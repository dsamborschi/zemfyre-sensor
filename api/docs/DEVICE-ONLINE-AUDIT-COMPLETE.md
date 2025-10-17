# Device Online Audit Logging - Implementation Complete ✅

## What Was Added

You correctly identified that **no audit log was created when devices came back online**. This has now been implemented!

---

## Changes Made

### 1. Updated `DeviceModel.getOrCreate()` 

**File:** `api/src/db/models.ts`

**What it does:**
- Before updating device status, checks if device exists and was offline
- If device was offline → calculates offline duration
- Logs `DEVICE_ONLINE` audit event with details
- Prints console message: `✅ Device kitchen-sensor came back online after 30 minutes`

**Code added:**
```typescript
static async getOrCreate(uuid: string): Promise<Device> {
  // Check if device was offline before
  const existingDevice = await this.getByUuid(uuid);
  const wasOffline = existingDevice && !existingDevice.is_online;
  
  // Update device to online
  const result = await query<Device>(
    `INSERT INTO devices (uuid, is_online, is_active)
     VALUES ($1, true, true)
     ON CONFLICT (uuid) DO UPDATE SET
       is_online = true,
       last_connectivity_event = CURRENT_TIMESTAMP
     RETURNING *`,
    [uuid]
  );
  
  // Log when device comes back online
  if (wasOffline && existingDevice) {
    const offlineDurationMs = Date.now() - new Date(existingDevice.modified_at).getTime();
    const offlineDurationMin = Math.floor(offlineDurationMs / 1000 / 60);
    
    await logAuditEvent({
      eventType: AuditEventType.DEVICE_ONLINE,
      deviceUuid: uuid,
      severity: AuditSeverity.INFO,
      details: {
        deviceName: existingDevice.device_name || 'Unknown',
        wasOfflineAt: existingDevice.modified_at,
        offlineDurationMinutes: offlineDurationMin,
        cameOnlineAt: new Date().toISOString()
      }
    });
    
    console.log(`✅ Device ${existingDevice.device_name || uuid.substring(0, 8)} came back online after ${offlineDurationMin} minutes`);
  }
  
  return result.rows[0];
}
```

### 2. Updated Documentation

**File:** `api/docs/DEVICE-GOES-BACK-ONLINE.md`

- Removed "Optional" section (feature is now implemented)
- Added SQL queries to view device online events
- Added SQL query to correlate offline/online event pairs
- Added examples of what audit logs look like

---

## How to Use

### View Devices That Came Back Online

```sql
SELECT 
  created_at,
  device_uuid,
  details->>'deviceName' as device_name,
  details->>'offlineDurationMinutes' as minutes_offline,
  details->>'wasOfflineAt' as went_offline,
  details->>'cameOnlineAt' as came_online
FROM audit_logs 
WHERE event_type = 'device_online'
ORDER BY created_at DESC
LIMIT 10;
```

**Example output:**
```
created_at              | device_uuid  | device_name    | minutes_offline | went_offline            | came_online
------------------------|--------------|----------------|-----------------|-------------------------|-------------------------
2025-10-16 10:36:30     | abc-123...   | kitchen-sensor | 30              | 2025-10-16 10:06:00     | 2025-10-16 10:36:30
2025-10-16 09:15:22     | def-456...   | garage-sensor  | 120             | 2025-10-16 07:15:00     | 2025-10-16 09:15:22
```

### Find Offline/Online Pairs for a Device

```sql
-- Simple version - just for one device
SELECT 
  event_type,
  created_at,
  details->>'deviceName' as device_name,
  details->>'offlineDurationMinutes' as offline_minutes
FROM audit_logs
WHERE device_uuid = '8479359e-dbeb-4858-813c-e8a9008dde04'
  AND event_type IN ('device_offline', 'device_online')
ORDER BY created_at DESC;
```

### Console Output

When a device comes back online, you'll see:

```
✅ Device kitchen-sensor came back online after 30 minutes
```

---

## Complete Device Lifecycle Audit Trail

Now you have **complete visibility** into device connectivity:

### 1. Device Goes Offline (Monitor Detects)
```
Event: device_offline
Logged by: HeartbeatMonitor
Frequency: Every 60 seconds (checks all devices)
Condition: last_connectivity_event > 5 minutes ago
```

**Audit log:**
```json
{
  "event_type": "device_offline",
  "device_uuid": "abc-123",
  "severity": "warning",
  "details": {
    "deviceName": "kitchen-sensor",
    "lastSeen": "2025-10-16T10:00:00Z",
    "offlineThresholdMinutes": 5,
    "detectedAt": "2025-10-16T10:06:00Z"
  }
}
```

### 2. Device Comes Back Online (Device Reports) ✨ NEW

```
Event: device_online
Logged by: DeviceModel.getOrCreate()
Triggered: On ANY device API call
Condition: Device was offline (is_online = false)
```

**Audit log:**
```json
{
  "event_type": "device_online",
  "device_uuid": "abc-123",
  "severity": "info",
  "details": {
    "deviceName": "kitchen-sensor",
    "wasOfflineAt": "2025-10-16T10:06:00Z",
    "offlineDurationMinutes": 30,
    "cameOnlineAt": "2025-10-16T10:36:00Z"
  }
}
```

---

## Testing

### Manual Test Scenario

1. **Start API**
   ```powershell
   cd api
   npm run dev
   ```

2. **Device connects and goes online**
   - Device makes API call
   - Should see: `✅ Device came back online...` (if was previously offline)

3. **Stop device or disconnect network**
   - Wait 5+ minutes

4. **Heartbeat marks offline**
   - Should see: `🔴 Device marked offline`
   - Check audit_logs: `SELECT * FROM audit_logs WHERE event_type = 'device_offline' ORDER BY created_at DESC LIMIT 1;`

5. **Reconnect device**
   - Device makes API call
   - Should see: `✅ Device kitchen-sensor came back online after 30 minutes`
   - Check audit_logs: `SELECT * FROM audit_logs WHERE event_type = 'device_online' ORDER BY created_at DESC LIMIT 1;`

### Expected Console Output

```
📥 Received state request from device 8479359e...
✅ Device kitchen-sensor came back online after 30 minutes
```

### Database Verification

```sql
-- Should have both offline and online events
SELECT 
  event_type,
  created_at,
  details->>'deviceName' as name,
  details->>'offlineDurationMinutes' as duration
FROM audit_logs
WHERE device_uuid = 'your-device-uuid'
  AND event_type IN ('device_offline', 'device_online')
ORDER BY created_at DESC
LIMIT 10;
```

---

## Benefits

### ✅ Complete Audit Trail
- Know exactly when devices go offline
- Know exactly when they come back
- Calculate actual downtime duration

### ✅ Operational Visibility
- Monitor device reliability
- Identify problematic devices (frequent offline/online cycles)
- Alert on extended downtimes

### ✅ Troubleshooting
- Correlate device issues with offline events
- See if issues resolved when device came back online
- Track patterns (e.g., device goes offline every night)

### ✅ Analytics
```sql
-- Device with most offline incidents
SELECT 
  device_uuid,
  COUNT(*) as offline_count
FROM audit_logs
WHERE event_type = 'device_offline'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY device_uuid
ORDER BY offline_count DESC;

-- Average offline duration per device
SELECT 
  device_uuid,
  AVG((details->>'offlineDurationMinutes')::int) as avg_offline_minutes,
  COUNT(*) as total_offline_events
FROM audit_logs
WHERE event_type = 'device_online'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY device_uuid
ORDER BY avg_offline_minutes DESC;
```

---

## Summary

### Before ❌
- Device offline events logged ✅
- Device online events **NOT logged** ❌
- No visibility into when devices recovered
- No downtime duration tracking

### After ✅
- Device offline events logged ✅
- Device online events **NOW logged** ✅
- Complete visibility into device lifecycle
- Automatic downtime duration calculation
- Console logging for real-time visibility
- Rich audit trail for analytics

---

## Files Modified

1. ✅ `api/src/db/models.ts` - Added online detection and logging
2. ✅ `api/docs/DEVICE-GOES-BACK-ONLINE.md` - Updated documentation
3. ✅ `api/database/migrations/002_add_system_config.sql` - Database migration for system_config table

## Database Setup

**Run migrations to create required tables:**
```bash
cd api
npx ts-node scripts/run-migrations.ts
```

This will create:
- ✅ `system_config` table (for heartbeat state persistence)
- ✅ All other required tables

## Build Status

✅ **TypeScript compilation successful** - Ready to deploy!

---

Great catch on identifying this gap! The system now has **complete bidirectional audit logging** for device connectivity events. 🎯
