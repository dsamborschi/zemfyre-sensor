# Sensor Health API - Quick Reference

## Primary Endpoints (Dashboard)

### 🎯 Device Health Overview (Most Important)
Shows actual Modbus/CAN/OPC-UA device connectivity - what users care about.

```http
GET /api/v1/devices/:deviceUuid/device-health
```

**Response**:
```json
{
  "summary": {
    "total": 3,
    "online": 2,
    "offline": 1,
    "errors": 1
  },
  "devices": [
    {
      "name": "temperature-sensor",
      "protocol": "modbus",
      "status": "offline|online|error",
      "connected": false,
      "lastPoll": "2025-10-30T02:35:00Z",
      "errorCount": 5,
      "lastError": "ETIMEDOUT",
      "lastSeen": "2025-10-30T02:35:00Z"
    }
  ]
}
```

**Use For**: Primary dashboard, device list page, overview cards

---

### 🚨 Unhealthy Sensors Alert
Cross-device query for all unhealthy sensors (alerting dashboard).

```http
GET /api/v1/sensors/unhealthy
```

**Response**:
```json
{
  "count": 2,
  "unhealthy_sensors": [
    {
      "device_uuid": "5c629f26-...",
      "sensor_name": "modbus-sensors",
      "healthy": false,
      "last_error": "No data in 60 seconds",
      "last_seen": "2025-10-30T02:35:00Z"
    }
  ]
}
```

**Use For**: Alert dashboard, monitoring page, notification system

---

## Secondary Endpoints (Advanced)

### 🔧 Combined View (Infrastructure Diagnostics)
Shows both device health AND pipeline infrastructure status.

```http
GET /api/v1/devices/:deviceUuid/sensors
```

**Response**:
```json
{
  "devices": [ /* protocol adapter devices */ ],
  "pipelines": [ /* sensor pipeline status */ ],
  "summary": {
    "totalDevices": 3,
    "connectedDevices": 2,
    "pipelinesHealthy": 1,
    "totalPipelines": 2
  }
}
```

**Use For**: Advanced diagnostics, troubleshooting, infrastructure monitoring

---

### 📊 Historical Data (Charts)
Time-series data for sensor health over time.

```http
GET /api/v1/devices/:deviceUuid/sensors/:sensorName/history?hours=24
```

**Query Params**:
- `hours` (default: 24) - How many hours of history to return
- `limit` (default: 1000) - Maximum number of records

**Response**:
```json
{
  "sensor": {
    "device_uuid": "5c629f26-...",
    "sensor_name": "modbus-sensors"
  },
  "history": [
    {
      "reported_at": "2025-10-30T02:35:00Z",
      "healthy": true,
      "state": "CONNECTED",
      "messages_received": 150,
      "reconnect_attempts": 0
    }
  ]
}
```

**Use For**: Charts, trend analysis, historical uptime

---

### 📊 Protocol Adapter History (Charts)
Time-series data for protocol adapter devices.

```http
GET /api/v1/devices/:deviceUuid/protocol-adapters/:protocolType/:deviceName/history?hours=24
```

**Example**: `/api/v1/devices/5c629f26.../protocol-adapters/modbus/temperature-sensor/history?hours=24`

**Response**:
```json
{
  "device": {
    "device_uuid": "5c629f26-...",
    "protocol_type": "modbus",
    "device_name": "temperature-sensor"
  },
  "history": [
    {
      "reported_at": "2025-10-30T02:35:00Z",
      "connected": true,
      "error_count": 0,
      "last_error": null
    }
  ]
}
```

**Use For**: Device detail pages, error trend analysis

---

### 📋 List Protocol Adapters
List all protocol adapter devices (raw data).

```http
GET /api/v1/devices/:deviceUuid/protocol-adapters
```

**Query Params**:
- `protocolType` (optional) - Filter by protocol: `modbus`, `can`, `opcua`

**Response**:
```json
{
  "count": 3,
  "protocol_adapters": [
    {
      "device_uuid": "5c629f26-...",
      "protocol_type": "modbus",
      "device_name": "temperature-sensor",
      "connected": false,
      "last_poll": "2025-10-30T02:35:00Z",
      "error_count": 5,
      "last_error": "ETIMEDOUT",
      "reported_at": "2025-10-30T02:35:00Z"
    }
  ]
}
```

**Use For**: Raw data access, exports, integrations

---

## Dashboard Usage Examples

### 1. Device Health Card

```typescript
const { summary } = await fetch(`/api/v1/devices/${uuid}/device-health`).then(r => r.json());

<CardGrid>
  <Card title="Total" value={summary.total} />
  <Card title="Online" value={summary.online} color="green" icon="✅" />
  <Card title="Offline" value={summary.offline} color="red" icon="❌" />
  <Card title="Errors" value={summary.errors} color="yellow" icon="⚠️" />
</CardGrid>
```

### 2. Device Table

```typescript
const { devices } = await fetch(`/api/v1/devices/${uuid}/device-health`).then(r => r.json());

<Table>
  {devices.map(d => (
    <tr key={d.name}>
      <td>{d.name}</td>
      <td><Badge>{d.protocol}</Badge></td>
      <td><Status status={d.status} /></td>
      <td>{d.lastError || '-'}</td>
    </tr>
  ))}
</Table>
```

### 3. Alert Banner

```typescript
const { unhealthy_sensors } = await fetch('/api/v1/sensors/unhealthy').then(r => r.json());

{unhealthy_sensors.length > 0 && (
  <AlertBanner severity="error">
    ⚠️ {unhealthy_sensors.length} sensor(s) unhealthy
  </AlertBanner>
)}
```

### 4. Historical Chart

```typescript
const { history } = await fetch(
  `/api/v1/devices/${uuid}/sensors/${name}/history?hours=24`
).then(r => r.json());

<LineChart
  data={history.map(h => ({
    time: h.reported_at,
    uptime: h.healthy ? 1 : 0
  }))}
/>
```

---

## Health Status Logic

### Sensor Pipeline Health
```
✅ Healthy: Connected AND receiving data in last 60 seconds
⚠️ Degraded: Connected BUT no data (protocol adapter issue)
❌ Unhealthy: Disconnected (infrastructure failure)
```

### Protocol Adapter Device Health
```
✅ Online: connected = true, error_count = 0
⚠️ Error: error_count > 0 (intermittent issues)
❌ Offline: connected = false (device unreachable)
```

---

## Testing Commands

```bash
# Primary dashboard endpoint
curl http://7f05d0d2.localhost/api/v1/devices/5c629f26-8495-4747-86e3-c2d98851aa62/device-health

# Alert endpoint
curl http://7f05d0d2.localhost/api/v1/sensors/unhealthy

# Combined view
curl http://7f05d0d2.localhost/api/v1/devices/5c629f26-8495-4747-86e3-c2d98851aa62/sensors

# Historical data
curl 'http://7f05d0d2.localhost/api/v1/devices/5c629f26-8495-4747-86e3-c2d98851aa62/sensors/modbus-sensors/history?hours=24'
```

---

## Database Queries (Direct Access)

```sql
-- Latest sensor health
SELECT * FROM sensor_health_latest WHERE device_uuid = '5c629f26-...';

-- Latest protocol adapter health
SELECT * FROM protocol_adapter_health_latest WHERE device_uuid = '5c629f26-...';

-- Historical sensor data (24 hours)
SELECT * FROM sensor_health_history 
WHERE device_uuid = '5c629f26-...' 
  AND reported_at > NOW() - INTERVAL '24 hours'
ORDER BY reported_at DESC;

-- All unhealthy sensors
SELECT * FROM sensor_health_latest WHERE healthy = false;

-- Device uptime percentage (last 24 hours)
SELECT 
  sensor_name,
  COUNT(*) FILTER (WHERE healthy = true) * 100.0 / COUNT(*) as uptime_percent
FROM sensor_health_history
WHERE device_uuid = '5c629f26-...'
  AND reported_at > NOW() - INTERVAL '24 hours'
GROUP BY sensor_name;
```

---

## Endpoint Priority

**For Dashboard Development**:
1. 🎯 `GET /device-health` - Start here (primary view)
2. 🚨 `GET /sensors/unhealthy` - Add alerts
3. 📊 `GET /sensors/:name/history` - Add charts
4. 🔧 `GET /sensors` - Advanced diagnostics (optional)

**For Mobile App**:
- Use `GET /device-health` for summary
- Use `GET /sensors/unhealthy` for push notifications
- Poll every 30 seconds for real-time updates

**For Integrations**:
- Use `GET /protocol-adapters` for raw data access
- Use webhooks with `/sensors/unhealthy` for alerts
