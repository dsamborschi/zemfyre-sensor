/**
 * Event Sourcing Service
 * Application-side implementation for event publishing and consumption
 */

import pool from '../db/connection';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import EventSourcingConfig from '../config/event-sourcing';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Event {
  id?: number;
  event_id: string;
  event_type: string;
  event_version: number;
  timestamp: Date;
  aggregate_type: string;
  aggregate_id: string;
  data: any;
  metadata?: any;
  correlation_id?: string;
  causation_id?: string;
  source?: string;
  checksum: string;
}

export interface EventHandler {
  (event: Event): Promise<void>;
}

export interface ProjectionHandler {
  (event: Event, currentState: any): Promise<any>;
}

// ============================================================================
// EVENT PUBLISHER
// ============================================================================

export class EventPublisher {
  private correlationId?: string;
  private source: string;

  constructor(source: string = 'system', correlationId?: string) {
    this.source = source;
    this.correlationId = correlationId || crypto.randomUUID();
  }

  /**
   * Publish a single event (with config-based filtering)
   */
  async publish(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    data: any,
    options?: {
      causationId?: string;
      metadata?: any;
    }
  ): Promise<string | null> {
    // Check if this event should be published based on configuration
    if (!EventSourcingConfig.shouldPublishEvent(eventType)) {
      console.log(`[EventPublisher] Skipping event ${eventType} (filtered by config)`);
      return null;
    }

    const result = await pool.query(
      `SELECT publish_event($1, $2, $3, $4, $5, $6, $7, $8) as event_id`,
      [
        eventType,
        aggregateType,
        aggregateId,
        JSON.stringify(data),
        this.source,
        this.correlationId,
        options?.causationId || null,
        options?.metadata ? JSON.stringify(options.metadata) : null,
      ]
    );

    return result.rows[0].event_id;
  }

  /**
   * Publish multiple events atomically (in transaction)
   */
  async publishBatch(
    events: Array<{
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      data: any;
      metadata?: any;
    }>
  ): Promise<string[]> {
    return pool.transaction(async (client) => {
      const eventIds: string[] = [];

      for (const event of events) {
        const result = await client.query(
          `SELECT publish_event($1, $2, $3, $4, $5, $6, $7, $8) as event_id`,
          [
            event.eventType,
            event.aggregateType,
            event.aggregateId,
            JSON.stringify(event.data),
            this.source,
            this.correlationId,
            null, // causation_id
            event.metadata ? JSON.stringify(event.metadata) : null,
          ]
        );

        eventIds.push(result.rows[0].event_id);
      }

      return eventIds;
    });
  }

  /**
   * Get correlation ID for this publisher
   */
  getCorrelationId(): string {
    return this.correlationId!;
  }
}

// ============================================================================
// EVENT STORE (Query Interface)
// ============================================================================

export class EventStore {
  /**
   * Get all events for an aggregate
   */
  static async getAggregateEvents(
    aggregateType: string,
    aggregateId: string,
    sinceEventId?: number
  ): Promise<Event[]> {
    const result = await pool.query(
      `SELECT * FROM get_aggregate_events($1, $2, $3)`,
      [aggregateType, aggregateId, sinceEventId || null]
    );

    return result.rows;
  }

  /**
   * Get event chain by correlation ID
   */
  static async getEventChain(correlationId: string): Promise<Event[]> {
    const result = await pool.query(
      `SELECT * FROM get_event_chain($1)`,
      [correlationId]
    );

    return result.rows;
  }

  /**
   * Get events by type
   */
  static async getEventsByType(
    eventType: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<Event[]> {
    const result = await pool.query(
      `SELECT * FROM events 
       WHERE event_type = $1 
       ORDER BY timestamp DESC 
       LIMIT $2 OFFSET $3`,
      [eventType, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get recent events
   */
  static async getRecentEvents(
    limit: number = 100,
    aggregateType?: string
  ): Promise<Event[]> {
    const query = aggregateType
      ? `SELECT * FROM events WHERE aggregate_type = $1 ORDER BY timestamp DESC LIMIT $2`
      : `SELECT * FROM events ORDER BY timestamp DESC LIMIT $1`;

    const params = aggregateType ? [aggregateType, limit] : [limit];
    const result = await pool.query(query, params);

    return result.rows;
  }

  /**
   * Get event statistics
   */
  static async getStats(daysBack: number = 7): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM get_event_stats($1)`,
      [daysBack]
    );

    return result.rows;
  }

  /**
   * Rebuild state from events (event replay)
   */
  static async rebuildDeviceState(deviceUuid: string): Promise<any> {
    const result = await pool.query(
      `SELECT rebuild_device_state($1) as state`,
      [deviceUuid]
    );

    return result.rows[0]?.state || {};
  }
}

// ============================================================================
// EVENT LISTENER (Real-time event processing)
// ============================================================================

export class EventListener extends EventEmitter {
  private client: any;
  private isListening: boolean = false;

  /**
   * Start listening for events via PostgreSQL NOTIFY
   */
  async start(): Promise<void> {
    if (this.isListening) {
      return;
    }

    this.client = await pool.getClient();
    
    await this.client.query('LISTEN events');
    
    this.client.on('notification', (msg: any) => {
      if (msg.channel === 'events') {
        try {
          const payload = JSON.parse(msg.payload);
          this.emit('event', payload);
          this.emit(payload.event_type, payload);
        } catch (error) {
          console.error('Error parsing event notification:', error);
        }
      }
    });

    this.isListening = true;
    console.log('Event listener started');
  }

  /**
   * Stop listening
   */
  async stop(): Promise<void> {
    if (!this.isListening || !this.client) {
      return;
    }

    await this.client.query('UNLISTEN events');
    this.client.release();
    this.isListening = false;
    console.log('Event listener stopped');
  }

  /**
   * Subscribe to specific event types
   */
  onEventType(eventType: string, handler: (payload: any) => void): void {
    this.on(eventType, handler);
  }
}

// ============================================================================
// PROJECTION BUILDER
// ============================================================================

export class ProjectionBuilder {
  private handlers: Map<string, ProjectionHandler> = new Map();
  private cursorName: string;

  constructor(cursorName: string) {
    this.cursorName = cursorName;
  }

  /**
   * Register event handler for projection
   */
  on(eventType: string, handler: ProjectionHandler): void {
    this.handlers.set(eventType, handler);
  }

  /**
   * Process events and build projection
   */
  async process(batchSize: number = 100): Promise<number> {
    // Get last processed event ID
    const cursorResult = await pool.query(
      `SELECT last_event_id FROM event_cursors WHERE processor_name = $1`,
      [this.cursorName]
    );

    const lastEventId = cursorResult.rows[0]?.last_event_id || 0;

    // Get next batch of events
    const eventsResult = await pool.query(
      `SELECT * FROM events 
       WHERE id > $1 
       ORDER BY id ASC 
       LIMIT $2`,
      [lastEventId, batchSize]
    );

    const events = eventsResult.rows;

    if (events.length === 0) {
      return 0;
    }

    // Process events
    let processed = 0;
    for (const event of events) {
      const handler = this.handlers.get(event.event_type);
      if (handler) {
        try {
          // Get current projection state
          const stateResult = await pool.query(
            `SELECT * FROM state_projections WHERE device_uuid = $1`,
            [event.aggregate_id]
          );

          const currentState = stateResult.rows[0] || {};

          // Apply event to state
          await handler(event, currentState);

          processed++;
        } catch (error) {
          console.error(`Error processing event ${event.id}:`, error);
        }
      }

      // Update cursor
      await pool.query(
        `INSERT INTO event_cursors (processor_name, last_event_id)
         VALUES ($1, $2)
         ON CONFLICT (processor_name) 
         DO UPDATE SET last_event_id = $2, last_processed_at = NOW()`,
        [this.cursorName, event.id]
      );
    }

    return processed;
  }

  /**
   * Reset projection (rebuild from scratch)
   */
  async reset(): Promise<void> {
    await pool.query(
      `DELETE FROM event_cursors WHERE processor_name = $1`,
      [this.cursorName]
    );
  }
}

// ============================================================================
// EXAMPLE USAGE & HELPERS
// ============================================================================

/**
 * Helper: Publish target state change
 */
export async function publishTargetStateChange(
  deviceUuid: string,
  oldState: any,
  newState: any,
  source: string = 'api',
  metadata?: any
): Promise<string> {
  const publisher = new EventPublisher(source);

  return publisher.publish(
    'target_state.updated',
    'device',
    deviceUuid,
    {
      old_state: oldState,
      new_state: newState,
      changed_fields: calculateChangedFields(oldState, newState),
    },
    { metadata }
  );
}

/**
 * Helper: Publish current state change
 */
export async function publishCurrentStateChange(
  deviceUuid: string,
  newState: any,
  source: string = 'supervisor'
): Promise<string> {
  const publisher = new EventPublisher(source);

  return publisher.publish(
    'current_state.updated',
    'device',
    deviceUuid,
    { state: newState }
  );
}

/**
 * Helper: Publish reconciliation events
 */
export async function publishReconciliationCycle(
  deviceUuid: string,
  diff: any,
  actionsResult: any
): Promise<string[]> {
  const publisher = new EventPublisher('supervisor');

  const startEventId = await publisher.publish(
    'reconciliation.started',
    'device',
    deviceUuid,
    { diff }
  );

  // Publish individual action events
  const actionEventIds: string[] = [];
  for (const action of actionsResult.actions || []) {
    const eventId = await publisher.publish(
      `container.${action.type}`,
      'app',
      action.app_name,
      action.details,
      { causationId: startEventId }
    );
    actionEventIds.push(eventId);
  }

  const completedEventId = await publisher.publish(
    'reconciliation.completed',
    'device',
    deviceUuid,
    {
      actions_count: actionEventIds.length,
      success: actionsResult.success,
      duration_ms: actionsResult.duration_ms,
    },
    { causationId: startEventId }
  );

  return [startEventId, ...actionEventIds, completedEventId];
}

/**
 * Helper: Calculate changed fields between two objects
 */
function calculateChangedFields(oldObj: any, newObj: any): string[] {
  const changed: string[] = [];

  const allKeys = new Set([
    ...Object.keys(oldObj || {}),
    ...Object.keys(newObj || {}),
  ]);

  for (const key of allKeys) {
    if (JSON.stringify(oldObj?.[key]) !== JSON.stringify(newObj?.[key])) {
      changed.push(key);
    }
  }

  return changed;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  EventPublisher,
  EventStore,
  EventListener,
  ProjectionBuilder,
  publishTargetStateChange,
  publishCurrentStateChange,
  publishReconciliationCycle,
};
