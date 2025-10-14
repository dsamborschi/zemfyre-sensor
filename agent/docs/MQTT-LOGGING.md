# MQTT Log Backend - Implementation Guide

## Overview

Yes! You can absolutely push logs to MQTT. This would be a **new backend implementation** alongside `LocalLogBackend`.

## Architecture

```
Container Logs
    ↓
ContainerLogMonitor
    ↓
LogMessage created
    ↓
┌───────────┴────────────┐
│                        │
LocalLogBackend    MqttLogBackend
│                        │
├─ Memory               ├─ mqtt.publish()
└─ Files                └─ Real-time streaming
```

## Benefits

✅ **Real-time push** - No polling needed  
✅ **Multiple subscribers** - Dashboard, alerts, analytics  
✅ **Low bandwidth** - Efficient MQTT protocol  
✅ **Persistent sessions** - QoS for reliability  
✅ **Topic filtering** - Subscribe to specific services  
✅ **Decoupled** - Works alongside local storage  

## MQTT Topic Structure

```
container-manager/logs/{appId}/{serviceName}/{level}

Examples:
- container-manager/logs/1001/web/info
- container-manager/logs/1001/web/error
- container-manager/logs/1001/redis/warn
- container-manager/logs/system/info
- container-manager/logs/manager/error
```

## Installation

```bash
npm install mqtt @types/mqtt
```

✅ Already installed!

## Usage Example

### 1. Initialize Multiple Backends

```typescript
// In server.ts
import { LocalLogBackend } from './logging/local-backend';
import { MqttLogBackend } from './logging/mqtt-backend';
import { ContainerLogMonitor } from './logging/monitor';

// Local storage (existing)
const localBackend = new LocalLogBackend({
  maxLogs: 10000,
  enableFilePersistence: true,
  logDir: './data/logs',
});

// MQTT streaming (new!)
const mqttBackend = new MqttLogBackend({
  brokerUrl: 'mqtt://localhost:1883', // or 'mqtt://broker.hivemq.com:1883'
  baseTopic: 'container-manager/logs',
  qos: 1, // At least once delivery
  enableBatching: true,
  batchInterval: 1000, // Send every 1 second
  maxBatchSize: 50,
  debug: true,
});

await mqttBackend.connect();

// Monitor sends to BOTH backends!
const logMonitor = new ContainerLogMonitor([
  localBackend,  // Store locally
  mqttBackend,   // Stream to MQTT
], dockerManager.getDockerInstance());
```

### 2. Subscribe to Logs (Another Device/Service)

```javascript
// Dashboard, monitoring service, or another app
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');

// Subscribe to ALL logs
client.subscribe('container-manager/logs/#');

// Subscribe to specific service
client.subscribe('container-manager/logs/1001/web/+');

// Subscribe to errors only
client.subscribe('container-manager/logs/+/+/error');

client.on('message', (topic, message) => {
  const log = JSON.parse(message.toString());
  console.log(`[${log.level}] ${log.serviceName}: ${log.message}`);
});
```

### 3. Real-Time Dashboard

```html
<!DOCTYPE html>
<html>
<head>
  <title>Container Logs</title>
  <script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script>
</head>
<body>
  <h1>Live Container Logs</h1>
  <div id="logs"></div>

  <script>
    const client = mqtt.connect('ws://localhost:9001'); // WebSocket port
    
    client.subscribe('container-manager/logs/#');
    
    client.on('message', (topic, payload) => {
      const log = JSON.parse(payload.toString());
      const div = document.getElementById('logs');
      const logEntry = document.createElement('div');
      logEntry.style.color = log.level === 'error' ? 'red' : 'black';
      logEntry.textContent = `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.serviceName}: ${log.message}`;
      div.prepend(logEntry);
      
      // Keep only last 100 logs
      while (div.children.length > 100) {
        div.removeChild(div.lastChild);
      }
    });
  </script>
</body>
</html>
```

## MQTT Broker Options

### 1. Local Mosquitto (Recommended for Pi)

```bash
# Install on Raspberry Pi
sudo apt-get install mosquitto mosquitto-clients

# Start service
sudo systemctl start mosquitto
sudo systemctl enable mosquitto

# Test
mosquitto_sub -t "container-manager/logs/#" -v
```

### 2. Cloud Brokers (Free Tier)

- **HiveMQ**: `mqtt://broker.hivemq.com:1883`
- **Eclipse**: `mqtt://mqtt.eclipseprojects.io:1883`
- **AWS IoT Core**: Requires credentials
- **Azure IoT Hub**: Requires credentials

### 3. Docker Mosquitto

```bash
docker run -d -p 1883:1883 -p 9001:9001 eclipse-mosquitto
```

## Configuration Options

```typescript
{
  brokerUrl: 'mqtt://localhost:1883',     // Broker URL
  clientOptions: {                        // MQTT client options
    username: 'admin',                    // Optional auth
    password: 'password',
    clientId: 'container-manager-1',
  },
  baseTopic: 'container-manager/logs',    // Base topic
  qos: 1,                                 // 0, 1, or 2
  retain: false,                          // Retain last message
  enableBatching: true,                   // Batch logs
  batchInterval: 1000,                    // Batch every 1s
  maxBatchSize: 50,                       // Max 50 logs per batch
  debug: true,                            // Enable debug logging
}
```

## QoS Levels

| QoS | Description | Use Case |
|-----|-------------|----------|
| 0 | At most once | Best effort, may lose logs |
| 1 | At least once | Guaranteed delivery, may duplicate |
| 2 | Exactly once | Guaranteed once, slower |

**Recommended**: QoS 1 for good balance

## Message Format

### Single Log (non-batched)

```json
{
  "id": "log-1",
  "message": "Server started on port 8080",
  "timestamp": 1696195200000,
  "level": "info",
  "source": {
    "type": "container",
    "name": "web"
  },
  "serviceId": 1001,
  "serviceName": "web",
  "containerId": "abc123...",
  "isStdErr": false,
  "isSystem": false
}
```

Published to: `container-manager/logs/1001/web/info`

### Batched Logs

```json
{
  "count": 3,
  "logs": [
    { "message": "Log 1", ... },
    { "message": "Log 2", ... },
    { "message": "Log 3", ... }
  ]
}
```

Published to: `container-manager/logs/1001/web/info/batch`

## Monitoring Tools

### mosquitto_sub (Terminal)

```bash
# All logs
mosquitto_sub -t "container-manager/logs/#" -v

# Specific service
mosquitto_sub -t "container-manager/logs/1001/web/#"

# Errors only
mosquitto_sub -t "container-manager/logs/+/+/error"

# Pretty print JSON
mosquitto_sub -t "container-manager/logs/#" | jq .
```

### MQTT Explorer (GUI)

Download: https://mqtt-explorer.com/

- Visual topic tree
- Message history
- Topic filtering
- JSON formatting

### Node-RED (Low-Code Dashboard)

```bash
npm install -g --unsafe-perm node-red
node-red
```

Open: http://localhost:1880

Drag MQTT nodes to build dashboards!

## Implementation Steps

### 1. Modify ContainerLogMonitor

Update `src/logging/monitor.ts` to accept **multiple backends**:

```typescript
export class ContainerLogMonitor {
  private backends: LogBackend[]; // Change from single to array

  constructor(backends: LogBackend | LogBackend[], docker: Docker) {
    this.backends = Array.isArray(backends) ? backends : [backends];
    this.docker = docker;
  }

  private async sendLog(message: LogMessage) {
    // Send to ALL backends
    await Promise.all(
      this.backends.map(backend => backend.log(message))
    );
  }
}
```

### 2. Create MqttLogBackend

Create `src/logging/mqtt-backend.ts` (see template below)

### 3. Update Server Initialization

```typescript
// Existing local backend
const localBackend = new LocalLogBackend({...});

// New MQTT backend
const mqttBackend = new MqttLogBackend({
  brokerUrl: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
  qos: 1,
  enableBatching: true,
});

await mqttBackend.connect();

// Pass both backends
const logMonitor = new ContainerLogMonitor(
  [localBackend, mqttBackend], // Array of backends
  dockerManager.getDockerInstance()
);
```

## Template: mqtt-backend.ts

The file needs these key methods:

```typescript
export class MqttLogBackend implements LogBackend {
  // 1. connect() - Connect to broker
  // 2. disconnect() - Disconnect gracefully
  // 3. log(message) - Publish log to MQTT
  // 4. buildTopic(message) - Build topic from log data
  // 5. publishSingle(message) - Publish one log
  // 6. publishBatch() - Publish batched logs
}
```

See the full implementation in `docs/MQTT-BACKEND-TEMPLATE.ts` (create this file)

## Testing

### 1. Start Mosquitto

```bash
docker run -d -p 1883:1883 --name mosquitto eclipse-mosquitto
```

### 2. Subscribe to Logs

```bash
# Terminal 1
mosquitto_sub -h localhost -t "container-manager/logs/#" -v
```

### 3. Start Container-Manager

```bash
# Terminal 2
MQTT_BROKER=mqtt://localhost:1883 npm run dev
```

### 4. Deploy Container

```bash
# Terminal 3
curl -X POST http://localhost:3000/api/v1/apps/1001 \
  -d '{"appId":1001,"services":[{"serviceId":1,"serviceName":"web","imageName":"nginx:alpine"}]}'
```

### 5. Watch Logs Stream

You should see logs appear in Terminal 1 in real-time!

## Advantages over Polling

| Feature | Polling (HTTP) | MQTT Push |
|---------|----------------|-----------|
| Latency | 1-5 seconds | < 100ms |
| Bandwidth | High (constant requests) | Low (only when logs exist) |
| Scalability | Poor (N clients = N requests) | Excellent (pub/sub) |
| Real-time | ❌ Delayed | ✅ Instant |
| Filtering | Client-side | Broker-side (topics) |

## Use Cases

### 1. Central Logging

Multiple Pis → MQTT Broker → Log aggregation service

```
Pi #1 → mqtt://broker/logs/device-1/#
Pi #2 → mqtt://broker/logs/device-2/#
Pi #3 → mqtt://broker/logs/device-3/#
          ↓
    Aggregator subscribes to: logs/#
```

### 2. Real-Time Alerts

```typescript
// Alert service
client.subscribe('container-manager/logs/+/+/error');
client.on('message', (topic, payload) => {
  const log = JSON.parse(payload);
  sendEmail(`Error in ${log.serviceName}: ${log.message}`);
});
```

### 3. Log Analytics

```typescript
// Analytics service
client.subscribe('container-manager/logs/#');
client.on('message', (topic, payload) => {
  const log = JSON.parse(payload);
  
  // Store in database
  await db.logs.insert(log);
  
  // Update metrics
  metrics.increment(`logs.${log.level}`);
});
```

## Next Steps

1. ✅ Install MQTT package (already done!)
2. **Create `src/logging/mqtt-backend.ts`** (see template)
3. **Modify `monitor.ts`** to support multiple backends
4. **Update `server.ts`** to initialize MQTT backend
5. **Test with Mosquitto**
6. **Deploy to Pi**

## Environment Variables

```bash
# .env
MQTT_BROKER=mqtt://localhost:1883
MQTT_USERNAME=admin
MQTT_PASSWORD=secret
MQTT_QOS=1
MQTT_BATCH=true
```

## Security

For production:

```typescript
{
  brokerUrl: 'mqtts://broker.example.com:8883', // TLS
  clientOptions: {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    rejectUnauthorized: true, // Verify certificates
    ca: fs.readFileSync('./certs/ca.crt'),
  }
}
```

---

**Ready to implement!** MQTT provides a powerful, real-time alternative to polling for log streaming. 📡

