# Sensor Health Monitoring API Implementation

## Overview
This document describes the API changes implemented to store and query sensor health data from devices.

## Database Changes

### Migration: 032_create_sensor_health_tables.sql
Location: `api/database/migrations/032_create_sensor_health_tables.sql`

**Tables Created:**

1. **sensor_health_history** - Stores time-series data for sensor connection health
   - Tracks connection status, errors, message stats, reconnection attempts
   - Indexed on (device_uuid, sensor_name, timestamp) for efficient queries
   - Auto-pruned after 30 days

2. **protocol_adapter_health_history** - Stores protocol adapter (Modbus/CAN/OPC-UA) device status
   - Tracks device connections, poll times, error counts
   - Indexed on (device_uuid, protocol_type, device_name, timestamp)
   - Auto-pruned after 30 days

**Views Created:**

1. **sensor_health_latest** - Latest status per device/sensor
   - Uses `DISTINCT ON (device_uuid, sensor_name)` for efficiency
   - Provides current health snapshot for dashboards

2. **protocol_adapter_health_latest** - Latest protocol adapter status
   - Uses `DISTINCT ON (device_uuid, protocol_type, device_name)`
   - Shows current Modbus/CAN/OPC-UA device connections

## API Changes

### 1. Device State Handler (api/src/routes/device-state.ts)

Added health data storage to `PATCH /api/v1/device/state` endpoint (line ~248):

**Sensor Health Storage:**
```typescript
if (deviceState.sensor_health && Array.isArray(deviceState.sensor_health)) {
  // Insert sensor health records into sensor_health_history
  // Fields: connected, healthy, messages stats, reconnect attempts, errors
}
```

**Protocol Adapter Health Storage:**
```typescript
if (deviceState.protocol_adapters_health) {
  // Insert protocol adapter records into protocol_adapter_health_history
  // Fields: protocol_type, device_name, connected, last_poll, error_count
}
```

### 2. New Sensor Routes (api/src/routes/sensors.ts)

Created comprehensive sensor health API endpoints:

#### GET /api/v1/devices/:uuid/sensors
List all sensors for a device with current status
```json
{
  "count": 2,
  "sensors": [
    {
      "device_uuid": "5c629f26-...",
      "sensor_name": "modbus-sensors",
      "connected": true,
      "healthy": true,
      "messages_received": 1250,
      "reconnect_attempts": 3,
      "last_error": null,
      "last_seen": "2025-01-15T10:30:00Z"
    }
  ]
}
```

#### GET /api/v1/devices/:uuid/sensors/:sensorName/history
Get sensor health history for time-series charts
- Query param: `?hours=24` (default)
- Returns last 1000 records within time range
- Use for uptime charts, error trends

#### GET /api/v1/sensors/unhealthy
Alert dashboard - all unhealthy sensors across all devices
```json
{
  "count": 3,
  "unhealthy_sensors": [
    {
      "device_uuid": "...",
      "device_name": "Factory Floor Pi",
      "sensor_name": "modbus-sensors",
      "connected": false,
      "last_error": "ECONNREFUSED",
      "last_error_time": "2025-01-15T10:25:00Z",
      "seconds_since_report": 320
    }
  ]
}
```

#### GET /api/v1/devices/:uuid/protocol-adapters
List protocol adapter devices (Modbus/CAN/OPC-UA)
```json
{
  "count": 4,
  "protocol_adapters": [
    {
      "device_uuid": "...",
      "protocol_type": "modbus",
      "device_name": "Temperature Controller",
      "connected": true,
      "last_poll": "2025-01-15T10:30:00Z",
      "error_count": 0
    }
  ]
}
```

#### GET /api/v1/devices/:uuid/protocol-adapters/:protocol/:deviceName/history
Protocol adapter health history for charts
- Query param: `?hours=24`
- Returns connection status, poll times, error counts over time

#### GET /api/v1/devices/:uuid/sensors/uptime
Sensor uptime statistics
```json
{
  "device_uuid": "...",
  "hours": 24,
  "sensors": [
    {
      "sensor_name": "modbus-sensors",
      "total_reports": 288,
      "connected_reports": 285,
      "uptime_percentage": 98.96,
      "max_reconnects": 3
    }
  ]
}
```

### 3. Server Registration (api/src/index.ts)

Added sensor routes to main API server:
```typescript
import sensorsRoutes from './routes/sensors';
app.use(API_BASE, sensorsRoutes);
```

## Data Flow

### Agent → API
1. Agent collects sensor stats from `sensor-publish` feature
2. Agent collects protocol adapter stats from `protocol-adapters` feature
3. Agent includes health data in state report every 10s:
   ```json
   {
     "device-uuid": {
       "apps": {...},
       "config": {...},
       "sensor_health": [
         {
           "name": "modbus-sensors",
           "connected": true,
           "healthy": true,
           "messagesReceived": 1250,
           "reconnectAttempts": 3
         }
       ],
       "protocol_adapters_health": {
         "modbus": [
           {
             "deviceName": "Temperature Controller",
             "connected": true,
             "lastPoll": "2025-01-15T10:30:00Z"
           }
         ]
       }
     }
   }
   ```
4. API receives report via `PATCH /api/v1/device/state`
5. API inserts records into history tables
6. Views automatically show latest status

### Dashboard → API
1. Dashboard queries `/api/v1/devices/:uuid/sensors` for current status
2. Dashboard queries `/api/v1/sensors/unhealthy` for alerts
3. Dashboard queries `/api/v1/devices/:uuid/sensors/:name/history` for charts
4. Dashboard queries `/api/v1/devices/:uuid/sensors/uptime` for statistics

## Deployment Steps

### 1. Run Database Migration
The migration will run automatically on API startup, or manually:

```bash
# Automatic (on API restart)
cd api && npm start

# Manual
kubectl exec -it <postgres-pod> -n customer-7f05d0d2 -- \
  psql -U iotistic -d iotistic < /path/to/032_create_sensor_health_tables.sql
```

### 2. Restart API
```bash
# Build
cd api && npm run build

# Restart (K8s)
kubectl rollout restart deployment/<api-deployment> -n customer-7f05d0d2

# Or port-forward for local testing
kubectl port-forward svc/customer-7f05d0d2-customer-instance-api 3002:3002 -n customer-7f05d0d2
```

### 3. Verify Agent Sends Data
Check agent is running with protocol adapters enabled:
```bash
# Agent should log:
📡 Recording sensor health for device 5c629f26... (1 sensors)
🔌 Recording protocol adapter health for device 5c629f26...
```

### 4. Test API Endpoints
```bash
# List sensors
curl http://localhost:3002/api/v1/devices/5c629f26-8495-4747-86e3-c2d98851aa62/sensors

# Get unhealthy sensors (alert dashboard)
curl http://localhost:3002/api/v1/sensors/unhealthy

# Get sensor history (for charts)
curl "http://localhost:3002/api/v1/devices/5c629f26-8495-4747-86e3-c2d98851aa62/sensors/modbus-sensors/history?hours=24"

# Get uptime statistics
curl http://localhost:3002/api/v1/devices/5c629f26-8495-4747-86e3-c2d98851aa62/sensors/uptime
```

## Dashboard Integration Examples

### Current Status List
```typescript
// Fetch all sensors for a device
const response = await fetch(`/api/v1/devices/${deviceUuid}/sensors`);
const { sensors } = await response.json();

// Display in table
sensors.map(sensor => (
  <Row>
    <Cell>{sensor.sensor_name}</Cell>
    <Cell><StatusBadge healthy={sensor.healthy} /></Cell>
    <Cell>{sensor.connected ? 'Connected' : 'Disconnected'}</Cell>
    <Cell>{sensor.messages_received}</Cell>
    <Cell>{sensor.reconnect_attempts}</Cell>
  </Row>
));
```

### Alert Dashboard
```typescript
// Fetch unhealthy sensors across all devices
const response = await fetch('/api/v1/sensors/unhealthy');
const { unhealthy_sensors } = await response.json();

// Show alerts
unhealthy_sensors.map(sensor => (
  <Alert severity="error">
    Device: {sensor.device_name}<br/>
    Sensor: {sensor.sensor_name}<br/>
    Error: {sensor.last_error}<br/>
    Offline for: {sensor.seconds_since_report}s
  </Alert>
));
```

### Uptime Chart
```typescript
// Fetch sensor history
const response = await fetch(
  `/api/v1/devices/${deviceUuid}/sensors/${sensorName}/history?hours=24`
);
const { history } = await response.json();

// Plot chart
<LineChart>
  <Line 
    data={history.map(h => ({ 
      time: h.timestamp, 
      value: h.connected ? 1 : 0 
    }))}
    dataKey="value"
    name="Connection Status"
  />
</LineChart>
```

## Testing Notes

### Current Status
- ✅ Migration created (032_create_sensor_health_tables.sql)
- ✅ API storage logic implemented (device-state.ts)
- ✅ API query endpoints created (sensors.ts)
- ✅ Routes registered in server (index.ts)
- ✅ TypeScript compilation successful
- ⏳ Migration needs to run (on API restart)
- ⏳ Agent needs to be tested with real Modbus devices

### Known Issues
- Modbus devices currently timing out (ETIMEDOUT to 192.168.1.100:502)
- Need to verify protocol adapter config path is correct
- Need to test with actual hardware once Modbus connection fixed

## Future Enhancements

1. **Alerting System**
   - Webhook notifications for sensor failures
   - Email alerts for prolonged disconnections
   - Slack/Discord integrations

2. **Dashboard Widgets**
   - Real-time sensor status cards
   - Historical uptime charts
   - Error log timeline
   - Reconnection frequency heatmap

3. **Analytics**
   - Sensor reliability scoring
   - MTBF (Mean Time Between Failures)
   - Network quality indicators (reconnection patterns)

4. **Retention Policies**
   - Archive old data to cold storage
   - Configurable retention per customer
   - Data export for analysis

## References

- Agent health tracking: `agent/src/features/sensor-publish/sensor.ts`
- ApiBinder reporting: `agent/src/sync-state.ts` (lines 682-735)
- Migration file: `api/database/migrations/032_create_sensor_health_tables.sql`
- API storage: `api/src/routes/device-state.ts` (lines 248-310)
- API queries: `api/src/routes/sensors.ts`
