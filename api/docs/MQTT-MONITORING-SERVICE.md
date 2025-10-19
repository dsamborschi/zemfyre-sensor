# MQTT Monitoring Dashboard Service

Complete MQTT monitoring solution with hierarchical topic tree and real-time broker metrics, based on Cedalo MQTT Management Center architecture.

## Features

✅ **Hierarchical Topic Tree** - Nested topic structure with message counts per level
✅ **Real-Time Metrics** - Message rates, throughput, clients, subscriptions
✅ **Broker Statistics** - Complete $SYS topic monitoring
✅ **Historical Data** - Last 15 measurements for charts
✅ **Dashboard API** - Single endpoint for complete dashboard data

## Architecture

```
MQTT Broker (port 1883)
         ↓
  [$SYS/# + # subscriptions]
         ↓
MQTTMonitorService
    ├─ Topic Tree Builder
    ├─ Metrics Calculator
    └─ Stats Aggregator
         ↓
    REST API (port 3002)
         ↓
    Dashboard UI
```

## API Endpoints

Base URL: `http://localhost:3002/api/v1/mqtt-monitor`

### Status & Control

#### `GET /status`
Get monitor connection status

**Response:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "topicCount": 150,
    "messageCount": 5842
  }
}
```

#### `POST /start`
Start the monitoring service

**Response:**
```json
{
  "success": true,
  "message": "MQTT monitor started"
}
```

#### `POST /stop`
Stop the monitoring service

**Response:**
```json
{
  "success": true,
  "message": "MQTT monitor stopped"
}
```

### Topic Tree

#### `GET /topic-tree`
Get complete hierarchical topic tree structure

**Response:**
```json
{
  "success": true,
  "data": {
    "_name": "root",
    "_messagesCounter": 5842,
    "_topicsCounter": 150,
    "$iot": {
      "_name": "$iot",
      "_topic": "$iot",
      "_created": 1729300000000,
      "_messagesCounter": 2500,
      "_topicsCounter": 75,
      "device": {
        "_name": "device",
        "_topic": "$iot/device",
        "_messagesCounter": 1200,
        "_topicsCounter": 50,
        "a3f8c9d2-4e1b-4a9f-b7d3-c2e8f5a1b6d4": {
          "_name": "a3f8c9d2-4e1b-4a9f-b7d3-c2e8f5a1b6d4",
          "_topic": "$iot/device/a3f8c9d2-4e1b-4a9f-b7d3-c2e8f5a1b6d4",
          "_messagesCounter": 225,
          "_topicsCounter": 4,
          "telemetry": {
            "_name": "telemetry",
            "_topic": "$iot/device/a3f8c9d2-4e1b-4a9f-b7d3-c2e8f5a1b6d4/telemetry",
            "_messagesCounter": 225,
            "_topicsCounter": 2,
            "temperature": {
              "_name": "temperature",
              "_topic": "$iot/device/a3f8c9d2-4e1b-4a9f-b7d3-c2e8f5a1b6d4/telemetry/temperature",
              "_messagesCounter": 123,
              "_message": "23.5",
              "_qos": 0,
              "_retain": false,
              "_created": 1729300000000,
              "_lastModified": 1729350000000
            }
          }
        }
      }
    }
  }
}
```

#### `GET /topics`
Get flattened list of all topics

**Response:**
```json
{
  "success": true,
  "count": 150,
  "data": [
    {
      "topic": "$iot/device/a3f8c9d2/telemetry/temperature",
      "messageCount": 123,
      "lastMessage": "23.5",
      "lastModified": 1729350000000
    },
    {
      "topic": "$iot/device/a3f8c9d2/telemetry/humidity",
      "messageCount": 102,
      "lastMessage": "65",
      "lastModified": 1729350100000
    }
  ]
}
```

### Metrics

#### `GET /metrics`
Get real-time broker metrics with historical data

**Response:**
```json
{
  "success": true,
  "data": {
    "messageRate": {
      "published": [90, 92, 88, 95, 93, 91, 94, 96, 90, 89, 92, 93, 95, 94, 93],
      "received": [85, 87, 86, 90, 88, 87, 89, 91, 85, 84, 87, 88, 90, 89, 88],
      "current": {
        "published": 235,
        "received": 228
      }
    },
    "throughput": {
      "outbound": [45, 47, 46, 50, 48, 47, 49, 51, 45, 44, 47, 48, 50, 49, 48],
      "inbound": [42, 44, 43, 47, 45, 44, 46, 48, 42, 41, 44, 45, 47, 46, 45],
      "current": {
        "outbound": 50,
        "inbound": 48
      }
    },
    "clients": 14,
    "subscriptions": 43,
    "retainedMessages": 10,
    "totalMessages": {
      "sent": 125678,
      "received": 120345
    },
    "timestamp": 1729350000000
  }
}
```

#### `GET /system-stats`
Get raw $SYS topic statistics

**Response:**
```json
{
  "success": true,
  "data": {
    "_name": "broker",
    "$SYS": {
      "broker": {
        "messages": {
          "sent": "125678",
          "received": "120345",
          "stored": "0"
        },
        "clients": {
          "connected": "14",
          "total": "25",
          "maximum": "100"
        },
        "subscriptions": {
          "count": "43"
        },
        "load": {
          "messages": {
            "sent": {
              "1min": "235.5",
              "5min": "240.2",
              "15min": "238.8"
            },
            "received": {
              "1min": "228.3",
              "5min": "232.1",
              "15min": "230.5"
            }
          },
          "bytes": {
            "sent": {
              "1min": "51200.5",
              "5min": "52300.2",
              "15min": "51800.8"
            },
            "received": {
              "1min": "49100.3",
              "5min": "50200.1",
              "15min": "49600.5"
            }
          }
        },
        "retained messages": {
          "count": "10"
        }
      }
    }
  }
}
```

### Dashboard

#### `GET /dashboard`
Get all dashboard data in a single request

**Response:**
```json
{
  "success": true,
  "data": {
    "status": {
      "connected": true,
      "topicCount": 150,
      "messageCount": 5842
    },
    "topicTree": { /* Full tree structure */ },
    "topics": {
      "count": 150,
      "list": [ /* First 100 topics */ ]
    },
    "metrics": {
      "messageRate": { /* Current + history */ },
      "throughput": { /* Current + history */ },
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

Environment variables:

```bash
# MQTT Broker Connection
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=admin
MQTT_PASSWORD=password

# Monitoring Settings
MQTT_MONITOR_AUTO_START=true                    # Auto-start on server boot
MQTT_METRICS_UPDATE_INTERVAL=5000               # Metrics calculation interval (ms)
MQTT_TOPIC_TREE_UPDATE_INTERVAL=5000            # Topic tree update interval (ms)
```

## Usage Examples

### PowerShell

```powershell
# Get dashboard data
$dashboard = Invoke-RestMethod -Uri "http://localhost:3002/api/v1/mqtt-monitor/dashboard"
$dashboard.data

# Get just metrics
$metrics = Invoke-RestMethod -Uri "http://localhost:3002/api/v1/mqtt-monitor/metrics"
$metrics.data

# Get topic tree
$tree = Invoke-RestMethod -Uri "http://localhost:3002/api/v1/mqtt-monitor/topic-tree"
$tree.data

# Stop monitoring
Invoke-RestMethod -Uri "http://localhost:3002/api/v1/mqtt-monitor/stop" -Method Post
```

### cURL

```bash
# Get dashboard
curl http://localhost:3002/api/v1/mqtt-monitor/dashboard

# Get metrics
curl http://localhost:3002/api/v1/mqtt-monitor/metrics

# Get topic tree
curl http://localhost:3002/api/v1/mqtt-monitor/topic-tree

# Start/stop
curl -X POST http://localhost:3002/api/v1/mqtt-monitor/start
curl -X POST http://localhost:3002/api/v1/mqtt-monitor/stop
```

## Dashboard UI Integration

### Topic Tree Display

The topic tree follows this structure for UI rendering:

```typescript
interface TopicNode {
  _name: string;              // Display name
  _topic: string;             // Full topic path
  _messagesCounter: number;   // Total messages on this level
  _topicsCounter: number;     // Number of subtopics
  _message?: string;          // Last message (if leaf node)
  _lastModified?: number;     // Timestamp
  [key: string]: any;         // Child nodes
}
```

**Display Example:**
```
📁 $iot (5842 messages)
  📁 device (2500 messages)
    📁 a3f8c9d2-4e1b-4a9f-b7d3-c2e8f5a1b6d4 (225 messages)
      📁 telemetry (225 messages)
        📄 temperature (123 messages) - Last: 23.5
        📄 humidity (102 messages) - Last: 65
```

### Metrics Chart Data

The `messageRate` and `throughput` arrays contain the last 15 measurements, perfect for chart rendering:

```typescript
// Chart.js example
const chartData = {
  labels: Array.from({length: 15}, (_, i) => `${i}min ago`),
  datasets: [
    {
      label: 'Published',
      data: metrics.messageRate.published,
      borderColor: 'blue'
    },
    {
      label: 'Received',
      data: metrics.messageRate.received,
      borderColor: 'green'
    }
  ]
};
```

### Real-Time Updates

For live dashboard updates, poll the `/dashboard` endpoint every 5 seconds:

```typescript
// React/Vue example
useEffect(() => {
  const interval = setInterval(async () => {
    const response = await fetch('/api/v1/mqtt-monitor/dashboard');
    const data = await response.json();
    setDashboardData(data.data);
  }, 5000);
  
  return () => clearInterval(interval);
}, []);
```

## Performance Considerations

- **Topic Tree Size**: Large brokers with 1000+ topics may produce multi-MB responses
- **Update Intervals**: Default 5 seconds balances real-time vs. server load
- **Historical Data**: Limited to 15 measurements (~1-2 minutes of history)
- **Dashboard Endpoint**: Returns first 100 topics only for performance

## Differences from Cedalo Management Center

✅ **Included:**
- Topic tree hierarchy with message counts
- Real-time metrics (message rate, throughput)
- $SYS topic monitoring
- Historical data for charts

❌ **Not Included:**
- WebSocket push notifications (use polling instead)
- Multiple broker connections
- Dynamic security management
- Client detail inspection

## Integration with Digital Twin

Link MQTT topics to digital twin entities:

```typescript
// Fetch topics
const topics = await fetch('/api/v1/mqtt-monitor/topics').then(r => r.json());

// Create entities for each device
for (const topic of topics.data) {
  if (topic.topic.includes('/device/')) {
    const deviceId = topic.topic.split('/')[2];
    await createEntity({
      entity_type: 'device',
      name: `Device ${deviceId}`,
      metadata: {
        mqtt_topic: topic.topic,
        message_count: topic.messageCount
      }
    });
  }
}
```

## Troubleshooting

### No metrics showing

Check that $SYS topics are enabled on your broker:

```conf
# mosquitto.conf
sys_interval 1
```

### Topic tree empty

Ensure topics are being published:

```bash
mosquitto_pub -h localhost -t test/topic -m "hello"
```

### High memory usage

Reduce update intervals or limit topic tree depth:

```bash
MQTT_TOPIC_TREE_UPDATE_INTERVAL=10000  # 10 seconds
MQTT_METRICS_UPDATE_INTERVAL=10000
```

## Next Steps

1. **Dashboard UI**: Build React/Vue components using these APIs
2. **WebSocket Support**: Add real-time push notifications
3. **Alerts**: Set thresholds for metrics and trigger alerts
4. **Export**: Add CSV/JSON export for historical analysis
5. **Multiple Brokers**: Support monitoring multiple MQTT brokers

## License

Part of the Zemfyre Sensor project.
