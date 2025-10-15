# Shadow vs Sensor-Publish: Topic Convention Comparison

## Overview

Both features now use the **same Zemfyre IoT topic convention** for consistency and easier cloud integration.

## Topic Structure

```
$iot/device/{deviceUuid}/{feature}/{...}
     │        │            │         │
     │        │            │         └─ Feature-specific subtopics
     │        │            └─ Feature name (sensor|shadow|telemetry|...)
     │        └─ Device UUID from provisioning
     └─ Zemfyre IoT namespace
```

## Side-by-Side Comparison

### Sensor Publish Feature

```typescript
// Constructor
new SensorPublishFeature(
  config: SensorPublishConfig,
  mqttConnection: MqttConnection,
  logger: Logger,
  deviceUuid: string  // ✅ Uses device UUID
)

// Topics
$iot/device/{deviceUuid}/sensor/{sensorTopic}
$iot/device/{deviceUuid}/sensor/{heartbeatTopic}

// Example
$iot/device/abc-123/sensor/temperature
$iot/device/abc-123/sensor/heartbeat
```

### Shadow Feature

```typescript
// Constructor
new ShadowFeature(
  config: ShadowConfig,
  mqttConnection: MqttConnection,
  logger: Logger,
  deviceUuid: string  // ✅ Uses device UUID
)

// Topics
$iot/device/{deviceUuid}/shadow/name/{shadowName}/update
$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/accepted
$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/rejected
$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/delta
$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/documents
$iot/device/{deviceUuid}/shadow/name/{shadowName}/get
$iot/device/{deviceUuid}/shadow/name/{shadowName}/get/accepted
$iot/device/{deviceUuid}/shadow/name/{shadowName}/get/rejected

// Example
$iot/device/abc-123/shadow/name/device-state/update
$iot/device/abc-123/shadow/name/device-state/update/delta
```

## Complete Topic Tree

```
$iot/
  └─ device/
      └─ {deviceUuid}/              # Unique device identifier
          ├─ sensor/                # Sensor Publish Feature
          │   ├─ {topic}            # Custom sensor topics
          │   └─ heartbeat          # Heartbeat (if configured)
          │
          ├─ shadow/                # Shadow Feature
          │   └─ name/
          │       └─ {shadowName}/  # Named shadow
          │           ├─ update
          │           │   ├─ accepted
          │           │   ├─ rejected
          │           │   ├─ delta
          │           │   └─ documents
          │           ├─ get
          │           │   ├─ accepted
          │           │   └─ rejected
          │           └─ delete
          │               ├─ accepted
          │               └─ rejected
          │
          └─ [future features]/     # Telemetry, commands, etc.
```

## Example Messages

### Sensor Data (Sensor Publish)

```json
// Topic: $iot/device/dev-001/sensor/temperature
{
  "sensorName": "bme688",
  "temperature": 25.5,
  "humidity": 60.2,
  "timestamp": 1697234567890
}
```

### Shadow Update (Shadow Feature)

```json
// Topic: $iot/device/dev-001/shadow/name/device-config/update
{
  "state": {
    "reported": {
      "updateInterval": 60,
      "logLevel": "info",
      "features": {
        "sensors": true,
        "telemetry": true
      }
    }
  },
  "clientToken": "abc-123-xyz"
}
```

### Shadow Delta (Shadow Feature)

```json
// Topic: $iot/device/dev-001/shadow/name/device-config/update/delta
{
  "state": {
    "logLevel": "debug"  // Desired != Reported
  },
  "version": 42,
  "timestamp": 1697234567890
}
```

## Cloud Integration Benefits

### 1. Routing by Device

```javascript
// Cloud MQTT subscriber
const devicePattern = '$iot/device/+/#';

client.subscribe(devicePattern, (topic, message) => {
  const [, , , deviceUuid, feature, ...rest] = topic.split('/');
  
  // Route to appropriate handler
  if (feature === 'sensor') {
    handleSensorData(deviceUuid, rest, message);
  } else if (feature === 'shadow') {
    handleShadowUpdate(deviceUuid, rest, message);
  }
});
```

### 2. Device-Centric Dashboards

```sql
-- PostgreSQL/TimescaleDB query
SELECT 
  device_uuid,
  feature_type,
  COUNT(*) as message_count
FROM mqtt_messages
WHERE topic LIKE '$iot/device/%'
GROUP BY device_uuid, feature_type;
```

### 3. Unified ACLs

```conf
# Mosquitto ACL
# Single rule gives device access to ALL its features
pattern readwrite $iot/device/%u/#

# Or more granular:
pattern readwrite $iot/device/%u/sensor/#
pattern readwrite $iot/device/%u/shadow/#
```

## Comparison with AWS IoT

### AWS IoT Topics (Old Pattern)

```
$aws/things/{thingName}/shadow/name/{shadowName}/update
```

**Issues:**
- ❌ Tightly coupled to AWS IoT
- ❌ Different convention from sensor data
- ❌ Requires AWS-specific ACLs
- ❌ Hard to migrate to other brokers

### Zemfyre IoT Topics (New Pattern)

```
$iot/device/{deviceUuid}/shadow/name/{shadowName}/update
```

**Benefits:**
- ✅ Broker agnostic (works with any MQTT broker)
- ✅ Consistent with sensor-publish and future features
- ✅ Device-centric (easy to query by device)
- ✅ Simple ACLs using wildcards

## Migration from AWS IoT

If you're migrating from AWS IoT Device Shadow:

### Option 1: Topic Bridge

```conf
# Mosquitto bridge config
connection aws-to-zemfyre
bridge_attempt_unsubscribe false
topic $aws/things/+/shadow/# in 0 $iot/device/
```

### Option 2: Dual Implementation

```typescript
// Support both patterns temporarily
const awsTopics = new AwsShadowTopics(thingName, shadowName);
const zemfyreTopics = new ShadowTopics(deviceUuid, shadowName);

// Subscribe to both
await mqtt.subscribe(awsTopics.updateDelta);
await mqtt.subscribe(zemfyreTopics.updateDelta);
```

### Option 3: Cloud-Side Translation

```javascript
// AWS IoT Rule to forward to Zemfyre topics
SELECT * FROM '$aws/things/+/shadow/#' AS topic

// AWS Lambda to translate and republish
exports.handler = async (event) => {
  const oldTopic = event.topic;
  const newTopic = oldTopic.replace('$aws/things/', '$iot/device/');
  await iotData.publish({
    topic: newTopic,
    payload: JSON.stringify(event)
  }).promise();
};
```

## Future Expansion

The convention easily extends to new features:

```
$iot/device/{deviceUuid}/telemetry/{metric}
$iot/device/{deviceUuid}/commands/{commandName}
$iot/device/{deviceUuid}/events/{eventType}
$iot/device/{deviceUuid}/logs/{level}
$iot/device/{deviceUuid}/files/{fileName}
```

All following the same pattern! 🎯

---

**Last Updated**: October 14, 2025  
**Version**: 2.0.0
