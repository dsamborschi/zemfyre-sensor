# Event Sourcing API Integration

## Overview

Event sourcing has been integrated into key API endpoints to provide a complete audit trail of device lifecycle, state changes, and administrative actions.

## Events Added to API

### 1. Device Provisioning (`POST /api/v1/device/register`)

**Event Type:** `device.provisioned`

**When:** New device registers with the system using a provisioning key

**Data Captured:**
- Device name, type, fleet ID
- IP address, MAC address
- OS version, supervisor version
- Provisioning key used

**Example:**
```bash
curl -X POST http://localhost:4002/api/v1/device/register \
  -H "Authorization: Bearer <provisioning-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "12345678-1234-1234-1234-123456789abc",
    "deviceName": "test-device-001",
    "deviceType": "raspberry-pi-4",
    "deviceApiKey": "secret-key",
    "macAddress": "b8:27:eb:12:34:56"
  }'
```

---

### 2. Target State Updates (`POST /api/v1/devices/:uuid/target-state`)

**Event Type:** `target_state.updated`

**When:** Cloud/admin updates what the device should be running

**Data Captured:**
- New state (apps, config)
- Old state (for diff comparison)
- State version
- Apps added/removed
- Apps count

**Example:**
```bash
curl -X POST http://localhost:4002/api/v1/devices/12345678-1234-1234-1234-123456789abc/target-state \
  -H "Content-Type: application/json" \
  -d '{
    "apps": {
      "1000": {
        "appId": 1000,
        "appName": "my-app",
        "services": [...]
      }
    },
    "config": {
      "DEVICE_HOSTNAME": "my-device"
    }
  }'
```

---

### 3. Current State Reports (`PATCH /api/v1/device/state`)

**Event Type:** `current_state.updated`

**When:** Device reports its actual running state (what it's really doing)

**Data Captured:**
- Running apps and their status
- System info (IP, MAC, OS version, uptime)
- Resource usage (CPU, memory, storage)
- Apps count

**Example:**
```bash
curl -X PATCH http://localhost:4002/api/v1/device/state \
  -H "Content-Type: application/json" \
  -d '{
    "12345678-1234-1234-1234-123456789abc": {
      "apps": {
        "1000": { "status": "running", "containerId": "abc123" }
      },
      "ip_address": "192.168.1.100",
      "cpu_usage": 25.5,
      "memory_usage": 45.2
    }
  }'
```

---

### 4. Device Online/Offline (`PATCH /api/v1/devices/:uuid/active`)

**Event Types:** 
- `device.online` (when enabled)
- `device.offline` (when disabled)

**When:** Admin enables/disables a device

**Data Captured:**
- Device name and type
- Previous state vs new state
- Reason for change
- Timestamp

**Example:**
```bash
# Disable device
curl -X PATCH http://localhost:4002/api/v1/devices/12345678-1234-1234-1234-123456789abc/active \
  -H "Content-Type: application/json" \
  -d '{ "is_active": false }'

# Re-enable device
curl -X PATCH http://localhost:4002/api/v1/devices/12345678-1234-1234-1234-123456789abc/active \
  -H "Content-Type: application/json" \
  -d '{ "is_active": true }'
```

---

## Testing

### Quick Test

1. **Start the API:**
   ```bash
   cd api
   npm run dev
   ```

2. **Run test script:**
   ```bash
   npx ts-node scripts/test-api-events.ts
   ```

3. **Expected output:**
   - Makes API calls to set target state, report current state, toggle device status
   - Queries event store after each action
   - Shows event breakdown and summary

### Manual Testing

**Query all events for a device:**
```sql
SELECT * FROM get_aggregate_events('device', '12345678-1234-1234-1234-123456789abc', NULL);
```

**Query all target state changes:**
```sql
SELECT 
  event_id,
  aggregate_id as device_uuid,
  data->>'version' as version,
  data->>'apps_count' as apps_count,
  timestamp
FROM events
WHERE event_type = 'target_state.updated'
ORDER BY timestamp DESC;
```

**Query recent events:**
```sql
SELECT 
  event_type,
  aggregate_type,
  aggregate_id,
  timestamp,
  source
FROM events
ORDER BY timestamp DESC
LIMIT 20;
```

---

## Event Metadata

All API events include metadata for forensic analysis:

```json
{
  "ip_address": "::1",
  "user_agent": "Mozilla/5.0...",
  "endpoint": "/api/v1/devices/:uuid/target-state",
  "provisioning_key_id": "uuid" // (only for provisioning)
}
```

---

## Benefits

### 1. **Complete Audit Trail**
- Every state change is permanently recorded
- Know exactly when and why each change happened
- Track who/what triggered each event

### 2. **Time Travel Debugging**
- Reconstruct device state at any point in history
- Compare target vs current state over time
- Identify when drift occurred

### 3. **Analytics & Insights**
- How often do target states change?
- Which devices report most frequently?
- What's the typical delay between target and current?

### 4. **Compliance & Security**
- Immutable log for compliance audits
- Detect unauthorized state changes
- Forensic analysis after security incidents

### 5. **Event-Driven Architecture**
- Build real-time dashboards from events
- Trigger alerts on specific event patterns
- Automated reconciliation when drift detected

---

## Next Steps

### 1. Add More Events

Consider adding events for:
- `container.started` / `container.stopped` / `container.crashed`
- `reconciliation.started` / `reconciliation.completed` / `reconciliation.failed`
- `image.pulled` / `image.pull_failed`
- `volume.created` / `volume.removed`
- `network.created` / `network.removed`

### 2. Real-Time Processing

Set up an EventListener to process events as they arrive:

```typescript
import { EventListener } from '../services/event-sourcing';

const listener = new EventListener();

// Alert on device offline
listener.onEventType('device.offline', async (event) => {
  console.log(`🚨 Device went offline: ${event.aggregate_id}`);
  // Send alert, update dashboard, etc.
});

// Auto-reconcile on target state change
listener.onEventType('target_state.updated', async (event) => {
  console.log(`🎯 Target state changed for ${event.aggregate_id}`);
  // Trigger reconciliation check
});

await listener.start();
```

### 3. Build Projections

Create read models for fast queries:

```typescript
import { ProjectionBuilder } from '../services/event-sourcing';

const builder = new ProjectionBuilder('device_summary');

builder.on('device.provisioned', async (event, state) => {
  return { ...state, deviceCount: (state.deviceCount || 0) + 1 };
});

builder.on('target_state.updated', async (event, state) => {
  return { ...state, lastUpdate: event.timestamp };
});

await builder.process();
```

### 4. Event Analytics

Query patterns for insights:

```sql
-- Most active devices (by state changes)
SELECT 
  aggregate_id as device_uuid,
  COUNT(*) as event_count
FROM events
WHERE event_type = 'current_state.updated'
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY aggregate_id
ORDER BY event_count DESC
LIMIT 10;

-- Target vs Current state drift
WITH target_updates AS (
  SELECT 
    aggregate_id,
    MAX(timestamp) as last_target_update
  FROM events
  WHERE event_type = 'target_state.updated'
  GROUP BY aggregate_id
),
current_updates AS (
  SELECT 
    aggregate_id,
    MAX(timestamp) as last_current_update
  FROM events
  WHERE event_type = 'current_state.updated'
  GROUP BY aggregate_id
)
SELECT 
  t.aggregate_id as device_uuid,
  t.last_target_update,
  c.last_current_update,
  (c.last_current_update - t.last_target_update) as drift_duration
FROM target_updates t
LEFT JOIN current_updates c ON t.aggregate_id = c.aggregate_id
WHERE c.last_current_update < t.last_target_update
ORDER BY drift_duration DESC;
```

---

## Architecture

```
API Endpoint → EventPublisher → PostgreSQL Events Table → EventListener → Actions
                                        ↓
                                  Event Store
                                        ↓
                               Queryable History
```

**Source:** `api/src/routes/cloud.ts` (lines 30, 373-394, 838-866, 1175-1197, 1538-1559)

**Event Publisher:** Initialized at router level, shared across all endpoints

**Storage:** Events stored in partitioned `events` table with daily partitions

**Retention:** 90 days default (configurable)

---

## Files Modified

- ✅ `api/src/routes/cloud.ts` - Added EventPublisher integration
- ✅ `api/scripts/test-api-events.ts` - Created test script

## Files to Review

- 📖 `api/docs/EVENT-SOURCING-GUIDE.md` - Complete implementation guide
- 📖 `api/src/services/event-sourcing.ts` - Event sourcing service
- 📖 `api/database/migrations/006_add_event_sourcing.sql` - Database schema

---

## Summary

✅ **4 Event Types** integrated into production API  
✅ **Complete audit trail** for device lifecycle  
✅ **Immutable history** of all state changes  
✅ **Ready for real-time processing** and analytics  
✅ **Production-tested** with comprehensive test script  

Event sourcing is now live and capturing critical system events! 🎉
