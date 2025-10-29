# Shadow Sensor Configuration - Quick Start Guide

## Implementation Complete! 🎉

You can now remotely configure sensors via Shadow MQTT messages.

---

## What Was Implemented

### 1. **SensorConfigHandler** (`agent/src/sensor-publish/config-handler.ts`)
   - Listens for Shadow delta events
   - Validates sensor configuration
   - Applies changes (enable/disable, intervals)
   - Reports back actual state

### 2. **SensorPublishFeature Extensions** (`agent/src/sensor-publish/sensor-publish-feature.ts`)
   - Added `enableSensor(name)` - Enable a sensor
   - Added `disableSensor(name)` - Disable a sensor
   - Added `updateInterval(name, ms)` - Change publish interval
   - Added `getSensors()` - Get all sensor configurations
   - Added `isMqttConnected()` - Check MQTT status

### 3. **Sensor Extensions** (`agent/src/sensor-publish/sensor.ts`)
   - Added `updateInterval(ms)` - Update interval on running sensor

### 4. **Type Updates** (`agent/src/sensor-publish/types.ts`)
   - Added `publishInterval` to `SensorConfigSchema`

### 5. **Supervisor Integration** (`agent/src/supervisor.ts`)
   - Imports `SensorConfigHandler`
   - Initializes handler after Shadow + Sensor Publish
   - Logs configuration status

---

## How to Enable

### Environment Variables

```bash
# Enable both features (required)
ENABLE_SHADOW=true
ENABLE_SENSOR_PUBLISH=true

# Shadow configuration
SHADOW_NAME=sensor-config
SHADOW_SYNC_ON_DELTA=false  # We handle deltas manually
SHADOW_OUTPUT_FILE=/app/data/shadow-sensor-config.json

# Optional: Enable debug logging
SENSOR_CONFIG_DEBUG=true
SHADOW_DEBUG=true

# Sensor configuration (example)
SENSOR_PUBLISH_CONFIG='{"sensors":[
  {"name":"sensor1","enabled":true,"addr":"/tmp/sensors/sensor1.sock","publishInterval":30000,"eomDelimiter":"\\n","mqttTopic":"sensor/data"},
  {"name":"sensor2","enabled":true,"addr":"/tmp/sensors/sensor2.sock","publishInterval":60000,"eomDelimiter":"\\n","mqttTopic":"sensor/data"},
  {"name":"sensor3","enabled":false,"addr":"/tmp/sensors/sensor3.sock","publishInterval":30000,"eomDelimiter":"\\n","mqttTopic":"sensor/data"}
]}'
```

---

## Testing

### Step 1: Start Agent with Both Features Enabled

```bash
cd agent

# Set environment
export ENABLE_SHADOW=true
export ENABLE_SENSOR_PUBLISH=true
export SHADOW_NAME=sensor-config
export SHADOW_SYNC_ON_DELTA=false
export MQTT_BROKER=mqtt://localhost:1883

# Configure sensors (example)
export SENSOR_PUBLISH_CONFIG='{"sensors":[{"name":"sensor1","enabled":true,"addr":"../sensor-simulator/sockets/sensor1.sock","publishInterval":30000,"eomDelimiter":"\\n","mqttTopic":"sensor/data"}]}'

# Start
npm run dev
```

**Expected Output**:
```
🔮 Initializing Shadow Feature...
✅ Shadow Feature initialized
   Shadow name: sensor-config
   Device id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
   
🔧 Initializing Sensor Config Handler...
✅ Sensor Config Handler initialized
   Remote sensor configuration: Enabled
   Shadow name: sensor-config
```

---

### Step 2: Subscribe to Shadow Topics (Monitor)

Open a new terminal and subscribe to shadow updates:

```bash
# Subscribe to all shadow updates
mosquitto_sub -h localhost -p 1883 -v \
  -t 'iot/device/+/shadow/name/sensor-config/#'
```

You should see the device report initial sensor state automatically.

---

### Step 3: Update Sensor Configuration via MQTT

#### Example 1: Change Sensor Interval

```bash
# Publish desired state (change interval to 60 seconds)
mosquitto_pub -h localhost -p 1883 \
  -t 'iot/device/YOUR-DEVICE-UUID/shadow/name/sensor-config/update' \
  -m '{
    "state": {
      "desired": {
        "sensors": {
          "sensor1": {
            "publishInterval": 60000
          }
        }
      }
    }
  }'
```

**Device Logs**:
```
[SensorConfig] ☁️  Received configuration update from cloud
[SensorConfig] ✅ Updated interval for sensor1: 60000ms
[SensorConfig] ✅ Sensor configuration applied and reported
```

**Shadow State** (check subscriber terminal):
```json
{
  "state": {
    "reported": {
      "sensors": {
        "sensor1": {
          "enabled": true,
          "addr": "../sensor-simulator/sockets/sensor1.sock",
          "publishInterval": 60000,
          "status": "connected",
          "lastPublish": "2025-10-18T10:30:00Z",
          "metrics": {
            "publishCount": 42,
            "errorCount": 0,
            "lastError": null
          }
        }
      }
    }
  }
}
```

---

#### Example 2: Disable a Sensor

```bash
mosquitto_pub -h localhost -p 1883 \
  -t 'iot/device/YOUR-DEVICE-UUID/shadow/name/sensor-config/update' \
  -m '{
    "state": {
      "desired": {
        "sensors": {
          "sensor1": {
            "enabled": false
          }
        }
      }
    }
  }'
```

**Device Logs**:
```
[SensorConfig] ☁️  Received configuration update from cloud
[SensorConfig] ✅ Disabled sensor: sensor1
[SensorConfig] ✅ Sensor configuration applied and reported
```

---

#### Example 3: Enable a Disabled Sensor

```bash
mosquitto_pub -h localhost -p 1883 \
  -t 'iot/device/YOUR-DEVICE-UUID/shadow/name/sensor-config/update' \
  -m '{
    "state": {
      "desired": {
        "sensors": {
          "sensor3": {
            "enabled": true
          }
        }
      }
    }
  }'
```

**Device Logs**:
```
[SensorConfig] ☁️  Received configuration update from cloud
[SensorConfig] ✅ Enabled sensor: sensor3
[SensorConfig] ✅ Sensor configuration applied and reported
```

---

#### Example 4: Bulk Update (Multiple Sensors)

```bash
mosquitto_pub -h localhost -p 1883 \
  -t 'iot/device/YOUR-DEVICE-UUID/shadow/name/sensor-config/update' \
  -m '{
    "state": {
      "desired": {
        "sensors": {
          "sensor1": {
            "publishInterval": 120000
          },
          "sensor2": {
            "enabled": false
          },
          "sensor3": {
            "enabled": true,
            "publishInterval": 45000
          }
        }
      }
    }
  }'
```

---

### Step 4: Test Validation (Invalid Config)

```bash
# Try to set interval too low (minimum is 1000ms)
mosquitto_pub -h localhost -p 1883 \
  -t 'iot/device/YOUR-DEVICE-UUID/shadow/name/sensor-config/update' \
  -m '{
    "state": {
      "desired": {
        "sensors": {
          "sensor1": {
            "publishInterval": 500
          }
        }
      }
    }
  }'
```

**Device Logs**:
```
[SensorConfig] ☁️  Received configuration update from cloud
[SensorConfig] ❌ Failed to apply sensor configuration: Invalid publishInterval for sensor1: minimum 1000ms (1 second)
```

**Shadow State** (error reported):
```json
{
  "state": {
    "reported": {
      "error": {
        "message": "Invalid publishInterval for sensor1: minimum 1000ms (1 second)",
        "timestamp": "2025-10-18T10:30:00Z"
      }
    }
  }
}
```

---

## Integration with Your Cloud API

### Cloud API Endpoint (Example)

```typescript
// api/src/routes/devices.ts

/**
 * Update sensor configuration for a device
 */
router.patch('/devices/:deviceId/sensors', async (req, res) => {
  const { deviceId } = req.params;
  const { sensors } = req.body;
  
  // Publish desired state to device's shadow
  const topic = `iot/device/${deviceId}/shadow/name/sensor-config/update`;
  const message = {
    state: {
      desired: {
        sensors: sensors
      }
    }
  };
  
  await mqttClient.publish(topic, JSON.stringify(message));
  
  res.json({ success: true, message: 'Configuration update sent' });
});
```

### Cloud Dashboard (Example UI)

```javascript
// dashboard/src/components/SensorConfig.jsx

function SensorConfigPanel({ deviceId, sensors }) {
  const updateSensorInterval = async (sensorName, newInterval) => {
    await fetch(`/api/devices/${deviceId}/sensors`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sensors: {
          [sensorName]: {
            publishInterval: newInterval
          }
        }
      })
    });
  };
  
  return (
    <div>
      {sensors.map(sensor => (
        <div key={sensor.name}>
          <label>{sensor.name}</label>
          <input 
            type="number" 
            value={sensor.publishInterval / 1000} 
            onChange={e => updateSensorInterval(sensor.name, e.target.value * 1000)}
          />
          <span>seconds</span>
        </div>
      ))}
    </div>
  );
}
```

---

## Validation Rules

### Publish Interval
- **Minimum**: 1000ms (1 second)
- **Maximum**: 3600000ms (1 hour)
- **Type**: Number (milliseconds)

### Enabled Flag
- **Type**: Boolean (`true` or `false`)

### Sensor Name
- **Must exist** in current sensor configuration
- Case-sensitive

---

## Architecture Benefits

### Why This Design Works

1. **Separation of Concerns**
   - Container Manager: Infrastructure (Docker)
   - Shadow Feature: Application Config (Sensors)

2. **Real-Time Updates**
   - MQTT delivers changes instantly (<1 second)
   - No polling required
   - No restart needed

3. **Validation at Edge**
   - Device validates before applying
   - Reports errors back to cloud
   - Cloud knows if config is valid

4. **Confirmation Loop**
   - Device reports actual applied state
   - Cloud sees delta eliminated
   - Bi-directional sync

5. **Offline Support**
   - Desired state persisted in shadow
   - Applied when device reconnects
   - No manual intervention needed

---

## Troubleshooting

### Handler Not Starting

**Check logs for:**
```
⏭️  Sensor Config Handler disabled (requires both Shadow and Sensor Publish features)
```

**Fix**: Ensure both features are enabled:
```bash
export ENABLE_SHADOW=true
export ENABLE_SENSOR_PUBLISH=true
```

---

### No Delta Events Received

**Check:**
1. MQTT broker is running: `docker ps | grep mosquitto`
2. Device is connected: Check agent logs for `[Shadow] Shadow feature started`
3. Correct topic: Use device UUID in topic path

**Test MQTT manually:**
```bash
# Subscribe to test if broker works
mosquitto_sub -h localhost -p 1883 -t 'test'

# Publish to test
mosquitto_pub -h localhost -p 1883 -t 'test' -m 'hello'
```

---

### Configuration Not Applied

**Check validation errors in logs:**
```
[SensorConfig] ❌ Failed to apply sensor configuration: <error message>
```

**Common issues:**
- Interval too low (< 1000ms)
- Interval too high (> 3600000ms)
- Sensor name doesn't exist
- Invalid data type (string instead of number)

---

## Next Steps

1. **Build Cloud Dashboard**
   - UI for sensor configuration
   - Real-time shadow state display
   - Configuration history

2. **Add More Validation**
   - Sensor address validation
   - Topic naming validation
   - Rate limiting for config changes

3. **Enhance Reporting**
   - Include more sensor metrics
   - Historical data
   - Alert thresholds

4. **Implement Profiles**
   - Preset configurations (e.g., "Low Power", "High Frequency")
   - Quick switching between profiles
   - Save/load custom profiles

---

## Summary

✅ **Implemented**: Remote sensor configuration via Shadow
✅ **Protocol**: MQTT (real-time, <1s latency)
✅ **Features**: Enable/disable, change intervals, bulk updates
✅ **Validation**: Edge validation with error reporting
✅ **Confirmation**: Bi-directional sync (desired → reported)
✅ **Pattern**: Balena for containers, AWS IoT Shadow for sensors

Your IoT platform now has **complete remote management** of both **infrastructure** (containers) and **application** (sensors)! 🚀
