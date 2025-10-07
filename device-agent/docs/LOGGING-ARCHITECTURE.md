# Logging Architecture: Device → Cloud

## 🎯 How Balena Handles Logging

In balena's architecture, **container logs are streamed from device to cloud** in real-time using a **separate logging backend**.

### Key Principles

1. **Separate Channel**: Logs use a different endpoint than state reporting
2. **Streaming**: Logs are streamed in real-time (not batched with state reports)
3. **Compressed**: Logs are gzipped to save bandwidth
4. **Buffered**: Local buffer prevents log loss during network issues
5. **Persistent Connection**: Uses HTTP streaming with keepalive

## 📊 Balena's Logging Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  DEVICE                                                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Container Logs                                     │    │
│  │   stdout/stderr from each container                │    │
│  └──────────────────┬─────────────────────────────────┘    │
│                     ↓                                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Log Monitor                                        │    │
│  │   • Attaches to container streams                  │    │
│  │   • Adds metadata (serviceId, timestamp)           │    │
│  └──────────────────┬─────────────────────────────────┘    │
│                     ↓                                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Log Backend (BalenaLogBackend)                     │    │
│  │   • Buffers logs locally (PassThrough stream)      │    │
│  │   • Compresses with gzip                           │    │
│  │   • Streams to cloud via HTTPS                     │    │
│  └──────────────────┬─────────────────────────────────┘    │
│                     │                                        │
└─────────────────────┼────────────────────────────────────────┘
                      │
                      │ POST /device/v2/{uuid}/log-stream
                      │ Content-Encoding: gzip
                      │ Content-Type: application/x-ndjson
                      │ (Persistent HTTPS connection)
                      │
┌─────────────────────▼────────────────────────────────────────┐
│  CLOUD API                                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Log Ingestion Service                              │     │
│  │   • Receives gzipped log stream                    │     │
│  │   • Decompresses                                   │     │
│  │   • Stores in database                             │     │
│  │   • Indexes for search                             │     │
│  └────────────────────────────────────────────────────┘     │
│                     ↓                                         │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Log Storage                                        │     │
│  │   • Database (PostgreSQL, Elasticsearch, etc.)     │     │
│  │   • Retention policies                             │     │
│  │   • Search indexing                                │     │
│  └────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────┘
```

## 🔧 Current Implementation

Your standalone-application-manager already has **3 logging backends**:

### 1. LocalLogBackend (Always Enabled)
**File:** `src/logging/local-backend.ts`

```typescript
// Stores logs in memory + optionally to disk
const logBackend = new LocalLogBackend({
  maxLogs: 1000,               // Keep last 1000 logs in memory
  maxAge: 3600000,             // 1 hour retention
  enableFilePersistence: true, // Write to disk
  logDir: './data/logs',       // Log directory
  maxFileSize: 5242880,        // 5MB per file
});
```

**Features:**
- ✅ In-memory buffer (fast access)
- ✅ File persistence (survives restarts)
- ✅ Log rotation (by size/age)
- ✅ Query/filter API

### 2. MqttLogBackend (Optional - Already Implemented!)
**File:** `src/logging/mqtt-backend.ts`

```typescript
// Publishes logs to MQTT broker
const mqttBackend = new MqttLogBackend({
  brokerUrl: 'mqtt://broker:1883',
  baseTopic: 'device/logs',
  qos: 1,
  enableBatching: true,
  batchInterval: 1000,        // Batch every 1s
  maxBatchSize: 50,           // Max 50 logs per batch
});
```

**Features:**
- ✅ Real-time streaming to MQTT
- ✅ Batching for efficiency
- ✅ QoS support
- ✅ Automatic reconnection

### 3. Cloud HTTP Streaming Backend (Needs Implementation)

To match balena's pattern, you could add:

```typescript
// NEW: Stream logs to cloud API
const cloudLogBackend = new CloudLogBackend({
  cloudEndpoint: 'https://your-cloud.com',
  deviceUuid: 'abc-123',
  apiKey: 'secret',
  compression: 'gzip',
});
```

## 🎨 Three Logging Patterns

### Pattern 1: Local Only (Current Default)
**Use when:** Single device, testing, or no cloud

```bash
# No special config needed
npm run dev
```

**Logs stored:**
- In-memory (last 1000 logs)
- On disk (`./data/logs/*.log`)

**Access:**
```bash
# Via device API
curl http://localhost:48484/v1/logs
curl http://localhost:48484/v1/logs?serviceName=web
```

### Pattern 2: MQTT Streaming (Already Supported!)
**Use when:** Need real-time log aggregation, have MQTT broker

```bash
export MQTT_BROKER=mqtt://your-broker:1883
export MQTT_TOPIC=device/logs
npm run dev
```

**What happens:**
1. Device captures container logs
2. Streams to MQTT broker in real-time
3. Cloud subscribes to MQTT topics
4. Aggregates logs from all devices

**Benefits:**
- ✅ Real-time streaming
- ✅ Decoupled architecture
- ✅ Multiple subscribers possible
- ✅ **Already implemented in your code!**

### Pattern 3: HTTP Streaming to Cloud (Like Balena)
**Use when:** Want balena-style centralized logging

**Would require:**
1. Cloud endpoint: `POST /device/v2/{uuid}/log-stream`
2. Gzip compression
3. NDJSON format (newline-delimited JSON)
4. Persistent HTTPS connection

## 💡 Recommended Approach

### For Your Use Case: **Use MQTT** (Already Implemented!)

Since you already have MQTT support, this is the easiest path:

```
┌─────────────────────────────────────────┐
│  DEVICE (Raspberry Pi)                   │
│  ┌───────────────────────────────────┐  │
│  │ Container Logs                    │  │
│  │   ↓                               │  │
│  │ MqttLogBackend                    │  │
│  │   • Batches logs every 1s         │  │
│  │   • Publishes to MQTT broker      │  │
│  └──────────┬────────────────────────┘  │
└─────────────┼───────────────────────────┘
              │
              │ MQTT Publish
              │ Topic: device/{uuid}/logs
              │
┌─────────────▼───────────────────────────┐
│  MQTT BROKER (Mosquitto, etc.)          │
│  • mosquitto.org                         │
│  • CloudMQTT                             │
│  • AWS IoT Core                          │
└─────────────┬───────────────────────────┘
              │
              │ MQTT Subscribe
              │
┌─────────────▼───────────────────────────┐
│  CLOUD API (Your Server)                │
│  ┌───────────────────────────────────┐  │
│  │ MQTT Subscriber                   │  │
│  │   • Subscribes to device/+/logs   │  │
│  │   • Stores in database            │  │
│  │   • Indexes for search            │  │
│  └───────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### Setup MQTT Logging

**1. Install MQTT Broker (on your server):**
```bash
# Using Docker
docker run -d -p 1883:1883 -p 9001:9001 eclipse-mosquitto

# Or install native
apt-get install mosquitto
```

**2. Configure Device:**
```bash
export MQTT_BROKER=mqtt://your-server:1883
export MQTT_TOPIC=device/logs
export MQTT_BATCH=true
export MQTT_BATCH_INTERVAL=1000  # 1 second batches
npm run dev
```

**3. Cloud Subscribes:**
```javascript
// In your cloud API
import mqtt from 'mqtt';

const client = mqtt.connect('mqtt://localhost:1883');

client.subscribe('device/+/logs', (err) => {
  if (!err) {
    console.log('Subscribed to device logs');
  }
});

client.on('message', (topic, message) => {
  const logs = JSON.parse(message.toString());
  const deviceUuid = topic.split('/')[1];
  
  // Store logs in database
  storeLogs(deviceUuid, logs);
  
  // Index for search
  indexLogs(deviceUuid, logs);
});
```

## 🚀 Quick Start: MQTT Logging

### Terminal 1: MQTT Broker
```bash
docker run -d -p 1883:1883 --name mqtt eclipse-mosquitto
```

### Terminal 2: Device (with MQTT)
```bash
cd standalone-application-manager
export MQTT_BROKER=mqtt://localhost:1883
export MQTT_TOPIC=device/logs
npm run dev
```

**Device logs should show:**
```
✅ MQTT log backend connected: mqtt://localhost:1883
```

### Terminal 3: Test MQTT Subscriber
```bash
# Subscribe to see logs
docker exec -it mqtt mosquitto_sub -t "device/#" -v
```

**You'll see logs like:**
```
device/abc-123-uuid/logs {"message":"Container started","serviceId":1,"timestamp":1696600000}
```

## 📊 State Reporting vs Log Streaming

### State Reporting (Already Implemented)
**Endpoint:** `PATCH /api/v3/device/state`
**Frequency:** Every 10s (state changes), 5min (metrics)
**Content:**
- Current state (apps, services)
- System metrics (CPU, memory, temp)
- Device health

**Not included:**
- ❌ Container logs (too much data!)

### Log Streaming (Use MQTT)
**Endpoint:** MQTT broker
**Frequency:** Real-time (batched every 1s)
**Content:**
- Container stdout/stderr
- Supervisor logs
- System logs

## 🎯 Comparison

| Feature | Local Backend | MQTT Backend | HTTP Streaming |
|---------|---------------|--------------|----------------|
| Real-time | ❌ No | ✅ Yes | ✅ Yes |
| Bandwidth | ❌ N/A | ✅ Low | ⚠️ Medium |
| Setup | ✅ Easy | ⚠️ Medium | ❌ Complex |
| Scalability | ❌ Single device | ✅ Many devices | ✅ Many devices |
| Implementation | ✅ Done | ✅ Done | ❌ Not done |
| Compression | ❌ No | ⚠️ Optional | ✅ Yes |

## 💡 Recommendation

### Use This Architecture:

```
Device → MQTT Broker → Cloud API
        (real-time)     (subscribes)

Device → Cloud API
        (state reports every 10s/5min)
```

**Benefits:**
1. ✅ **Already implemented** in your code!
2. ✅ Logs and state are **decoupled**
3. ✅ MQTT is **lightweight** and **scalable**
4. ✅ Cloud can **subscribe to specific devices**
5. ✅ Works with **public MQTT brokers** (CloudMQTT, AWS IoT)

## 🔧 Alternative: Simple Log Upload

If you don't want MQTT, you could add **periodic log upload** to cloud API:

```typescript
// In api-binder.ts, add to reportCurrentState():

// Upload recent logs every 5 minutes
if (includeMetrics) {
  const recentLogs = await logBackend.getLogs({
    since: Date.now() - 300000, // Last 5 minutes
    limit: 1000
  });
  
  // Include in state report
  stateReport[deviceInfo.uuid].recent_logs = recentLogs;
}
```

**Trade-offs:**
- ✅ Simple (no MQTT needed)
- ✅ Uses existing API
- ❌ Not real-time (5min delay)
- ❌ Limited history (1000 logs)
- ❌ Larger state reports

## 📝 Summary

### Your Options:

1. **Local Only** (current default)
   - Logs stored on device
   - Access via device API
   - No cloud streaming

2. **MQTT Streaming** (recommended, already implemented!)
   - Real-time log streaming
   - Lightweight protocol
   - Scalable to many devices
   - Just set `MQTT_BROKER` env var

3. **HTTP Streaming** (like balena)
   - Most bandwidth efficient
   - Requires implementation
   - Complex setup

### My Recommendation: **Use MQTT**

It's already implemented, battle-tested, and perfect for IoT device logging. Just need to:
1. Deploy MQTT broker
2. Set `MQTT_BROKER` on devices
3. Subscribe in cloud API

Want me to create a cloud MQTT subscriber example? 🚀
