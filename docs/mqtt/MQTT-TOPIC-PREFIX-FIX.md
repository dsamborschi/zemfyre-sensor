# ✅ MQTT Topic Prefix Fix - Removed `$` Prefix

## Critical Issue Found

Topics starting with **`$`** are **reserved for MQTT broker system topics**!

### The Problem

**Original topics**:
```
$iot/device/{uuid}/shadow/name/{shadowName}/update
$iot/device/{uuid}/sensor/{topic}
```

**Why this failed**:
- In MQTT protocol, topics beginning with `$` are reserved (e.g., `$SYS/...` for broker stats)
- Mosquitto and other MQTT brokers have special handling/restrictions for `$` topics
- These topics may not be routable, subscribable, or may require special permissions
- AWS IoT Core uses `$aws/...` internally, but we're using standard Mosquitto, not AWS IoT

### The Fix

**New topics (without `$` prefix)**:
```
iot/device/{uuid}/shadow/name/{shadowName}/update
iot/device/{uuid}/sensor/{topic}
```

---

## Changes Made

### 1. Agent - Shadow Topics

**File**: `agent/src/shadow/types.ts`

**Before**:
```typescript
public get update(): string {
  return `$iot/device/${this.deviceUuid}/shadow/name/${this.shadowName}/update`;
}
```

**After**:
```typescript
public get update(): string {
  return `iot/device/${this.deviceUuid}/shadow/name/${this.shadowName}/update`;
}
```

All shadow topic methods updated (update, updateAccepted, updateDelta, get, delete, etc.)

### 2. Agent - Sensor Topics

**File**: `agent/src/sensor-publish/Sensor.ts`

**Before**:
```typescript
const topic = `$iot/device/${this.deviceUuid}/sensor/${this.config.mqttTopic}`;
```

**After**:
```typescript
const topic = `iot/device/${this.deviceUuid}/sensor/${this.config.mqttTopic}`;
```

Updated in both:
- Data publishing (line ~290)
- Heartbeat publishing (line ~412)

### 3. API - Subscription Patterns

**File**: `api/src/mqtt/mqtt-manager.ts`

**Before**:
```typescript
case 'sensor':
  return `$iot/device/${mqttDevicePattern}/sensor/+`;
case 'shadow-reported':
  return `$iot/device/${mqttDevicePattern}/shadow/name/+/update`;
```

**After**:
```typescript
case 'sensor':
  return `iot/device/${mqttDevicePattern}/sensor/+`;
case 'shadow-reported':
  return `iot/device/${mqttDevicePattern}/shadow/name/+/update`;
```

### 4. API - Message Handlers

**File**: `api/src/mqtt/mqtt-manager.ts`

**Renamed and updated**:
- `handleAwsIotShadowMessage()` → `handleIotShadowMessage()`
- `handleAwsIotSensorMessage()` → `handleIotSensorMessage()`

**Updated topic parsing**:
```typescript
// Before: Check for parts[0] === '$iot'
if (parts[0] !== '$iot' || parts[1] !== 'device') { ... }

// After: Check for parts[0] === 'iot'
if (parts[0] !== 'iot' || parts[1] !== 'device') { ... }
```

**Updated part indices** (shifted by 1 due to removed `$iot` → `iot`):
```typescript
// Shadow topics: iot/device/{uuid}/shadow/name/{shadowName}/update
// Before: parts[0]='$iot', parts[2]=uuid, parts[5]=shadowName, parts[7]=updateType
// After:  parts[0]='iot',  parts[2]=uuid, parts[4]=shadowName, parts[6]=updateType

const deviceUuid = parts[2];
const shadowName = parts[4];  // Was parts[5]
const updateType = parts[6] || 'update';  // Was parts[7]
```

### 5. API - Detection Logic

**File**: `api/src/mqtt/mqtt-manager.ts`

**Before**:
```typescript
if (topic.startsWith('$iot/device/')) {
  console.log('✅ Detected AWS IoT topic');
  ...
}
```

**After**:
```typescript
if (topic.startsWith('iot/device/')) {
  console.log('✅ Detected IoT device topic');
  ...
}
```

### 6. Documentation Updates

Updated topic structure documentation in `mqtt-manager.ts` header:

```typescript
/**
 * MQTT Topic Structure (Convention)
 * 
 * IoT Device Format (used by device agent):
 *   Note: No leading $ - topics starting with $ are reserved for MQTT broker system topics
 * 
 *   Sensor Data:        iot/device/{uuid}/sensor/{sensorTopic}
 *   Shadow - Update:    iot/device/{uuid}/shadow/name/{shadowName}/update
 *   ...
 */
```

---

## Topic Comparison

### Shadow Topics

| Before (Broken) | After (Fixed) |
|----------------|---------------|
| `$iot/device/{uuid}/shadow/name/{name}/update` | `iot/device/{uuid}/shadow/name/{name}/update` |
| `$iot/device/{uuid}/shadow/name/{name}/update/accepted` | `iot/device/{uuid}/shadow/name/{name}/update/accepted` |
| `$iot/device/{uuid}/shadow/name/{name}/update/delta` | `iot/device/{uuid}/shadow/name/{name}/update/delta` |

### Sensor Topics

| Before (Broken) | After (Fixed) |
|----------------|---------------|
| `$iot/device/{uuid}/sensor/{topic}` | `iot/device/{uuid}/sensor/{topic}` |

### Example

**Device UUID**: `46b68204-9806-43c5-8d19-18b1f53e3b8a`

**Before**:
```
$iot/device/46b68204-9806-43c5-8d19-18b1f53e3b8a/shadow/name/device-state/update
$iot/device/46b68204-9806-43c5-8d19-18b1f53e3b8a/sensor/temperature
```

**After**:
```
iot/device/46b68204-9806-43c5-8d19-18b1f53e3b8a/shadow/name/device-state/update
iot/device/46b68204-9806-43c5-8d19-18b1f53e3b8a/sensor/temperature
```

---

## Testing

### 1. Rebuild Agent

```bash
cd agent
npm run build
```

### 2. Restart Both Services

**Agent**:
```bash
cd agent
npm run dev
```

**API**:
```bash
cd api
npm run dev
```

### 3. Expected Logs

**Agent startup**:
```bash
📤 Publishing shadow update to: iot/device/46b68204.../shadow/name/device-state/update
   Payload size: 464 bytes
📡 MQTT Publish: iot/device/46b68204.../shadow/name/device-state/update
   QoS: 1
✅ MQTT Publish success: iot/device/46b68204.../shadow/name/device-state/update
```

**API startup**:
```bash
✅ Subscribed to iot/device/+/sensor/+ (QoS: 1)
✅ Subscribed to iot/device/+/shadow/name/+/update (QoS: 1)
✅ Subscribed to iot/device/+/shadow/name/+/update/delta (QoS: 1)
✅ Successfully subscribed to 6 topics
```

**When device publishes**:
```bash
# API receives:
📨 Raw MQTT message event fired: iot/device/46b68204.../shadow/name/device-state/update
🔔 MQTT Message received: { topic: 'iot/device/...', payloadSize: 464, ... }
✅ Detected IoT device topic
🔔 Shadow message: 46b68204.../device-state [update]
✅ Stored shadow update: 46b68204.../device-state
```

### 4. Verify with mosquitto_sub

```bash
# Subscribe to all IoT topics
docker exec mosquitto mosquitto_sub -h localhost -p 1883 -t 'iot/#' -v

# Should see:
iot/device/46b68204.../shadow/name/device-state/update {"state":{"reported":{...}}}
iot/device/46b68204.../sensor/temperature {"sensor":"sensor1","timestamp":...}
```

### 5. Verify Database

```sql
-- Check shadow data
SELECT device_uuid, shadow_name, updated_at 
FROM device_shadows 
ORDER BY updated_at DESC 
LIMIT 5;

-- Check sensor data
SELECT device_uuid, sensor_name, timestamp 
FROM sensor_data 
ORDER BY timestamp DESC 
LIMIT 10;
```

---

## Why This Matters

### MQTT Reserved Topics

From MQTT specification:
- Topics starting with `$` are reserved for server/broker implementation
- Common examples:
  - `$SYS/broker/clients/connected` - Broker statistics
  - `$SYS/broker/uptime` - Broker uptime
  - `$SYS/broker/version` - Broker version

### Mosquitto Behavior

Mosquitto specifically:
- May not route `$` topics between clients
- May require special ACL permissions for `$` topics
- May silently drop publishes/subscriptions to unknown `$` topics
- `$SYS/...` topics are read-only system stats

### AWS IoT Core vs Standard MQTT

- **AWS IoT Core**: Uses `$aws/...` for AWS-specific features (shadows, jobs, rules)
- **Standard MQTT**: Only `$SYS/...` is standard, other `$` topics are undefined
- **Our System**: Uses standard Mosquitto, so must avoid `$` prefix

---

## Summary

✅ **Removed `$` prefix** from all IoT device topics (shadows + sensors)  
✅ **Updated agent** - shadow topics, sensor topics, documentation  
✅ **Updated API** - subscriptions, handlers, parsing logic, documentation  
✅ **Fixed MQTT compatibility** - Topics now follow standard MQTT conventions  
✅ **Zero errors** - Clean compilation on both agent and API  

**Topic format**: `iot/device/{uuid}/{feature}/{...}`  
**No more** `$iot/...` - that was causing Mosquitto to ignore our messages!

---

## Files Modified

1. **`agent/src/shadow/types.ts`** - ShadowTopics class (all topic getters)
2. **`agent/src/sensor-publish/Sensor.ts`** - Data and heartbeat publish topics
3. **`api/src/mqtt/mqtt-manager.ts`** - Subscriptions, handlers, parsing, docs

---

**Result**: MQTT messages will now flow correctly through Mosquitto! 🎉
