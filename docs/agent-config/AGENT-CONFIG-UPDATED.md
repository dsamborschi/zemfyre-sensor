# Agent Configuration Updated ✅

## What Was Changed

Updated `.vscode/launch.json` "Debug Agent" configuration:

### Before (Docker paths)
```json
"SENSOR_PUBLISH_CONFIG": "{\"sensors\":[{\"name\":\"sensor1\",\"addr\":\"/tmp/sensor1.sock\",...}]}"
```

### After (Windows paths - 3 sensors)
```json
"SENSOR_PUBLISH_CONFIG": "{\"sensors\":[
  {\"name\":\"sensor1\",\"addr\":\"../sensor-simulator/sockets/sensor1.sock\",...},
  {\"name\":\"sensor2\",\"addr\":\"../sensor-simulator/sockets/sensor2.sock\",...},
  {\"name\":\"sensor3\",\"addr\":\"../sensor-simulator/sockets/sensor3.sock\",...}
]}"
```

## Key Changes

1. **Path Change**: `/tmp/sensor1.sock` → `../sensor-simulator/sockets/sensor1.sock`
2. **Added 3 Sensors**: Now monitoring sensor1, sensor2, and sensor3
3. **Relative Path**: Uses `../` to go from `agent/` folder to `sensor-simulator/sockets/`

## Verification

Socket files exist:
```
✅ sensor-simulator/sockets/sensor1.sock
✅ sensor-simulator/sockets/sensor2.sock
✅ sensor-simulator/sockets/sensor3.sock
```

Simulator is running:
```
📡 [sensor1] Socket listening: /tmp/sensors/sensor1.sock
📡 [sensor2] Socket listening: /tmp/sensors/sensor2.sock
📡 [sensor3] Socket listening: /tmp/sensors/sensor3.sock
```

## Next Steps

### 1. Start the Agent

In VS Code, press **F5** or select "Debug Agent" and click the green play button.

### 2. Expected Agent Output

```
🚀 Initializing Device Supervisor...
📡 Initializing Sensor Publish Feature...
[SensorPublish] Starting sensor 'sensor1'
[SensorPublish] Connecting to ../sensor-simulator/sockets/sensor1.sock
[SensorPublish] Connected to sensor socket
[SensorPublish] Starting sensor 'sensor2'
[SensorPublish] Connected to sensor socket
[SensorPublish] Starting sensor 'sensor3'
[SensorPublish] Connected to sensor socket
✅ Sensor Publish Feature initialized
   Sensors configured: 3
```

### 3. Expected Simulator Output

Once agent connects, you'll see:
```
2025-10-18T19:20:05.295Z 📡 [sensor1] Client connected
2025-10-18T19:20:05.295Z 📡 [sensor1] Published: {"sensor_name":"sensor1","temperature":23.45,...}
2025-10-18T19:20:05.314Z 📡 [sensor2] Client connected
2025-10-18T19:20:05.314Z 📡 [sensor2] Published: {"sensor_name":"sensor2","temperature":24.12,...}
2025-10-18T19:20:05.315Z 📡 [sensor3] Client connected
2025-10-18T19:20:05.315Z 📡 [sensor3] Published: {"sensor_name":"sensor3","temperature":22.89,...}
```

### 4. Verify MQTT Publishing

If you have MQTT broker running:
```powershell
# Subscribe to sensor data
docker run --rm -it --network=zemfyre-net eclipse-mosquitto mosquitto_sub -h mosquitto -t 'sensor/#' -v

# Expected output:
sensor/data {"sensor_name":"sensor1","temperature":23.45,...}
sensor/data {"sensor_name":"sensor2","temperature":24.12,...}
sensor/data {"sensor_name":"sensor3","temperature":22.89,...}
```

## Troubleshooting

### Agent Can't Connect to Sockets

**Error**: `ENOENT: no such file or directory, connect '../sensor-simulator/sockets/sensor1.sock'`

**Solution**: Verify simulator is running and sockets exist:
```powershell
docker-compose -f docker-compose.simulator.yml ps
ls sensor-simulator\sockets\
```

### Path Not Found

**Error**: `Error: connect ENOENT`

**Solution**: Check you're running agent from correct directory. The path `../sensor-simulator/sockets/` is relative to the `agent/` folder.

### Simulator Shows "No clients connected"

**Cause**: Agent hasn't started yet or couldn't connect.

**Solution**: 
1. Start the agent in VS Code (F5)
2. Check agent logs for connection errors
3. Verify socket paths in launch.json

## Current Configuration Summary

| Component | Status | Location |
|-----------|--------|----------|
| **Simulator** | ✅ Running | Docker container |
| **Sockets** | ✅ Created | `sensor-simulator/sockets/*.sock` |
| **Agent Config** | ✅ Updated | `.vscode/launch.json` |
| **Agent** | ⏳ Ready to start | VS Code Debug |

## Ready to Test! 🚀

Press **F5** in VS Code to start the agent and watch the connection happen!
