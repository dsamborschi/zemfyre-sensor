# Process Metrics API Documentation

## Overview
API endpoints for retrieving device process metrics (current and historical).

---

## Endpoints

### 1. Get Current Top Processes

Retrieves the most recent top processes for a device.

**Endpoint**: `GET /api/v1/devices/:uuid/processes`

**Parameters**:
- `uuid` (path, required): Device UUID

**Response**:
```json
{
  "device_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "top_processes": [
    {
      "pid": 1234,
      "name": "node",
      "cpu": 18.5,
      "mem": 12.3,
      "command": "node /app/server.js"
    },
    {
      "pid": 5678,
      "name": "postgres",
      "cpu": 12.2,
      "mem": 8.7,
      "command": "postgres: main process"
    }
  ],
  "is_online": true,
  "last_updated": "2025-10-19T14:30:00Z"
}
```

**Status Codes**:
- `200 OK`: Success
- `404 Not Found`: Device not found
- `500 Internal Server Error`: Server error

**Example**:
```bash
curl http://localhost:4002/api/v1/devices/550e8400-e29b-41d4-a716-446655440000/processes
```

---

### 2. Get Historical Process Metrics

Retrieves time-series process metrics for trend analysis.

**Endpoint**: `GET /api/v1/devices/:uuid/processes/history`

**Parameters**:
- `uuid` (path, required): Device UUID
- `hours` (query, optional): Hours of history to retrieve (default: 24)
- `limit` (query, optional): Maximum number of records (default: 50)

**Response**:
```json
{
  "device_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "count": 48,
  "history": [
    {
      "top_processes": [
        {
          "pid": 1234,
          "name": "node",
          "cpu": 18.5,
          "mem": 12.3,
          "command": "node /app/server.js"
        }
      ],
      "recorded_at": "2025-10-19T14:30:00Z"
    },
    {
      "top_processes": [
        {
          "pid": 1234,
          "name": "node",
          "cpu": 16.2,
          "mem": 11.8,
          "command": "node /app/server.js"
        }
      ],
      "recorded_at": "2025-10-19T14:25:00Z"
    }
  ]
}
```

**Status Codes**:
- `200 OK`: Success
- `500 Internal Server Error`: Server error

**Examples**:
```bash
# Last 24 hours (default)
curl http://localhost:4002/api/v1/devices/550e8400-e29b-41d4-a716-446655440000/processes/history

# Last 6 hours
curl "http://localhost:4002/api/v1/devices/550e8400-e29b-41d4-a716-446655440000/processes/history?hours=6"

# Last 12 hours, max 30 records
curl "http://localhost:4002/api/v1/devices/550e8400-e29b-41d4-a716-446655440000/processes/history?hours=12&limit=30"
```

---

## Data Types

### ProcessInfo
```typescript
{
  pid: number;           // Process ID
  name: string;          // Process name (e.g., "node", "postgres")
  cpu: number;           // CPU usage percentage (0-100)
  mem: number;           // Memory usage percentage (0-100)
  command: string;       // Full command line
}
```

---

## Usage Patterns

### Real-Time Monitoring
Poll the current processes endpoint every 5-10 seconds:

```javascript
setInterval(async () => {
  const response = await fetch(
    `http://localhost:4002/api/v1/devices/${deviceId}/processes`
  );
  const data = await response.json();
  updateProcessTable(data.top_processes);
}, 5000);
```

### Historical Analysis
Fetch historical data for charts with appropriate time range:

```javascript
const hours = timePeriod === '30min' ? 1 : 
              timePeriod === '6h' ? 6 : 
              timePeriod === '12h' ? 12 : 24;

const response = await fetch(
  `http://localhost:4002/api/v1/devices/${deviceId}/processes/history?hours=${hours}&limit=50`
);
const data = await response.json();
renderChart(data.history);
```

---

## Notes

1. **Data Freshness**: Process data is collected by the agent every 5 minutes (configurable via `METRICS_INTERVAL`)
2. **Top 10 Processes**: Only the top 10 processes by weighted score (60% CPU + 40% Memory) are tracked
3. **Storage**: Historical data is stored in PostgreSQL with JSONB format for flexibility
4. **Retention**: Historical metrics are retained for 30 days by default
5. **Performance**: GIN indexes on JSONB columns ensure fast queries even with large datasets

---

## Error Handling

### Device Not Found
```json
{
  "error": "Device not found",
  "message": "Device 550e8400-e29b-41d4-a716-446655440000 not found"
}
```

### No Process Data
```json
{
  "device_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "top_processes": [],
  "is_online": true,
  "last_updated": "2025-10-19T14:30:00Z"
}
```

### Server Error
```json
{
  "error": "Failed to get top processes",
  "message": "Database connection error"
}
```

---

## Integration Example

### React Component
```typescript
import { useState, useEffect } from 'react';

function ProcessMonitor({ deviceId }: { deviceId: string }) {
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProcesses = async () => {
      try {
        const res = await fetch(
          `http://localhost:4002/api/v1/devices/${deviceId}/processes`
        );
        const data = await res.json();
        setProcesses(data.top_processes || []);
      } catch (error) {
        console.error('Failed to fetch processes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProcesses();
    const interval = setInterval(fetchProcesses, 5000);
    return () => clearInterval(interval);
  }, [deviceId]);

  if (loading) return <div>Loading...</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>Process</th>
          <th>PID</th>
          <th>CPU %</th>
          <th>Memory %</th>
        </tr>
      </thead>
      <tbody>
        {processes.map((proc) => (
          <tr key={proc.pid}>
            <td>{proc.name}</td>
            <td>{proc.pid}</td>
            <td>{proc.cpu.toFixed(1)}%</td>
            <td>{proc.mem.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## See Also

- [Main Implementation Documentation](./TOP-PROCESS-METRICS-IMPLEMENTATION.md)
- [Device State API](../api/src/routes/device-state.ts)
- [System Metrics Collection](../agent/src/system-metrics.ts)
