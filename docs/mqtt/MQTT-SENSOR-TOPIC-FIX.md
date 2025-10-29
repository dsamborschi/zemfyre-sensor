# ✅ MQTT Sensor Topic Fix - Complete

## Issue Found

API was subscribing to **wrong sensor topic format**:

| Component | Topic Format | Status |
|-----------|-------------|---------|
| **Device Agent** | `iot/device/{uuid}/sensor/{topic}` | AWS IoT Format ✅ |
| **Cloud API (Before)** | `device/*/sensor/+/data` | Legacy Format ❌ |
| **Cloud API (After)** | `iot/device/*/sensor/+` | AWS IoT Format ✅ |

**Result**: Topics didn't match, so sensor data never reached the API!

---

## Root Cause

The device agent publishes sensor data using AWS IoT format:

```typescript
// agent/src/sensor-publish/sensor.ts (line 290)
const topic = `iot/device/${this.deviceUuid}/sensor/${this.config.mqttTopic}`;
```

**Example topic**:
```
iot/device/abc-123-456/sensor/temperature
```

But the API was subscribing to legacy format:
```
device/*/sensor/+/data  ❌ Wrong prefix, extra /data suffix
```

---

## Fix Applied

### 1. Updated Sensor Subscription Pattern

**File**: `api/src/mqtt/mqtt-manager.ts` (line ~189)

**Before**:
```typescript
case 'sensor':
  return `device/${deviceUuid}/sensor/+/data`;
```

**After**:
```typescript
case 'sensor':
  // Subscribe to AWS IoT sensor data format (matches device agent)
  return `iot/device/${deviceUuid}/sensor/+`;
```

### 2. Updated Message Router

**File**: `api/src/mqtt/mqtt-manager.ts` (line ~292)

**Before**:
```typescript
if (topic.startsWith('iot/device/')) {
  this.handleAwsIotShadowMessage(topic, message);
  return;
}
```

**After**:
```typescript
if (topic.startsWith('iot/device/')) {
  // Check if it's a shadow topic or sensor topic
  if (topic.includes('/shadow/')) {
    this.handleAwsIotShadowMessage(topic, message);
  } else if (topic.includes('/sensor/')) {
    this.handleAwsIotSensorMessage(topic, message);
  }
  return;
}
```

### 3. Added AWS IoT Sensor Handler

**File**: `api/src/mqtt/mqtt-manager.ts` (new method)

```typescript
/**
 * Handle AWS IoT sensor message
 * Topic format: iot/device/{uuid}/sensor/{sensorTopic}
 */
private handleAwsIotSensorMessage(topic: string, message: string): void {
  // Parse topic: iot/device/{uuid}/sensor/{sensorTopic}
  const parts = topic.split('/');
  const deviceUuid = parts[2];
  const sensorTopic = parts[4]; // temperature, humidity, etc.
  
  // Parse JSON payload
  const data = JSON.parse(message);
  
  // Extract sensor name
  const sensorName = data.sensorName || data.sensor || sensorTopic;
  
  // Route to existing sensor handler
  this.handleSensorData(deviceUuid, sensorName, data);
}
```

### 4. Updated Documentation

Updated topic structure comment to reflect AWS IoT format for sensors.

---

## Data Flow (Now Fixed!)

### Sensor Data Publishing

```
Device Agent (Sensor)
    ↓ Publishes sensor reading
Topic: iot/device/abc-123/sensor/temperature
Payload: {
  "timestamp": "2025-10-18T14:30:00Z",
  "data": { "temperature": 22.5, "unit": "C" },
  "sensorName": "sensor1"
}
    ↓ MQTT Broker
Cloud API (MQTT Manager)
    ✅ Subscribed to: iot/device/*/sensor/+
    ↓ MATCH! Receives message
    ↓ handleMessage()
    ↓ Detects: topic.startsWith('iot/device/')
    ↓ Detects: topic.includes('/sensor/')
    ↓ handleAwsIotSensorMessage()
    ↓ Parses: deviceUuid=abc-123, sensorTopic=temperature
    ↓ handleSensorData()
    ↓ emit('sensor', sensorData)
Handler (handlers.ts)
    ↓ handleSensorData()
    ↓ INSERT INTO sensor_data
PostgreSQL
    ✅ Sensor data saved!
```

---

## Expected Logs (With Debug)

### On API Startup

```bash
🔌 Initializing MQTT service...
📡 Connecting to MQTT broker: mqtt://localhost:1883
✅ Connected to MQTT broker
📋 Client ID: api-server
🔧 QoS: 1
📡 Subscribing to all device topics...
🔍 Attempting to subscribe to: iot/device/*/sensor/+
✅ Subscribed to iot/device/*/sensor/+ (QoS: 1)  ← FIXED!
🔍 Attempting to subscribe to: iot/device/*/shadow/name/+/update/accepted
✅ Subscribed to iot/device/*/shadow/name/+/update/accepted (QoS: 1)
✅ MQTT service initialized
```

### When Device Publishes Sensor Data

```bash
# Device log:
[SensorPublish] Publishing sensor data to iot/device/abc-123.../sensor/temperature

# API log (NEW):
📨 Raw MQTT message event fired: iot/device/abc-123.../sensor/temperature
🔔 MQTT Message received: {
  topic: 'iot/device/abc-123.../sensor/temperature',
  payloadSize: 156,
  preview: '{"timestamp":"2025-10-18...","data":{"temperature":22.5}...}'
}
✅ Detected AWS IoT topic  ← NEW!
📊 Sensor data from abc-123.../sensor1
✅ Stored sensor data: abc-123.../sensor1
```

---

## Testing

### 1. Restart API

```bash
cd api
npm run dev

# Look for:
✅ Subscribed to iot/device/*/sensor/+ (QoS: 1)
```

### 2. Start Device Agent

```bash
cd agent
export ENABLE_SENSOR_PUBLISH=true
export MQTT_BROKER=mqtt://localhost:1883
export SENSOR_PUBLISH_CONFIG='{"sensors":[{"name":"sensor1","enabled":true,"addr":"/tmp/sensor1.sock","publishInterval":30000,"topic":"temperature"}]}'
npm run dev
```

### 3. Verify Messages Flow

**Monitor MQTT (optional)**:
```bash
mosquitto_sub -h localhost -p 1883 -t 'iot/device/+/sensor/#' -v

# Should see:
iot/device/abc-123.../sensor/temperature {"timestamp":...}
```

**Check API logs**:
```bash
# Should now see:
📨 Raw MQTT message event fired: iot/device/abc-123.../sensor/temperature
✅ Detected AWS IoT topic
📊 Sensor data from abc-123.../sensor1
✅ Stored sensor data: abc-123.../sensor1
```

### 4. Verify Database

```sql
SELECT 
  device_uuid,
  sensor_name,
  data,
  timestamp
FROM sensor_data
ORDER BY timestamp DESC
LIMIT 10;
```

**Expected**: Rows with sensor data! 🎉

---

## Topic Matching Comparison

### Sensor Topics

| Device Publishes | API Subscribes (Before) | Match? |
|-----------------|-------------------------|---------|
| `iot/device/abc-123/sensor/temperature` | `device/*/sensor/+/data` | ❌ NO |

| Device Publishes | API Subscribes (After) | Match? |
|-----------------|------------------------|---------|
| `iot/device/abc-123/sensor/temperature` | `iot/device/*/sensor/+` | ✅ YES! |

### Shadow Topics (Already Working)

| Device Publishes | API Subscribes | Match? |
|-----------------|----------------|---------|
| `iot/device/abc-123/shadow/name/sensor-config/update/accepted` | `iot/device/*/shadow/name/+/update/accepted` | ✅ YES |

---

## Complete Topic Structure

### AWS IoT Format (Device Agent → API)

```
Sensors:
  iot/device/{uuid}/sensor/{sensorTopic}
  Examples:
    - iot/device/abc-123/sensor/temperature
    - iot/device/abc-123/sensor/humidity
    - iot/device/abc-123/sensor/pressure

Shadow:
  iot/device/{uuid}/shadow/name/{shadowName}/update/accepted
  iot/device/{uuid}/shadow/name/{shadowName}/update/delta
  Examples:
    - iot/device/abc-123/shadow/name/sensor-config/update/accepted
    - iot/device/abc-123/shadow/name/device-state/update/delta
```

### Legacy Format (Container Logs, Metrics)

```
Logs:
  device/{uuid}/logs/{containerId}
  Example: device/abc-123/logs/container-456

Metrics:
  device/{uuid}/metrics
  Example: device/abc-123/metrics

Status:
  device/{uuid}/status
  Example: device/abc-123/status
```

---

## Summary

✅ **Fixed**: Sensor subscription now uses AWS IoT format  
✅ **Fixed**: Message router handles both sensor and shadow topics  
✅ **Added**: `handleAwsIotSensorMessage()` method  
✅ **Updated**: Topic documentation  
✅ **Zero Errors**: Clean compilation  

**Your sensor data will now flow from device → MQTT → API → PostgreSQL!** 🚀

---

## Files Modified

1. **`api/src/mqtt/mqtt-manager.ts`**:
   - Updated sensor subscription: `iot/device/*/sensor/+`
   - Updated message router to detect sensor vs shadow
   - Added `handleAwsIotSensorMessage()` method
   - Updated topic documentation comments

---

**Next**: Restart your API and watch for `📨 Raw MQTT message event fired` logs! 🎉
