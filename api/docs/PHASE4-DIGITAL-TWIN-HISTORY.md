# Phase 4: Digital Twin Historical Tracking & Anomaly Detection

## Overview

Phase 4 extends the digital twin system with time-series tracking, historical queries, and anomaly detection capabilities. This enables trend analysis, predictive maintenance, and automated alerting based on statistical outliers.

## Features Implemented

### 1. Shadow History Storage
- **Database Table**: `device_shadow_history`
- **Automatic Capture**: Every shadow update is stored with timestamp
- **JSONB Storage**: Complete shadow state preserved for flexible querying
- **Indexed**: Optimized for time-range queries and JSONB field access

### 2. Historical Query API
**Endpoint**: `GET /api/v1/devices/:uuid/twin/history`

**Query Parameters**:
- `from`: Start timestamp (ISO 8601, default: 7 days ago)
- `to`: End timestamp (ISO 8601, default: now)
- `limit`: Maximum results (default: 100, max: 1000)
- `field`: Specific field to track (e.g., 'system.cpuUsage', 'health.status')

**Response** (Full History):
```json
{
  "deviceUuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
  "timeRange": {
    "from": "2025-10-11T00:00:00.000Z",
    "to": "2025-10-18T00:00:00.000Z"
  },
  "count": 142,
  "limit": 100,
  "history": [
    {
      "timestamp": "2025-10-18T00:00:00.000Z",
      "version": 523,
      "state": {
        "identity": { "deviceUuid": "...", "name": "..." },
        "system": { "cpuUsage": 45.2, "memoryUsed": 3.2 },
        "health": { "status": "healthy" }
      }
    }
  ]
}
```

**Response** (Field-Specific with Statistics):
```json
{
  "deviceUuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
  "field": "system.cpuUsage",
  "timeRange": { "from": "...", "to": "..." },
  "count": 142,
  "statistics": {
    "count": 142,
    "min": 12.5,
    "max": 98.3,
    "average": 45.7,
    "latest": 52.1
  },
  "data": [
    { "timestamp": "2025-10-18T00:00:00.000Z", "value": 52.1, "version": 523 },
    { "timestamp": "2025-10-17T23:00:00.000Z", "value": 48.9, "version": 522 }
  ]
}
```

**Example Queries**:
```bash
# Last 7 days of complete shadow history
curl http://localhost:4002/api/v1/devices/46b68204-9806-43c5-8d19-18b1f53e3b8a/twin/history

# CPU usage for last 24 hours with statistics
curl "http://localhost:4002/api/v1/devices/46b68204-9806-43c5-8d19-18b1f53e3b8a/twin/history?field=system.cpuUsage&from=2025-10-17T00:00:00Z"

# Memory usage trends with 50 data points
curl "http://localhost:4002/api/v1/devices/46b68204-9806-43c5-8d19-18b1f53e3b8a/twin/history?field=system.memoryUsagePercent&limit=50"
```

### 3. Anomaly Detection API
**Endpoint**: `GET /api/v1/devices/:uuid/twin/anomalies`

**Query Parameters**:
- `field`: Field to analyze (default: 'system.cpuUsage')
- `from`: Start timestamp (ISO 8601, default: 7 days ago)
- `to`: End timestamp (ISO 8601, default: now)
- `threshold`: Z-score threshold (default: 2.5, higher = fewer anomalies)

**Detection Method**: Statistical Z-score analysis
- Calculates mean and standard deviation of time-series
- Identifies values that deviate significantly from normal behavior
- Classifies severity: `critical` (Z-score > 3) or `warning` (Z-score > threshold)

**Response**:
```json
{
  "deviceUuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
  "field": "system.cpuUsage",
  "timeRange": { "from": "...", "to": "..." },
  "statistics": {
    "dataPoints": 142,
    "mean": 45.7,
    "stdDev": 12.3,
    "min": 12.5,
    "max": 98.3
  },
  "anomalyDetection": {
    "threshold": 2.5,
    "method": "Z-score",
    "detected": {
      "total": 5,
      "critical": 2,
      "warning": 3,
      "percentage": "3.52"
    }
  },
  "anomalies": [
    {
      "timestamp": "2025-10-17T14:23:00.000Z",
      "value": 98.3,
      "zScore": 4.28,
      "severity": "critical",
      "deviation": "115%"
    },
    {
      "timestamp": "2025-10-16T09:15:00.000Z",
      "value": 85.2,
      "zScore": 3.21,
      "severity": "critical",
      "deviation": "86%"
    }
  ]
}
```

**Example Queries**:
```bash
# Detect CPU usage anomalies (default threshold: 2.5)
curl http://localhost:4002/api/v1/devices/46b68204-9806-43c5-8d19-18b1f53e3b8a/twin/anomalies?field=system.cpuUsage

# More sensitive detection (lower threshold = more anomalies)
curl "http://localhost:4002/api/v1/devices/46b68204-9806-43c5-8d19-18b1f53e3b8a/twin/anomalies?field=system.cpuUsage&threshold=2"

# Memory anomaly detection for last 24 hours
curl "http://localhost:4002/api/v1/devices/46b68204-9806-43c5-8d19-18b1f53e3b8a/twin/anomalies?field=system.memoryUsagePercent&from=2025-10-17T00:00:00Z"
```

### 4. Data Retention Scheduler
**Service**: `shadow-retention.ts`

**Configuration** (Environment Variables):
```bash
SHADOW_RETENTION_DAYS=90          # How long to keep history (default: 90 days)
SHADOW_RETENTION_CHECK_HOURS=24   # How often to run cleanup (default: 24 hours)
```

**Features**:
- Automatic cleanup of old shadow history records
- Runs periodically (default: every 24 hours)
- Logs deletion statistics and database size
- Graceful shutdown handling

**Console Output**:
```
🗑️  Starting shadow history retention scheduler
    Check interval: 24 hours
    Retention period: 90 days

🗑️  Running shadow history retention check (deleting records older than 90 days)...
✅ Deleted 1,523 old shadow history records (older than 2025-07-19T00:00:00.000Z)

📊 Shadow history statistics:
    Total records: 45,234
    Oldest record: 2025-07-19T00:05:32.123Z
    Newest record: 2025-10-18T00:02:15.456Z
    Table size: 128 MB
```

**Manual Trigger** (for testing):
```typescript
import { triggerRetentionCheck } from './services/shadow-retention';
await triggerRetentionCheck();
```

## Database Schema

### `device_shadow_history` Table

```sql
CREATE TABLE device_shadow_history (
    id BIGSERIAL PRIMARY KEY,
    device_uuid UUID NOT NULL REFERENCES devices(uuid) ON DELETE CASCADE,
    shadow_name VARCHAR(255) NOT NULL DEFAULT 'device-state',
    reported_state JSONB NOT NULL,
    version INTEGER DEFAULT 0,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX idx_shadow_history_device_uuid ON device_shadow_history(device_uuid);
CREATE INDEX idx_shadow_history_timestamp ON device_shadow_history(timestamp DESC);
CREATE INDEX idx_shadow_history_device_time ON device_shadow_history(device_uuid, timestamp DESC);
CREATE INDEX idx_shadow_history_query ON device_shadow_history(device_uuid, shadow_name, timestamp DESC);
CREATE INDEX idx_shadow_history_state ON device_shadow_history USING GIN (reported_state);
```

## Integration Points

### MQTT Handler (Automatic Capture)
Every shadow update via MQTT automatically creates a history entry:

```typescript
// api/src/mqtt/handlers.ts
export async function handleShadowUpdate(update: ShadowUpdate): Promise<void> {
  // Update current shadow
  await query(`INSERT INTO device_shadows ...`);
  
  // Store in history (Phase 4)
  await query(
    `INSERT INTO device_shadow_history (device_uuid, shadow_name, reported_state, version, timestamp)
     VALUES ($1, $2, $3, $4, $5)`,
    [update.deviceUuid, 'device-state', JSON.stringify(update.reported), update.version, update.timestamp]
  );
}
```

### Audit Logging
All Phase 4 endpoints log access events:

```typescript
export enum AuditEventType {
  DEVICE_TWIN_HISTORY_ACCESSED = 'device_twin_history_accessed',
  DEVICE_TWIN_ANOMALIES_ACCESSED = 'device_twin_anomalies_accessed'
}
```

## Use Cases

### 1. Predictive Maintenance
```bash
# Analyze CPU trends to predict failures
curl "http://localhost:4002/api/v1/devices/$UUID/twin/anomalies?field=system.cpuUsage&threshold=2"

# Check disk usage growth over time
curl "http://localhost:4002/api/v1/devices/$UUID/twin/history?field=system.diskUsagePercent&from=2025-09-18T00:00:00Z"
```

### 2. Performance Analysis
```bash
# Compare memory usage before and after deployment
curl "http://localhost:4002/api/v1/devices/$UUID/twin/history?field=system.memoryUsagePercent&from=2025-10-15T00:00:00Z&to=2025-10-16T00:00:00Z"
```

### 3. Automated Alerting
Integrate with monitoring systems to trigger alerts on detected anomalies:

```javascript
const response = await fetch(`/api/v1/devices/${uuid}/twin/anomalies?field=system.cpuUsage`);
const data = await response.json();

if (data.anomalyDetection.detected.critical > 0) {
  sendAlert('Critical CPU usage anomaly detected', data.anomalies);
}
```

### 4. Fleet-Wide Trend Analysis
```bash
# Get history for multiple devices and compare
for uuid in $DEVICE_LIST; do
  curl "http://localhost:4002/api/v1/devices/$uuid/twin/history?field=system.cpuUsage&limit=100"
done
```

## Testing

Run the updated test script:

```powershell
cd api
.\test-digital-twin.ps1
```

**Tests Included**:
1. Fleet health summary
2. Fleet twins list
3. Fleet alerts
4. Single device twin
5. **Twin history (complete snapshots)**
6. **Field-specific history with statistics**
7. **Anomaly detection**

## Performance Considerations

### Query Optimization
- **Indexes**: Composite indexes optimize device + time range queries
- **GIN Index**: JSONB GIN index enables fast field filtering
- **Limit**: Default limit of 100 prevents large result sets

### Partitioning (Optional)
For high-volume deployments (>1M records), enable table partitioning in migration:

```sql
-- Partition by month
CREATE TABLE device_shadow_history_2025_10 PARTITION OF device_shadow_history
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
```

### Retention Policy
- **Default**: 90 days (configurable via `SHADOW_RETENTION_DAYS`)
- **Storage**: ~1KB per shadow snapshot
- **Example**: 10 devices × 288 updates/day × 90 days = ~260MB

## Future Enhancements

### Phase 4.1 (Planned)
- **Time-series aggregation**: Bucket data by hour/day/week
- **Multi-field anomaly detection**: Detect patterns across multiple metrics
- **Anomaly baseline learning**: Train on historical "normal" behavior
- **Export API**: Download history as CSV/JSON for external analysis

### Phase 4.2 (Planned)
- **Real-time anomaly streaming**: WebSocket push notifications
- **Fleet-wide anomaly dashboard**: Visual heatmaps
- **ML-based predictions**: LSTM models for failure prediction
- **Correlation analysis**: Detect relationships between metrics

## Troubleshooting

### No history data available
**Problem**: `GET /twin/history` returns 404

**Solution**: History is only captured after Phase 4 deployment. Send shadow updates to populate:
```bash
# Trigger shadow update from device
mosquitto_pub -h localhost -t "device/46b68204-9806-43c5-8d19-18b1f53e3b8a/shadow/update" \
  -m '{"reported":{"system":{"cpuUsage":45.2}}}'
```

### Anomaly detection requires >10 data points
**Problem**: `GET /twin/anomalies` returns 400 "Insufficient data"

**Solution**: Expand time range or wait for more shadow updates:
```bash
curl "http://localhost:4002/api/v1/devices/$UUID/twin/anomalies?from=2025-10-01T00:00:00Z"
```

### Large database size
**Problem**: `device_shadow_history` table growing too large

**Solution**:
1. Reduce retention period: `SHADOW_RETENTION_DAYS=30`
2. Manually trigger cleanup: `POST /admin/shadow/cleanup`
3. Enable partitioning (see migration comments)

## Summary

Phase 4 completes the digital twin system with:
- ✅ Historical shadow tracking (database + MQTT integration)
- ✅ Time-series query API with statistics
- ✅ Anomaly detection using Z-score method
- ✅ Automated data retention scheduler
- ✅ Comprehensive testing suite

**Next Steps**: Test endpoints, adjust retention policy, integrate with monitoring dashboards!
