# Device Online Status Management

## Current Behavior (How it Works Now)

### ✅ When `is_online` and `is_active` are Set to TRUE

#### 1. **Device Registration** (`POST /api/v1/device/register`)
```typescript
is_online: true,
is_active: true
```
- Sets both fields to `true` when device first registers
- Updates `last_connectivity_event` to current timestamp

#### 2. **Device Activity** (Any API call)
When a device makes ANY API call (`getOrCreate()` is called):
```typescript
ON CONFLICT (uuid) DO UPDATE SET
  is_online = true,
  last_connectivity_event = CURRENT_TIMESTAMP
```
- Automatically sets `is_online = true`
- Updates `last_connectivity_event` timestamp

**Triggered by:**
- `GET /api/v1/device/:uuid/state` - Polling for target state
- `PATCH /api/v1/device/state` - Reporting current state
- `POST /api/v1/device/:uuid/logs` - Uploading logs
- Any endpoint that calls `DeviceModel.getOrCreate(uuid)`

### ❌ What Happens When Device Goes Offline (Current Implementation)

**Problem: NOTHING HAPPENS AUTOMATICALLY!**

The current API has:
- ✅ A `markOffline()` method in `DeviceModel`
- ❌ **NO automatic heartbeat monitoring**
- ❌ **NO background job to detect offline devices**
- ❌ **NO timeout mechanism**

**Result:** If you turn your device off:
1. Device stops making API calls
2. `is_online` stays `true` (WRONG!)
3. `last_connectivity_event` stops updating
4. Database shows device as online indefinitely

---

## 🐛 The Problem

**The API relies on device activity to update online status, but has no way to detect when a device stops communicating.**

This is a **passive system** - it only updates when devices check in, but never proactively checks if devices are still alive.

---

## 🔧 Solution: Implement Heartbeat Monitoring

### Option 1: Background Job (Recommended)

Add a scheduled job that periodically checks `last_connectivity_event`:

```typescript
// Runs every 60 seconds
setInterval(async () => {
  const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  
  await query(`
    UPDATE devices 
    SET is_online = false 
    WHERE is_online = true 
      AND last_connectivity_event < NOW() - INTERVAL '5 minutes'
  `);
}, 60000);
```

**Pros:**
- Simple to implement
- Works with existing device polling pattern
- No changes needed to device agent

**Cons:**
- Delay in detecting offline devices (up to check interval)
- Requires API to always be running

### Option 2: Dedicated Heartbeat Endpoint

Add a new endpoint that devices must ping regularly:

```typescript
// Device agent pings every 60 seconds
POST /api/v1/device/:uuid/heartbeat
```

**Pros:**
- More explicit intent
- Can track heartbeat separately from state updates

**Cons:**
- Requires changes to device agent
- Additional network traffic

### Option 3: Use Existing Polling as Heartbeat (Current Best)

The device already polls for target state every 30 seconds. We can leverage this:

```typescript
GET /api/v1/device/:uuid/state  // Already updates last_connectivity_event
```

Then add background job to check for stale timestamps.

---

## 🚀 Recommended Implementation

### 1. Add Heartbeat Monitor Service

Create `api/src/services/heartbeat-monitor.ts`:

```typescript
import { query } from '../db/connection';
import { logAuditEvent, AuditEventType, AuditSeverity } from '../utils/audit-logger';

export class HeartbeatMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly checkInterval = 60000; // 1 minute
  private readonly offlineThreshold = 5; // 5 minutes

  start() {
    console.log('🫀 Starting heartbeat monitor...');
    console.log(`   Checking every ${this.checkInterval / 1000}s`);
    console.log(`   Offline threshold: ${this.offlineThreshold} minutes`);

    this.intervalId = setInterval(() => {
      this.checkDevices();
    }, this.checkInterval);

    // Run immediately on start
    this.checkDevices();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🫀 Heartbeat monitor stopped');
    }
  }

  private async checkDevices() {
    try {
      const result = await query(`
        UPDATE devices 
        SET is_online = false,
            status = 'offline'
        WHERE is_online = true 
          AND last_connectivity_event < NOW() - INTERVAL '${this.offlineThreshold} minutes'
        RETURNING uuid, device_name, last_connectivity_event
      `);

      if (result.rows.length > 0) {
        console.log(`⚠️  Marked ${result.rows.length} device(s) as offline:`);
        
        for (const device of result.rows) {
          console.log(`   - ${device.device_name || device.uuid} (last seen: ${device.last_connectivity_event})`);
          
          await logAuditEvent({
            eventType: AuditEventType.DEVICE_OFFLINE,
            deviceUuid: device.uuid,
            severity: AuditSeverity.WARNING,
            details: {
              lastSeen: device.last_connectivity_event,
              offlineThresholdMinutes: this.offlineThreshold
            }
          });
        }
      }
    } catch (error) {
      console.error('❌ Error checking device heartbeats:', error);
    }
  }
}

export default new HeartbeatMonitor();
```

### 2. Initialize in Main Server

Update `api/src/index.ts`:

```typescript
import heartbeatMonitor from './services/heartbeat-monitor';

// After database initialization
heartbeatMonitor.start();

// In graceful shutdown
process.on('SIGTERM', () => {
  heartbeatMonitor.stop();
  // ... rest of shutdown
});
```

### 3. Configuration

Add environment variables to control behavior:

```bash
# .env
HEARTBEAT_CHECK_INTERVAL=60000        # Check every 60 seconds
HEARTBEAT_OFFLINE_THRESHOLD=5         # Minutes before marking offline
HEARTBEAT_ENABLED=true                # Enable/disable monitoring
```

---

## 📊 Monitoring & Alerts

### Database Queries

**Check currently online devices:**
```sql
SELECT uuid, device_name, is_online, last_connectivity_event
FROM devices 
WHERE is_online = true
ORDER BY last_connectivity_event DESC;
```

**Find stale connections:**
```sql
SELECT uuid, device_name, last_connectivity_event,
       EXTRACT(EPOCH FROM (NOW() - last_connectivity_event))/60 as minutes_since_last_seen
FROM devices 
WHERE is_online = true 
  AND last_connectivity_event < NOW() - INTERVAL '5 minutes';
```

**Device uptime statistics:**
```sql
SELECT 
  device_name,
  last_connectivity_event,
  NOW() - last_connectivity_event as time_since_last_seen,
  is_online
FROM devices
ORDER BY last_connectivity_event DESC;
```

### Audit Log

All offline events are logged to `audit_logs`:

```sql
SELECT * FROM audit_logs 
WHERE event_type = 'device_offline' 
ORDER BY created_at DESC;
```

---

## 🔄 Device Reconnection Flow

When a device comes back online:

1. Device makes any API call (e.g., polls for state)
2. `getOrCreate()` updates:
   ```sql
   is_online = true
   last_connectivity_event = CURRENT_TIMESTAMP
   ```
3. Device is automatically marked as online
4. Can optionally log reconnection event

---

## ⚙️ Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `HEARTBEAT_CHECK_INTERVAL` | 60000ms (1 min) | How often to check for offline devices |
| `HEARTBEAT_OFFLINE_THRESHOLD` | 5 minutes | Time without activity before marking offline |
| `HEARTBEAT_ENABLED` | true | Enable/disable heartbeat monitoring |

**Recommendations:**
- **Development**: 2-3 minute threshold
- **Production**: 5-10 minute threshold (accounts for network issues)
- **Critical systems**: 1-2 minute threshold + alerting

---

## 🎯 Summary

### Current State
- ✅ `is_online` set to `true` on device activity
- ✅ `last_connectivity_event` updated automatically
- ❌ No automatic offline detection
- ❌ Devices stay "online" forever if they disconnect

### After Implementation
- ✅ Automatic offline detection
- ✅ Configurable thresholds
- ✅ Audit logging for offline events
- ✅ Graceful reconnection handling
- ✅ Monitoring and alerts

### Next Steps
1. Implement `HeartbeatMonitor` service
2. Add to server initialization
3. Configure thresholds
4. Test offline detection
5. Monitor audit logs
