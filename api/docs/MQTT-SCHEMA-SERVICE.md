# MQTT Schema Agent Service

TypeScript port of the MQTT schema agent that monitors MQTT topics and automatically generates JSON schemas for message payloads.

## Overview

The MQTT Schema Agent connects to an MQTT broker, subscribes to topics, and analyzes incoming messages to:
- Detect message types (JSON, XML, binary, string)
- Generate JSON schemas for JSON payloads
- Track MQTT broker statistics via `$SYS` topics
- Report discovered topics periodically

## Features

✅ **Automatic Schema Generation**: Analyzes JSON payloads and creates JSON Schema definitions
✅ **Multiple Format Detection**: Handles JSON, XML, binary, and string payloads
✅ **Broker Statistics**: Monitors `$SYS` topics for broker metrics
✅ **Event-Driven Architecture**: Emits events for new schemas and reports
✅ **Auto-Start**: Can be configured to start automatically on server startup
✅ **RESTful API**: Full HTTP API for controlling and querying the agent

## API Endpoints

### Status & Control

#### `GET /api/v1/mqtt-schema/status`
Get agent connection status

**Response:**
```json
{
  "connected": true,
  "topicCount": 15
}
```

#### `POST /api/v1/mqtt-schema/start`
Start the MQTT schema agent

**Response:**
```json
{
  "success": true,
  "message": "MQTT schema agent started"
}
```

#### `POST /api/v1/mqtt-schema/stop`
Stop the MQTT schema agent

**Response:**
```json
{
  "success": true,
  "message": "MQTT schema agent stopped"
}
```

### Schema Discovery

#### `GET /api/v1/mqtt-schema/topics`
Get all discovered topics with their schemas

**Response:**
```json
{
  "success": true,
  "count": 15,
  "topics": [
    {
      "topic": "sensor/temperature",
      "type": "object",
      "properties": {
        "value": { "type": "number" },
        "unit": { "type": "string" },
        "timestamp": { "type": "string" }
      },
      "timestamp": 1729300000000
    }
  ]
}
```

#### `GET /api/v1/mqtt-schema/topics/:topic`
Get schema for a specific topic (use URL encoding for topic names with slashes)

**Example:**
```bash
curl http://localhost:3002/api/v1/mqtt-schema/topics/sensor%2Ftemperature
```

**Response:**
```json
{
  "success": true,
  "schema": {
    "topic": "sensor/temperature",
    "type": "object",
    "properties": {
      "value": { "type": "number" },
      "unit": { "type": "string" }
    },
    "timestamp": 1729300000000
  }
}
```

### Statistics

#### `GET /api/v1/mqtt-schema/stats`
Get MQTT broker statistics

**Response:**
```json
{
  "success": true,
  "stats": {
    "messagesSent": 12345,
    "subscriptions": 25,
    "retainedMessages": 10,
    "connectedClients": 5,
    "bytesReceived15min": 1024000,
    "bytesSent15min": 512000,
    "userMessages": 500,
    "mqtt_connected": true
  }
}
```

## Configuration

Configure via environment variables:

```bash
# MQTT Broker Connection
MQTT_BROKER_URL=mqtt://localhost:1883    # Broker URL
MQTT_USERNAME=username                    # Optional
MQTT_PASSWORD=password                    # Optional

# Topics to Monitor
MQTT_TOPICS=sensor/#,device/#             # Comma-separated list (default: #)

# Auto-Start
MQTT_SCHEMA_AUTO_START=true               # Start on server startup (default: true)
```

## Usage Examples

### Basic Usage

```typescript
import { MQTTSchemaAgent } from './services/mqtt-schema-agent';

const agent = new MQTTSchemaAgent({
  brokerUrl: 'mqtt://localhost:1883',
  topics: ['sensor/#', 'device/#']
});

// Listen for schema discoveries
agent.on('schema', ({ topic, schema }) => {
  console.log(`New schema for ${topic}:`, schema);
});

// Listen for periodic reports
agent.on('report', ({ schemas, stats }) => {
  console.log(`Discovered ${schemas.length} schemas`);
  console.log(`Broker stats:`, stats);
});

// Start the agent
await agent.start();
```

### PowerShell Examples

```powershell
# Get agent status
curl http://localhost:3002/api/v1/mqtt-schema/status

# Start the agent
curl -X POST http://localhost:3002/api/v1/mqtt-schema/start

# Get all discovered topics
curl http://localhost:3002/api/v1/mqtt-schema/topics

# Get specific topic schema (URL encode the topic)
$topic = [System.Web.HttpUtility]::UrlEncode("sensor/temperature")
curl "http://localhost:3002/api/v1/mqtt-schema/topics/$topic"

# Get broker statistics
curl http://localhost:3002/api/v1/mqtt-schema/stats

# Stop the agent
curl -X POST http://localhost:3002/api/v1/mqtt-schema/stop
```

## Schema Generation

The agent automatically generates JSON schemas for JSON payloads:

### Input Message
```json
{
  "temperature": 22.5,
  "humidity": 65,
  "location": "Room 101",
  "sensors": ["temp", "humidity"]
}
```

### Generated Schema
```json
{
  "type": "object",
  "properties": {
    "temperature": { "type": "number" },
    "humidity": { "type": "number" },
    "location": { "type": "string" },
    "sensors": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

## Monitored $SYS Topics

The agent automatically monitors these broker statistics topics:

- `$SYS/broker/messages/sent` - Total messages sent
- `$SYS/broker/subscriptions/count` - Active subscriptions
- `$SYS/broker/retained messages/count` - Retained messages
- `$SYS/broker/clients/connected` - Connected clients
- `$SYS/broker/load/bytes/received/15min` - Bytes received (15min avg)
- `$SYS/broker/load/bytes/sent/15min` - Bytes sent (15min avg)

## Integration with Digital Twin

The MQTT schema agent can be integrated with the digital twin system to:

1. **Auto-discover device topics** - Automatically detect new devices publishing data
2. **Validate message formats** - Ensure devices send correctly formatted data
3. **Generate entity properties** - Create entity properties based on message schemas
4. **Monitor data quality** - Track schema changes and data inconsistencies

### Example Integration

```typescript
// In your digital twin service
agent.on('schema', async ({ topic, schema }) => {
  // Create entity for new device
  if (topic.startsWith('device/')) {
    const deviceId = topic.split('/')[1];
    
    await createEntity({
      entity_type: 'device',
      name: `Device ${deviceId}`,
      metadata: {
        mqtt_topic: topic,
        schema: schema
      }
    });
  }
});
```

## Differences from Original

This TypeScript port differs from the original FlowFuse agent:

1. ✅ **No external API dependency** - Doesn't require FlowFuse API credentials
2. ✅ **Standalone operation** - Works as a self-contained service
3. ✅ **Event-driven** - Uses EventEmitter for schema discoveries
4. ✅ **TypeScript** - Full type safety and modern async/await
5. ✅ **Integrated** - Part of the unified Iotistic API
6. ⚠️ **No persistence** - Doesn't store schemas to external database (uses in-memory storage)

## Performance

- **Memory efficient**: Only stores schemas discovered since last report
- **Non-blocking**: All operations are async
- **Scalable**: Can handle thousands of topics
- **Low overhead**: Minimal CPU usage for schema generation

## Troubleshooting

### Agent won't connect

Check broker URL and credentials:
```bash
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password
```

### No topics discovered

Ensure topics are being published and subscription pattern is correct:
```bash
MQTT_TOPICS=#  # Subscribe to all topics
MQTT_TOPICS=sensor/#,device/#  # Multiple patterns
```

### Schema not generated

Check logs for parsing errors. Ensure messages are valid JSON:
```bash
# Test message format
mosquitto_pub -h localhost -t test/topic -m '{"valid": "json"}'
```

## Future Enhancements

Potential additions:
- [ ] Schema persistence to database
- [ ] Schema versioning and change detection
- [ ] Schema validation for incoming messages
- [ ] Alert on schema violations
- [ ] Integration with ML anomaly detection
- [ ] Export schemas to OpenAPI/GraphQL

## License

Part of the Iotistic Sensor project.
