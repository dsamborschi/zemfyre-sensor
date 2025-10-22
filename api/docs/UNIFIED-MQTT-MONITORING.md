# Unified MQTT Monitoring Service

**Complete MQTT monitoring solution** combining topic tree, metrics, and automatic schema generation in one service.

## What's Unified?

This service combines the capabilities of:
- ✅ **mqtt-schema-agent** - Automatic JSON schema generation
- ✅ **mqtt-monitor** - Topic tree and broker metrics
- ✅ **Cedalo Management Center** - Hierarchical topic structure

## Features

### Topic Tree & Metrics
- Hierarchical topic tree with message counts per level
- Real-time broker statistics from $SYS topics
- Message rate tracking (published/received per second)
- Network throughput monitoring (KB/s)
- Client and subscription tracking
- 15-point historical data for charts

### Schema Generation
- Automatic JSON schema generation for JSON payloads
- Message type detection (JSON, XML, string, binary)
- Schema stored in topic tree nodes
- Individual schema endpoint per topic

## API Endpoints

Base URL: `http://localhost:3002/api/v1/mqtt-monitor`

> **💡 Unified API:** This service combines schema generation and monitoring into one endpoint. Replaces legacy `/api/v1/mqtt-schema` endpoints. See [MQTT-API-MIGRATION.md](./MQTT-API-MIGRATION.md) for migration guide.

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/status` | Connection status and counts |
| POST | `/start` | Start monitoring |
| POST | `/stop` | Stop monitoring |
| GET | `/topic-tree` | Hierarchical topic structure with schemas |
| GET | `/topics` | Flattened topic list with schemas |
| GET | `/topics/:topic/schema` | Get schema for specific topic |
| GET | `/metrics` | Real-time broker metrics |
| GET | `/stats` | Comprehensive statistics (metrics + schemas) |
| GET | `/system-stats` | Raw $SYS topic data |
| GET | `/dashboard` | Everything in one call ⭐ |

## Example Responses

### Topic with Schema

```json
{
  "topic": "$iot/device/a3f8c9d2/telemetry/temperature",
  "messageCount": 123,
  "lastMessage": "{\"value\":23.5,\"unit\":\"celsius\"}",
  "messageType": "json",
  "schema": {
    "type": "object",
    "properties": {
      "value": { "type": "number" },
      "unit": { "type": "string" }
    }
  },
  "lastModified": 1729350000000
}
```

### Topic Tree Node with Schema

```json
{
  "_name": "temperature",
  "_topic": "$iot/device/a3f8c9d2/telemetry/temperature",
  "_messagesCounter": 123,
  "_topicsCounter": 0,
  "_message": "{\"value\":23.5,\"unit\":\"celsius\"}",
  "_messageType": "json",
  "_schema": {
    "type": "object",
    "properties": {
      "value": { "type": "number" },
      "unit": { "type": "string" }
    }
  },
  "_qos": 0,
  "_retain": false,
  "_created": 1729300000000,
  "_lastModified": 1729350000000
}
```

### Dashboard Response

```json
{
  "success": true,
  "data": {
    "status": {
      "connected": true,
      "topicCount": 150,
      "messageCount": 5842
    },
    "topicTree": { /* Complete tree with schemas */ },
    "topics": {
      "count": 150,
      "withSchemas": 45,
      "list": [ /* Topics with message type and schema */ ]
    },
    "metrics": {
      "messageRate": { /* Current + 15-point history */ },
      "throughput": { /* KB/s with history */ },
      "clients": 14,
      "subscriptions": 43,
      "retainedMessages": 10,
      "totalMessages": {
        "sent": 125678,
        "received": 120345
      }
    },
    "timestamp": 1729350000000
  }
}
```

## Configuration

```bash
# MQTT Connection
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=admin
MQTT_PASSWORD=password

# Features
MQTT_MONITOR_AUTO_START=true                    # Auto-start on boot
MQTT_METRICS_UPDATE_INTERVAL=5000               # Metrics interval (ms)
MQTT_TOPIC_TREE_UPDATE_INTERVAL=5000            # Tree update interval (ms)
```

## Usage Examples

### Get Topics with Schemas

```powershell
# Get all topics with schemas
$topics = Invoke-RestMethod "http://localhost:3002/api/v1/mqtt-monitor/topics"

# Filter JSON topics only
$jsonTopics = $topics.data | Where-Object { $_.messageType -eq 'json' }

# Show topics with schemas
$jsonTopics | Where-Object { $_.schema } | Format-Table topic, messageType
```

### Get Schema for Specific Topic

```powershell
# Get schema (URL encode the topic)
$topic = [System.Uri]::EscapeDataString('$iot/device/a3f8c9d2/telemetry/temperature')
$schema = Invoke-RestMethod "http://localhost:3002/api/v1/mqtt-monitor/topics/$topic/schema"

$schema.data | ConvertTo-Json -Depth 10
```

### Dashboard with Schema Stats

```powershell
$dashboard = Invoke-RestMethod "http://localhost:3002/api/v1/mqtt-monitor/dashboard"

Write-Host "Total Topics: $($dashboard.data.topics.count)"
Write-Host "With Schemas: $($dashboard.data.topics.withSchemas)"
Write-Host "Connected Clients: $($dashboard.data.metrics.clients)"
```

### Get Comprehensive Statistics

```powershell
# Get combined statistics (replaces legacy /mqtt-schema/stats)
$stats = Invoke-RestMethod "http://localhost:3002/api/v1/mqtt-monitor/stats"

Write-Host "Schema Statistics:"
Write-Host "  Total Schemas: $($stats.stats.schemas.total)"
Write-Host "  JSON: $($stats.stats.schemas.byType.json)"
Write-Host "  XML: $($stats.stats.schemas.byType.xml)"
Write-Host "  String: $($stats.stats.schemas.byType.string)"

Write-Host "`nPerformance:"
Write-Host "  Message Rate: $($stats.stats.messageRate.published) msg/s published"
Write-Host "  Throughput: $($stats.stats.throughput.outbound) KB/s outbound"
Write-Host "  Clients: $($stats.stats.clients)"
```

**Response:**
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
    "broker": { /* $SYS data */ }
  }
}
```

## Dashboard UI Integration

### Display Topic with Schema

```typescript
interface TopicWithSchema {
  topic: string;
  messageCount: number;
  lastMessage?: string;
  messageType?: 'json' | 'xml' | 'string' | 'binary';
  schema?: JSONSchema;
  lastModified?: number;
}

// Render topic in UI
function TopicRow({ topic }: { topic: TopicWithSchema }) {
  return (
    <div>
      <h3>{topic.topic}</h3>
      <div>Messages: {topic.messageCount}</div>
      <div>Type: {topic.messageType || 'unknown'}</div>
      
      {topic.schema && (
        <details>
          <summary>Schema</summary>
          <pre>{JSON.stringify(topic.schema, null, 2)}</pre>
        </details>
      )}
      
      {topic.lastMessage && (
        <details>
          <summary>Last Message</summary>
          <pre>{topic.lastMessage}</pre>
        </details>
      )}
    </div>
  );
}
```

### Schema Validation Example

```typescript
// Fetch schema
const response = await fetch(
  `/api/v1/mqtt-monitor/topics/${encodeURIComponent(topicName)}/schema`
);
const { data } = await response.json();

// Use schema to validate incoming messages
import Ajv from 'ajv';
const ajv = new Ajv();
const validate = ajv.compile(data.schema);

// Validate message
const message = { value: 23.5, unit: 'celsius' };
const valid = validate(message);

if (!valid) {
  console.error('Invalid message:', validate.errors);
}
```

## Migration from Separate Services

If you were using `mqtt-schema-agent` separately, here's the mapping:

| Old Endpoint | New Endpoint |
|-------------|-------------|
| `/api/v1/mqtt-schema/topics` | `/api/v1/mqtt-monitor/topics` |
| `/api/v1/mqtt-schema/topics/:topic` | `/api/v1/mqtt-monitor/topics/:topic/schema` |
| `/api/v1/mqtt-schema/stats` | `/api/v1/mqtt-monitor/metrics` |
| `/api/v1/mqtt-schema/status` | `/api/v1/mqtt-monitor/status` |

**Key Changes:**
- Topic list now includes message type and schema in same response
- Schema endpoint is now at `/topics/:topic/schema` instead of `/topics/:topic`
- Stats are more comprehensive with historical data
- Dashboard endpoint combines everything

## Benefits of Unified Service

✅ **Single Connection** - One MQTT client instead of two
✅ **Less Memory** - Shared topic tree for both features
✅ **Consistent Data** - Topic tree and schemas always in sync
✅ **Simpler API** - One service to manage instead of two
✅ **Better Performance** - Single message handler, less overhead

## Performance

- **Memory**: ~50MB base + ~1KB per unique topic
- **CPU**: Minimal - schema generation only on first message per topic
- **Network**: Single MQTT connection with `#` subscription
- **Update Rate**: Configurable (default 5 seconds)

## Troubleshooting

### Schemas not generating

Ensure messages are valid JSON:
```bash
mosquitto_pub -h localhost -t test/topic -m '{"valid": "json"}'
```

### High memory usage

Disable schema generation for large topic sets:
```bash
# In service constructor
schemaGenerationEnabled: false
```

### Missing $SYS metrics

Enable in broker config:
```conf
# mosquitto.conf
sys_interval 1
```

## Next Steps

1. ✅ Service unified and tested
2. ⏳ Build dashboard UI using `/dashboard` endpoint
3. ⏳ Add schema validation for incoming messages
4. ⏳ Export schemas to OpenAPI/GraphQL definitions
5. ⏳ Add WebSocket support for real-time updates

## License

Part of the Iotistic Sensor project.
