# Shadow & Sensor Startup Order - Explained

## Your Question

**"Should device start publishing updates or should sensors be enabled first?"**

## Answer

**Sensors should be enabled FIRST, then Shadow publishes the initial state.**

This is exactly what your code does! Here's the startup sequence:

## Current Initialization Order (in `supervisor.ts`)

```typescript
// Step 10: Initialize Sensor Publish Feature
await this.initializeSensorPublish();
  ↓
  - Parses SENSOR_PUBLISH_CONFIG from env
  - Creates SensorPublishFeature instance
  - Calls sensorPublish.start()
    ↓
    - Creates Sensor instances (enabled by default)
    - Starts publishing sensor data to MQTT
  - ✅ Sensors are now RUNNING and publishing

// Step 11: Initialize Shadow Feature
await this.initializeShadowFeature();
  ↓
  - Creates ShadowFeature instance
  - Calls shadow.start()
    ↓
    1. Subscribe to shadow MQTT topics (delta, accepted, etc.)
    2. Read initial state from file (or use default)
    3. Publish shadow update with CURRENT state
       - This reports whatever sensors are doing RIGHT NOW
  - ✅ Shadow reports actual running state

// Step 12: Initialize Sensor Config Handler
await this.initializeSensorConfigHandler();
  ↓
  - Links Shadow to SensorPublish
  - Listens for delta events (cloud config changes)
  - Can now apply remote config updates
  - ✅ Remote management enabled
```

## Why This Order is Correct

### 1. **Sensors Start First** ✅

**Why**: The sensors need to be running BEFORE Shadow reports their state.

```typescript
// initializeSensorPublish() in supervisor.ts (line 465)
this.sensorPublish = new SensorPublishFeature(
  sensorConfig,        // From SENSOR_PUBLISH_CONFIG env var
  mqttConnection,
  sensorLogger,
  deviceInfo.uuid
);

await this.sensorPublish.start();  // ← Sensors start here!
```

**What happens**:
- Reads sensor config from `SENSOR_PUBLISH_CONFIG` environment variable
- Creates `Sensor` instances for each configured sensor
- Each sensor connects to hardware (via TCP socket or Unix socket)
- Each sensor starts publishing data on its interval (default: 30 seconds)

**Result**: Sensors are **actively publishing data** when Shadow initializes.

### 2. **Shadow Reports Initial State** ✅

**Why**: Shadow should report the ACTUAL current state of sensors.

```typescript
// initializeShadowFeature() in supervisor.ts (line 547)
this.shadowFeature = new ShadowFeature(
  shadowConfig,
  mqttConnection,
  shadowLogger,
  deviceInfo.uuid
);

await this.shadowFeature.start();  // ← Shadow starts here!
```

**What happens in `shadow.start()`**:
```typescript
// shadow-feature.ts (line 78)
public async start(): Promise<void> {
  // 1. Subscribe to shadow topics
  await this.subscribeToPertinentShadowTopics();
  
  // 2. Read and publish initial shadow state
  await this.readAndUpdateShadowFromFile();  // ← Reports current state!
  
  // 3. Start file monitor (optional)
  // 4. Start periodic publish (optional)
}
```

**Initial shadow update**:
- If `SHADOW_INPUT_FILE` is set → Reads that file
- If no input file → Uses default: `{ welcome: 'aws-iot' }`

**Important**: The initial shadow update does NOT automatically include sensor state! It only publishes what's in the input file or default.

### 3. **SensorConfigHandler Bridges Them** ✅

**Why**: Connects Shadow delta events to sensor configuration changes.

```typescript
// initializeSensorConfigHandler() in supervisor.ts (line 650)
this.sensorConfigHandler = new SensorConfigHandler(
  this.shadowFeature,      // Listens to this
  this.sensorPublish,      // Controls this
  configLogger
);

this.sensorConfigHandler.start();  // ← Starts listening for deltas
```

**What happens**:
- Listens for `delta-updated` events from Shadow
- When cloud changes sensor config, applies it to running sensors
- Reports back the new actual state

## The Problem: Initial State Not Reported! 🚨

**Issue**: Shadow publishes initial state from file/default, but does NOT automatically report current sensor states.

**Why this matters**:
1. Cloud doesn't know what sensors are running
2. Dashboard shows empty/wrong sensor config
3. Admin has to manually trigger a refresh

## Solution: Report Sensor State on Startup

You have **two options**:

### Option 1: Extend ShadowFeature Initialization (Recommended)

Update `initializeShadowFeature()` in `supervisor.ts` to report sensor state after Shadow starts:

```typescript
await this.shadowFeature.start();

// Report initial sensor state to shadow
if (this.sensorPublish) {
  const initialSensorState = {
    sensors: this.sensorPublish.getSensors().reduce((acc, sensor) => {
      acc[sensor.name] = {
        enabled: sensor.enabled,
        addr: sensor.addr,
        publishInterval: sensor.publishInterval,
        status: 'initializing'
      };
      return acc;
    }, {} as Record<string, any>)
  };
  
  await this.shadowFeature.updateShadow(initialSensorState, true);
  console.log('✅ Reported initial sensor state to shadow');
}
```

### Option 2: Update SensorConfigHandler to Report on Start

Extend `SensorConfigHandler.start()` to report current state immediately:

```typescript
// sensor-publish/config-handler.ts
public async start(): Promise<void> {
  this.shadowFeature.on('delta-updated', async (event) => {
    await this.handleDelta(event.state);
  });
  
  // Report initial state immediately
  const currentConfig = await this.getCurrentSensorConfig();
  await this.shadowFeature.updateShadow(currentConfig, true);
  
  this.logger.info(`${SensorConfigHandler.TAG}: Started and reported initial state`);
}
```

## Complete Startup Flow (With Fix)

```
┌────────────────────────────────────────────────────────────────┐
│                    Supervisor.start()                           │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  Step 10: Initialize Sensor Publish                            │
├────────────────────────────────────────────────────────────────┤
│  • Parse SENSOR_PUBLISH_CONFIG                                 │
│  • Create SensorPublishFeature                                 │
│  • await sensorPublish.start()                                 │
│    ├─ Create Sensor instances                                  │
│    ├─ Connect to hardware (TCP/Unix sockets)                   │
│    └─ Start publishing data (every 30s)                        │
│  ✅ Sensors RUNNING                                            │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  Step 11: Initialize Shadow Feature                            │
├────────────────────────────────────────────────────────────────┤
│  • Create ShadowFeature                                        │
│  • await shadow.start()                                        │
│    ├─ Subscribe to shadow MQTT topics                         │
│    ├─ Read input file (or use default)                        │
│    └─ Publish initial shadow update                           │
│       → Topic: iot/device/{uuid}/shadow/name/.../update      │
│       → Payload: { state: { reported: {...} } }               │
│  ✅ Shadow SUBSCRIBED, initial state published                │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  Step 12: Initialize Sensor Config Handler                    │
├────────────────────────────────────────────────────────────────┤
│  • Create SensorConfigHandler(shadow, sensorPublish)          │
│  • configHandler.start()                                       │
│    ├─ Listen for 'delta-updated' events                       │
│    └─ [NEW] Report initial sensor state to shadow             │
│       ↓                                                        │
│       shadow.updateShadow({                                    │
│         sensors: {                                             │
│           sensor1: { enabled: true, publishInterval: 30000 }, │
│           sensor2: { enabled: true, publishInterval: 30000 }  │
│         }                                                      │
│       }, true)                                                 │
│  ✅ Remote management ENABLED, initial state REPORTED         │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  Cloud API Receives Initial State                             │
├────────────────────────────────────────────────────────────────┤
│  • MQTT Manager receives:                                      │
│    iot/device/{uuid}/shadow/name/sensor-config/update/       │
│    accepted                                                    │
│  • Parses AWS IoT Shadow format                                │
│  • Saves to PostgreSQL:                                        │
│    INSERT INTO device_shadows (device_uuid, reported, ...)    │
│  ✅ Database has current sensor state                         │
└────────────────────────────────────────────────────────────────┘
```

## Environment Variables (Startup Configuration)

### Required for Sensors

```bash
# Enable sensor publishing
ENABLE_SENSOR_PUBLISH=true

# Sensor configuration (JSON)
SENSOR_PUBLISH_CONFIG='{
  "sensors": [
    {
      "name": "sensor1",
      "enabled": true,
      "addr": "/tmp/sensor1.sock",
      "publishInterval": 30000,
      "topic": "temperature"
    },
    {
      "name": "sensor2",
      "enabled": true,
      "addr": "/tmp/sensor2.sock",
      "publishInterval": 30000,
      "topic": "humidity"
    }
  ]
}'

# Optional: Enable debug logging
SENSOR_PUBLISH_DEBUG=true
```

### Required for Shadow

```bash
# Enable shadow feature
ENABLE_SHADOW=true

# Shadow name (for topic: .../shadow/name/{shadowName}/...)
SHADOW_NAME=sensor-config

# Optional: Input file (initial state)
SHADOW_INPUT_FILE=/app/data/shadow-input.json

# Optional: Output file (for debugging)
SHADOW_OUTPUT_FILE=/app/data/shadow-sensor-config.json

# Auto-sync on delta (device applies cloud changes)
SHADOW_SYNC_ON_DELTA=false  # We use SensorConfigHandler instead

# Optional: Debug logging
SHADOW_DEBUG=true
```

### Required for MQTT

```bash
# MQTT broker (used by both sensors and shadow)
MQTT_BROKER=mqtt://localhost:1883

# Optional: MQTT settings
MQTT_QOS=1
MQTT_DEBUG=true
```

## Testing the Startup

### 1. Start Agent with Both Features

```bash
cd agent

# Set environment variables
export ENABLE_SENSOR_PUBLISH=true
export ENABLE_SHADOW=true
export SHADOW_NAME=sensor-config
export MQTT_BROKER=mqtt://localhost:1883

# Sensor config
export SENSOR_PUBLISH_CONFIG='{
  "sensors": [
    {"name": "sensor1", "enabled": true, "addr": "/tmp/sensor1.sock", "publishInterval": 30000, "topic": "temperature"}
  ]
}'

# Start agent
npm run dev
```

### 2. Expected Logs

```bash
📡 Initializing Sensor Publish Feature...
✅ Sensor Publish Feature initialized
   Sensors configured: 1
   MQTT Topic pattern: iot/device/{deviceUuid}/sensor/{topic}

🔮 Initializing Shadow Feature...
[Shadow] Starting Shadow feature for 'sensor-config'
[Shadow] Subscribed to iot/device/{uuid}/shadow/name/sensor-config/update/accepted
[Shadow] Subscribed to iot/device/{uuid}/shadow/name/sensor-config/update/delta
[Shadow] Publishing shadow update (token: abc-123...)
✅ Shadow Feature initialized

🔧 Initializing Sensor Config Handler...
[SensorConfig] Started listening for sensor config updates
[SensorConfig] Reported initial sensor state to shadow  ← NEW!
✅ Sensor Config Handler initialized
```

### 3. Verify Shadow Published

```bash
# Monitor MQTT
mosquitto_sub -h localhost -p 1883 -t 'iot/device/+/shadow/#' -v

# You should see:
iot/device/YOUR-UUID/shadow/name/sensor-config/update/accepted
{
  "state": {
    "reported": {
      "sensors": {
        "sensor1": {
          "enabled": true,
          "addr": "/tmp/sensor1.sock",
          "publishInterval": 30000,
          "status": "connected"
        }
      }
    }
  },
  "version": 1
}
```

### 4. Verify Database

```sql
SELECT 
  device_uuid,
  reported->'sensors' as sensors,
  version,
  updated_at
FROM device_shadows
WHERE device_uuid = 'YOUR-UUID';
```

**Expected**: Row with sensor configuration in `reported` column.

## Summary

### Current Behavior ✅

| Step | Component | Action | Status |
|------|-----------|--------|---------|
| 1 | Sensor Publish | Sensors start, connect to hardware, publish data | ✅ Correct |
| 2 | Shadow Feature | Subscribes to topics, publishes initial state | ✅ Correct |
| 3 | Sensor Config Handler | Listens for delta events | ✅ Correct |

### Missing Piece ⚠️

| Issue | Impact | Solution |
|-------|--------|----------|
| Shadow doesn't report sensor state on startup | Cloud doesn't know what sensors are running | Add `updateShadow()` call in Step 12 |

### Recommended Fix

**Add to `initializeSensorConfigHandler()` in `supervisor.ts`**:

```typescript
this.sensorConfigHandler.start();

// Report initial sensor configuration to shadow
if (this.sensorPublish && this.shadowFeature) {
  const initialState = {
    sensors: this.sensorPublish.getSensors().reduce((acc, s) => {
      acc[s.name] = {
        enabled: s.enabled,
        addr: s.addr,
        publishInterval: s.publishInterval
      };
      return acc;
    }, {} as Record<string, any>)
  };
  
  await this.shadowFeature.updateShadow(initialState, true);
  console.log('✅ Reported initial sensor state to shadow');
}
```

**Result**: Cloud knows sensor state immediately on startup! 🎉

---

**Status**: Startup order is CORRECT, just needs to report sensor state after initialization.
