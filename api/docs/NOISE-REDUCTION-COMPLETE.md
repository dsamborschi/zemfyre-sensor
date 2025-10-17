# Event Sourcing Noise Reduction - Implementation Complete

## Summary

Successfully implemented noise reduction strategies for event sourcing to prevent database bloat from high-frequency events.

## Problem

Event sourcing captures ALL state changes, which was creating excessive event volume:

- **device.heartbeat**: ~1000s of events per day per device (every state report)
- **current_state.updated**: Published even when nothing changed
- **Result**: Potential database bloat and storage costs

## Solution

### 1. Configuration-Based Control

Created `src/config/event-sourcing.ts` with:

```typescript
EventSourcingConfig = {
  // Disable heartbeat events (too noisy)
  PUBLISH_HEARTBEAT_EVENTS: false,
  
  // Only publish state updates when state changes
  PUBLISH_STATE_UPDATES: 'changes', // 'always' | 'changes' | 'never'
  
  // Optional sampling for high-frequency events
  SAMPLE_RATE: 1, // 1 = no sampling, 10 = 1 in 10 events
  SAMPLED_EVENT_TYPES: ['device.heartbeat', 'current_state.updated'],
  
  // Retention and optimization
  RETENTION_DAYS: 90,
  ARCHIVE_OLD_EVENTS: false,
  ENABLE_BATCHING: false
}
```

### 2. EventPublisher Integration

Modified `src/services/event-sourcing.ts`:

- **EventPublisher.publish()** now checks `EventSourcingConfig.shouldPublishEvent()`
- Returns `null` (not string) when event is filtered
- Logs skipped events for debugging

```typescript
async publish(eventType, aggregateType, aggregateId, data, options): Promise<string | null> {
  // Check if this event should be published based on configuration
  if (!EventSourcingConfig.shouldPublishEvent(eventType)) {
    console.log(`[EventPublisher] Skipping event ${eventType} (filtered by config)`);
    return null;
  }
  // ... existing publish logic
}
```

### 3. State Change Detection

Updated `src/routes/cloud.ts` state reporting endpoint:

- Compare old state vs new state before publishing
- Only publish `current_state.updated` when apps actually change
- Use `EventSourcingConfig.shouldPublishStateUpdate(stateChanged)`

```typescript
const oldState = await DeviceCurrentStateModel.get(uuid);
const stateChanged = !oldState || 
  JSON.stringify(oldState.apps) !== JSON.stringify(deviceState.apps);

if (EventSourcingConfig.shouldPublishStateUpdate(stateChanged)) {
  await eventPublisher.publish('current_state.updated', ...);
}
```

### 4. Removed Heartbeat Noise

- **REMOVED** `device.heartbeat` publishing from state reports
- Connectivity now tracked by:
  - `device.online` - When device resumes after being offline
  - `device.offline` - When heartbeat monitor detects timeout (5min threshold)

## Test Results

✅ All tests passing:

```
Test 1: Publishing device.heartbeat (should be filtered)
[EventPublisher] Skipping event device.heartbeat (filtered by config)
✅ device.heartbeat correctly filtered by config

Test 2: Publishing current_state.updated with changes
✅ current_state.updated published (event_id: b0fed5bf-...)

Test 3: Testing shouldPublishStateUpdate logic
  - With changes: ✅ Should publish
  - No changes: ✅ Should NOT publish

Test 4: Querying event counts
Event counts for test device:
  - current_state.updated: 1
  (no device.heartbeat - correctly filtered)

Test 5: Testing sampling logic
  - Sample rate: 1 in 10
  - Expected: ~10 published
  - Actual: 8 published
  ✅ Sampling working as expected
```

## Impact

### Before Noise Reduction
- **device.heartbeat**: ~1,440 events/day per device (assuming 10s interval)
- **current_state.updated**: ~1,440 events/day per device
- **Total**: ~2,880 events/day per device

### After Noise Reduction
- **device.heartbeat**: 0 events (disabled)
- **current_state.updated**: ~10-50 events/day (only on changes)
- **device.online/offline**: ~2-10 events/day (connectivity changes)
- **Total**: ~12-60 events/day per device

**Storage Reduction**: ~98% fewer events! 🎉

## Files Modified

1. **Created**: `src/config/event-sourcing.ts` - Configuration system
2. **Modified**: `src/services/event-sourcing.ts` - EventPublisher filtering
3. **Modified**: `src/routes/cloud.ts` - State change detection + config import
4. **Updated**: `docs/EVENT-SOURCING-GUIDE.md` - Added noise reduction section
5. **Created**: `scripts/test-noise-reduction.ts` - Test suite

## Configuration Options

### Environment Variables

Control via environment variables:

```bash
# Disable heartbeat events (default: false)
PUBLISH_HEARTBEAT_EVENTS=false

# State update mode: always, changes, never (default: changes)
PUBLISH_STATE_UPDATES=changes

# Sampling rate for high-frequency events (default: 1 = no sampling)
EVENT_SAMPLE_RATE=1

# Retention period in days (default: 90)
EVENT_RETENTION_DAYS=90

# Archive instead of delete (default: false)
ARCHIVE_OLD_EVENTS=false

# Enable event batching (default: false)
ENABLE_EVENT_BATCHING=false
EVENT_BATCH_SIZE=10
EVENT_BATCH_DELAY_MS=500
```

### Recommended Configurations

**Production (Balanced)**:
```bash
PUBLISH_HEARTBEAT_EVENTS=false
PUBLISH_STATE_UPDATES=changes
EVENT_SAMPLE_RATE=1
EVENT_RETENTION_DAYS=90
```

**Development (Verbose)**:
```bash
PUBLISH_HEARTBEAT_EVENTS=true
PUBLISH_STATE_UPDATES=always
EVENT_SAMPLE_RATE=1
EVENT_RETENTION_DAYS=30
```

**High-Scale (Minimal)**:
```bash
PUBLISH_HEARTBEAT_EVENTS=false
PUBLISH_STATE_UPDATES=changes
EVENT_SAMPLE_RATE=10  # Sample 1 in 10 state updates
EVENT_RETENTION_DAYS=30
ARCHIVE_OLD_EVENTS=true
```

## Monitoring Event Volume

### Query event counts:
```sql
-- Events in last 24 hours by type
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

### Check partition sizes:
```sql
-- Disk usage per partition
SELECT 
  schemaname || '.' || tablename as partition_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE tablename LIKE 'events_y%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Average events per device:
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

## Maintenance

### Automated Partition Cleanup

Schedule a cron job to drop old partitions:

```bash
# /etc/cron.daily/event-partition-cleanup
#!/bin/bash
psql -U postgres -d iotistic_cloud -c "SELECT drop_old_event_partitions(90);"
```

### Manual Testing

Test noise reduction:
```bash
cd api
npx ts-node scripts/test-noise-reduction.ts
```

Test connectivity events:
```bash
npx ts-node scripts/test-connectivity-events.ts
```

## Next Steps

1. ✅ **Implemented**: Configuration-based control
2. ✅ **Implemented**: State change detection
3. ✅ **Implemented**: Heartbeat filtering
4. ⏳ **Monitor**: Production event volume for 1 week
5. ⏳ **Tune**: Adjust config based on actual usage patterns
6. ⏳ **Automate**: Set up partition cleanup cron job
7. ⏳ **Dashboard**: Create Grafana panel for event volume monitoring

## Related Documentation

- **EVENT-SOURCING-GUIDE.md** - Complete event sourcing guide with noise reduction section
- **CONNECTIVITY-EVENTS.md** - Device connectivity event system
- **src/config/event-sourcing.ts** - Configuration options and defaults

---

**Status**: ✅ Implementation complete and tested
**Date**: 2024
**Test Results**: All tests passing
**Storage Impact**: ~98% reduction in event volume
