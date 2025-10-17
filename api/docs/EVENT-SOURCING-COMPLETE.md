# Event Sourcing Implementation - Complete Guide

## Summary

✅ **Event Sourcing has been fully implemented** with both database and application layers ready to use.

## What Was Created

### 1. Database Layer (`006_add_event_sourcing.sql`)

**Tables**:
- `events` - Immutable event log (partitioned by date, 38 partitions created)
- `event_types` - Registry of 30+ pre-defined event types
- `state_projections` - Current state rebuilt from events  
- `event_cursors` - Track event processing position

**Functions**:
- `publish_event()` - Append events to log
- `get_aggregate_events()` - Query events by entity
- `get_event_chain()` - Trace related events (correlation/causation)
- `rebuild_device_state()` - Replay events to rebuild state
- `get_event_stats()` - Event statistics
- `create_events_partition()` - Create new partitions
- `drop_old_event_partitions()` - Retention cleanup

**Features**:
- PostgreSQL LISTEN/NOTIFY for real-time events
- SHA256 checksums for data integrity
- Correlation IDs to group related events
- Causation IDs to track event chains
- Automatic partitioning (daily partitions, 90-day default retention)

### 2. Application Layer (`src/services/event-sourcing.ts`)

**Classes**:
- `EventPublisher` - Publish events (single or batch)
- `EventStore` - Query event history
- `EventListener` - Real-time event notifications
- `ProjectionBuilder` - Build read models from events

**Helper Functions**:
- `publishTargetStateChange()` - Target state updates
- `publishCurrentStateChange()` - Current state updates
- `publishReconciliationCycle()` - Reconciliation workflow

### 3. Documentation

- **`docs/EVENT-SOURCING-GUIDE.md`** - Complete usage guide
- **`scripts/test-event-sourcing.ts`** - Test script with examples

## How to Use

### Step 1: Run Migration

```bash
cd api

# First fix the partitioning migration issue (check oldest data)
npx ts-node -e "
import pool from './src/db/connection';
(async () => {
  const result = await pool.query(
    'SELECT MIN(recorded_at) FROM device_metrics_old'
  );
  console.log('Oldest record:', result.rows[0]);
  await pool.close();
})();
"

# Then run migrations
npx ts-node scripts/run-migrations.ts
```

### Step 2: Test Event Sourcing

```bash
npx ts-node scripts/test-event-sourcing.ts
```

This will:
- ✅ Verify tables exist
- ✅ Publish test events
- ✅ Query event history
- ✅ Test real-time listener
- ✅ Show partition info

### Step 3: Integrate into Your Code

#### Publish Events (Target State Changes)

```typescript
import { EventPublisher } from './src/services/event-sourcing';

// When target state changes via API
const publisher = new EventPublisher('api');

await publisher.publish(
  'target_state.updated',
  'device',
  deviceUuid,
  {
    old_state: oldState,
    new_state: newState,
    changed_fields: ['apps.my-app.image'],
  },
  {
    metadata: {
      user_id: req.user.id,
      ip_address: req.ip,
    },
  }
);
```

#### Query Events

```typescript
import { EventStore } from './src/services/event-sourcing';

// Get all events for a device
const events = await EventStore.getAggregateEvents('device', deviceUuid);

// Get recent events
const recent = await EventStore.getRecentEvents(100);

// Get event statistics
const stats = await EventStore.getStats(7); // Last 7 days
```

#### Listen to Events Real-Time

```typescript
import { EventListener } from './src/services/event-sourcing';

const listener = new EventListener();
await listener.start();

// Listen to specific event types
listener.onEventType('container.crashed', async (payload) => {
  console.log('Container crashed:', payload.aggregate_id);
  await sendAlert(payload);
});

// Listen to all events
listener.on('event', (payload) => {
  console.log('Event:', payload.event_type);
});
```

## Event Types Available

30+ pre-registered event types:

**Device**: provisioned, deprovisioned, online, offline, heartbeat

**Target State**: updated, app_added, app_removed, app_updated, config_changed, volume_added/removed, network_added/removed

**Current State**: updated, app_started, app_stopped, app_crashed, app_health_changed

**Reconciliation**: started, completed, failed, drift_detected

**Container**: created, started, stopped, removed, restarted, crashed, health_check_failed

**Image**: pulled, pull_failed, removed

**Volume**: created, removed, attached, detached

**Network**: created, removed, connected, disconnected

## Architecture Comparison

### Traditional State Management
```
API Request → Update Database → Done
```
- ❌ No history
- ❌ Can't debug what happened
- ❌ Can't replay changes
- ❌ No audit trail

### Event Sourcing
```
API Request → Publish Event → Event Log → Update Projection
                            ↓
                      Notify Listeners
```
- ✅ Complete history
- ✅ Full audit trail
- ✅ Time-travel debugging
- ✅ Event-driven architecture
- ✅ Can rebuild state at any point
- ✅ Real-time notifications

## Benefits

### 1. Complete Audit Trail
Every change is recorded with:
- What happened (`event_type`)
- When (`timestamp`)
- Who/what (`source`, `metadata`)
- Why (`correlation_id` links related events)

### 2. Time-Travel Debugging
```typescript
// Rebuild state at any point in time
const events = await EventStore.getAggregateEvents('device', deviceUuid);
const stateOnDate = replayEventsUntil(events, '2025-10-15');
```

### 3. Event-Driven Architecture
```typescript
// React to events in real-time
listener.onEventType('target_state.updated', async (payload) => {
  // Automatically trigger reconciliation
  await triggerReconciliation(payload.aggregate_id);
});
```

### 4. Troubleshooting
```typescript
// Trace what caused a container crash
const chain = await EventStore.getEventChain(correlationId);
// Shows: target_state.updated → reconciliation.started → 
//        container.stopped → container.crashed
```

### 5. Analytics & Reporting
```sql
-- How many containers crashed last week?
SELECT COUNT(*) FROM events
WHERE event_type = 'container.crashed'
AND timestamp > NOW() - INTERVAL '7 days';

-- Which apps crash most often?
SELECT aggregate_id, COUNT(*)
FROM events
WHERE event_type = 'container.crashed'
GROUP BY aggregate_id
ORDER BY COUNT(*) DESC;
```

## Performance

### Partitioning
- ✅ Fast queries (partition pruning)
- ✅ Instant cleanup (DROP TABLE vs DELETE)
- ✅ Parallel processing
- ✅ 38 daily partitions created (-30 to +7 days)

### Indexing
- `(aggregate_type, aggregate_id, timestamp)` - Entity history
- `(event_type, timestamp)` - Query by type
- `(correlation_id)` - Trace chains
- `(timestamp DESC)` - Recent events

### Storage
- Typical event: ~1KB
- 1M events/day ≈ 1GB/day
- With 90-day retention ≈ 90GB
- Automatic cleanup via partition drops

## Maintenance

### Create Future Partitions

```sql
-- Create partitions for next 30 days
SELECT create_events_partition(CURRENT_DATE + (i || ' days')::INTERVAL)
FROM generate_series(8, 37) AS i;
```

### Drop Old Partitions

```sql
-- Drop events older than 90 days
SELECT drop_old_event_partitions(90);
```

### Scheduled Maintenance

```typescript
// scripts/maintain-events.ts
import pool from '../src/db/connection';

async function maintainEvents() {
  // Create future partitions
  await pool.query(`
    SELECT create_events_partition(CURRENT_DATE + (i || ' days')::INTERVAL)
    FROM generate_series(1, 7) AS i
  `);
  
  // Drop old partitions
  await pool.query(`SELECT drop_old_event_partitions(90)`);
  
  await pool.close();
}

// Run daily via cron
maintainEvents();
```

## Next Steps

1. ✅ **Migration created** - Database schema ready
2. ✅ **Service created** - TypeScript API ready
3. ✅ **Tests created** - Example usage ready
4. ✅ **Documentation complete** - Full guide ready
5. ⏳ **Fix migration 005** - Resolve partitioning issue first
6. ⏳ **Run migrations** - Apply event sourcing schema
7. ⏳ **Integrate events** - Add EventPublisher to your code
8. ⏳ **Set up listeners** - React to events real-time
9. ⏳ **Automate maintenance** - Schedule partition management

## Industry Usage

Event Sourcing is used by:
- ✅ Kubernetes (events table)
- ✅ AWS CloudTrail
- ✅ Azure Event Hub
- ✅ Balena Supervisor (device logs)
- ✅ GitHub (audit log)
- ✅ Stripe (API events)
- ✅ Banking systems (transaction logs)

It's a production-proven pattern for systems that need:
- Complete audit trails
- Debugging capabilities
- Compliance requirements
- Event-driven architecture
- Time-travel queries

## Resources

- **Full Guide**: `docs/EVENT-SOURCING-GUIDE.md`
- **Test Script**: `scripts/test-event-sourcing.ts`
- **Migration**: `database/migrations/006_add_event_sourcing.sql`
- **Service**: `src/services/event-sourcing.ts`
