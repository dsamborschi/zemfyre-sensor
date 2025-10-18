# MQTT Manager for API

Flexible MQTT message handling for receiving data from IoT devices.

## Features

- **Broker-agnostic**: Works with local Mosquitto, AWS IoT Core, Azure IoT Hub, HiveMQ, etc.
- **Event-driven architecture**: Uses EventEmitter for flexible message handling
- **Auto-reconnection**: Handles network interruptions gracefully
- **Type-safe**: Full TypeScript support with defined message types
- **Scalable**: Supports wildcard subscriptions for multiple devices

## Supported Message Types

| Type | Topic Pattern | Description |
|------|--------------|-------------|
| **Sensor Data** | `device/{uuid}/sensor/{name}/data` | Time-series sensor readings |
| **Shadow (Reported)** | `device/{uuid}/shadow/reported` | Device-reported state |
| **Shadow (Desired)** | `device/{uuid}/shadow/desired` | Cloud-desired state |
| **Logs** | `device/{uuid}/logs/{containerId}` | Container logs |
| **Metrics** | `device/{uuid}/metrics` | System metrics (CPU, memory, etc.) |
| **Status** | `device/{uuid}/status` | Device online/offline status |

## Environment Variables

```bash
# Required
MQTT_BROKER_URL=mqtt://localhost:1883          # MQTT broker URL

# Optional
MQTT_CLIENT_ID=api-server-1                     # Client ID (default: api-{hostname})
MQTT_USERNAME=                                   # Broker authentication
MQTT_PASSWORD=                                   # Broker authentication
MQTT_RECONNECT_PERIOD=5000                      # Reconnect interval (ms)
MQTT_KEEPALIVE=60                               # Keepalive interval (seconds)
MQTT_QOS=1                                      # QoS level: 0, 1, or 2
MQTT_SUBSCRIBE_ALL=true                         # Subscribe to all devices (default: true)
```

## Usage

### 1. Initialize in main server file

```typescript
// src/index.ts
import { initializeMqtt, shutdownMqtt } from './mqtt';

async function startServer() {
  // ... other initialization
  
  // Initialize MQTT
  await initializeMqtt();
  
  // ... start Express server
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await shutdownMqtt();
  process.exit(0);
});
```

### 2. Custom message handling

```typescript
import { getMqttManager } from './mqtt';

const mqttManager = getMqttManager();

if (mqttManager) {
  // Listen for sensor data
  mqttManager.on('sensor', (data) => {
    console.log('Sensor data:', data);
    // Custom processing...
  });

  // Listen for specific device
  mqttManager.on('shadow', (update) => {
    if (update.deviceUuid === 'specific-uuid') {
      // Handle shadow update for specific device
    }
  });
}
```

### 3. Subscribe to specific devices

```typescript
const mqttManager = getMqttManager();

if (mqttManager) {
  // Subscribe to specific device topics
  mqttManager.subscribe('device-uuid-123', [
    'sensor',
    'shadow-reported',
    'metrics'
  ]);

  // Subscribe to all devices (wildcard)
  mqttManager.subscribeToAll(['sensor', 'logs']);
}
```

### 4. Publish messages to devices

```typescript
const mqttManager = getMqttManager();

if (mqttManager) {
  // Send desired state to device
  mqttManager.publish(
    'device/abc-123/shadow/desired',
    {
      config: {
        interval: 60,
        enabled: true
      }
    }
  );

  // Send command to device
  mqttManager.publish(
    'device/abc-123/commands/restart',
    { container: 'app-container' }
  );
}
```

## Database Schema

The MQTT manager automatically stores messages in PostgreSQL:

```sql
-- Sensor data (time-series)
sensor_data (
  device_uuid, sensor_name, data, timestamp, metadata
)

-- Device shadows (state management)
device_shadows (
  device_uuid, reported, desired, version, updated_at
)

-- Container logs
device_logs (
  device_uuid, container_id, message, level, timestamp
)

-- Metrics (already exists in device_metrics table)
```

Run migration:
```bash
psql -U postgres -d your_database < api/database/migrations/013_add_mqtt_tables.sql
```

## External MQTT Brokers

### AWS IoT Core

```bash
MQTT_BROKER_URL=mqtts://your-endpoint.iot.us-east-1.amazonaws.com:8883
MQTT_CLIENT_ID=api-server-aws
# Use X.509 certificates for authentication (configure in mqtt-manager.ts)
```

### Azure IoT Hub

```bash
MQTT_BROKER_URL=mqtts://your-hub.azure-devices.net:8883
MQTT_USERNAME=your-hub.azure-devices.net/api-server
MQTT_PASSWORD=SharedAccessSignature sr=...
```

### HiveMQ Cloud

```bash
MQTT_BROKER_URL=mqtts://your-cluster.hivemq.cloud:8883
MQTT_USERNAME=your-username
MQTT_PASSWORD=your-password
```

### Local Mosquitto (Docker)

```bash
MQTT_BROKER_URL=mqtt://mosquitto:1883
# or external:
MQTT_BROKER_URL=mqtt://192.168.1.100:1883
MQTT_USERNAME=admin
MQTT_PASSWORD=secret
```

## Message Formats

### Sensor Data

```json
{
  "deviceUuid": "abc-123",
  "sensorName": "temperature",
  "timestamp": "2025-10-18T10:00:00Z",
  "data": {
    "value": 22.5,
    "unit": "celsius"
  },
  "metadata": {
    "location": "room-101"
  }
}
```

### Shadow Update (Reported)

```json
{
  "deviceUuid": "abc-123",
  "reported": {
    "config": {
      "interval": 30,
      "enabled": true
    },
    "status": "running"
  },
  "timestamp": "2025-10-18T10:00:00Z",
  "version": 5
}
```

### Log Message

```json
{
  "deviceUuid": "abc-123",
  "containerId": "container-123",
  "containerName": "app",
  "message": "Application started",
  "level": "info",
  "stream": "stdout",
  "timestamp": "2025-10-18T10:00:00Z"
}
```

### Metrics

```json
{
  "deviceUuid": "abc-123",
  "timestamp": "2025-10-18T10:00:00Z",
  "cpu_usage": 45.2,
  "memory_usage": 1024000000,
  "memory_total": 4096000000,
  "cpu_temp": 55.3
}
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ IoT Devices (Agent)                                      │
├──────────────────────────────────────────────────────────┤
│ • Sensor Publish Feature → sensor data                  │
│ • Shadow Feature → shadow updates                        │
│ • Log Streaming → container logs                         │
│ • Metrics → system metrics                               │
└─────────────┬────────────────────────────────────────────┘
              │
              ▼ MQTT Topics
┌──────────────────────────────────────────────────────────┐
│ MQTT Broker (Mosquitto / AWS IoT / Azure IoT Hub)       │
└─────────────┬────────────────────────────────────────────┘
              │
              ▼ Subscribe
┌──────────────────────────────────────────────────────────┐
│ API Server (MqttManager)                                 │
├──────────────────────────────────────────────────────────┤
│ • Event handlers                                         │
│ • Message routing                                        │
│ • Database storage                                       │
└─────────────┬────────────────────────────────────────────┘
              │
              ▼ Store
┌──────────────────────────────────────────────────────────┐
│ PostgreSQL Database                                      │
├──────────────────────────────────────────────────────────┤
│ • sensor_data                                            │
│ • device_shadows                                         │
│ • device_logs                                            │
│ • device_metrics                                         │
└──────────────────────────────────────────────────────────┘
```

## Performance Considerations

1. **QoS Levels**:
   - QoS 0: At most once (fastest, may lose messages)
   - QoS 1: At least once (recommended, may duplicate)
   - QoS 2: Exactly once (slowest, no duplicates)

2. **Log Retention**: Implement automatic cleanup for `device_logs` table

3. **Partitioning**: Consider partitioning `sensor_data` and `device_logs` by month for large deployments

4. **External Storage**: For high-volume sensor data, consider InfluxDB or TimescaleDB instead of PostgreSQL

## Testing

```bash
# Publish test sensor data
mosquitto_pub -h localhost -t device/test-uuid/sensor/temperature/data \
  -m '{"timestamp":"2025-10-18T10:00:00Z","data":{"value":22.5}}'

# Publish shadow update
mosquitto_pub -h localhost -t device/test-uuid/shadow/reported \
  -m '{"config":{"enabled":true},"version":1}'

# Subscribe to all device topics
mosquitto_sub -h localhost -t 'device/#' -v
```

## Troubleshooting

**MQTT not connecting**:
- Check `MQTT_BROKER_URL` is correct
- Verify broker is running: `docker ps | grep mosquitto`
- Check credentials if using authentication

**Messages not being received**:
- Verify subscriptions: `mqttManager.getSubscriptions()`
- Check topic format matches convention
- Enable MQTT client logging

**High database load**:
- Implement log retention policies
- Consider batch inserts for high-frequency sensors
- Use time-series database for sensor data

---

**Status**: ✅ Ready for production

**Dependencies**: `mqtt` npm package (install: `npm install mqtt`)
