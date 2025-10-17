# API Downtime Handling - Heartbeat Monitor

## The Problem You Identified

**Question:** *"What if the API stops for maintenance or fails...does it record the last time it monitored the is_online status?"*

**Original Problem:** ❌
- API crashes or stops for maintenance
- Heartbeat monitor stops checking devices
- No record of when last check happened
- On restart, immediately checks all devices
- **FALSE POSITIVES**: Devices marked offline even though API was down (not the devices)

## The Solution ✅

The heartbeat monitor now:
1. **Records every check** in database (`system_config` table)
2. **Detects API downtime** on restart
3. **Adjusts offline detection** to account for downtime
4. **Only marks devices offline** if they were inactive BEFORE API stopped
5. **Logs restart events** for audit trail

---

## How It Works

### During Normal Operation

```
Every 60 seconds:
  1. Check devices for activity
  2. Mark offline if last_connectivity_event > 5 minutes
  3. Save check timestamp to database
```

**Database Record:**
```sql
INSERT INTO system_config (key, value)
VALUES ('heartbeat_last_check', '{"timestamp": "2025-10-17T10:30:00Z"}')
```

### On API Restart

```
API starts:
  1. Load last check time from database
  2. Calculate downtime = NOW - last_check_time
  3. If downtime > 2 check intervals:
     a. Log API restart event
     b. Only mark devices offline if:
        last_connectivity_event < last_check_time
        (i.e., device was inactive BEFORE API stopped)
  4. Resume normal monitoring
```

---

## Example Scenarios

### Scenario 1: Short API Restart (Normal)

```
10:00:00 - Last heartbeat check saved
10:01:00 - API crashes
10:02:00 - API restarts
          - Downtime: 2 minutes (less than 2 check intervals)
          - Action: Resume normal monitoring
          - ✅ No false positives
```

### Scenario 2: Long API Downtime (Maintenance)

```
10:00:00 - Last heartbeat check saved
10:00:30 - Device last contacted API (active)
10:01:00 - API stops for maintenance
10:30:00 - API restarts after 30 minutes
```

**Without downtime handling (OLD):**
```
❌ Device last_connectivity_event = 10:00:30
❌ Now = 10:30:00 (30 minutes later)
❌ 30 > 5 minutes threshold
❌ INCORRECTLY marked offline (API was down, not device!)
```

**With downtime handling (NEW):**
```
✅ API downtime detected: 30 minutes
✅ Last check: 10:00:00
✅ Device last_connectivity_event = 10:00:30 (AFTER last check)
✅ Device was ACTIVE during API downtime
✅ NOT marked offline - device may still be connected
```

### Scenario 3: Device Offline Before API Downtime

```
10:00:00 - Last heartbeat check saved
09:50:00 - Device last contacted API
10:01:00 - API stops
10:30:00 - API restarts
```

**Analysis:**
```
✅ API downtime detected: 30 minutes  
✅ Last check: 10:00:00
✅ Device last_connectivity_event = 09:50:00 (BEFORE last check)
✅ Device was already inactive for 10 minutes when API stopped
✅ CORRECTLY marked offline - device was down before API
```

---

## Database Schema

### New Table: `system_config`

**Created by migration:** `002_add_system_config.sql`

```sql
CREATE TABLE IF NOT EXISTS system_config (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose:** Store system-wide configuration and state that needs to persist across API restarts.

**Initial Setup:**
```bash
cd api
npx ts-node scripts/run-migrations.ts
```

**Data Example:**
```sql
SELECT * FROM system_config WHERE key = 'heartbeat_last_check';

-- Result:
key                    | value                                  | updated_at
-----------------------|----------------------------------------|---------------------------
heartbeat_last_check   | {"timestamp": "2025-10-17T10:30:00Z"} | 2025-10-17 10:30:00
```

---

## Console Output Examples

### First Run (No Previous State)

```
🫀 Starting heartbeat monitor...
   Check interval: 60s
   Offline threshold: 5 minutes
   No previous check time found (first run)
✅ Normal operation - no significant downtime detected
```

### Normal Restart (< 2 Minutes Downtime)

```
🫀 Starting heartbeat monitor...
   Check interval: 60s
   Offline threshold: 5 minutes
   Last check was at: 2025-10-17T10:28:00.000Z
✅ Normal operation - no significant downtime detected
```

### After Maintenance (30 Minutes Downtime)

```
🫀 Starting heartbeat monitor...
   Check interval: 60s
   Offline threshold: 5 minutes
   Last check was at: 2025-10-17T10:00:00.000Z
⚠️  API downtime detected: 30 minutes
   Last check: 2025-10-17T10:00:00.000Z
   API restarted: 2025-10-17T10:30:00.000Z
   Adjusted offline threshold: 35 minutes (includes downtime)
   📋 Marked 2 device(s) offline (were inactive BEFORE API downtime):
      - kitchen-sensor (last seen: 2025-10-17T09:55:00.000Z)
      - garage-sensor (last seen: 2025-10-17T09:58:00.000Z)
```

### After Crash (All Devices Were Active)

```
🫀 Starting heartbeat monitor...
   Check interval: 60s
   Offline threshold: 5 minutes
   Last check was at: 2025-10-17T10:00:00.000Z
⚠️  API downtime detected: 15 minutes
   Last check: 2025-10-17T10:00:00.000Z
   API restarted: 2025-10-17T10:15:00.000Z
   Adjusted offline threshold: 20 minutes (includes downtime)
✅ No devices to mark offline (all were active during API downtime)
```

---

## Audit Logging

### API Restart Event

```sql
SELECT * FROM audit_logs WHERE event_type = 'api_restart';
```

**Example:**
```json
{
  "event_type": "api_restart",
  "severity": "info",
  "created_at": "2025-10-17T10:30:00.000Z",
  "details": {
    "apiDowntimeMinutes": 30,
    "lastCheckTime": "2025-10-17T10:00:00.000Z",
    "restartTime": "2025-10-17T10:30:00.000Z",
    "devicesMarkedOffline": 2
  }
}
```

### Device Offline Event (After Restart)

```json
{
  "event_type": "device_offline",
  "device_uuid": "8479359e-dbeb-4858-813c-e8a9008dde04",
  "severity": "warning",
  "created_at": "2025-10-17T10:30:00.000Z",
  "details": {
    "deviceName": "kitchen-sensor",
    "lastSeen": "2025-10-17T09:55:00.000Z",
    "offlineThresholdMinutes": 5,
    "detectedAt": "2025-10-17T10:30:00.000Z",
    "apiDowntimeMinutes": 30,
    "reason": "Detected after API restart - device was inactive before downtime"
  }
}
```

---

## Testing Scenarios

### Test 1: Simulate API Crash and Restart

```powershell
# 1. Start API
cd api
npm run dev

# 2. Wait for devices to connect

# 3. Stop API (Ctrl+C or crash)

# 4. Wait 10 minutes

# 5. Restart API
npm run dev

# 6. Check console output - should see downtime detection
```

### Test 2: Check Stored State

```sql
-- View last check time
SELECT 
  key,
  value->>'timestamp' as last_check,
  updated_at
FROM system_config 
WHERE key = 'heartbeat_last_check';

-- Check API restart events
SELECT 
  created_at,
  details->>'apiDowntimeMinutes' as downtime_minutes,
  details->>'devicesMarkedOffline' as devices_affected
FROM audit_logs 
WHERE event_type = 'api_restart'
ORDER BY created_at DESC;
```

### Test 3: Manual Trigger After Simulated Downtime

```powershell
# Stop API for maintenance
# Wait 10 minutes
# Start API
# Manually trigger check
curl -X POST http://localhost:4002/api/v1/admin/heartbeat/check

# Check audit logs
# Should see proper handling of downtime
```

---

## Configuration

### Environment Variables

```bash
# .env
HEARTBEAT_ENABLED=true
HEARTBEAT_CHECK_INTERVAL=60000        # 1 minute
HEARTBEAT_OFFLINE_THRESHOLD=5         # Minutes
```

### Recommendations

**Production:**
```bash
HEARTBEAT_CHECK_INTERVAL=60000        # Check every minute
HEARTBEAT_OFFLINE_THRESHOLD=5         # 5 minute threshold
```

**High-Availability:**
```bash
HEARTBEAT_CHECK_INTERVAL=30000        # Check every 30 seconds
HEARTBEAT_OFFLINE_THRESHOLD=3         # 3 minute threshold
```

---

## Benefits of This Approach

### ✅ Accurate Offline Detection
- No false positives from API downtime
- Only marks devices that were actually offline

### ✅ Operational Visibility
- Know when API had downtime
- Track duration of outages
- See impact on device monitoring

### ✅ Audit Trail
- Complete history of API restarts
- Device offline events include context
- Can correlate device issues with API issues

### ✅ Graceful Degradation
- System recovers correctly after any length downtime
- State is persistent across restarts
- No manual intervention needed

---

## Edge Cases Handled

### 1. First Run (No Previous State)
```
✅ No lastCheckTime in database
✅ Skip downtime detection
✅ Start normal monitoring
```

### 2. Database Unavailable
```
⚠️  Cannot load last check time
✅ Log warning but continue
✅ Treat as first run
```

### 3. Very Long Downtime (Days/Weeks)
```
✅ Calculates actual downtime
✅ Only marks devices inactive before API stopped
✅ Logs full downtime duration
```

### 4. Rapid Restarts
```
✅ Downtime < 2 check intervals
✅ No special handling needed
✅ Resume normal operation
```

---

## Monitoring Queries

### Check Last Heartbeat Check Time

```sql
SELECT 
  value->>'timestamp' as last_check,
  EXTRACT(EPOCH FROM (NOW() - (value->>'timestamp')::timestamp))/60 as minutes_ago
FROM system_config 
WHERE key = 'heartbeat_last_check';
```

### Find API Restart Events

```sql
SELECT 
  created_at,
  details->>'apiDowntimeMinutes' as downtime,
  details->>'devicesMarkedOffline' as affected_devices
FROM audit_logs 
WHERE event_type = 'api_restart'
ORDER BY created_at DESC
LIMIT 10;
```

### Correlate Device Offline with API Downtime

```sql
SELECT 
  al1.created_at as restart_time,
  al1.details->>'apiDowntimeMinutes' as api_downtime,
  al2.device_uuid,
  al2.details->>'deviceName' as device_name,
  al2.details->>'reason' as offline_reason
FROM audit_logs al1
LEFT JOIN audit_logs al2 ON 
  al2.event_type = 'device_offline' AND
  al2.created_at BETWEEN al1.created_at - INTERVAL '1 minute' 
                     AND al1.created_at + INTERVAL '1 minute'
WHERE al1.event_type = 'api_restart'
ORDER BY al1.created_at DESC;
```

---

## Summary

### Problem Solved ✅

**Before:**
- API crash → devices falsely marked offline
- No visibility into API downtime
- No way to distinguish API issues from device issues

**After:**
- API crash → intelligent offline detection
- Full audit trail of API downtime
- Accurate device status even after outages
- Devices only marked offline if they were actually inactive

### Key Features

1. **Persistent State** - Last check time stored in database
2. **Downtime Detection** - Automatically detects API outages
3. **Smart Filtering** - Only marks devices that were inactive BEFORE API stopped
4. **Audit Trail** - Complete logging of all events
5. **Zero Config** - Works automatically on every restart

### Your Devices Are Safe! 🛡️

Even if the API crashes or undergoes maintenance, your devices won't be incorrectly marked as offline. The system intelligently distinguishes between:
- Device actually offline
- API was down (not the device's fault)

This ensures **accurate monitoring** and **prevents false alerts**! 🎯
