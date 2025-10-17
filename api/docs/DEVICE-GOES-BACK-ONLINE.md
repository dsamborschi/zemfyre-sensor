# How Device Goes Back Online

## Your Question

> "so once the device goes back online...will that monitor change the status or device pushing the status?"

## Answer: **Device Pushes the Status** ✅

The **heartbeat monitor only marks devices OFFLINE** (one direction). When a device comes back online, **the device itself updates its status** by making API calls.

---

## The Complete Flow

### 1. Device Goes Offline (Monitor Detects)

```
Device stops contacting API → Heartbeat monitor checks every 60s → 
After 5 minutes of no activity → Monitor sets is_online = false
```

**Who does it:** ⏱️ **Heartbeat Monitor Service** (automatic)

---

### 2. Device Comes Back Online (Device Reports)

```
Device reconnects → Makes ANY API call → 
API updates last_connectivity_event → Sets is_online = true
```

**Who does it:** 📱 **Device itself** (by calling API)

---

## Code Implementation

### Device Reporting (Automatic on Every Call)

**Location:** `api/src/db/models.ts` - `DeviceModel.getOrCreate()`

```typescript
static async getOrCreate(uuid: string): Promise<Device> {
  const result = await query<Device>(
    `INSERT INTO devices (uuid, is_online, is_active)
     VALUES ($1, true, true)
     ON CONFLICT (uuid) DO UPDATE SET
       is_online = true,                           // ✅ Set back online
       last_connectivity_event = CURRENT_TIMESTAMP // ✅ Record activity
     RETURNING *`,
    [uuid]
  );
  return result.rows[0];
}
```

**This function is called by:**
- ✅ `GET /api/v1/device/:uuid/state` - Device polls for target state (every 30s)
- ✅ `PATCH /api/v1/device/state` - Device reports current state
- ✅ `POST /api/v1/device/register` - Device provisioning
- ✅ Any device-initiated API call

---

### Heartbeat Monitor (Only Marks Offline)

**Location:** `api/src/services/heartbeat-monitor.ts`

```typescript
private async checkDevices(): Promise<void> {
  // Only marks devices OFFLINE, never ONLINE
  const result = await query(`
    UPDATE devices 
    SET is_online = false,
        updated_at = CURRENT_TIMESTAMP
    WHERE is_online = true 
      AND last_connectivity_event < NOW() - INTERVAL '${this.offlineThreshold} minutes'
    RETURNING uuid, device_name, last_connectivity_event
  `);
  
  console.log(`🔴 Marked ${result.rows.length} device(s) offline`);
}
```

**Notice:** The monitor **NEVER sets `is_online = true`**. It only detects when devices go offline.

---

## Why This Design?

### ✅ Advantages of "Device Pushes Online Status"

1. **Real-time accuracy** - Device status updates immediately when it reconnects
2. **No polling needed** - Monitor doesn't need to ping devices
3. **Natural lifecycle** - Device activity inherently proves it's online
4. **Scales well** - Works with millions of devices (no active probing)

### ❌ Alternative: "Monitor Detects Both Online/Offline"

If the monitor tried to detect when devices come back online:
- ❌ Would need to ping/probe every offline device regularly
- ❌ Firewall/NAT issues - can't reach devices behind routers
- ❌ Increased network traffic and API load
- ❌ Delayed detection (only checks every 60 seconds)

---

## Timeline Example

### Scenario: Device Loses Power, Then Recovers

```
10:00:00 - Device last contacted API (GET /state)
         - is_online = true
         - last_connectivity_event = 10:00:00

10:00:30 - Device loses power (offline)

10:01:00 - Heartbeat check #1 (activity < 5 min ago, still considers online)
10:02:00 - Heartbeat check #2 (activity < 5 min ago, still considers online)
10:03:00 - Heartbeat check #3 (activity < 5 min ago, still considers online)
10:04:00 - Heartbeat check #4 (activity < 5 min ago, still considers online)
10:05:00 - Heartbeat check #5 (activity < 5 min ago, still considers online)

10:06:00 - Heartbeat check #6 (activity > 5 min ago)
         - Monitor marks: is_online = false ❌
         - Console: "🔴 Device my-device marked offline"

[Device is offline for 30 minutes]

10:36:00 - Device power restored
         - Device boots up
         - Connects to network
         
10:36:30 - Device polls API: GET /api/v1/device/:uuid/state
         - getOrCreate() called automatically
         - UPDATE devices SET is_online = true ✅
         - Console: "📥 Received state request from device abc123..."

10:36:31 - Device is now ONLINE
         - No manual intervention needed
         - Monitor sees last_connectivity_event = 10:36:30
         - Won't mark offline on next check
```

---

## What Triggers the "Back Online" Update?

### Every Device API Call Triggers It

**1. Polling for Target State (Most Common)**
```bash
# Device polls every 30 seconds
GET /api/v1/device/:uuid/state

# API response includes getOrCreate() which:
# - Sets is_online = true
# - Updates last_connectivity_event
```

**2. Reporting Current State**
```bash
# Device reports its state
PATCH /api/v1/device/state

# Body: { "uuid": {...}, "apps": {...} }
# API calls getOrCreate() → sets online
```

**3. Initial Provisioning**
```bash
# Device first registration
POST /api/v1/device/register

# Creates device with is_online = true
```

**4. Any Device-Initiated Request**
- Device metrics reporting
- Log uploads
- Configuration changes
- State queries

**All these endpoints call `getOrCreate()` which automatically sets the device online.**

---

## Database State Transitions

### Offline → Online (Device-Driven)

```sql
-- Before: Device offline
SELECT is_online, last_connectivity_event FROM devices WHERE uuid = 'abc-123';
-- Result: false | 2025-10-16 10:00:00

-- Device makes API call (any endpoint)
-- getOrCreate() executes:
UPDATE devices 
SET is_online = true, 
    last_connectivity_event = CURRENT_TIMESTAMP
WHERE uuid = 'abc-123';

-- After: Device online
SELECT is_online, last_connectivity_event FROM devices WHERE uuid = 'abc-123';
-- Result: true | 2025-10-16 10:36:30
```

### Online → Offline (Monitor-Driven)

```sql
-- Before: Device online
SELECT is_online, last_connectivity_event FROM devices WHERE uuid = 'abc-123';
-- Result: true | 2025-10-16 10:00:00

-- Heartbeat monitor runs (60s interval)
-- After 5 minutes of inactivity:
UPDATE devices 
SET is_online = false
WHERE is_online = true 
  AND last_connectivity_event < NOW() - INTERVAL '5 minutes';

-- After: Device offline
SELECT is_online, last_connectivity_event FROM devices WHERE uuid = 'abc-123';
-- Result: false | 2025-10-16 10:00:00  (timestamp unchanged)
```

---

## Monitoring Query

### Track Device Online/Offline Transitions

```sql
-- See recent online status changes
SELECT 
  uuid,
  device_name,
  is_online,
  last_connectivity_event,
  EXTRACT(EPOCH FROM (NOW() - last_connectivity_event))/60 as minutes_since_activity,
  updated_at
FROM devices
ORDER BY updated_at DESC
LIMIT 10;
```

### Find Devices That Recently Came Back Online

```sql
SELECT 
  uuid,
  device_name,
  is_online,
  last_connectivity_event,
  updated_at,
  updated_at - last_connectivity_event as offline_duration
FROM devices
WHERE is_online = true
  AND updated_at > NOW() - INTERVAL '1 hour'
  AND updated_at - last_connectivity_event > INTERVAL '5 minutes'
ORDER BY updated_at DESC;

-- Interpretation:
-- If offline_duration > 5 minutes, device was offline and just came back
```

---

### Audit Trail

### Device Coming Back Online ✅

**NEW: Explicit "came back online" events are now logged!**

When a device that was previously offline makes an API call, the system:
1. Detects the device was offline (`is_online = false`)
2. Calculates offline duration
3. Logs a `DEVICE_ONLINE` audit event
4. Prints console message: `✅ Device kitchen-sensor came back online after 30 minutes`

**Query for devices that came back online:**

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

**Example result:**
```
created_at              | device_uuid  | device_name    | minutes_offline | went_offline            | came_online
------------------------|--------------|----------------|-----------------|-------------------------|-------------------------
2025-10-16 10:36:30     | abc-123...   | kitchen-sensor | 30              | 2025-10-16 10:06:00     | 2025-10-16 10:36:30
2025-10-16 09:15:22     | def-456...   | garage-sensor  | 120             | 2025-10-16 07:15:00     | 2025-10-16 09:15:22
```

### Device Going Offline

```sql
### Device Going Offline

**Query for offline events:**

```sql
-- Device was marked offline
SELECT * FROM audit_logs 
WHERE event_type = 'device_offline' 
  AND device_uuid = 'abc-123'
ORDER BY created_at DESC 
LIMIT 1;

-- Then check device current status
SELECT is_online, last_connectivity_event 
FROM devices 
WHERE uuid = 'abc-123';

-- If is_online = true and last_connectivity_event > offline event time:
-- Device came back online!

-- Or simply query device_online events directly:
SELECT * FROM audit_logs 
WHERE event_type = 'device_online'
  AND device_uuid = 'abc-123'
ORDER BY created_at DESC;
```

### Correlating Offline → Online Events

```sql
-- Find pairs of offline/online events for same device
WITH offline_events AS (
  SELECT 
    device_uuid,
    created_at as offline_at,
    details->>'deviceName' as device_name
  FROM audit_logs
  WHERE event_type = 'device_offline'
),
online_events AS (
  SELECT 
    device_uuid,
    created_at as online_at,
    details->>'offlineDurationMinutes' as duration_min
  FROM audit_logs
  WHERE event_type = 'device_online'
)
SELECT 
  o1.device_name,
  o1.offline_at,
  o2.online_at,
  o2.duration_min,
  o2.online_at - o1.offline_at as measured_duration
FROM offline_events o1
LEFT JOIN online_events o2 
  ON o1.device_uuid = o2.device_uuid
  AND o2.online_at > o1.offline_at
  AND o2.online_at = (
    SELECT MIN(created_at) 
    FROM audit_logs 
    WHERE event_type = 'device_online' 
      AND device_uuid = o1.device_uuid 
      AND created_at > o1.offline_at
  )
ORDER BY o1.offline_at DESC;
```

---

## Configuration

### Device Polling Interval (Agent Side)

**Location:** `agent/src/supervisor.ts` or similar

```typescript
// Device polls API every 30 seconds
const POLL_INTERVAL = 30000; // 30 seconds

setInterval(async () => {
  await checkTargetState(); // Calls GET /api/v1/device/:uuid/state
}, POLL_INTERVAL);
```

### Offline Detection Threshold (API Side)

**Location:** `api/.env`

```bash
HEARTBEAT_CHECK_INTERVAL=60000  # Check every 60 seconds
HEARTBEAT_OFFLINE_THRESHOLD=5   # Mark offline after 5 minutes
```

---

## Summary

| Action | Who Does It | How |
|--------|------------|-----|
| **Device goes offline** | ⏱️ Heartbeat Monitor | Detects `last_connectivity_event` > 5 min ago |
| **Device comes back online** | 📱 Device itself | Makes API call → `getOrCreate()` → `is_online = true` |

### Key Takeaway

**The heartbeat monitor is ONE-WAY:**
- ✅ Marks devices **offline** when they stop communicating
- ❌ Does **NOT** mark devices **online** when they reconnect

**Devices mark THEMSELVES online** by simply calling the API. Every API call from the device automatically:
1. Sets `is_online = true`
2. Updates `last_connectivity_event = NOW()`
3. Resets the offline detection timer

This is a **passive monitoring** system - the device's own activity proves it's online! 🎯
