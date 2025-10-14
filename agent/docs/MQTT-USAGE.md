# MQTT Logging - Usage Guide

## 🎉 MQTT Backend is Now Integrated!

The MQTT logging backend is **automatically enabled** when you set the `MQTT_BROKER` environment variable.

## Quick Start

### Option 1: Local Mosquitto (Recommended)

```bash
# Start Mosquitto broker
docker run -d -p 1883:1883 --name mosquitto eclipse-mosquitto

# Start container-manager with MQTT enabled
MQTT_BROKER=mqtt://localhost:1883  npm run dev
```

### Option 2: Cloud MQTT Broker

```bash
# Use HiveMQ public broker
MQTT_BROKER=mqtt://broker.hivemq.com:1883 npm run dev

# Or Eclipse public broker
MQTT_BROKER=mqtt://mqtt.eclipseprojects.io:1883 npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MQTT_BROKER` | (none) | MQTT broker URL. If not set, MQTT is disabled |
| `MQTT_TOPIC` | `container-manager/logs` | Base topic for logs |
| `MQTT_QOS` | `1` | Quality of Service (0, 1, or 2) |
| `MQTT_BATCH` | `true` | Enable batching |
| `MQTT_BATCH_INTERVAL` | `1000` | Batch interval in ms |
| `MQTT_BATCH_SIZE` | `50` | Max logs per batch |
| `MQTT_DEBUG` | `false` | Enable debug logging |

## Example with All Options

```bash
MQTT_BROKER=mqtt://localhost:1883 \
MQTT_TOPIC=my-device/logs \
MQTT_QOS=1 \
MQTT_BATCH=true \
MQTT_BATCH_INTERVAL=2000 \
MQTT_BATCH_SIZE=100 \
MQTT_DEBUG=true \
npm run dev
```

## How It Works

### 1. Without MQTT (Default)

```
Container logs → ContainerLogMonitor → LocalLogBackend
                                        ↓
                                    Memory + Files
```

### 2. With MQTT Enabled

```
Container logs → ContainerLogMonitor → LocalLogBackend (Memory + Files)
                                     → MqttLogBackend (Real-time streaming)
```

**Logs are sent to BOTH backends simultaneously!**

## Subscribing to Logs

### Using mosquitto_sub (Terminal)

```bash
# All logs
mosquitto_sub -h localhost -t "container-manager/logs/#" -v

# Specific service
mosquitto_sub -h localhost -t "container-manager/logs/1001/web/#"

# Only errors
mosquitto_sub -h localhost -t "container-manager/logs/+/+/error"

# Pretty print JSON
mosquitto_sub -h localhost -t "container-manager/logs/#" | jq .
```

### Using MQTT Explorer (GUI)

1. Download: https://mqtt-explorer.com/
2. Connect to `localhost:1883`
3. Subscribe to `container-manager/logs/#`
4. View logs in real-time with a nice UI

### Using Node.js

```javascript
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');

client.subscribe('container-manager/logs/#');

client.on('message', (topic, message) => {
  const log = JSON.parse(message.toString());
  console.log(`[${log.level}] ${log.serviceName}: ${log.message}`);
});
```

### Using Python

```python
import paho.mqtt.client as mqtt
import json

def on_message(client, userdata, msg):
    log = json.loads(msg.payload)
    print(f"[{log['level']}] {log['serviceName']}: {log['message']}")

client = mqtt.Client()
client.on_message = on_message
client.connect("localhost", 1883)
client.subscribe("container-manager/logs/#")
client.loop_forever()
```

## MQTT Topics Structure

```
container-manager/logs/{appId}/{serviceName}/{level}
container-manager/logs/system/{level}
container-manager/logs/manager/{level}
```

### Examples:
- `container-manager/logs/1001/web/info` - Normal web service logs
- `container-manager/logs/1001/web/error` - Web service errors
- `container-manager/logs/1001/redis/warn` - Redis warnings
- `container-manager/logs/system/info` - System messages
- `container-manager/logs/manager/error` - Manager errors

### Batched Logs:
- `container-manager/logs/1001/web/info/batch` - Batch of info logs

## Testing

### 1. Start Mosquitto

```bash
docker run -d -p 1883:1883 --name mosquitto eclipse-mosquitto
```

### 2. Subscribe in Terminal 1

```bash
mosquitto_sub -h localhost -t "container-manager/logs/#" -v
```

### 3. Start Container-Manager in Terminal 2

```bash
MQTT_BROKER=mqtt://localhost:1883 npm run dev
```

**Expected output:**
```
✅ Local log backend initialized
✅ MQTT log backend connected: mqtt://localhost:1883
✅ ContainerManager initialized
✅ Log monitor initialized with 2 backend(s)
```

### 4. Deploy nginx in Terminal 3

```bash
curl -X POST http://localhost:3000/api/v1/apps/1001 \
  -H "Content-Type: application/json" \
  -d '{
    "appId": 1001,
    "services": [{
      "serviceId": 1,
      "serviceName": "web",
      "imageName": "nginx:alpine",
      "ports": ["8085:80"]
    }]
  }'
```

### 5. Generate Logs

```bash
# Access nginx to generate logs
curl http://localhost:8085/
```

### 6. Watch Logs in Terminal 1

You should see logs appear in real-time:
```
container-manager/logs/1001/web/info {"message":"Server listening on port 80",...}
container-manager/logs/1001/web/info {"message":"GET / HTTP/1.1",...}
```

## Troubleshooting

### MQTT Not Connecting?

Check the startup logs:
- ✅ `MQTT log backend connected` - Working!
- ❌ `Failed to connect to MQTT broker` - Connection issue

Common issues:
1. Mosquitto not running: `docker ps | grep mosquitto`
2. Wrong broker URL: Check `MQTT_BROKER` value
3. Firewall blocking: Check port 1883

### No Logs Appearing?

1. Check if containers are running: `curl http://localhost:3000/api/v1/state`
2. Check local logs work: `curl http://localhost:3000/api/v1/logs`
3. Enable MQTT debug: `MQTT_DEBUG=true`

### Logs Appearing Late?

- Batching is enabled by default (1 second interval)
- Disable batching: `MQTT_BATCH=false`
- Or reduce interval: `MQTT_BATCH_INTERVAL=500`

## Benefits

### vs REST API Polling

| Feature | REST Polling | MQTT Push |
|---------|--------------|-----------|
| Latency | 1-5 seconds | < 100ms |
| Bandwidth | High (constant requests) | Low (only when logs exist) |
| Scalability | Poor (N clients = N requests) | Excellent (pub/sub) |
| Real-time | ❌ | ✅ |

### Multiple Subscribers

One stream, many consumers:
```
Container-Manager (Publisher)
    ↓
MQTT Broker
    ↓
    ├─→ Dashboard (real-time display)
    ├─→ Alert Service (email on errors)
    ├─→ Analytics (metrics & graphs)
    └─→ Log Archive (long-term storage)
```

### Central Logging

Multiple devices to one broker:
```
Pi #1 → mqtt://broker/logs/device-1/#
Pi #2 → mqtt://broker/logs/device-2/#
Pi #3 → mqtt://broker/logs/device-3/#
          ↓
    Log Aggregator subscribes to: logs/#
```

## Production Deployment

### Raspberry Pi with Mosquitto

```bash
# Install Mosquitto
sudo apt-get update
sudo apt-get install mosquitto mosquitto-clients

# Enable on boot
sudo systemctl enable mosquitto

# Start container-manager with MQTT
sudo MQTT_BROKER=mqtt://localhost:1883 \
  \
     npm run dev
```

### Docker Compose

```yaml
version: '3.8'
services:
  mosquitto:
    image: eclipse-mosquitto
    ports:
      - "1883:1883"
    volumes:
      - mosquitto-data:/mosquitto/data
      - mosquitto-logs:/mosquitto/log

  container-manager:
    build: .
    environment:
  -
      - MQTT_BROKER=mqtt://mosquitto:1883
      - MQTT_QOS=1
      - MQTT_BATCH=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "3000:3000"

volumes:
  mosquitto-data:
  mosquitto-logs:
```

### Secure MQTT (TLS)

```bash
MQTT_BROKER=mqtts://broker.example.com:8883 \
MQTT_USERNAME=admin \
MQTT_PASSWORD=secret \

npm run dev
```

## Advanced: Building a Dashboard

See `docs/MQTT-LOGGING.md` for:
- HTML dashboard example
- Node-RED integration
- WebSocket streaming
- Grafana integration

---

**Status: ✅ MQTT Logging Fully Functional!**

You now have real-time log streaming via MQTT! 🎉
