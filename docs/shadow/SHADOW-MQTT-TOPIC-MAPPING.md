# Shadow MQTT Topic Mapping - Visual Guide

## Before Fix ❌

```
┌─────────────────────────────────────┐
│         Device Agent                 │
│                                     │
│  Publishes to:                      │
│  iot/device/abc-123/shadow/        │
│    name/sensor-config/update        │
│                                     │
│  Receives on:                       │
│  iot/device/abc-123/shadow/        │
│    name/sensor-config/update/       │
│    accepted ✅                      │
└─────────────────────────────────────┘
                ↓ MQTT
┌─────────────────────────────────────┐
│         MQTT Broker                  │
│                                     │
│  Topic:                             │
│  iot/device/abc-123/shadow/        │
│    name/sensor-config/update/       │
│    accepted                         │
└─────────────────────────────────────┘
                ↓ MQTT
┌─────────────────────────────────────┐
│          Cloud API                   │
│                                     │
│  Subscribed to:                     │
│  device/*/shadow/reported ❌         │
│  device/*/shadow/desired  ❌         │
│                                     │
│  NO MATCH! Data lost! ⚠️            │
└─────────────────────────────────────┘
```

## After Fix ✅

```
┌─────────────────────────────────────┐
│         Device Agent                 │
│                                     │
│  Publishes to:                      │
│  iot/device/abc-123/shadow/        │
│    name/sensor-config/update        │
│                                     │
│  Receives on:                       │
│  iot/device/abc-123/shadow/        │
│    name/sensor-config/update/       │
│    accepted ✅                      │
└─────────────────────────────────────┘
                ↓ MQTT
┌─────────────────────────────────────┐
│         MQTT Broker                  │
│                                     │
│  Topic:                             │
│  iot/device/abc-123/shadow/        │
│    name/sensor-config/update/       │
│    accepted                         │
└─────────────────────────────────────┘
                ↓ MQTT
┌─────────────────────────────────────┐
│          Cloud API                   │
│                                     │
│  Subscribed to:                     │
│  iot/device/*/shadow/name/+/       │
│    update/accepted ✅                │
│  iot/device/*/shadow/name/+/       │
│    update/delta ✅                   │
│                                     │
│  MATCHES! Saves to DB! 🎉          │
└─────────────────────────────────────┘
                ↓ SQL
┌─────────────────────────────────────┐
│         PostgreSQL                   │
│                                     │
│  device_shadows table:              │
│  ┌─────────────┬──────────┐         │
│  │ device_uuid │ reported │         │
│  ├─────────────┼──────────┤         │
│  │ abc-123...  │ {...}    │         │
│  └─────────────┴──────────┘         │
└─────────────────────────────────────┘
```

## Topic Breakdown

### AWS IoT Shadow Topic Structure

```
iot/device/{deviceUuid}/shadow/name/{shadowName}/update/{type}
│    │      │           │      │    │           │       │
│    │      │           │      │    │           │       └─ accepted/delta/rejected/documents
│    │      │           │      │    │           └───────── action
│    │      │           │      │    └───────────────────── shadow name (e.g., "sensor-config")
│    │      │           │      └────────────────────────── "name" keyword
│    │      │           └───────────────────────────────── "shadow" keyword
│    │      └───────────────────────────────────────────── device UUID
│    └──────────────────────────────────────────────────── "device" keyword
└───────────────────────────────────────────────────────── AWS IoT prefix
```

### Wildcard Subscriptions

```
iot/device/*/shadow/name/+/update/accepted
            │             │
            │             └─ Single-level wildcard (+ matches one segment)
            │                Matches ANY shadow name
            │
            └─────────────── Multi-level wildcard (* matches multiple segments)
                             Matches ANY device UUID
```

**Examples that match**:
- `iot/device/abc-123-456/shadow/name/sensor-config/update/accepted` ✅
- `iot/device/xyz-789-012/shadow/name/sensor-config/update/accepted` ✅
- `iot/device/abc-123-456/shadow/name/container-state/update/accepted` ✅
- `iot/device/any-device/shadow/name/any-shadow/update/accepted` ✅

**Examples that DON'T match**:
- `device/abc-123/shadow/reported` ❌ (missing $iot prefix)
- `iot/device/abc-123/shadow/update` ❌ (missing /name/{shadowName})
- `iot/device/abc-123/shadow/name/sensor-config/update` ❌ (missing /accepted)

## Message Flow Examples

### Example 1: Device Reports Sensor Config

```
1. Device publishes:
   Topic:   iot/device/abc-123/shadow/name/sensor-config/update
   Payload: {"state":{"reported":{"sensors":{"sensor1":{"enabled":true}}}}}

2. MQTT Broker processes and responds:
   Topic:   iot/device/abc-123/shadow/name/sensor-config/update/accepted
   Payload: {"state":{"reported":{...}},"metadata":{"reported":{...}},"version":2}

3. Cloud API receives (subscribed to .../accepted):
   ✅ MATCH!
   handleAwsIotShadowMessage()
     → handleShadowReported()
       → emit('shadow', {...})
         → handleShadowUpdate() (from handlers.ts)
           → INSERT INTO device_shadows (device_uuid, reported, ...)

4. PostgreSQL stores:
   device_uuid: abc-123
   reported: {"sensors":{"sensor1":{"enabled":true}}}
   version: 2
```

### Example 2: Cloud Sets Desired Config

```
1. Admin dashboard publishes:
   Topic:   iot/device/abc-123/shadow/name/sensor-config/update
   Payload: {"state":{"desired":{"sensors":{"sensor1":{"publishInterval":60000}}}}}

2. MQTT Broker compares desired vs reported, computes delta:
   Topic:   iot/device/abc-123/shadow/name/sensor-config/update/delta
   Payload: {"state":{"sensors":{"sensor1":{"publishInterval":60000}}},"version":3}

3. Cloud API receives (subscribed to .../delta):
   ✅ MATCH!
   handleAwsIotShadowMessage()
     → handleShadowDelta()
       → emit('shadow', {...})
         → handleShadowUpdate() (from handlers.ts)
           → INSERT INTO device_shadows (device_uuid, desired, ...)

4. Device receives (subscribed to .../delta):
   SensorConfigHandler.handleDelta()
     → Validates + applies changes
     → Reports back new state (see Example 1)

5. PostgreSQL stores:
   device_uuid: abc-123
   desired: {"sensors":{"sensor1":{"publishInterval":60000}}}
   version: 3
```

## Code Mapping

### MQTT Manager Subscribe

```typescript
// api/src/mqtt/mqtt-manager.ts

subscribe(deviceUuid: string, topics: string[]): void {
  const topicPatterns = topics.map(type => {
    switch (type) {
      case 'shadow-reported':
        return `iot/device/${deviceUuid}/shadow/name/+/update/accepted`;
        //      ^^^^^^^^^^ ^^^^^^^^^^^^ ^^^^^^^^^^^^^ ^ ^^^^^^^^^^^^^^
        //      AWS IoT    UUID         name/shadow   + = any name
        //      prefix     (or *)       pattern       
      
      case 'shadow-desired':
        return `iot/device/${deviceUuid}/shadow/name/+/update/delta`;
        //                                                     ^^^^^
        //                                                     delta = desired state
    }
  });
}
```

### Message Handler Router

```typescript
// api/src/mqtt/mqtt-manager.ts

private handleMessage(topic: string, payload: Buffer): void {
  if (topic.startsWith('iot/device/')) {
    //                   ^^^^^^^^^^^^^^
    //                   AWS IoT format
    this.handleAwsIotShadowMessage(topic, message);
  } else {
    // Standard format (sensor, logs, metrics, status)
  }
}
```

### AWS IoT Shadow Parser

```typescript
// api/src/mqtt/mqtt-manager.ts

private handleAwsIotShadowMessage(topic: string, message: string): void {
  // Parse: iot/device/{uuid}/shadow/name/{shadowName}/update/{type}
  const parts = topic.split('/');
  //            [0]    [1]     [2]   [3]     [4]   [5]          [6]     [7]
  //            $iot   device  uuid  shadow  name  shadowName   update  type
  
  const deviceUuid = parts[2];  // Extract UUID
  const shadowName = parts[5];  // Extract shadow name
  const updateType = parts[7];  // Extract type (accepted/delta/rejected/documents)
  
  if (updateType === 'accepted') {
    this.handleShadowReported(deviceUuid, shadowName, data);
    // → Saves to device_shadows.reported
  } else if (updateType === 'delta') {
    this.handleShadowDelta(deviceUuid, shadowName, data);
    // → Saves to device_shadows.desired
  }
}
```

## Subscription Registration Flow

```
api/src/index.ts (server startup)
  ↓
initializeMqtt()
  ↓
new MqttManager({...})
  ↓
mqttManager.connect()
  ↓
mqttManager.subscribeToAll([
  'sensor',
  'shadow-reported',    ← We subscribe here
  'shadow-desired',     ← And here
  'logs',
  'metrics',
  'status'
])
  ↓
subscribe('*', topics)   ← '*' = all devices
  ↓
mqttClient.subscribe([
  'device/*/sensor/+/data',
  'iot/device/*/shadow/name/+/update/accepted',   ← Shadow reported
  'iot/device/*/shadow/name/+/update/delta',      ← Shadow desired
  'device/*/logs/+',
  'device/*/metrics',
  'device/*/status'
])
  ↓
✅ Subscriptions active, waiting for messages
```

## Database Schema

```sql
CREATE TABLE device_shadows (
    id SERIAL PRIMARY KEY,
    device_uuid UUID NOT NULL UNIQUE,
    
    -- State from device
    reported JSONB DEFAULT '{}',
    
    -- State from cloud/admin
    desired JSONB DEFAULT '{}',
    
    -- Version for optimistic locking
    version INTEGER DEFAULT 0,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- When shadow update arrives:
INSERT INTO device_shadows (device_uuid, reported, version, updated_at)
VALUES ('abc-123', '{"sensors":{...}}', 2, NOW())
ON CONFLICT (device_uuid) 
DO UPDATE SET
  reported = EXCLUDED.reported,
  version = GREATEST(device_shadows.version, EXCLUDED.version),
  updated_at = EXCLUDED.updated_at;
```

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Device Topic** | `iot/device/.../shadow/.../update` | Same (no change) |
| **API Subscription** | `device/*/shadow/reported` ❌ | `iot/device/*/shadow/.../accepted` ✅ |
| **Topic Match** | No | Yes |
| **Data Saved** | No ❌ | Yes ✅ |
| **Shadow Sync** | Broken 🚨 | Working 🎉 |

**Result**: Shadow-based sensor configuration now persists to PostgreSQL and enables cloud management! 🚀
