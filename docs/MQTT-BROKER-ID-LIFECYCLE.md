# When is mqtt_broker_id Added to Devices?

## Short Answer

`mqtt_broker_id` is added to the `devices` table in **Migration 019** but is **NOT automatically assigned during device provisioning**.

## Timeline

### 1. Migration 019 Runs (Database Schema)
**File:** `api/database/migrations/019_add_mqtt_broker_config.sql`
**Line 126:**
```sql
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS mqtt_broker_id INTEGER 
REFERENCES mqtt_broker_config(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_devices_mqtt_broker_id ON devices(mqtt_broker_id);
```

**What it does:**
- Adds `mqtt_broker_id` column to existing `devices` table
- Creates foreign key reference to `mqtt_broker_config(id)`
- Sets `ON DELETE SET NULL` (if broker deleted, device reverts to NULL = default)
- All existing devices get `mqtt_broker_id = NULL`

### 2. Device Provisioning (Device Registration)
**File:** `api/src/routes/provisioning.ts`
**Current State:** ❌ Does NOT set `mqtt_broker_id`

When a device registers via `POST /api/v1/device/register`:
```typescript
device = await DeviceModel.update(uuid, {
  device_name: deviceName,
  device_type: deviceType,
  provisioning_state: 'registered',
  // ... other fields
  // ❌ mqtt_broker_id is NOT set here!
});
```

**Result:** New devices get `mqtt_broker_id = NULL` (will use default broker)

### 3. Broker Assignment Happens Later (Manual or Automatic)

**Option A: Manual Assignment**
```sql
UPDATE devices 
SET mqtt_broker_id = 2 
WHERE uuid = 'device-uuid';
```

**Option B: Via API**
```bash
curl -X PUT http://localhost:4002/api/v1/devices/{uuid} \
  -d '{"mqtt_broker_id": 2}'
```

**Option C: Bulk Assignment**
```sql
-- Assign all devices to default broker
UPDATE devices 
SET mqtt_broker_id = (
  SELECT id FROM mqtt_broker_config WHERE is_default = true LIMIT 1
)
WHERE mqtt_broker_id IS NULL;
```

## Current Behavior

### During Provisioning
```typescript
// Device registered with mqtt_broker_id = NULL
POST /api/v1/device/register
{
  "uuid": "abc123",
  "deviceName": "My Device"
}

// Response includes broker from getBrokerConfigForDevice()
// which queries: WHERE id = COALESCE(device.mqtt_broker_id, default_broker_id)
{
  "mqtt": {
    "broker": "mqtt://localhost:5883",  // From default broker
    "brokerConfig": { ... }
  }
}
```

### Lookup Logic
```typescript
// In utils/mqtt-broker-config.ts
export async function getBrokerConfigForDevice(deviceUuid: string) {
  const result = await query(`
    SELECT * FROM mqtt_broker_config 
    WHERE id = COALESCE(
      (SELECT mqtt_broker_id FROM devices WHERE uuid = $1),  -- NULL for new devices
      (SELECT id FROM mqtt_broker_config WHERE is_default = true)  -- Falls back here
    )
  `, [deviceUuid]);
}
```

## Should We Auto-Assign During Provisioning?

### Option 1: Keep Current Behavior (NULL = Default) ✅ Recommended
**Pros:**
- Simple and flexible
- Default broker changes affect all unassigned devices automatically
- Explicit NULL means "use whatever is default"

**Cons:**
- Can't easily track which devices use which broker
- Can't distinguish between "never assigned" vs "explicitly using default"

### Option 2: Auto-Assign Default Broker During Provisioning
**Change:** Set `mqtt_broker_id` to default broker ID during device registration

**Pros:**
- Explicit broker assignment from the start
- Can track broker usage per device
- Can change individual device brokers without affecting others

**Cons:**
- If default broker changes, old devices still point to old broker
- More complex to manage broker migrations

### Option 3: Assign via Provisioning Key
**Change:** Add `default_broker_id` to `provisioning_keys` table

```sql
ALTER TABLE provisioning_keys 
ADD COLUMN default_broker_id INTEGER REFERENCES mqtt_broker_config(id);

-- During provisioning
UPDATE devices 
SET mqtt_broker_id = (
  SELECT default_broker_id FROM provisioning_keys WHERE id = $1
)
WHERE uuid = $2;
```

**Pros:**
- Different fleets can use different brokers
- Flexible broker assignment per provisioning key

**Cons:**
- More complex schema
- Requires updating provisioning keys

## Recommendation: Add Auto-Assignment Option

I recommend adding an **optional auto-assignment** feature:

### 1. Add to DeviceModel.update() in provisioning
```typescript
// In provisioning.ts
const defaultBroker = await getDefaultBrokerConfig();

device = await DeviceModel.update(uuid, {
  device_name: deviceName,
  device_type: deviceType,
  // ... other fields
  mqtt_broker_id: defaultBroker?.id || null  // Auto-assign default
});
```

### 2. Add Configuration Flag
```typescript
// In .env
AUTO_ASSIGN_BROKER=true  // Set to false to keep current behavior

// In provisioning code
if (process.env.AUTO_ASSIGN_BROKER === 'true') {
  const defaultBroker = await getDefaultBrokerConfig();
  device.mqtt_broker_id = defaultBroker?.id;
}
```

## Migration Path for Existing Devices

If you want to assign the default broker to all existing devices:

```sql
-- Check how many devices have NULL mqtt_broker_id
SELECT COUNT(*) FROM devices WHERE mqtt_broker_id IS NULL;

-- Assign default broker to all unassigned devices
UPDATE devices 
SET mqtt_broker_id = (
  SELECT id FROM mqtt_broker_config WHERE is_default = true LIMIT 1
)
WHERE mqtt_broker_id IS NULL;

-- Verify
SELECT 
  COUNT(*) FILTER (WHERE mqtt_broker_id IS NULL) AS unassigned,
  COUNT(*) FILTER (WHERE mqtt_broker_id IS NOT NULL) AS assigned
FROM devices;
```

## Summary

| Stage | Action | mqtt_broker_id Value |
|-------|--------|---------------------|
| **Migration 019** | Column created | All devices: `NULL` |
| **Device Registers** | No assignment | New device: `NULL` |
| **Broker Lookup** | COALESCE to default | Uses default broker |
| **Manual Assignment** | UPDATE statement | Device: specific broker ID |

**Current State:** ✅ Works correctly with NULL defaulting to default broker

**Potential Enhancement:** Add auto-assignment during provisioning (optional via config flag)
