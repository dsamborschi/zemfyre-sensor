# Sensor Publish Feature

**Notice:** The Sensor Publish feature enables your IoT device to collect and publish sensor data from local Unix domain sockets to MQTT topics in the cloud or local MQTT broker.

[*Back To The Main Readme*](../README.md)

## Overview

The Sensor Publish feature is a TypeScript port of the AWS IoT Device Client sensor-publish functionality. It allows you to publish sensor data captured on your device to MQTT brokers over standardized topics. This feature provides a clean separation between sensor data collection and network communication.

### Key Features

- ✅ **Multiple Sensor Support**: Up to 10 sensors per device
- ✅ **Unix Domain Socket Communication**: Efficient IPC between sensor apps and the agent
- ✅ **Configurable Message Parsing**: Use regex delimiters to parse sensor streams
- ✅ **Message Buffering & Batching**: Configure buffer size and time thresholds
- ✅ **Automatic Reconnection**: Handles sensor disconnections gracefully
- ✅ **Heartbeat Monitoring**: Optional heartbeat messages for sensor health tracking
- ✅ **MQTT Integration**: Publishes to standardized MQTT topic structure

## How It Works

```
┌────────────────────────────────────────────────────────┐
│              IoT Device (Raspberry Pi)                  │
│                                                         │
│  ┌──────────────┐  Unix Socket  ┌──────────────────┐  │
│  │ Your Sensor  │───────────────►│ Device Agent     │  │
│  │ Application  │  Stream Data   │ (Supervisor)     │  │
│  │              │                │                  │  │
│  │ - Reads HW   │                │ - Parses Stream  │  │
│  │ - Formats    │                │ - Buffers        │  │
│  │ - Streams    │                │ - Batches        │  │
│  └──────────────┘                │ - Publishes      │  │
│                                  └────────┬───────────┘  │
└─────────────────────────────────────────┼──────────────┘
                                          │
                                          │ MQTT
                                          ↓
                                  ┌────────────────┐
                                  │ MQTT Broker    │
                                  │ (Mosquitto/    │
                                  │  Cloud)        │
                                  └────────────────┘
```

### Architecture

1. **Your Sensor Application**: Reads from physical sensors (I2C, SPI, GPIO, etc.) and writes formatted data to a Unix domain socket
2. **Device Agent**: Connects to the Unix socket, parses the stream using your delimiter, buffers messages, and publishes to MQTT
3. **MQTT Broker**: Receives sensor data on standardized topics for further processing

## Configuration

### Environment Variables

Enable the feature:

```bash
ENABLE_SENSOR_PUBLISH=true
```

Set sensor configuration (JSON format):

```bash
SENSOR_PUBLISH_CONFIG='{"enabled":true,"sensors":[...]}'
```

Enable debug logging:

```bash
SENSOR_PUBLISH_DEBUG=true
```

### Configuration Schema

```json
{
  "enabled": true,
  "sensors": [
    {
      "name": "my-sensor",
      "enabled": true,
      "addr": "/tmp/sensors/my-sensor",
      "addrPollSec": 10,
      "bufferTimeMs": 1000,
      "bufferSize": 10,
      "bufferCapacity": 131072,
      "eomDelimiter": "[\\r\\n]+",
      "mqttTopic": "temperature",
      "mqttHeartbeatTopic": "heartbeat",
      "heartbeatTimeSec": 300
    }
  ]
}
```

### Configuration Parameters

#### `enabled` (boolean, optional, default: `true`)
- Enable/disable the entire Sensor Publish feature

#### `sensors` (array, required)
- Array of sensor configuration objects
- **Maximum 10 sensors supported**
- Empty array disables the feature

#### Sensor Configuration Parameters

**`name`** (string, optional)
- Human-readable sensor name
- Used in logging and heartbeat messages
- If not provided, defaults to `sensor-1`, `sensor-2`, etc.

**`enabled`** (boolean, optional, default: `true`)
- Enable/disable this specific sensor

**`addr`** (string, required)
- Full path to the Unix domain socket
- Example: `/tmp/sensors/bme688`
- **Must be writable** by both your sensor app and the device agent
- Parent directory must exist and be writable

**`addrPollSec`** (number, optional, default: `10`)
- Reconnection interval in seconds
- How often to retry if sensor server is unavailable
- Use `0` for busy-polling (not recommended)

**`bufferTimeMs`** (number, optional, default: `0`)
- Timeout in milliseconds before publishing buffered messages
- Timer resets after each publish
- `0` = publish immediately when data is received

**`bufferSize`** (number, optional, default: `0`)
- Number of messages to buffer before publishing
- `0` or `1` = no buffering (publish each message immediately)
- When limit is reached, batch is published to MQTT

**`bufferCapacity`** (number, optional, default: `131072` = 128KB)
- Maximum buffer size in bytes
- **Minimum: 1024 bytes**
- Messages larger than this are discarded with error log
- Default matches AWS IoT Core message size limit (128KB)

**`eomDelimiter`** (string, required)
- End-of-message delimiter regex pattern
- Used to parse the sensor stream into individual messages
- Examples:
  - `[\r\n]+` - Newline or CRLF
  - `\n` - Newline only
  - `,` - Comma separator
  - `\|` - Pipe separator

**`mqttTopic`** (string, required)
- MQTT topic name for sensor data
- Published to: `iot/device/{deviceUuid}/sensor/{mqttTopic}`
- Example: `temperature` → `iot/device/abc-123/sensor/temperature`

**`mqttHeartbeatTopic`** (string, optional)
- MQTT topic name for heartbeat messages
- Published to: `iot/device/{deviceUuid}/sensor/{mqttHeartbeatTopic}`
- Heartbeat only sent when sensor is connected
- If omitted, no heartbeat messages are sent

**`heartbeatTimeSec`** (number, optional, default: `300`)
- Heartbeat interval in seconds
- Only applies if `mqttHeartbeatTopic` is set

## MQTT Topic Structure

The Sensor Publish feature uses a standardized topic hierarchy:

### Sensor Data Topics

```
iot/device/{deviceUuid}/sensor/{mqttTopic}
```

**Example:**
```
iot/device/f3b2a1c0-1234-5678-9abc-def012345678/sensor/temperature
```

**Payload Format:**
```json
{
  "sensor": "bme688-temp",
  "timestamp": "2025-10-14T10:30:00.000Z",
  "messages": [
    "22.5",
    "22.6",
    "22.7"
  ]
}
```

### Heartbeat Topics

```
iot/device/{deviceUuid}/sensor/{mqttHeartbeatTopic}
```

**Example:**
```
iot/device/f3b2a1c0-1234-5678-9abc-def012345678/sensor/heartbeat
```

**Payload Format:**
```json
{
  "sensor": "bme688-temp",
  "timestamp": "2025-10-14T10:30:00.000Z",
  "state": "CONNECTED",
  "stats": {
    "messagesReceived": 150,
    "messagesPublished": 15,
    "bytesReceived": 1024,
    "bytesPublished": 900,
    "reconnectAttempts": 0,
    "lastPublishTime": "2025-10-14T10:29:55.000Z",
    "lastHeartbeatTime": "2025-10-14T10:30:00.000Z"
  }
}
```

## Example Configurations

### Single Sensor - Immediate Publish

```json
{
  "enabled": true,
  "sensors": [
    {
      "name": "bme688",
      "addr": "/tmp/sensors/bme688",
      "eomDelimiter": "[\\r\\n]+",
      "mqttTopic": "temperature",
      "mqttHeartbeatTopic": "heartbeat"
    }
  ]
}
```

This configuration:
- Reads from `/tmp/sensors/bme688`
- Publishes each message immediately (no buffering)
- Sends heartbeat every 300 seconds (default)

### Multiple Sensors with Buffering

```json
{
  "enabled": true,
  "sensors": [
    {
      "name": "temperature-sensor",
      "addr": "/tmp/sensors/temp",
      "eomDelimiter": "\\n",
      "mqttTopic": "temperature",
      "bufferSize": 10,
      "bufferTimeMs": 5000
    },
    {
      "name": "humidity-sensor",
      "addr": "/tmp/sensors/humidity",
      "eomDelimiter": "\\n",
      "mqttTopic": "humidity",
      "bufferSize": 10,
      "bufferTimeMs": 5000
    },
    {
      "name": "pressure-sensor",
      "addr": "/tmp/sensors/pressure",
      "eomDelimiter": "\\n",
      "mqttTopic": "pressure",
      "mqttHeartbeatTopic": "sensor-health"
    }
  ]
}
```

This configuration:
- Three independent sensors
- Temperature and humidity buffer 10 messages or 5 seconds (whichever comes first)
- Pressure sensor publishes immediately
- All sensors share same heartbeat topic

### High-Frequency Sensor with Large Buffer

```json
{
  "enabled": true,
  "sensors": [
    {
      "name": "accelerometer",
      "addr": "/tmp/sensors/accel",
      "eomDelimiter": "\\n",
      "mqttTopic": "motion",
      "bufferSize": 100,
      "bufferTimeMs": 1000,
      "bufferCapacity": 262144,
      "addrPollSec": 5
    }
  ]
}
```

This configuration:
- High-frequency accelerometer data
- Buffer 100 messages or 1 second
- 256KB buffer capacity for large batches
- Fast reconnection (5 seconds)

## Creating a Sensor Application

Your sensor application must:
1. Create a Unix domain socket server
2. Accept client connections
3. Stream sensor data with delimiters

### Example: Python Sensor App

```python
#!/usr/bin/env python3
import socket
import time
import random
import os

# Sensor configuration
SOCKET_PATH = '/tmp/sensors/temperature'

# Ensure parent directory exists
os.makedirs(os.path.dirname(SOCKET_PATH), exist_ok=True)

# Remove old socket if exists
try:
    os.unlink(SOCKET_PATH)
except OSError:
    pass

# Create Unix domain socket
sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.bind(SOCKET_PATH)

# Set permissions (read/write for user and group)
os.chmod(SOCKET_PATH, 0o660)

sock.listen(1)
print(f"Sensor server listening on {SOCKET_PATH}")

while True:
    conn, _ = sock.accept()
    print("Device agent connected")
    
    try:
        while True:
            # Simulate temperature reading
            temperature = 20.0 + random.uniform(-2, 2)
            
            # Send with newline delimiter
            message = f"{temperature:.2f}\n"
            conn.sendall(message.encode('utf-8'))
            
            time.sleep(1)  # 1Hz sampling
            
    except (BrokenPipeError, ConnectionResetError):
        print("Device agent disconnected")
        conn.close()
```

### Example: Node.js Sensor App

```javascript
const net = require('net');
const fs = require('fs');
const path = require('path');

const SOCKET_PATH = '/tmp/sensors/temperature';

// Ensure parent directory exists
fs.mkdirSync(path.dirname(SOCKET_PATH), { recursive: true });

// Remove old socket
try {
  fs.unlinkSync(SOCKET_PATH);
} catch (err) {}

// Create server
const server = net.createServer((socket) => {
  console.log('Device agent connected');
  
  // Send temperature data every second
  const interval = setInterval(() => {
    const temperature = 20.0 + (Math.random() * 4 - 2);
    socket.write(`${temperature.toFixed(2)}\n`);
  }, 1000);
  
  socket.on('end', () => {
    console.log('Device agent disconnected');
    clearInterval(interval);
  });
  
  socket.on('error', (err) => {
    console.error('Socket error:', err);
    clearInterval(interval);
  });
});

server.listen(SOCKET_PATH, () => {
  console.log(`Sensor server listening on ${SOCKET_PATH}`);
  
  // Set permissions
  fs.chmodSync(SOCKET_PATH, 0o660);
});
```

## Usage Examples

### Starting the Feature

```bash
# Set environment variables
export ENABLE_SENSOR_PUBLISH=true
export SENSOR_PUBLISH_CONFIG='{
  "enabled": true,
  "sensors": [{
    "name": "bme688",
    "addr": "/tmp/sensors/bme688",
    "eomDelimiter": "[\r\n]+",
    "mqttTopic": "temperature"
  }]
}'

# Start device agent
npm run dev
```

### Monitoring Sensor Data

Subscribe to sensor topics:

```bash
# Subscribe to temperature data
mosquitto_sub -h localhost -t 'iot/device/+/sensor/temperature'

# Subscribe to heartbeat
mosquitto_sub -h localhost -t 'iot/device/+/sensor/heartbeat'

# Subscribe to all sensor topics
mosquitto_sub -h localhost -t 'iot/device/+/sensor/#'
```

## Troubleshooting

### Sensor Won't Connect

**Problem**: Sensor state shows `DISCONNECTED` or `ERROR`

**Solutions**:
1. Check Unix socket path exists and is writable:
   ```bash
   ls -la /tmp/sensors/
   ```
2. Verify parent directory permissions (both user and group writable):
   ```bash
   chmod 770 /tmp/sensors/
   ```
3. Ensure sensor application is running:
   ```bash
   ps aux | grep sensor
   ```
4. Check agent logs for connection errors

### Messages Not Publishing

**Problem**: Sensor connected but no MQTT messages

**Solutions**:
1. Verify MQTT broker is running and accessible
2. Check delimiter regex matches your data format
3. Enable debug logging: `SENSOR_PUBLISH_DEBUG=true`
4. Verify buffer settings aren't preventing publish

### High Memory Usage

**Problem**: Agent consuming too much memory

**Solutions**:
1. Reduce `bufferCapacity` (default 128KB per sensor)
2. Reduce `bufferSize` for more frequent publishing
3. Reduce `bufferTimeMs` to publish more often
4. Check for sensor applications sending too much data

### Messages Being Discarded

**Problem**: Logs show messages discarded

**Solutions**:
1. Increase `bufferCapacity` if messages are too large
2. Check your delimiter regex is correct
3. Verify sensor isn't sending messages > 128KB
4. Adjust buffering parameters to publish more frequently

## Performance Considerations

### Buffer Configuration

- **bufferSize** controls message count batching
- **bufferTimeMs** ensures max latency
- **bufferCapacity** limits memory per sensor

**Recommendations**:
- High-frequency sensors: Use larger buffers (e.g., 100 messages, 1-2 seconds)
- Low-frequency sensors: Use small buffers or immediate publish
- Multiple sensors: Balance buffer sizes based on data rate

### Message Size

- Default 128KB limit matches AWS IoT Core
- Large messages consume more memory
- Consider splitting large messages in your sensor app

### Reconnection

- Default 10-second reconnection interval
- Busy-polling (0 seconds) wastes CPU
- Longer intervals save resources but increase downtime

## Integration with Iotistic Sensor

If you're using the Iotistic Sensor project with BME688 sensors:

1. **Create a sensor bridge application** that:
   - Reads from your existing MQTT topics
   - Writes to Unix domain sockets
   
2. **Or modify existing sensor code** to:
   - Publish to both MQTT (for local services) and Unix sockets (for cloud)

Example bridge:

```typescript
import mqtt from 'mqtt';
import net from 'net';

// Subscribe to local MQTT
const mqttClient = mqtt.connect('mqtt://localhost:1883');
const socketPath = '/tmp/sensors/bme688';

mqttClient.on('message', (topic, message) => {
  if (topic === 'sensor/temperature') {
    // Forward to Unix socket
    const socket = net.connect(socketPath);
    socket.write(message.toString() + '\n');
    socket.end();
  }
});

mqttClient.subscribe('sensor/#');
```

## Comparison with Direct MQTT

| Feature | Sensor Publish | Direct MQTT |
|---------|----------------|-------------|
| Complexity | Medium (two layers) | Low (direct) |
| Separation of concerns | ✅ Clean separation | ❌ Mixed concerns |
| MQTT connection management | ✅ Centralized | ❌ Per sensor app |
| Buffering & batching | ✅ Built-in | ❌ Manual implementation |
| Auto-reconnection | ✅ Built-in | ❌ Manual implementation |
| Multiple sensors | ✅ Single connection | ❌ Multiple connections |
| Resource efficiency | ✅ High | ❌ Moderate |
| Flexibility | ❌ Limited | ✅ Full control |

**Use Sensor Publish if you:**
- Have multiple sensors
- Want simplified sensor applications
- Need robust buffering and batching
- Prefer standardized approach

**Use Direct MQTT if you:**
- Have simple setup with few sensors
- Want maximum flexibility
- Already have working MQTT code
- Prefer fewer moving parts

---

**Happy Sensing! 📡**

The Sensor Publish feature is now ready to collect and publish your sensor data!
