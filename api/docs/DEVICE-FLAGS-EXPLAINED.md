# Device Flags: `is_online` vs `is_active`

## Quick Answer

**`is_online`** = Connectivity status (automatic)  
**`is_active`** = Administrative status (manual)

---

## Detailed Comparison

| Aspect | `is_online` | `is_active` |
|--------|-------------|-------------|
| **Purpose** | Network connectivity | Administrative control |
| **Updated by** | System (automatic) | Admin (manual) |
| **Frequency** | Changes constantly | Rarely changes |
| **Set to `true`** | When device communicates | During registration or admin action |
| **Set to `false`** | After 5 min no activity | By admin action only |
| **Use case** | "Is device connected?" | "Should we use this device?" |

---

## `is_online` - Connectivity Status

### What It Means
Indicates whether the device is **currently communicating** with the API.

### How It Works
```
Device makes API call → is_online = true
        ↓
No activity for 5 minutes
        ↓
Heartbeat monitor → is_online = false
        ↓
Device reconnects (any API call)
        ↓
is_online = true (automatic)
```

### When It Changes
- ✅ **Set to `true`**: Device polls, reports state, or makes any API call
- ❌ **Set to `false`**: Heartbeat monitor detects 5+ minutes of inactivity

### You Don't Control This
This flag is **managed automatically** by the system based on actual network activity.

---

## `is_active` - Administrative Status

### What It Means
Indicates whether the device is **administratively enabled** for use.

### How It Works
```
Device registered → is_active = true
        ↓
Admin disables device
        ↓
is_active = false
        ↓
Device can still connect (is_online changes)
        ↓
But admin marked it inactive
```

### When to Use It

#### ✅ Set `is_active = false` When:
1. **Decommissioning** - Remove device from active service
   ```
   Reason: "Device retired, replaced with newer model"
   ```

2. **Maintenance** - Temporarily disable during repairs
   ```
   Reason: "Hardware maintenance - will re-enable after service"
   ```

3. **Security** - Quarantine compromised devices
   ```
   Reason: "Security incident - device isolated pending investigation"
   ```

4. **Testing Complete** - Disable test devices
   ```
   Reason: "Test device - no longer needed for active monitoring"
   ```

5. **Billing/License** - Track paid vs inactive devices
   ```
   Reason: "Subscription inactive - device disabled until payment"
   ```

6. **Quality Control** - Flag problematic devices
   ```
   Reason: "Frequent disconnections - investigating hardware issues"
   ```

#### ✅ Keep `is_active = true` When:
- Device temporarily offline (network issue, power outage)
- Normal operation - device should be used when it comes back online
- Device is part of active fleet even if currently disconnected

---

## Real-World Scenarios

### Scenario 1: Normal Offline Device
```json
{
  "is_online": false,  // Powered off or network issue
  "is_active": true    // Still approved for use
}
```
**Meaning:** Device is temporarily offline but will work normally when it reconnects.

### Scenario 2: Device Under Maintenance
```json
{
  "is_online": false,  // Powered off for maintenance
  "is_active": false   // Administratively disabled
}
```
**Meaning:** Even when device comes back online, admin needs to re-enable it first.

### Scenario 3: Decommissioned Device
```json
{
  "is_online": false,  // No longer connected
  "is_active": false   // Permanently disabled
}
```
**Meaning:** Device removed from service. Keep in database for historical records.

### Scenario 4: Online But Disabled
```json
{
  "is_online": true,   // Still communicating
  "is_active": false   // But admin disabled it
}
```
**Meaning:** Device can still report data, but you don't want to use it (e.g., during testing phase).

---

## API Endpoints

### Check Device Status
```bash
GET /api/v1/devices/:uuid
```

**Response:**
```json
{
  "device": {
    "uuid": "...",
    "device_name": "kitchen-sensor",
    "is_online": true,   // Connected right now?
    "is_active": true,   // Approved for use?
    "last_connectivity_event": "2025-10-17T02:50:30Z"
  }
}
```

### Disable Device (Set `is_active = false`)
```bash
PATCH /api/v1/devices/:uuid/active
Content-Type: application/json

{
  "is_active": false
}
```

**PowerShell Example:**
```powershell
$body = @{ is_active = $false } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$uuid/active" `
    -Method PATCH `
    -ContentType "application/json" `
    -Body $body
```

### Re-enable Device (Set `is_active = true`)
```bash
PATCH /api/v1/devices/:uuid/active
Content-Type: application/json

{
  "is_active": true
}
```

---

## Database Queries

### Find Active Devices That Are Offline
```sql
SELECT 
  device_name,
  last_connectivity_event,
  EXTRACT(EPOCH FROM (NOW() - last_connectivity_event))/60 as minutes_offline
FROM devices 
WHERE is_active = true   -- Should be working
  AND is_online = false  -- But currently offline
ORDER BY last_connectivity_event ASC;
```
**Use Case:** Alert admins about important devices that are down.

### Find Inactive Devices
```sql
SELECT 
  device_name,
  is_online,
  last_connectivity_event,
  modified_at
FROM devices 
WHERE is_active = false
ORDER BY modified_at DESC;
```
**Use Case:** Review disabled devices, check if any should be re-enabled.

### Fleet Health Summary
```sql
SELECT 
  is_online,
  is_active,
  COUNT(*) as count
FROM devices
GROUP BY is_online, is_active
ORDER BY is_online DESC, is_active DESC;
```

**Example Result:**
```
is_online | is_active | count
----------|-----------|------
true      | true      | 45    ← Normal active devices
true      | false     | 2     ← Disabled but still connected
false     | true      | 5     ← Temporarily offline
false     | false     | 8     ← Decommissioned
```

---

## Filtering Devices in API

### Get Only Active Devices
```bash
GET /api/v1/devices?online=true

# Future enhancement (not implemented yet):
GET /api/v1/devices?active=true
```

### Query Active AND Online Devices
```sql
-- For dashboard: show only working devices
SELECT * FROM devices 
WHERE is_active = true 
  AND is_online = true;
```

### Query All Active Devices (even if offline)
```sql
-- For fleet management: show all devices that should be working
SELECT * FROM devices 
WHERE is_active = true
ORDER BY is_online DESC, last_connectivity_event DESC;
```

---

## Best Practices

### When to Use Each Flag

**Use `is_online` to:**
- ✅ Monitor real-time connectivity
- ✅ Alert on unexpected disconnections
- ✅ Track uptime statistics
- ✅ Identify network issues

**Use `is_active` to:**
- ✅ Control which devices are in service
- ✅ Track device lifecycle (active → maintenance → decommissioned)
- ✅ Manage fleet size for billing
- ✅ Quarantine problematic devices

### Workflow Examples

**Device Replacement:**
```bash
# 1. Disable old device
PATCH /api/v1/devices/old-uuid/active {"is_active": false}

# 2. Register new device
POST /api/v1/device/register

# 3. Old device stays in DB for history but won't be used
```

**Scheduled Maintenance:**
```bash
# Before maintenance
PATCH /api/v1/devices/uuid/active {"is_active": false}

# ... perform maintenance ...

# After maintenance
PATCH /api/v1/devices/uuid/active {"is_active": true}
```

**Quality Control:**
```sql
-- Find devices with frequent disconnections
SELECT 
  device_name,
  COUNT(*) as offline_events
FROM audit_logs
WHERE event_type = 'device_offline'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY device_name
HAVING COUNT(*) > 10
ORDER BY offline_events DESC;

-- Disable problematic devices for investigation
-- PATCH /api/v1/devices/:uuid/active {"is_active": false}
```

---

## Summary

### Your Current Device

Based on your observation:
```json
{
  "is_online": false,  // ← Changed by heartbeat monitor (automatic)
  "is_active": true    // ← Still set from registration (manual only)
}
```

**This is correct behavior!**

- `is_online = false` because device stopped communicating (automatic detection)
- `is_active = true` because no admin has disabled it (requires manual action)

### Key Takeaways

1. **`is_online`** = Real-time connectivity (changes automatically)
2. **`is_active`** = Administrative control (changes only when you say so)
3. They serve **different purposes** and should be used together
4. A device can be `is_online = true` but `is_active = false` (connected but disabled)
5. Use `is_active` for **lifecycle management**, not connectivity monitoring

---

## Testing the New Endpoint

```powershell
# Disable your device
$uuid = "8479359e-dbeb-4858-813c-e8a9008dde04"
$body = @{ is_active = $false } | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$uuid/active" `
    -Method PATCH `
    -ContentType "application/json" `
    -Body $body

# Check status
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$uuid" | 
    Select-Object -ExpandProperty device | 
    Select-Object device_name, is_online, is_active

# Re-enable it
$body = @{ is_active = $true } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$uuid/active" `
    -Method PATCH `
    -ContentType "application/json" `
    -Body $body
```

Now you have full control over both device connectivity (automatic) and device status (manual)! 🎯
