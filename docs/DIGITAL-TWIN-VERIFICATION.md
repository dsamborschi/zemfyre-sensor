# Digital Twin Phase 2 - Verification Guide

## ✅ What's Working

Your agent is now running cleanly without sensor connection errors after disabling `ENABLE_SENSOR_PUBLISH`.

## 🔍 How to Verify Digital Twin is Working

### 1. Check Agent Logs

Look for these log messages in your **Debug Agent** terminal:

**On Startup:**
```
🤖 Initializing Digital Twin State Manager...
✅ Digital Twin State Manager initialized
   Update interval: 30000ms (30s)
   Features: readings, health, system, connectivity
```

**Every 30 seconds:**
```
🔄 Updating digital twin state...
✅ Digital twin state updated
   Components: identity, readings, health, system, connectivity, lastUpdated
```

### 2. Check PostgreSQL Database

Open a new terminal and run:

```powershell
# Connect to PostgreSQL (adjust password if different)
docker exec -it postgres psql -U postgres -d iotistic

# Check for digital twin shadow updates
SELECT 
  device_uuid,
  shadow_name,
  reported_state->'system'->>'cpuUsage' as cpu,
  reported_state->'system'->>'memoryUsage' as memory,
  reported_state->'health'->>'status' as health,
  reported_state->'connectivity'->>'mqttConnected' as mqtt,
  reported_state->>'lastUpdated' as last_updated,
  updated_at
FROM device_shadows
WHERE shadow_name = 'device-state'
ORDER BY updated_at DESC
LIMIT 5;
```

**Expected Output:**
- `cpu`: CPU usage percentage (e.g., "15.5")
- `memory`: Memory usage in MB (e.g., "512")
- `health`: "healthy", "degraded", or "critical"
- `mqtt`: "true" or "false"
- `last_updated`: Recent timestamp (should update every 30 seconds)

### 3. Check Full Shadow Document

```sql
SELECT 
  device_uuid,
  shadow_name,
  jsonb_pretty(reported_state) as twin_state
FROM device_shadows
WHERE shadow_name = 'device-state'
ORDER BY updated_at DESC
LIMIT 1;
```

**Expected Structure:**
```json
{
  "identity": {
    "deviceUuid": "abc-123-...",
    "serialNumber": "...",
    "model": "...",
    "firmwareVersion": "...",
    "lastBootTime": "2025-10-18T..."
  },
  "readings": {
    "sensor1": {
      "value": 0,
      "unit": "messages",
      "timestamp": "2025-10-18T...",
      "quality": "poor"
    }
  },
  "health": {
    "status": "healthy",
    "uptime": 1234,
    "errors": [],
    "lastBootTime": "2025-10-18T..."
  },
  "system": {
    "cpuUsage": 15.5,
    "memoryUsage": 512,
    "memoryTotal": 16384,
    "diskUsage": 45,
    "diskTotal": 500,
    "temperature": 55
  },
  "connectivity": {
    "mqttConnected": true,
    "cloudConnected": true,
    "lastHeartbeat": "2025-10-18T..."
  },
  "lastUpdated": "2025-10-18T..."
}
```

## 📊 What Each Component Means

### Identity
- Static device information
- Boot time for calculating uptime

### Readings (Currently Limited)
- Since sensors are disabled, readings show message counts
- Quality indicator: "poor" (expected - no real sensor data)
- **Future**: Will show actual sensor values when sensors are enabled

### Health
- **Status**: Based on error count
  - `healthy`: 0-5 errors
  - `degraded`: 6-10 errors
  - `critical`: 10+ errors
- **Uptime**: Seconds since last boot
- **Errors**: Last 10 errors recorded

### System Metrics (The Important Part!)
- **CPU Usage**: Real-time CPU percentage
- **Memory**: Used/Total RAM in MB
- **Disk**: Used/Total disk space in GB
- **Temperature**: CPU temperature in °C

### Connectivity
- **MQTT**: Connection to local MQTT broker (localhost:5883)
- **Cloud**: Connection to cloud API (localhost:4002)
- **Heartbeat**: Last successful connection timestamp

## 🎯 Success Criteria

✅ Digital twin initialized on agent startup
✅ Shadow updates every 30 seconds
✅ System metrics showing real-time CPU/memory/disk
✅ Health status calculated from error count
✅ Connectivity status reflects MQTT/cloud state
✅ No errors in agent logs

## 🐛 Troubleshooting

### Digital Twin Not Initializing

**Check:** `ENABLE_DIGITAL_TWIN` environment variable
```json
"ENABLE_DIGITAL_TWIN": "true"
```

**Check:** `ENABLE_SHADOW` must also be enabled
```json
"ENABLE_SHADOW": "true"
```

### No Shadow Updates in Database

**Issue:** Shadow feature might not be working

**Check:** API is running (Debug API terminal)

**Check:** MQTT broker is running
```powershell
docker ps --filter name=mosquitto
```

**Check:** Device is provisioned
```sql
SELECT * FROM devices;
```

### System Metrics Show as Null

**Issue:** `systeminformation` package might have errors

**Check:** Agent logs for system metrics collection errors

### Updates Too Slow/Fast

**Adjust:** `TWIN_UPDATE_INTERVAL` in launch.json
```json
"TWIN_UPDATE_INTERVAL": "10000"  // 10 seconds
```

## 🚀 Next Steps (Phase 3)

Once you confirm digital twin is working:

1. **Create API Endpoints**
   - `GET /api/v1/devices/:uuid/twin` - Get current twin state
   - `GET /api/v1/fleet/twins` - Get all device twins
   - `GET /api/v1/fleet/twins/health` - Fleet health summary

2. **Add Dashboard Visualization**
   - Real-time system metrics charts
   - Health status indicators
   - Fleet overview

3. **Implement History Tracking**
   - Store shadow state changes over time
   - Trend analysis queries
   - Anomaly detection

## 📝 Notes

- **Sensor readings** are currently showing message counts (not real sensor data) because `ENABLE_SENSOR_PUBLISH` is disabled
- This is expected on Windows due to Unix socket limitations
- System metrics (CPU, memory, disk) are the primary value of Phase 2
- When deployed to Raspberry Pi with real BME688 sensors, readings will show actual environmental data

## 🎉 Congratulations!

Your digital twin is now collecting and reporting comprehensive device state every 30 seconds, providing a real-time virtual representation of your IoT device!
