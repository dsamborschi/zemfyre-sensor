# ✅ Digital Twin Implementation - Phase 2 Complete

## Overview

**Digital Twin State Manager** is now implemented! The device automatically collects and reports comprehensive state information to its shadow, creating a complete digital representation of the physical device.

---

## What's Included

### 1. Device Identity
- Device UUID
- Serial number (or UUID fallback)
- Model/device type
- Firmware version
- Last boot time

### 2. Sensor Readings
- Latest values from each sensor
- Timestamps
- Quality indicators (good/degraded/poor based on data age)
- Units of measurement

### 3. Device Health
- Overall status (healthy/degraded/critical/offline)
- Uptime (seconds since boot)
- Error log (last 10 errors)
- Last boot timestamp

### 4. System Metrics
- CPU usage (%)
- Memory usage (MB) + total
- Disk usage (GB) + total
- CPU temperature (if available)
- Network latency (if measured)

### 5. Connectivity Status
- MQTT connection status
- Cloud API connection status
- Last heartbeat timestamp

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_DIGITAL_TWIN` | `true` | Enable/disable digital twin feature |
| `TWIN_UPDATE_INTERVAL` | `60000` | Update interval in milliseconds (60s) |
| `TWIN_ENABLE_READINGS` | `true` | Include sensor readings in twin |
| `TWIN_ENABLE_HEALTH` | `true` | Include health status in twin |
| `TWIN_ENABLE_SYSTEM` | `true` | Include system metrics in twin |
| `TWIN_ENABLE_CONNECTIVITY` | `true` | Include connectivity status in twin |

### launch.json Configuration

Already updated:
```json
"env": {
  "ENABLE_DIGITAL_TWIN": "true",
  "TWIN_UPDATE_INTERVAL": "30000"  // Update every 30 seconds
}
```

---

## Shadow Document Structure

The digital twin updates the `device-state` shadow with this structure:

```json
{
  "state": {
    "reported": {
      "identity": {
        "deviceUuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
        "serialNumber": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
        "model": "zemfyre-sensor",
        "firmwareVersion": "1.0.0",
        "lastBootTime": "2025-10-18T10:00:00.000Z"
      },
      "readings": {
        "sensor1": {
          "value": 150,
          "unit": "messages",
          "timestamp": "2025-10-18T14:30:00.000Z",
          "quality": "good"
        },
        "sensor2": {
          "value": 145,
          "unit": "messages",
          "timestamp": "2025-10-18T14:29:55.000Z",
          "quality": "good"
        },
        "sensor3": {
          "value": 148,
          "unit": "messages",
          "timestamp": "2025-10-18T14:30:02.000Z",
          "quality": "good"
        }
      },
      "health": {
        "status": "healthy",
        "uptime": 86400,
        "errors": [],
        "lastBootTime": "2025-10-18T10:00:00.000Z"
      },
      "system": {
        "cpuUsage": 45.2,
        "memoryUsage": 512,
        "memoryTotal": 2048,
        "diskUsage": 5,
        "diskTotal": 32,
        "temperature": 45.5
      },
      "connectivity": {
        "mqttConnected": true,
        "cloudConnected": true,
        "lastHeartbeat": "2025-10-18T14:30:00.000Z"
      },
      "lastUpdated": "2025-10-18T14:30:00.000Z",
      "sensors": {
        "sensor1": {
          "enabled": true,
          "addr": "../sensor-simulator/sockets/sensor1.sock",
          "publishInterval": 30000
        },
        "sensor2": { ... },
        "sensor3": { ... }
      },
      "metrics": {
        "totalSensors": 3,
        "mqttConnected": true,
        "enabledSensors": 3
      }
    }
  }
}
```

---

## How It Works

### 1. Initialization

When the agent starts:
```typescript
// supervisor.ts
await this.initializeDigitalTwin();
```

1. Creates `TwinStateManager` instance
2. Connects to Shadow Feature
3. Sets references to Sensor Publish and MQTT backend
4. Starts periodic updates

### 2. Periodic Updates

Every `TWIN_UPDATE_INTERVAL` milliseconds:
```typescript
// twin-state-manager.ts
setInterval(() => {
  this.updateTwinState();
}, this.config.updateInterval);
```

The update process:
1. **Collect identity** - Device UUID, model, firmware version
2. **Collect readings** - Latest sensor values from SensorPublish
3. **Collect health** - Status, uptime, errors
4. **Collect system** - CPU, memory, disk via `systeminformation`
5. **Collect connectivity** - MQTT and cloud connection status
6. **Update shadow** - Publish complete state to MQTT

### 3. Data Flow

```
Device Sensors
    ↓ (readings)
SensorPublishFeature
    ↓ (last values)
TwinStateManager
    ↓ (collect state)
    ├─ Identity
    ├─ Readings
    ├─ Health
    ├─ System Metrics
    └─ Connectivity
    ↓ (combine)
ShadowFeature
    ↓ (publish)
MQTT: iot/device/{uuid}/shadow/name/device-state/update
    ↓ (subscribe)
Cloud API
    ↓ (save)
PostgreSQL: device_shadows table
```

---

## Files Created/Modified

### New Files

1. **`agent/src/digital-twin/twin-state-manager.ts`**
   - Main Digital Twin State Manager class
   - Collects all device state components
   - Periodic shadow updates
   - Error tracking for health monitoring

### Modified Files

1. **`agent/src/supervisor.ts`**
   - Added `twinStateManager` instance
   - Added `ENABLE_DIGITAL_TWIN` flag
   - Added `initializeDigitalTwin()` method
   - Added twin manager to stop sequence

2. **`.vscode/launch.json`**
   - Added `ENABLE_DIGITAL_TWIN: "true"`
   - Added `TWIN_UPDATE_INTERVAL: "30000"` (30 seconds for dev)

---

## Testing

### 1. Start the Agent

```bash
# Via VS Code debugger
F5 → "Debug Agent"

# Or via terminal
cd agent
npm run dev
```

### 2. Check Logs

Look for these log messages:

```bash
🤖 Initializing Digital Twin State Manager...
✅ Digital Twin State Manager initialized
   Update interval: 30000ms (30s)
   Features: readings, health, system, connectivity

# Every 30 seconds:
🔄 Updating digital twin state...
✅ Digital twin state updated
   Components: identity, readings, health, system, connectivity, lastUpdated
```

### 3. Verify Shadow Updates

**Check PostgreSQL**:
```sql
SELECT 
  device_uuid,
  shadow_name,
  reported_state->'identity'->>'deviceUuid' as device_uuid,
  reported_state->'health'->>'status' as health,
  reported_state->'system'->>'cpuUsage' as cpu,
  reported_state->'lastUpdated' as last_updated,
  updated_at
FROM device_shadows
WHERE shadow_name = 'device-state'
ORDER BY updated_at DESC;
```

**Expected result**: New row or updated row every 30 seconds with fresh data

### 4. Monitor MQTT Messages

```bash
docker exec mosquitto mosquitto_sub -h localhost -p 1883 -t 'iot/device/+/shadow/#' -v
```

You should see shadow updates published regularly.

---

## Use Cases

### 1. Dashboard Visualization

**Query the shadow for current device state**:
```typescript
// API endpoint
GET /api/v1/devices/:uuid/twin

// Returns complete shadow document
const twin = await fetch(`/api/v1/devices/${uuid}/twin`);

// Display on dashboard
<DeviceCard>
  <StatusBadge status={twin.health.status} />
  <CPUGauge value={twin.system.cpuUsage} />
  <MemoryGauge value={twin.system.memoryUsage} max={twin.system.memoryTotal} />
  <UptimeDisplay seconds={twin.health.uptime} />
</DeviceCard>
```

### 2. Fleet Health Monitoring

**Query all device twins for fleet overview**:
```sql
SELECT 
  device_uuid,
  reported_state->'health'->>'status' as status,
  reported_state->'system'->>'cpuUsage' as cpu,
  (reported_state->'connectivity'->>'mqttConnected')::boolean as online,
  updated_at
FROM device_shadows
WHERE shadow_name = 'device-state'
  AND updated_at > NOW() - INTERVAL '5 minutes'  -- Active devices
ORDER BY (reported_state->'health'->>'status') DESC;  -- Critical first
```

### 3. Predictive Maintenance

**Identify devices needing attention**:
```sql
-- High CPU devices
SELECT device_uuid, reported_state->'system'->>'cpuUsage' as cpu
FROM device_shadows
WHERE (reported_state->'system'->>'cpuUsage')::numeric > 80
  AND shadow_name = 'device-state';

-- Degraded health
SELECT device_uuid, reported_state->'health'->>'status' as status
FROM device_shadows
WHERE reported_state->'health'->>'status' IN ('degraded', 'critical')
  AND shadow_name = 'device-state';

-- Low disk space
SELECT device_uuid, 
  reported_state->'system'->>'diskUsage' as used,
  reported_state->'system'->>'diskTotal' as total
FROM device_shadows
WHERE (reported_state->'system'->>'diskUsage')::numeric / 
      (reported_state->'system'->>'diskTotal')::numeric > 0.9
  AND shadow_name = 'device-state';
```

### 4. Remote Diagnostics

**Get complete device state for troubleshooting**:
```bash
# Query shadow via API
curl http://localhost:4002/api/v1/devices/46b68204.../twin

# Shows:
# - Current sensor readings
# - System resource usage
# - Error history
# - Connection status
# - Uptime and boot time
```

---

## Quality Indicators

Sensor readings include a **quality** field based on data age:

```typescript
// Good: Data is recent (< 2x publish interval)
if (ageMs < publishInterval * 2) {
  quality = 'good';
}
// Degraded: Data is old (< 5x publish interval)
else if (ageMs < publishInterval * 5) {
  quality = 'degraded';
}
// Poor: Data is very old (> 5x publish interval)
else {
  quality = 'poor';
}
```

This helps identify:
- Sensors that stopped reporting
- Communication issues
- Stale data in dashboards

---

## Health Status

Overall device health is calculated based on error count:

```typescript
if (errors.length > 10) {
  status = 'critical';  // Many errors
} else if (errors.length > 5) {
  status = 'degraded';  // Some errors
} else {
  status = 'healthy';   // No/few errors
}
```

Errors are tracked via `twinStateManager.recordError(code, message)`.

---

## Next Steps

### Phase 3: API Endpoints (Upcoming)

Create REST API endpoints to query and manipulate digital twins:

- `GET /api/v1/devices/:uuid/twin` - Get device twin
- `GET /api/v1/fleet/twins` - Get all device twins
- `GET /api/v1/devices/:uuid/twin/history` - Historical twin states
- `PATCH /api/v1/devices/:uuid/twin/desired` - Set desired state

### Phase 4: Advanced Features (Future)

- **Time-series storage** - Store twin history for trend analysis
- **Anomaly detection** - Alert on unusual patterns
- **Predictive models** - Forecast failures based on twin data
- **Virtual twins** - Create simulated devices for testing
- **Twin-to-twin** - Device interactions via shadows

---

## Performance

**Overhead**: Very low
- Updates only once per `TWIN_UPDATE_INTERVAL` (default: 60s)
- Uses lightweight `systeminformation` library
- Shadow updates are batched and efficient

**Network**: Minimal
- One MQTT message per update interval
- Typical payload: ~1-2 KB
- QoS 1 (at least once)

**Database**: Efficient
- PostgreSQL JSONB for flexible querying
- Index on device_uuid + shadow_name + updated_at
- Can add partial indexes for specific queries

---

## Troubleshooting

### Digital Twin Not Starting

**Check logs**:
```bash
⚠️  Digital Twin disabled (set ENABLE_DIGITAL_TWIN=true to enable)
```
**Solution**: Set `ENABLE_DIGITAL_TWIN=true` in environment

### No Shadow Updates

**Check logs**:
```bash
🔄 Updating digital twin state...
❌ Error updating twin state: ...
```
**Solution**: Check Shadow Feature is enabled and MQTT is connected

### Missing System Metrics

**Check logs**:
```bash
Error getting system metrics: ...
```
**Solution**: Ensure `systeminformation` package is installed:
```bash
cd agent
npm install systeminformation
```

---

## Summary

✅ **Digital Twin State Manager implemented**  
✅ **Collects identity, readings, health, system, connectivity**  
✅ **Periodic shadow updates (configurable interval)**  
✅ **Quality indicators for sensor readings**  
✅ **Health status calculation**  
✅ **System metrics via systeminformation**  
✅ **Error tracking**  
✅ **Integrated into supervisor**  
✅ **Configured in launch.json**  

**Your device now maintains a complete, always-updated digital twin in the cloud!** 🎉🤖

**Next**: Restart your agent and watch the digital twin come to life in the database!
