# Device Online Status - Complete Answer

## Your Questions Answered

### Q: How are `is_online` and `is_active` updated?

**`is_online` field:**
- ✅ Set to `true` automatically whenever device makes ANY API call
- ✅ Updated via `DeviceModel.getOrCreate()` which is called by:
  - Device registration
  - State polling (`GET /api/v1/device/:uuid/state`)
  - State reporting (`PATCH /api/v1/device/state`)
  - Log uploads
  - Key exchange
- ✅ Set to `false` by the **Heartbeat Monitor** after 5 minutes of inactivity

**`is_active` field:**
- Set to `true` during device registration
- Manual administrative control (not automatically updated)
- Used for administratively disabling devices

**`last_connectivity_event` timestamp:**
- Updated to current time on EVERY API call
- Used by heartbeat monitor to determine if device is still alive

### Q: What happens when I turn my device off?

**With the new Heartbeat Monitor (✅ IMPLEMENTED):**

1. **Device stops communicating** (no more API calls)
2. **`last_connectivity_event` becomes stale** (no updates)
3. **After 5 minutes**, heartbeat monitor detects inactivity
4. **Automatically sets:**
   - `is_online = false`
   - `status = 'offline'`
5. **Logs event** to audit trail with device name and timestamp
6. **When device reconnects**, first API call automatically:
   - Sets `is_online = true` again
   - Updates `last_connectivity_event`
   - Device shown as online

---

## Implementation Summary

### ✅ What Was Added

1. **Heartbeat Monitor Service** (`api/src/services/heartbeat-monitor.ts`)
   - Runs every 60 seconds by default
   - Checks for devices with no activity for 5+ minutes
   - Marks them offline automatically
   - Logs all offline events

2. **Integration with API Server** (`api/src/index.ts`)
   - Starts automatically when API starts
   - Stops gracefully on shutdown
   - Configurable via environment variables

3. **Admin Endpoints** (`api/src/routes/cloud.ts`)
   - `GET /api/v1/admin/heartbeat` - View monitor status
   - `POST /api/v1/admin/heartbeat/check` - Manual trigger

4. **Documentation**
   - `DEVICE-ONLINE-STATUS.md` - Complete technical explanation
   - `TESTING-HEARTBEAT.md` - Testing guide and examples

### 📝 Configuration

Add to your `api/.env` file:

```bash
# Heartbeat Monitor (all optional, these are defaults)
HEARTBEAT_ENABLED=true                # Enable monitoring
HEARTBEAT_CHECK_INTERVAL=60000        # Check every 60 seconds
HEARTBEAT_OFFLINE_THRESHOLD=5         # Minutes before marking offline
```

### 🚀 Usage

**No changes needed to your device agent!** It already does everything required:
- Polls for state every 30 seconds → updates `last_connectivity_event`
- Reports state periodically → updates `last_connectivity_event`
- Any API call keeps device marked as online

---

## Quick Test

### 1. Start the API
```bash
cd api
npm run dev
```

You'll see:
```
🫀 Starting heartbeat monitor...
   Check interval: 60s
   Offline threshold: 5 minutes
```

### 2. Check Monitor Status
```bash
curl http://localhost:4002/api/v1/admin/heartbeat
```

### 3. View Your Devices
```bash
curl http://localhost:4002/api/v1/devices
```

Look at the `is_online` and `last_connectivity_event` fields.

### 4. Turn Off a Device

Wait 5 minutes, or manually trigger check:
```bash
curl -X POST http://localhost:4002/api/v1/admin/heartbeat/check
```

### 5. Check Device Status Again
```bash
curl http://localhost:4002/api/v1/devices
```

Device should now show `is_online: false`.

### 6. Turn Device Back On

When it makes any API call, it's automatically marked online again!

---

## Database Queries

**Check all devices:**
```sql
SELECT 
  device_name,
  is_online,
  is_active,
  last_connectivity_event,
  EXTRACT(EPOCH FROM (NOW() - last_connectivity_event))/60 as minutes_idle
FROM devices
ORDER BY last_connectivity_event DESC;
```

**Find offline devices:**
```sql
SELECT device_name, last_connectivity_event
FROM devices 
WHERE is_online = false
ORDER BY last_connectivity_event DESC;
```

**Check offline events in audit log:**
```sql
SELECT 
  created_at,
  device_uuid,
  details->>'deviceName' as device_name,
  details->>'lastSeen' as last_seen
FROM audit_logs 
WHERE event_type = 'device_offline'
ORDER BY created_at DESC;
```

---

## Architecture

```
Device Agent (Raspberry Pi)
  └─> Polls API every 30s
        └─> Updates last_connectivity_event
        └─> Sets is_online = true

Heartbeat Monitor (API Server)
  └─> Checks every 60s
        └─> Finds devices with last_connectivity_event > 5 minutes
        └─> Sets is_online = false
        └─> Logs to audit_logs

Device Reconnects
  └─> First API call
        └─> Sets is_online = true
        └─> Updates last_connectivity_event
```

---

## Next Steps

### Optional Enhancements

1. **Email/Webhook Alerts**
   ```typescript
   // In heartbeat-monitor.ts
   if (result.rows.length > 0) {
     await sendAlert(`${result.rows.length} devices went offline`);
   }
   ```

2. **Grafana Dashboard**
   - Show online vs offline count
   - Graph connectivity over time
   - Alert on offline events

3. **Device Health Score**
   - Track uptime percentage
   - Monitor disconnection frequency
   - Identify problematic devices

4. **Reconnection Logging**
   - Log when devices come back online
   - Track downtime duration
   - Analyze connectivity patterns

---

## Files Changed

1. ✅ `api/src/services/heartbeat-monitor.ts` - New service
2. ✅ `api/src/index.ts` - Integration and startup
3. ✅ `api/src/routes/cloud.ts` - Admin endpoints
4. ✅ `api/docs/DEVICE-ONLINE-STATUS.md` - Documentation
5. ✅ `api/docs/TESTING-HEARTBEAT.md` - Testing guide

---

## Your Device Status Now

Run this to see your device's current status:

```powershell
$device = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices" | 
    Select-Object -ExpandProperty devices | 
    Select-Object -First 1

Write-Host "Device: $($device.device_name)"
Write-Host "UUID: $($device.uuid)"
Write-Host "Online: $($device.is_online)"
Write-Host "Active: $($device.is_active)"  
Write-Host "Last Seen: $($device.last_connectivity_event)"
Write-Host ""
Write-Host "Minutes since last contact: " -NoNewline
$lastSeen = [DateTime]::Parse($device.last_connectivity_event)
$minutesIdle = (Get-Date) - $lastSeen
Write-Host "$([Math]::Round($minutesIdle.TotalMinutes, 1)) minutes"
```

**That's it! Your devices will now properly show online/offline status! 🎉**
