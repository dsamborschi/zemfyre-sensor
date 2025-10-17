# Testing Device Online Status & Heartbeat Monitor

## Quick Summary

**The Answer to Your Question:**

### How are `is_online` and `is_active` updated?

1. **`is_online = true`** - Set automatically when device makes ANY API call
   - Device registration
   - Polling for target state (`GET /api/v1/device/:uuid/state`)
   - Reporting current state (`PATCH /api/v1/device/state`)
   - Any endpoint that triggers `DeviceModel.getOrCreate()`

2. **`is_active = true`** - Set during device registration, manually controlled

3. **`last_connectivity_event`** - Updated to current timestamp on every API call

### What happens when you turn your device off?

**NOW (with heartbeat monitor implemented):**
- Device stops making API calls
- After 5 minutes of no communication, heartbeat monitor detects it
- `is_online` is automatically set to `false`
- `status` is set to `'offline'`
- Event is logged to audit trail

**BEFORE (without heartbeat monitor):**
- Device would stay `is_online = true` forever! ❌

---

## Testing the Heartbeat Monitor

### 1. Check Heartbeat Monitor Status

```bash
curl http://localhost:4002/api/v1/admin/heartbeat
```

**Expected Response:**
```json
{
  "status": "ok",
  "heartbeat": {
    "enabled": true,
    "checkInterval": 60000,
    "offlineThreshold": 5,
    "isRunning": true
  }
}
```

### 2. View Current Device Status

**PowerShell:**
```powershell
$devices = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices"
$devices.devices | Select-Object uuid, device_name, is_online, last_connectivity_event | Format-Table
```

**curl:**
```bash
curl http://localhost:4002/api/v1/devices | jq '.devices[] | {uuid, device_name, is_online, last_connectivity_event}'
```

### 3. Simulate Device Going Offline

**Option A: Turn off your actual Raspberry Pi device**

**Option B: Stop the device agent on your test device**
```bash
# On the device
docker stop application-manager
```

**Option C: Wait 5 minutes** (or configured `HEARTBEAT_OFFLINE_THRESHOLD`)

### 4. Manually Trigger Heartbeat Check (Don't Wait)

For testing, you can immediately check for offline devices:

```bash
curl -X POST http://localhost:4002/api/v1/admin/heartbeat/check
```

This will:
- Check all devices
- Mark any device with `last_connectivity_event` > 5 minutes ago as offline
- Log events to console and audit trail

### 5. Check Offline Events in Audit Log

**SQL Query:**
```sql
SELECT 
  event_type,
  device_uuid,
  details->>'deviceName' as device_name,
  details->>'lastSeen' as last_seen,
  created_at
FROM audit_logs 
WHERE event_type = 'device_offline'
ORDER BY created_at DESC
LIMIT 10;
```

**API Endpoint (if you add one):**
```bash
curl http://localhost:4002/api/v1/devices/{uuid}
```

Look for `is_online: false` and `status: "offline"`.

### 6. Device Comes Back Online

When device reconnects and makes ANY API call:
- `is_online` automatically set to `true`
- `last_connectivity_event` updated
- Device shows as online again

**Test it:**
```bash
# Device polls for state
curl http://localhost:4002/api/v1/device/YOUR_UUID/state
```

Immediately check:
```bash
curl http://localhost:4002/api/v1/devices/YOUR_UUID | jq '.device | {is_online, status, last_connectivity_event}'
```

---

## Configuration

### Environment Variables

Create `.env` file in `api/` directory:

```bash
# Heartbeat Monitor Configuration
HEARTBEAT_ENABLED=true                # Enable/disable monitoring
HEARTBEAT_CHECK_INTERVAL=60000        # Check every 60 seconds (1 minute)
HEARTBEAT_OFFLINE_THRESHOLD=5         # Minutes without activity before offline
```

### Recommended Settings

**Development/Testing:**
```bash
HEARTBEAT_CHECK_INTERVAL=30000        # Check every 30 seconds
HEARTBEAT_OFFLINE_THRESHOLD=2         # 2 minutes threshold (faster detection)
```

**Production:**
```bash
HEARTBEAT_CHECK_INTERVAL=60000        # Check every 1 minute
HEARTBEAT_OFFLINE_THRESHOLD=5         # 5 minutes threshold (accounts for network issues)
```

**Critical Systems with Alerting:**
```bash
HEARTBEAT_CHECK_INTERVAL=30000        # Check every 30 seconds
HEARTBEAT_OFFLINE_THRESHOLD=3         # 3 minutes threshold
# Add alerting webhook or email notification
```

---

## Monitoring Queries

### Find Devices About to Go Offline

```sql
SELECT 
  uuid,
  device_name,
  is_online,
  last_connectivity_event,
  EXTRACT(EPOCH FROM (NOW() - last_connectivity_event))/60 as minutes_idle,
  CASE 
    WHEN last_connectivity_event < NOW() - INTERVAL '4 minutes' THEN 'WARNING: Close to offline threshold'
    ELSE 'OK'
  END as status
FROM devices 
WHERE is_online = true
ORDER BY last_connectivity_event ASC;
```

### Device Uptime Statistics

```sql
SELECT 
  device_name,
  is_online,
  CASE 
    WHEN is_online THEN 
      EXTRACT(EPOCH FROM (NOW() - created_at))/3600 || ' hours'
    ELSE
      EXTRACT(EPOCH FROM (last_connectivity_event - created_at))/3600 || ' hours'
  END as total_uptime,
  CASE 
    WHEN is_online THEN 'Currently online'
    ELSE 
      EXTRACT(EPOCH FROM (NOW() - last_connectivity_event))/60 || ' minutes ago'
  END as last_seen
FROM devices
ORDER BY is_online DESC, last_connectivity_event DESC;
```

### Count Online vs Offline

```sql
SELECT 
  is_online,
  COUNT(*) as count,
  ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM devices)::numeric * 100, 2) as percentage
FROM devices
GROUP BY is_online;
```

---

## API Server Console Output

When heartbeat monitor detects offline devices, you'll see:

```
⚠️  Marked 2 device(s) as offline:
   - test-device-001 (last seen: 2025-10-17T02:15:30.123Z)
   - raspberry-pi-kitchen (last seen: 2025-10-17T02:14:45.789Z)
```

---

## Troubleshooting

### Heartbeat Monitor Not Running

**Check logs on API startup:**
```
🫀 Starting heartbeat monitor...
   Check interval: 60s
   Offline threshold: 5 minutes
```

**If you see:**
```
🫀 Heartbeat monitor disabled via configuration
```

Set in `.env`:
```bash
HEARTBEAT_ENABLED=true
```

### Devices Not Going Offline

1. **Check threshold:**
   ```bash
   curl http://localhost:4002/api/v1/admin/heartbeat
   ```

2. **Manually trigger check:**
   ```bash
   curl -X POST http://localhost:4002/api/v1/admin/heartbeat/check
   ```

3. **Check `last_connectivity_event`:**
   ```sql
   SELECT uuid, device_name, last_connectivity_event, NOW() - last_connectivity_event as time_since_last_seen
   FROM devices 
   WHERE is_online = true;
   ```

### False Offline Detections

If devices are incorrectly marked offline:

1. **Increase threshold:**
   ```bash
   HEARTBEAT_OFFLINE_THRESHOLD=10  # 10 minutes
   ```

2. **Check device polling interval:**
   - Devices should poll more frequently than offline threshold
   - Example: If threshold is 5 min, device should poll every 1-2 min

---

## Complete Test Workflow

```powershell
# 1. Start API (with heartbeat monitor)
cd api
npm run dev

# 2. Check heartbeat monitor is running
curl http://localhost:4002/api/v1/admin/heartbeat

# 3. Register a test device
$body = @{
    uuid = [guid]::NewGuid().ToString()
    deviceName = "test-offline-detection"
    deviceType = "test"
    deviceApiKey = "test-key-12345"
} | ConvertTo-Json

$PROVISIONING_KEY = "your-key-here"

Invoke-RestMethod -Uri "http://localhost:4002/api/v1/device/register" `
    -Method POST `
    -Headers @{"Authorization" = "Bearer $PROVISIONING_KEY"} `
    -ContentType "application/json" `
    -Body $body

# 4. Verify device is online
$uuid = $response.uuid
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$uuid"

# 5. Wait 6 minutes OR manually trigger check
Start-Sleep -Seconds 360
# OR
curl -X POST http://localhost:4002/api/v1/admin/heartbeat/check

# 6. Check device is now offline
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$uuid"
# Should show: is_online = false

# 7. Simulate device coming back online
curl "http://localhost:4002/api/v1/device/$uuid/state"

# 8. Check device is online again
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$uuid"
# Should show: is_online = true
```

---

## Summary

✅ **Heartbeat monitor implemented and running**
✅ **Automatic offline detection after configurable threshold**
✅ **Automatic online restoration when device reconnects**
✅ **Audit logging for all offline events**
✅ **Admin endpoints for monitoring and manual checks**
✅ **Configurable via environment variables**

Your devices will now properly reflect their actual connectivity status!
