# Sensor Simulator - Quick Start Guide

Get the sensor simulator running in 3 minutes!

## 🚀 Quick Start

### 1. Start the Simulator and Agent

```powershell
# From project root
docker-compose -f docker-compose.dev.yml up -d sensor-simulator

# View logs
docker-compose logs -f sensor-simulator
```

You should see:
```
✅ Sensor Simulator Started Successfully!
📊 Active Sensors: 3
📁 Socket Directory: /tmp/sensors
⏱️  Publish Interval: 60000ms (60s)
⚠️  Failure Simulation: Enabled
```

### 2. Configure Agent to Use Simulated Sensors

Update your agent's launch configuration or environment:

```json
{
  "ENABLE_SENSOR_PUBLISH": "true",
  "MQTT_BROKER": "mqtt://localhost:5883",
  "SENSOR_PUBLISH_CONFIG": "{\"sensors\":[{\"name\":\"sensor1\",\"addr\":\"/tmp/sensors/sensor1.sock\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"sensor/data\",\"bufferSize\":100,\"bufferTimeMs\":1000},{\"name\":\"sensor2\",\"addr\":\"/tmp/sensors/sensor2.sock\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"sensor/data\",\"bufferSize\":100,\"bufferTimeMs\":1000},{\"name\":\"sensor3\",\"addr\":\"/tmp/sensors/sensor3.sock\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"sensor/data\",\"bufferSize\":100,\"bufferTimeMs\":1000}]}"
}
```

### 3. Start the Agent

```powershell
# Start agent (it will connect to simulator sockets)
docker-compose -f docker-compose.dev.yml up -d agent

# Or run agent locally in VS Code Debug mode
# (make sure to add volume mount: -v sensor-sockets:/tmp/sensors)
```

### 4. Verify Data Flow

```powershell
# Check simulator logs
docker-compose logs -f sensor-simulator

# Check agent logs
docker-compose logs -f agent

# Subscribe to MQTT to see published data
docker run --rm -it --network=Iotistic-net eclipse-mosquitto mosquitto_sub -h mosquitto -t 'sensor/#' -v
```

## ⚙️ Configuration

### Change Number of Sensors

```powershell
# Create .env file
echo "SIM_NUM_SENSORS=5" > .env

# Restart simulator
docker-compose -f docker-compose.dev.yml up -d sensor-simulator
```

### Change Publish Interval

```powershell
# Publish every 10 seconds instead of 60
echo "SIM_PUBLISH_INTERVAL_MS=10000" >> .env

# Restart
docker-compose -f docker-compose.dev.yml restart sensor-simulator
```

### Disable Failure Simulation

```powershell
echo "SIM_ENABLE_FAILURES=false" >> .env
docker-compose -f docker-compose.dev.yml restart sensor-simulator
```

### Debug Mode

```powershell
echo "SIM_LOG_LEVEL=debug" >> .env
docker-compose -f docker-compose.dev.yml restart sensor-simulator
```

## 🧪 Testing Scenarios

### Test Sensor Failures

With failures enabled (default), you'll see random sensor disconnections:

```
⚠️  [sensor2] ⚠️  SIMULATED FAILURE - Sensor offline
♻️  [sensor2] Recovering from failure...
✅ [sensor2] Recovery successful
```

The agent should handle these gracefully and reconnect automatically.

### Test Multiple Sensors

```powershell
# Run with 10 sensors
echo "SIM_NUM_SENSORS=10" > .env
docker-compose -f docker-compose.dev.yml up -d sensor-simulator

# Update agent config to match
```

### Test High-Frequency Data

```powershell
# Publish every second
echo "SIM_PUBLISH_INTERVAL_MS=1000" > .env
docker-compose -f docker-compose.dev.yml restart sensor-simulator
```

## 🔍 Troubleshooting

### Sockets Not Created

```powershell
# Check if simulator is running
docker-compose ps sensor-simulator

# Check logs
docker-compose logs sensor-simulator

# Verify volume
docker volume inspect Iotistic-sensor_sensor-sockets
```

### Agent Can't Connect

```powershell
# Verify both containers use the same volume
docker inspect agent | grep sensor-sockets
docker inspect sensor-simulator | grep sensor-sockets

# Check socket files exist
docker exec sensor-simulator ls -la /tmp/sensors/
```

### No Data in MQTT

```powershell
# Check if MQTT broker is running
docker-compose ps mosquitto

# Test direct connection to socket
docker exec sensor-simulator nc -U /tmp/sensors/sensor1.sock

# Check agent sensor publish logs
docker-compose logs agent | grep -i sensor
```

## 📊 Expected Data Output

Each sensor publishes JSON like this every minute (default):

```json
{
  "sensor_name": "sensor1",
  "temperature": 23.45,
  "humidity": 45.67,
  "pressure": 1013.25,
  "gas_resistance": 245678,
  "timestamp": "2025-10-18T10:30:00.000Z"
}
```

## 🛑 Stopping

```powershell
# Stop simulator only
docker-compose -f docker-compose.dev.yml stop sensor-simulator

# Stop everything
docker-compose -f docker-compose.dev.yml down

# Stop and remove volumes (clears sockets)
docker-compose -f docker-compose.dev.yml down -v
```

## 📝 Common Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SIM_NUM_SENSORS` | `3` | Number of sensors |
| `SIM_PUBLISH_INTERVAL_MS` | `60000` | Publish every N ms |
| `SIM_ENABLE_FAILURES` | `true` | Random failures |
| `SIM_FAILURE_CHANCE` | `0.05` | 5% fail per interval |
| `SIM_LOG_LEVEL` | `info` | debug/info/warn/error |

See `.env.example` for all options!

## 🎯 Next Steps

1. ✅ Verify data appears in MQTT
2. ✅ Check InfluxDB for stored sensor data
3. ✅ View Grafana dashboards with live sensor readings
4. ✅ Test agent sensor publish buffering and batching
5. ✅ Test failure recovery scenarios

Happy testing! 🚀
