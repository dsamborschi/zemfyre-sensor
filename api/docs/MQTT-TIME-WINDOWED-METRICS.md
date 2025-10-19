# MQTT Time-Windowed Message Counts

## Overview

Dashboard users can now view **recent message activity** instead of total accumulated counts. This provides more actionable insights into current MQTT topic activity.

## Features

### 1. Time-Windowed Message Counts
- **5 minutes**: Very recent activity, ideal for real-time monitoring
- **15 minutes**: Default window, good balance of granularity and stability
- **30 minutes**: Half-hour trends
- **60 minutes**: Hourly activity patterns

### 2. Per-Topic Activity Tracking
- Message count within time window
- Message rate (messages per minute)
- Time-series data points for charting

## API Endpoints

### Get Recent Activity for All Topics

```bash
GET /api/v1/mqtt-monitor/recent-activity?window=15
```

**Query Parameters:**
- `window` (optional): Time window in minutes. Valid values: 5, 15, 30, 60. Default: 15

**Response:**
```json
{
  "success": true,
  "windowMinutes": 15,
  "count": 10,
  "data": [
    {
      "topic": "sensor/temperature",
      "messageCount": 45,
      "messageRate": 3.0,
      "windowMinutes": 15,
      "oldestTimestamp": "2025-10-19T16:30:00Z",
      "latestTimestamp": "2025-10-19T16:45:00Z"
    },
    {
      "topic": "device/status",
      "messageCount": 15,
      "messageRate": 1.0,
      "windowMinutes": 15,
      "oldestTimestamp": "2025-10-19T16:30:00Z",
      "latestTimestamp": "2025-10-19T16:45:00Z"
    }
  ]
}
```

**Fields:**
- `messageCount`: Total messages in the time window
- `messageRate`: Messages per minute (rounded to 2 decimals)
- `oldestTimestamp`: Start of the measurement window
- `latestTimestamp`: End of the measurement window

### Get Recent Activity for Specific Topic

```bash
GET /api/v1/mqtt-monitor/topics/sensor/temperature/recent-activity?window=15
```

**Query Parameters:**
- `window` (optional): Time window in minutes. Default: 15

**Response:**
```json
{
  "success": true,
  "data": {
    "topic": "sensor/temperature",
    "messageCount": 45,
    "messageRate": 3.0,
    "dataPoints": [
      {
        "timestamp": "2025-10-19T16:30:00Z",
        "count": 150
      },
      {
        "timestamp": "2025-10-19T16:30:30Z",
        "count": 155
      },
      {
        "timestamp": "2025-10-19T16:31:00Z",
        "count": 160
      }
      // ... more data points
    ]
  }
}
```

**Fields:**
- `messageCount`: Difference between latest and oldest count
- `messageRate`: Average rate over the window
- `dataPoints`: Time-series data for charting (one point per sync interval, default 30s)

## Database Implementation

### Tables Used

**mqtt_topic_metrics** - Stores timestamped snapshots of message counts
```sql
CREATE TABLE mqtt_topic_metrics (
    id SERIAL PRIMARY KEY,
    topic VARCHAR(500) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    message_count INTEGER DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    message_rate DECIMAL(10, 2),
    avg_message_size INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Recording Frequency

- **Default**: Every 30 seconds (configurable via `MQTT_DB_SYNC_INTERVAL` env var)
- **Minimum recommended**: 10 seconds for 5-minute windows
- **Data retention**: Automatically cleaned up after 30 days (via `cleanup_old_mqtt_metrics()` function)

### Query Performance

- Indexed on `topic` and `timestamp` for fast time-range queries
- Composite index on `(topic, timestamp DESC)` for per-topic queries
- Window queries use `NOW() - INTERVAL` for efficient filtering

## Implementation Details

### Database Service Methods

**getRecentMessageCounts(windowMinutes)**
- Calculates message count delta for all topics
- Returns sorted by activity (highest first)
- Uses window functions (LAG) for efficient delta calculation

**getTopicRecentActivity(topic, windowMinutes)**
- Retrieves all data points for a specific topic
- Calculates total count and rate
- Returns time-series array for charting

### MQTT Monitor Integration

The monitor now:
1. Records topic metrics to `mqtt_topic_metrics` during each sync
2. Stores cumulative message count (used to calculate deltas)
3. Tracks message size for bandwidth analysis

### Configuration

```bash
# Environment variables
MQTT_DB_SYNC_INTERVAL=30000        # Sync every 30 seconds (default)
MQTT_PERSIST_TO_DB=true            # Enable database persistence
MQTT_BROKER_URL=mqtt://localhost:1883
```

**For 5-minute windows**, consider setting:
```bash
MQTT_DB_SYNC_INTERVAL=10000        # Sync every 10 seconds (18 data points per 5 min)
```

## Dashboard Integration

### Example: Display Recent Activity Table

```typescript
// Fetch recent activity (15-minute window)
const response = await fetch('/api/v1/mqtt-monitor/recent-activity?window=15');
const { data } = await response.json();

// Render table
data.forEach(topic => {
  console.log(`${topic.topic}: ${topic.messageCount} messages (${topic.messageRate}/min)`);
});
```

### Example: Chart Topic Activity Over Time

```typescript
// Fetch specific topic activity
const response = await fetch('/api/v1/mqtt-monitor/topics/sensor/temperature/recent-activity?window=60');
const { data } = await response.json();

// Use with Recharts
<LineChart data={data.dataPoints}>
  <XAxis dataKey="timestamp" />
  <YAxis />
  <Line type="monotone" dataKey="count" stroke="#8884d8" />
  <Tooltip />
</LineChart>
```

## Migration from Total Counts

### Before (Total Count)
```typescript
// Old approach - shows lifetime total
const topics = await fetch('/api/v1/mqtt-monitor/topics');
// Result: topic has 2,143,673,853 messages (meaningless)
```

### After (Time-Windowed)
```typescript
// New approach - shows recent activity
const topics = await fetch('/api/v1/mqtt-monitor/recent-activity?window=15');
// Result: topic has 45 messages in last 15 minutes (actionable)
```

## Benefits

1. **Actionable insights**: See what's active NOW, not historical totals
2. **Trend detection**: Identify spikes or drops in activity
3. **Capacity planning**: Understand message rates for scaling
4. **Troubleshooting**: Quickly spot topics with unusual activity
5. **No overflow issues**: Window calculations use deltas, not cumulative counts

## Limitations

1. **Requires database persistence**: Must set `MQTT_PERSIST_TO_DB=true`
2. **Granularity**: Limited by sync interval (default 30s)
3. **Cold start**: Requires 2+ metrics records to calculate deltas
4. **Data retention**: Older than 30 days is automatically cleaned up

## Testing

```bash
# Start API with database persistence
cd api
MQTT_PERSIST_TO_DB=true npm run dev

# Test 15-minute window (default)
curl http://localhost:4002/api/v1/mqtt-monitor/recent-activity

# Test 5-minute window
curl http://localhost:4002/api/v1/mqtt-monitor/recent-activity?window=5

# Test specific topic
curl http://localhost:4002/api/v1/mqtt-monitor/topics/sensor/temperature/recent-activity?window=15
```

## Future Enhancements

1. **Custom window ranges**: Allow arbitrary time windows (e.g., 45 minutes)
2. **Peak detection**: Identify and flag unusual spikes
3. **Aggregated metrics**: Show sum/average across topic patterns (e.g., `sensor/*`)
4. **Alert thresholds**: Notify when message rate exceeds threshold
5. **Historical comparison**: Compare current window to previous period

---

**Version**: 1.0  
**Last Updated**: 2025-10-19  
**Author**: AI Agent with User Feedback
