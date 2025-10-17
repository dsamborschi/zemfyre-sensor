# Event Sourcing Implementation Guide

## Overview

Event Sourcing is implemented with:
- ✅ **Database side**: PostgreSQL tables, functions, partitioning
- ✅ **Application side**: TypeScript service for publishing/consuming events
- ✅ **Real-time notifications**: PostgreSQL LISTEN/NOTIFY for live events
- ✅ **Projections**: Rebuild state from event history

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  EventPublisher  →  Publish events                          │
│  EventStore      →  Query events                            │
│  EventListener   →  Real-time event notifications           │
│  ProjectionBuilder → Build read models from events          │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  events table         →  Immutable event log (partitioned)  │
│  event_types          →  Registry of event schemas          │
│  state_projections    →  Current state (rebuilt from events)│
│  event_cursors        →  Projection processing checkpoints  │
│                                                              │
│  Functions:                                                  │
│  - publish_event()              →  Append event             │
│  - get_aggregate_events()       →  Query by aggregate       │
│  - get_event_chain()            →  Trace causation          │
│  - rebuild_device_state()       →  Replay events            │
│  - drop_old_event_partitions()  →  Cleanup retention        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Step 1: Run Migration

```bash
cd api
npx ts-node scripts/run-migrations.ts
```

This creates:
- `events` table (partitioned by date)
- 38 partitions (-30 to +7 days)
- `event_types` registry (30+ pre-registered events)
- `state_projections` table
- `event_cursors` table
- Helper functions

### Step 2: Verify Installation

```bash
npx ts-node -e "
import pool from './src/db/connection';
(async () => {
  const stats = await pool.query('SELECT COUNT(*) FROM event_types');
  console.log('Event types registered:', stats.rows[0].count);
  await pool.close();
})();
"
```

## Usage Examples

### Example 1: Publish Events (Target State Change)

```typescript
import { EventPublisher } from './src/services/event-sourcing';

// When target state changes via API
const publisher = new EventPublisher('api', correlationId);

// Publish the main event
await publisher.publish(
  'target_state.updated',
  'device',
  deviceUuid,
  {
    old_state: oldTargetState,
    new_state: newTargetState,
    changed_fields: ['apps.my-app.image'],
  },
  {
    metadata: {
      user_id: 'admin',
      request_id: req.id,
      ip_address: req.ip,
    },
  }
);

// Publish detailed change events
await publisher.publish(
  'target_state.app_updated',
  'device',
  deviceUuid,
  {
    app_name: 'my-app',
    old_image: 'iotistic/app:v1',
    new_image: 'iotistic/app:v2',
  }
);
```

### Example 2: Query Events

```typescript
import { EventStore } from './src/services/event-sourcing';

// Get all events for a device
const events = await EventStore.getAggregateEvents('device', deviceUuid);

// Get events since last sync
const newEvents = await EventStore.getAggregateEvents(
  'device',
  deviceUuid,
  lastProcessedEventId
);

// Trace an event chain (all related events)
const chain = await EventStore.getEventChain(correlationId);

// Get statistics
const stats = await EventStore.getStats(7); // Last 7 days
```

### Example 3: Real-Time Event Listener

```typescript
import { EventListener } from './src/services/event-sourcing';

const listener = new EventListener();
await listener.start();

// Listen to all events
listener.on('event', (payload) => {
  console.log('Event received:', payload);
});

// Listen to specific event types
listener.onEventType('target_state.updated', async (payload) => {
  console.log('Target state changed:', payload.aggregate_id);
  
  // Trigger reconciliation
  await triggerReconciliation(payload.aggregate_id);
});

listener.onEventType('container.crashed', async (payload) => {
  console.log('Container crashed:', payload.aggregate_id);
  
  // Send alert
  await sendAlert(payload);
});
```

### Example 4: Build Projections (Read Models)

```typescript
import { ProjectionBuilder } from './src/services/event-sourcing';

// Create projection for device state
const projection = new ProjectionBuilder('device_state_projection');

// Register event handlers
projection.on('target_state.updated', async (event, currentState) => {
  await pool.query(
    `INSERT INTO state_projections (device_uuid, target_state, target_version)
     VALUES ($1, $2, $3)
     ON CONFLICT (device_uuid) 
     DO UPDATE SET target_state = $2, target_version = $3, updated_at = NOW()`,
    [event.aggregate_id, event.data.new_state, event.id]
  );
});

projection.on('current_state.updated', async (event, currentState) => {
  await pool.query(
    `UPDATE state_projections 
     SET current_state = $2, current_version = $3, updated_at = NOW()
     WHERE device_uuid = $1`,
    [event.aggregate_id, event.data.state, event.id]
  );
});

// Process events in batches
const processed = await projection.process(100);
console.log(`Processed ${processed} events`);
```

### Example 5: Reconciliation with Events

```typescript
import { publishReconciliationCycle } from './src/services/event-sourcing';

// During reconciliation
const diff = compareStates(targetState, currentState);

const actionsResult = {
  actions: [
    { type: 'started', app_name: 'my-app', details: {...} },
    { type: 'stopped', app_name: 'old-app', details: {...} },
  ],
  success: true,
  duration_ms: 1500,
};

// Publishes: reconciliation.started + container.* events + reconciliation.completed
const eventIds = await publishReconciliationCycle(
  deviceUuid,
  diff,
  actionsResult
);

// All events linked by correlation_id for tracing
```

## Integration with Existing Code

### Option 1: Add to State Manager

```typescript
// In src/services/state-manager.ts

import { publishTargetStateChange } from './event-sourcing';

class StateManager {
  async updateTargetState(deviceUuid: string, newState: any) {
    const oldState = await this.getCurrentTargetState(deviceUuid);
    
    // Update database
    await pool.query(
      `UPDATE devices SET target_state = $1 WHERE uuid = $2`,
      [newState, deviceUuid]
    );
    
    // Publish event
    await publishTargetStateChange(
      deviceUuid,
      oldState,
      newState,
      'api'
    );
    
    return newState;
  }
}
```

### Option 2: Add to Container Manager

```typescript
// In application-manager/src/container-manager.ts

import { EventPublisher } from '../services/event-sourcing';

class ContainerManager {
  private eventPublisher = new EventPublisher('supervisor');
  
  async startContainer(appName: string, config: any) {
    try {
      // Start container
      const container = await docker.createContainer(config);
      await container.start();
      
      // Publish event
      await this.eventPublisher.publish(
        'container.started',
        'app',
        appName,
        {
          container_id: container.id,
          image: config.Image,
          started_at: new Date(),
        }
      );
      
      return container;
    } catch (error) {
      // Publish error event
      await this.eventPublisher.publish(
        'container.start_failed',
        'app',
        appName,
        {
          error: error.message,
          config,
        }
      );
      throw error;
    }
  }
}
```

## Event Types Reference

### Device Events
- `device.provisioned` - Device added to system
- `device.deprovisioned` - Device removed
- `device.online` - Device connected
- `device.offline` - Device disconnected
- `device.heartbeat` - Periodic health check

### Target State Events
- `target_state.updated` - Full state update
- `target_state.app_added` - App added
- `target_state.app_removed` - App removed
- `target_state.app_updated` - App config changed
- `target_state.config_changed` - Config modified
- `target_state.volume_added` - Volume added
- `target_state.volume_removed` - Volume removed
- `target_state.network_added` - Network added
- `target_state.network_removed` - Network removed

### Current State Events
- `current_state.updated` - Device reported state
- `current_state.app_started` - App started
- `current_state.app_stopped` - App stopped
- `current_state.app_crashed` - App crashed
- `current_state.app_health_changed` - Health status changed

### Reconciliation Events
- `reconciliation.started` - Cycle started
- `reconciliation.completed` - Cycle finished
- `reconciliation.failed` - Cycle failed
- `reconciliation.drift_detected` - State mismatch detected

### Container Events
- `container.created` - Container created
- `container.started` - Container started
- `container.stopped` - Container stopped
- `container.removed` - Container removed
- `container.restarted` - Container restarted
- `container.crashed` - Container crashed
- `container.health_check_failed` - Health check failed

### Image Events
- `image.pulled` - Image downloaded
- `image.pull_failed` - Image pull failed
- `image.removed` - Image deleted

## Queries & Analysis

### Query 1: Device Event History

```sql
-- Get all events for a device
SELECT 
  event_type,
  timestamp,
  data,
  source
FROM events
WHERE aggregate_type = 'device'
AND aggregate_id = 'your-device-uuid'
ORDER BY timestamp DESC
LIMIT 100;
```

### Query 2: Trace Event Chain

```sql
-- Find all related events (by correlation_id)
SELECT * FROM get_event_chain('correlation-uuid-here');
```

### Query 3: Event Statistics

```sql
-- Last 7 days event stats
SELECT * FROM get_event_stats(7);
```

### Query 4: Rebuild State

```sql
-- Rebuild device state from events
SELECT rebuild_device_state('your-device-uuid');
```

### Query 5: Recent Container Events

```sql
SELECT 
  event_type,
  aggregate_id as app_name,
  data,
  timestamp
FROM events
WHERE aggregate_type = 'app'
AND event_type LIKE 'container.%'
ORDER BY timestamp DESC
LIMIT 50;
```

## Maintenance

### Create Future Partitions

```typescript
import pool from './src/db/connection';

// Create partitions for next 30 days
const result = await pool.query(`
  SELECT create_events_partition(CURRENT_DATE + (i || ' days')::INTERVAL)
  FROM generate_series(8, 37) AS i
`);
```

### Drop Old Partitions

```sql
-- Drop events older than 90 days
SELECT drop_old_event_partitions(90);
```

### Maintenance Script

```typescript
// scripts/maintain-events.ts
import pool from '../src/db/connection';

async function maintainEvents() {
  // Create future partitions (next 7 days)
  await pool.query(`
    SELECT create_events_partition(CURRENT_DATE + (i || ' days')::INTERVAL)
    FROM generate_series(1, 7) AS i
  `);
  
  // Drop old partitions (> 90 days)
  const result = await pool.query(`
    SELECT drop_old_event_partitions(90)
  `);
  
  console.log('Maintenance complete:', result.rows);
  
  await pool.close();
}

maintainEvents();
```

## Performance Considerations

### Partitioning Benefits
- ✅ Fast queries (partition pruning)
- ✅ Instant cleanup (DROP TABLE vs DELETE)
- ✅ Parallel processing
- ✅ Smaller indexes per partition

### Indexing Strategy
- `(aggregate_type, aggregate_id, timestamp)` - Get entity history
- `(event_type, timestamp)` - Query by event type
- `(correlation_id)` - Trace event chains
- `(timestamp DESC)` - Recent events

### Query Optimization
```typescript
// BAD: Full table scan
const events = await pool.query('SELECT * FROM events');

// GOOD: Use indexed columns
const events = await pool.query(
  `SELECT * FROM events 
   WHERE aggregate_type = 'device' 
   AND aggregate_id = $1 
   AND timestamp > NOW() - INTERVAL '7 days'`,
  [deviceUuid]
);
```

## Benefits of Event Sourcing

### 1. Complete Audit Trail
- Every change is recorded
- Who, what, when, why
- Compliance & debugging

### 2. Time Travel
```typescript
// Rebuild state at any point in time
const events = await EventStore.getAggregateEvents('device', deviceUuid);
const stateAtTime = replayEventsUntil(events, targetDate);
```

### 3. Event-Driven Architecture
- Real-time notifications
- Microservice communication
- Async processing

### 4. Debugging & Troubleshooting
```typescript
// Find what caused a container crash
const chain = await EventStore.getEventChain(correlationId);
// Shows: target_state.updated → reconciliation.started → container.stopped → container.crashed
```

### 5. Analytics & Reporting
```sql
-- How many containers crashed last week?
SELECT COUNT(*) FROM events
WHERE event_type = 'container.crashed'
AND timestamp > NOW() - INTERVAL '7 days';

-- Which apps crash most often?
SELECT 
  aggregate_id as app_name,
  COUNT(*) as crash_count
FROM events
WHERE event_type = 'container.crashed'
GROUP BY aggregate_id
ORDER BY crash_count DESC;
```

## Comparison: Traditional vs Event Sourcing

| Feature | Traditional | Event Sourcing |
|---------|-------------|----------------|
| **State** | Current only | Full history |
| **Updates** | Overwrite data | Append events |
| **Audit** | Manual logging | Automatic |
| **Debugging** | Limited | Time-travel possible |
| **Rollback** | Complex | Replay events |
| **Performance** | Fast reads | Fast reads (projections) |
| **Storage** | Less | More (event history) |
| **Complexity** | Lower | Higher |

## Managing Event Volume (Noise Reduction)

Event sourcing captures ALL state changes, which can generate significant database volume. Here's how to manage it:

### Configuration-Based Control

Located in `src/config/event-sourcing.ts`:

```typescript
export const EventSourcingConfig = {
  // Disable heartbeat events (very high frequency)
  PUBLISH_HEARTBEAT_EVENTS: false,
  
  // State updates: 'always' | 'changes' | 'never'
  PUBLISH_STATE_UPDATES: 'changes', // Only when state changes
  
  // Sampling for high-frequency events
  SAMPLE_RATE: 1, // 1 = no sampling, 10 = 1 in 10 events
  SAMPLED_EVENT_TYPES: ['device.heartbeat', 'current_state.updated'],
  
  // Retention
  RETENTION_DAYS: 90,
  ARCHIVE_OLD_EVENTS: false,
  
  // Batching (optional optimization)
  ENABLE_BATCHING: false,
  BATCH_SIZE: 10,
  BATCH_DELAY_MS: 500
};
```

### Event Frequency Analysis

**High-frequency events** (1000s per day per device):
- ❌ `device.heartbeat` - Every state report (~every 10 seconds)
- ⚠️ `current_state.updated` - Every state report if not filtered

**Medium-frequency events** (dozens per day):
- ✅ `target_state.updated` - When user changes configuration
- ✅ `container.started/stopped` - Container lifecycle events

**Low-frequency events** (a few per day or less):
- ✅ `device.provisioned` - Device registration
- ✅ `device.online/offline` - Connectivity changes
- ✅ `reconciliation.started/completed` - State reconciliation

### Recommended Configurations

**Production (balanced):**
```typescript
PUBLISH_HEARTBEAT_EVENTS: false,      // Too noisy
PUBLISH_STATE_UPDATES: 'changes',     // Only when apps change
SAMPLE_RATE: 1,                       // No sampling
RETENTION_DAYS: 90
```

**Development (verbose for debugging):**
```typescript
PUBLISH_HEARTBEAT_EVENTS: true,       // See all activity
PUBLISH_STATE_UPDATES: 'always',      // Every state report
SAMPLE_RATE: 1,
RETENTION_DAYS: 30
```

**High-scale (minimal storage):**
```typescript
PUBLISH_HEARTBEAT_EVENTS: false,
PUBLISH_STATE_UPDATES: 'changes',
SAMPLE_RATE: 10,                      // 1 in 10 state updates
RETENTION_DAYS: 30,
ARCHIVE_OLD_EVENTS: true
```

### Monitoring Event Volume

**Query event counts by type:**
```sql
-- Events in last 24 hours
SELECT 
  event_type,
  COUNT(*) as event_count,
  MIN(timestamp) as first_event,
  MAX(timestamp) as last_event
FROM events
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY event_count DESC;
```

**Check partition sizes:**
```sql
-- Partition disk usage
SELECT 
  schemaname || '.' || tablename as partition_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE tablename LIKE 'events_y%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Average events per device:**
```sql
-- Events per device (last 7 days)
SELECT 
  aggregate_id as device_uuid,
  COUNT(*) as total_events,
  COUNT(*) / 7.0 as avg_per_day
FROM events
WHERE aggregate_type = 'device'
AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY aggregate_id
ORDER BY total_events DESC
LIMIT 20;
```

### State Change Detection

The system automatically detects if state actually changed before publishing:

```typescript
// In cloud.ts state reporting endpoint
const oldState = await DeviceCurrentStateModel.get(uuid);
const stateChanged = !oldState || 
  JSON.stringify(oldState.apps) !== JSON.stringify(deviceState.apps);

// Only publish if changed OR config says 'always'
if (EventSourcingConfig.shouldPublishStateUpdate(stateChanged)) {
  await eventPublisher.publish('current_state.updated', ...);
}
```

### Sampling for High-Frequency Events

For very noisy events you want to keep some record of:

```typescript
// Enable sampling in config
SAMPLE_RATE: 10, // Keep 1 in 10 events
SAMPLED_EVENT_TYPES: ['current_state.updated']

// EventPublisher automatically samples these types
const shouldPublish = EventSourcingConfig.shouldPublishEvent('current_state.updated');
// Returns true only 10% of the time for sampled types
```

### Partition Maintenance

Automatically drop old partitions to control storage:

```sql
-- Drop partitions older than retention period
SELECT drop_old_event_partitions(90); -- Keep 90 days
```

Schedule this in a cron job:
```bash
# /etc/cron.daily/event-partition-cleanup
#!/bin/bash
psql -U postgres -d iotistic_cloud -c "SELECT drop_old_event_partitions(90);"
```

### Best Practices

1. **Start conservative**: Begin with `PUBLISH_STATE_UPDATES: 'changes'` and `PUBLISH_HEARTBEAT_EVENTS: false`
2. **Monitor volume**: Check partition sizes weekly for first month
3. **Adjust as needed**: If still too noisy, enable sampling
4. **Document changes**: Log why you changed configuration
5. **Test thoroughly**: After config changes, verify critical events still captured

### When You Need Full History

If debugging requires complete history:

1. Temporarily enable verbose mode
2. Reproduce the issue
3. Query relevant events
4. Restore production config

```typescript
// Quick toggle for debugging
const DEBUG_MODE = process.env.EVENT_SOURCING_DEBUG === 'true';

EventSourcingConfig.PUBLISH_HEARTBEAT_EVENTS = DEBUG_MODE;
EventSourcingConfig.PUBLISH_STATE_UPDATES = DEBUG_MODE ? 'always' : 'changes';
```

## Next Steps

1. ✅ **Run migration**: `npx ts-node scripts/run-migrations.ts`
2. ✅ **Integrate events**: Event publishing added to key API endpoints
3. ✅ **Configure verbosity**: Adjust `EventSourcingConfig` for your use case
4. ⏳ **Set up listener**: Start `EventListener` for real-time processing
5. ⏳ **Build projections**: Create read models from events
6. ⏳ **Automate maintenance**: Schedule partition management

## Resources

- **Event Sourcing Pattern**: https://martinfowler.com/eaaDev/EventSourcing.html
- **CQRS + Event Sourcing**: https://docs.microsoft.com/en-us/azure/architecture/patterns/cqrs
- **Managing Event Volume**: `CONNECTIVITY-EVENTS.md` for device-specific patterns
- **PostgreSQL Partitioning**: https://www.postgresql.org/docs/current/ddl-partitioning.html
- **PostgreSQL LISTEN/NOTIFY**: https://www.postgresql.org/docs/current/sql-notify.html
