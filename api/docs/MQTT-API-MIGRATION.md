# MQTT API Migration Guide

## Overview

The MQTT monitoring APIs have been unified into a single endpoint structure. Previously, there were two separate services:
- `/api/v1/mqtt-schema` - Schema generation
- `/api/v1/mqtt-monitor` - Topic tree and metrics

These are now **combined into `/api/v1/mqtt-monitor`** with all features in one service.

---

## Endpoint Migration Map

### Old Endpoints → New Endpoints

| Old Endpoint | New Endpoint | Notes |
|-------------|--------------|-------|
| `GET /mqtt-schema/status` | `GET /mqtt-monitor/status` | ✅ Same functionality |
| `POST /mqtt-schema/start` | `POST /mqtt-monitor/start` | ✅ Same functionality |
| `POST /mqtt-schema/stop` | `POST /mqtt-monitor/stop` | ✅ Same functionality |
| `GET /mqtt-schema/topics` | `GET /mqtt-monitor/topics` | ✅ **Enhanced** - includes schemas |
| `GET /mqtt-schema/topics/:topic` | `GET /mqtt-monitor/topics/:topic/schema` | ⚠️ Response format changed |
| `GET /mqtt-schema/stats` | `GET /mqtt-monitor/stats` | ✅ **Enhanced** - includes metrics |
| N/A | `GET /mqtt-monitor/topic-tree` | 🆕 **New** - hierarchical view |
| N/A | `GET /mqtt-monitor/metrics` | 🆕 **New** - real-time metrics |
| N/A | `GET /mqtt-monitor/dashboard` | 🆕 **New** - everything in one call |

---

## Response Format Changes

### `/topics` Endpoint

**Before** (`/mqtt-schema/topics`):
```json
{
  "success": true,
  "count": 50,
  "topics": [
    {
      "topic": "sensor/temperature",
      "schema": { "type": "object", "properties": {...} },
      "lastMessage": "{\"value\":23.5}",
      "messageCount": 145
    }
  ]
}
```

**After** (`/mqtt-monitor/topics`):
```json
{
  "success": true,
  "count": 50,
  "data": [
    {
      "topic": "sensor/temperature",
      "messageCount": 145,
      "lastMessage": "{\"value\":23.5}",
      "messageType": "json",
      "schema": { "type": "object", "properties": {...} },
      "qos": 0,
      "retain": false
    }
  ]
}
```

**Key Changes:**
- Root array moved from `topics` → `data`
- Added `messageType` field (`json`, `xml`, `string`, `binary`)
- Added `qos` and `retain` fields
- Schema generation is automatic for JSON messages

---

### `/topics/:topic` → `/topics/:topic/schema`

**Before** (`/mqtt-schema/topics/sensor/temperature`):
```json
{
  "success": true,
  "schema": {
    "type": "object",
    "properties": {
      "value": { "type": "number" }
    }
  }
}
```

**After** (`/mqtt-monitor/topics/sensor%2Ftemperature/schema`):
```json
{
  "success": true,
  "data": {
    "topic": "sensor/temperature",
    "messageType": "json",
    "schema": {
      "type": "object",
      "properties": {
        "value": { "type": "number" }
      }
    },
    "lastMessage": "{\"value\":23.5}",
    "messageCount": 145
  }
}
```

**Key Changes:**
- Response wrapped in `data` object
- Added context: `topic`, `messageType`, `lastMessage`, `messageCount`
- Topic in URL must be URL-encoded (use `encodeURIComponent` in JS)

---

### `/stats` Endpoint

**Before** (`/mqtt-schema/stats`):
```json
{
  "success": true,
  "stats": {
    "totalMessages": 5423,
    "userMessages": 5100,
    "systemMessages": 323,
    "topicsDiscovered": 45,
    "schemasGenerated": 38
  }
}
```

**After** (`/mqtt-monitor/stats`):
```json
{
  "success": true,
  "stats": {
    "connected": true,
    "topicCount": 45,
    "messageCount": 5423,
    "schemas": {
      "total": 38,
      "byType": {
        "json": 35,
        "xml": 2,
        "string": 8
      }
    },
    "messageRate": {
      "published": 125,
      "received": 120
    },
    "throughput": {
      "inbound": 45.2,
      "outbound": 48.5
    },
    "clients": 14,
    "subscriptions": 43,
    "retainedMessages": 10,
    "totalMessagesSent": 125678,
    "totalMessagesReceived": 120345,
    "broker": { /* broker-specific data */ }
  }
}
```

**Key Changes:**
- **Much more comprehensive** - includes metrics, throughput, client info
- Schema stats include breakdown by message type
- Added real-time message rates
- Added broker information from $SYS topics

---

## Code Migration Examples

### Example 1: Fetching Topics with Schemas

**Before:**
```typescript
// Old code using /mqtt-schema
const response = await fetch('/api/v1/mqtt-schema/topics');
const { topics } = await response.json();

topics.forEach(topic => {
  console.log(`${topic.topic}: ${topic.messageCount} messages`);
  if (topic.schema) {
    console.log('Schema:', topic.schema);
  }
});
```

**After:**
```typescript
// New code using /mqtt-monitor
const response = await fetch('/api/v1/mqtt-monitor/topics');
const { data } = await response.json();  // ← Changed from 'topics' to 'data'

data.forEach(topic => {
  console.log(`${topic.topic}: ${topic.messageCount} messages`);
  console.log(`Type: ${topic.messageType}`);  // ← New field
  if (topic.schema) {
    console.log('Schema:', topic.schema);
  }
});
```

---

### Example 2: Getting Schema for Specific Topic

**Before:**
```typescript
// Old code
const topic = 'sensor/temperature';
const response = await fetch(`/api/v1/mqtt-schema/topics/${topic}`);
const { schema } = await response.json();
```

**After:**
```typescript
// New code - URL encode the topic
const topic = 'sensor/temperature';
const encodedTopic = encodeURIComponent(topic);
const response = await fetch(`/api/v1/mqtt-monitor/topics/${encodedTopic}/schema`);
const { data } = await response.json();

// data now includes: { topic, messageType, schema, lastMessage, messageCount }
const schema = data.schema;
```

---

### Example 3: Dashboard Data (NEW)

**New Capability:**
```typescript
// Get everything in one call!
const response = await fetch('/api/v1/mqtt-monitor/dashboard');
const { data } = await response.json();

console.log('Connection:', data.status.connected);
console.log('Topics:', data.topics.count);
console.log('With Schemas:', data.topics.withSchemas);
console.log('Message Rate:', data.metrics.messageRate.current.published, 'msg/s');

// Access topic tree
const tree = data.topicTree;

// Access flattened topics with schemas
const topicList = data.topics.list;

// Access metrics
const metrics = data.metrics;
```

---

## Benefits of New API

### 1. **Single Service = Single Connection**
- Old: Two separate MQTT connections (one for schema, one for monitoring)
- New: One unified connection - more efficient

### 2. **Automatic Schema Integration**
- Schemas are automatically generated and embedded in topic data
- No need to call separate endpoints

### 3. **Comprehensive Dashboard Endpoint**
- Get everything in one API call
- Reduces network requests
- Better performance for dashboards

### 4. **Enhanced Metrics**
- Real-time message rates (msg/s)
- Throughput tracking (KB/s)
- Historical data (15-point arrays for charts)
- Client and subscription counts

### 5. **Message Type Detection**
- Automatically detects: JSON, XML, string, binary
- Better data handling based on type
- XML and binary payloads handled gracefully

---

## Backward Compatibility Notes

### Environment Variables
Both old and new variables are supported:

```bash
# Old (still works)
MQTT_SCHEMA_AUTO_START=true

# New (recommended)
MQTT_MONITOR_AUTO_START=true

# Shared (both use these)
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=admin
MQTT_PASSWORD=secret
```

### Deprecated Files
These files are deprecated and will be removed in future versions:
- `src/services/mqtt-schema-agent.ts` → Use `mqtt-monitor.ts`
- `src/routes/mqtt-schema.ts` → Use `mqtt-monitor.ts`

---

## Testing Your Migration

Use the test script to verify all endpoints:

```powershell
cd api
.\test-mqtt-unified.ps1
```

This tests:
- ✅ Status endpoint
- ✅ Topic list with schemas
- ✅ Individual schema retrieval
- ✅ Metrics and stats
- ✅ Dashboard endpoint

---

## Troubleshooting

### Issue: "Monitor not running"
**Solution:** Ensure you call `POST /api/v1/mqtt-monitor/start` first

### Issue: Schema not generated
**Possible causes:**
1. Message is not valid JSON
2. Schema generation disabled (set `schemaGenerationEnabled: true`)
3. Topic hasn't received messages yet

### Issue: 404 on schema endpoint
**Solution:** URL-encode the topic name:
```typescript
// Wrong
fetch(`/api/v1/mqtt-monitor/topics/sensor/temp/schema`)

// Correct
const topic = encodeURIComponent('sensor/temp');
fetch(`/api/v1/mqtt-monitor/topics/${topic}/schema`)
```

---

## Quick Reference

### All Available Endpoints

```
GET  /api/v1/mqtt-monitor/status           - Connection status
POST /api/v1/mqtt-monitor/start            - Start monitoring
POST /api/v1/mqtt-monitor/stop             - Stop monitoring
GET  /api/v1/mqtt-monitor/topic-tree       - Hierarchical tree
GET  /api/v1/mqtt-monitor/topics           - Flattened list with schemas
GET  /api/v1/mqtt-monitor/topics/:topic/schema - Schema for specific topic
GET  /api/v1/mqtt-monitor/metrics          - Real-time metrics + history
GET  /api/v1/mqtt-monitor/stats            - Comprehensive statistics
GET  /api/v1/mqtt-monitor/system-stats     - Raw $SYS broker data
GET  /api/v1/mqtt-monitor/dashboard        - Everything in one call ⭐
```

### Recommended Endpoint for Dashboards
**Use `/dashboard`** - it returns everything you need in one call!

---

## Need Help?

See the complete documentation:
- `UNIFIED-MQTT-MONITORING.md` - Full API reference
- `MQTT-MONITORING-SERVICE.md` - Service architecture
- `test-mqtt-unified.ps1` - Example usage

For issues, check the service logs:
```bash
docker-compose logs -f api
```
