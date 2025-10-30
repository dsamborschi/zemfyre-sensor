# Sensor Health Monitoring - Complete Implementation

**Date**: October 30, 2025  
**Status**: ✅ Complete - Ready for Testing

---

## Overview

Implemented two-tier sensor health monitoring system:
1. **Protocol Adapter Device Health** (Primary) - Shows actual Modbus/CAN/OPC-UA device connectivity
2. **Sensor Pipeline Health** (Secondary) - Shows named pipe/socket infrastructure status

This gives users actionable insights: "Is my temperature sensor working?" rather than just "Is my data pipeline connected?"

---

## Architecture

### Two-Tier Health Monitoring

```
┌─────────────────────────────────────────────────────────────┐
│                     USER DASHBOARD                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PRIMARY: Protocol Adapter Device Health                   │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Temperature Sensor (Modbus) ❌ Offline             │   │
│  │ └─ Error: ETIMEDOUT - Connection timeout          │   │
│  │ Pressure Sensor (Modbus)    ✅ Online              │   │
│  │ Flow Meter (CAN)            ✅ Online              │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
│  SECONDARY: Pipeline Infrastructure                        │
│  ┌────────────────────────────────────────────────────┐   │
│  │ ▼ Data Pipeline Health                            │   │
│  │   └─ modbus-sensors: ⚠️ Connected but no data     │   │
│  │   └─ can-sensors: ✅ Healthy (50 msgs, 5s ago)    │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. Agent: Smart Health Indicators

**File**: `agent/src/features/sensor-publish/sensor-publish-feature.ts`

**Smart Health Logic**:
```typescript
// Healthy if: connected to pipe AND receiving data flow
const hasRecentData = lastPublishTime && 
  (now - lastPublishTime) < 60000; // 60 seconds

const isHealthy = sensorState === 'CONNECTED' && 
  (hasRecentData || messagesReceived === 0); // Allow startup period
```

**What This Detects**:
- ✅ **Healthy**: Pipe connected + data flowing (protocol adapters working)
- ⚠️ **Degraded**: Pipe connected but no data (protocol adapter failure)
- ❌ **Unhealthy**: Pipe disconnected (infrastructure failure)

**Benefits**:
- Catches protocol adapter failures even when pipe infrastructure is healthy
- Users see meaningful health status: "No data in 60 seconds = problem"
- Eliminates false positives: "Connected" doesn't mean "working"

---

### 2. Agent: Initialization Order Fix

**File**: `agent/src/agent.ts`

**Problem**: ApiBinder was initialized BEFORE sensor-publish and protocol-adapters, so it received `undefined` for both features.

**Solution**: Reordered initialization:
```typescript
// OLD ORDER (broken):
// 1. Initialize ApiBinder (sensorPublish undefined!)
// 2. Initialize sensor-publish feature
// 3. Initialize protocol-adapters feature

// NEW ORDER (fixed):
// 1. Load config and calculate settings
// 2. Initialize sensor-publish feature ✅
// 3. Initialize protocol-adapters feature ✅
// 4. Initialize ApiBinder (now has access to features!)
```

**Result**: ApiBinder can now read sensor health and protocol adapter status for state reports.

---

### 3. Agent: Error Tracking Enhancement

**File**: `agent/src/features/sensor-publish/sensor.ts`

**Change**: Keep `lastError` even after successful connection (don't clear it)

**Before**:
```typescript
this.stats.lastError = undefined; // Cleared on connect - lost debugging info!
```

**After**:
```typescript
// Keep lastError for debugging - don't clear it on successful connection
// This allows us to see what errors occurred before connection succeeded
```

**Benefits**:
- See historical errors even after connection recovers
- Better debugging: "What went wrong before it started working?"
- Error patterns visible: "Always errors on startup then recovers"

---

### 4. API: Database Storage Fix

**File**: `api/src/routes/device-state.ts`

**Problem**: API expected `sensor_health` as array, but agent sends object format

**Agent Format**:
```json
{
  "sensor_health": {
    "modbus-sensors": {
      "state": "CONNECTED",
      "healthy": true,
      "lastError": "Connection timeout",
      ...stats
    }
  }
}
```

**Fixed Parsing**:
```typescript
// Parse sensor_health as object: { sensorName: {...stats} }
if (deviceState.sensor_health && typeof deviceState.sensor_health === 'object') {
  const sensorNames = Object.keys(deviceState.sensor_health);
  
  for (const sensorName of sensorNames) {
    const sensor = deviceState.sensor_health[sensorName];
    // Insert into sensor_health_history...
  }
}
```

---

### 5. API: Enhanced Dashboard Endpoints

**File**: `api/src/routes/sensors.ts`

#### Primary Endpoint: Device Health Overview

**GET `/api/v1/devices/:deviceUuid/device-health`**

Shows protocol adapter devices (what users care about):

```json
{
  "deviceUuid": "5c629f26-8495-4747-86e3-c2d98851aa62",
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
      "status": "offline",
      "connected": false,
      "lastPoll": "2025-10-30T02:30:00Z",
      "errorCount": 5,
      "lastError": "ETIMEDOUT: Connection timeout",
      "lastSeen": "2025-10-30T02:35:00Z"
    },
    {
      "name": "pressure-sensor",
      "protocol": "modbus",
      "status": "online",
      "connected": true,
      "lastPoll": "2025-10-30T02:35:00Z",
      "errorCount": 0,
      "lastError": null,
      "lastSeen": "2025-10-30T02:35:00Z"
    }
  ]
}
```

**Dashboard Usage**:
```typescript
// Fetch device health
const response = await fetch(`/api/v1/devices/${deviceUuid}/device-health`);
const { summary, devices } = await response.json();

// Show summary card
<SummaryCard>
  <Stat label="Total Devices" value={summary.total} />
  <Stat label="Online" value={summary.online} color="green" />
  <Stat label="Offline" value={summary.offline} color="red" />
  <Stat label="Errors" value={summary.errors} color="yellow" />
</SummaryCard>

// Show device table
<DeviceHealthTable devices={devices} />
```

#### Secondary Endpoint: Combined View

**GET `/api/v1/devices/:deviceUuid/sensors`**

Shows both device health AND pipeline infrastructure:

```json
{
  "devices": [
    {
      "name": "temperature-sensor",
      "protocol": "modbus",
      "connected": false,
      "errorCount": 5,
      "lastError": "ETIMEDOUT"
    }
  ],
  "pipelines": [
    {
      "name": "modbus-sensors",
      "state": "CONNECTED",
      "healthy": false,  // No recent data!
      "messagesReceived": 150,
      "lastActivity": "2025-10-30T02:30:00Z"
    }
  ],
  "summary": {
    "totalDevices": 3,
    "connectedDevices": 2,
    "pipelinesHealthy": 1,
    "totalPipelines": 2
  }
}
```

**Dashboard Usage**: Advanced diagnostics page showing infrastructure details

#### Alerting Endpoint: Unhealthy Sensors

**GET `/api/v1/sensors/unhealthy`**

Cross-device query for all unhealthy sensors:

```json
{
  "count": 2,
  "unhealthy_sensors": [
    {
      "device_uuid": "5c629f26-8495-4747-86e3-c2d98851aa62",
      "sensor_name": "modbus-sensors",
      "healthy": false,
      "last_error": "No data in 60 seconds",
      "last_seen": "2025-10-30T02:35:00Z"
    }
  ]
}
```

**Dashboard Usage**: Global alert dashboard, monitoring page

---

## Dashboard Implementation Guide

### Recommended Page Structure

#### 1. Device Health Dashboard (Primary View)

```typescript
// pages/device-health.tsx
import { useState, useEffect } from 'react';

function DeviceHealthDashboard({ deviceUuid }) {
  const [health, setHealth] = useState(null);
  
  useEffect(() => {
    fetch(`/api/v1/devices/${deviceUuid}/device-health`)
      .then(r => r.json())
      .then(setHealth);
  }, [deviceUuid]);
  
  if (!health) return <Loading />;
  
  return (
    <div>
      <h1>Device Health</h1>
      
      {/* Summary Cards */}
      <SummaryGrid>
        <Card title="Total Devices" value={health.summary.total} />
        <Card title="Online" value={health.summary.online} color="green" icon="✅" />
        <Card title="Offline" value={health.summary.offline} color="red" icon="❌" />
        <Card title="Errors" value={health.summary.errors} color="yellow" icon="⚠️" />
      </SummaryGrid>
      
      {/* Device Table */}
      <DeviceTable>
        <thead>
          <tr>
            <th>Device Name</th>
            <th>Protocol</th>
            <th>Status</th>
            <th>Last Poll</th>
            <th>Errors</th>
            <th>Last Error</th>
          </tr>
        </thead>
        <tbody>
          {health.devices.map(device => (
            <tr key={device.name}>
              <td>{device.name}</td>
              <td><Badge>{device.protocol}</Badge></td>
              <td>
                {device.status === 'online' && <StatusBadge color="green">✅ Online</StatusBadge>}
                {device.status === 'offline' && <StatusBadge color="red">❌ Offline</StatusBadge>}
                {device.status === 'error' && <StatusBadge color="yellow">⚠️ Error</StatusBadge>}
              </td>
              <td><RelativeTime time={device.lastPoll} /></td>
              <td>{device.errorCount}</td>
              <td>{device.lastError || '-'}</td>
            </tr>
          ))}
        </tbody>
      </DeviceTable>
      
      {/* Expandable: Pipeline Infrastructure Details */}
      <Collapsible title="🔧 Advanced Diagnostics">
        <PipelineHealthView deviceUuid={deviceUuid} />
      </Collapsible>
    </div>
  );
}
```

#### 2. Alert Dashboard (Cross-Device View)

```typescript
// pages/alerts.tsx
function AlertDashboard() {
  const [unhealthy, setUnhealthy] = useState([]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/v1/sensors/unhealthy')
        .then(r => r.json())
        .then(data => setUnhealthy(data.unhealthy_sensors));
    }, 5000); // Poll every 5 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div>
      <h1>🚨 Active Alerts</h1>
      {unhealthy.length === 0 ? (
        <EmptyState>✅ All sensors healthy</EmptyState>
      ) : (
        <AlertList>
          {unhealthy.map(sensor => (
            <AlertCard key={`${sensor.device_uuid}-${sensor.sensor_name}`}>
              <AlertIcon severity="error">⚠️</AlertIcon>
              <AlertContent>
                <AlertTitle>
                  {sensor.sensor_name} on device {sensor.device_uuid.substring(0, 8)}
                </AlertTitle>
                <AlertDescription>
                  {sensor.last_error}
                </AlertDescription>
                <AlertTimestamp>
                  Last seen: <RelativeTime time={sensor.last_seen} />
                </AlertTimestamp>
              </AlertContent>
            </AlertCard>
          ))}
        </AlertList>
      )}
    </div>
  );
}
```

#### 3. Device Detail Page (Historical Charts)

```typescript
// pages/device-detail.tsx
import { Line } from 'react-chartjs-2';

function DeviceDetailPage({ deviceUuid, deviceName }) {
  const [history, setHistory] = useState([]);
  
  useEffect(() => {
    fetch(`/api/v1/devices/${deviceUuid}/protocol-adapters/${deviceName}/history?hours=24`)
      .then(r => r.json())
      .then(data => setHistory(data.history));
  }, [deviceUuid, deviceName]);
  
  const chartData = {
    labels: history.map(h => new Date(h.reported_at)),
    datasets: [
      {
        label: 'Connection Status',
        data: history.map(h => h.connected ? 1 : 0),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
      },
      {
        label: 'Error Count',
        data: history.map(h => h.error_count),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
      }
    ]
  };
  
  return (
    <div>
      <h1>{deviceName} - 24 Hour History</h1>
      <Line data={chartData} />
    </div>
  );
}
```

---

## Testing Checklist

### Agent Tests

- [x] Agent builds successfully
- [x] ApiBinder receives sensorPublish and protocolAdapters references
- [x] Sensor health includes smart `healthy` flag (checks recent data)
- [x] `lastError` preserved after connection succeeds
- [ ] State reports include `sensor_health` object
- [ ] State reports include `protocol_adapters_health` object
- [ ] Test with real Modbus device (currently timing out)

### API Tests

- [x] API builds successfully
- [x] Migration creates sensor_health_history table
- [x] Migration creates protocol_adapter_health_history table
- [x] Migration creates views (sensor_health_latest, protocol_adapter_health_latest)
- [ ] API parses sensor_health object from state reports
- [ ] API inserts sensor health records into database
- [ ] API inserts protocol adapter records into database
- [ ] GET /device-health endpoint returns device list with status
- [ ] GET /sensors endpoint returns combined view
- [ ] GET /sensors/unhealthy returns cross-device alerts

### Database Tests

```sql
-- Check tables exist
\dt sensor_health*
\dt protocol_adapter*

-- Check views exist
\dv sensor_health_latest
\dv protocol_adapter_health_latest

-- Check for data (after agent reports)
SELECT COUNT(*) FROM sensor_health_history;
SELECT * FROM sensor_health_latest;

SELECT COUNT(*) FROM protocol_adapter_health_history;
SELECT * FROM protocol_adapter_health_latest;
```

### Integration Tests

```bash
# 1. Start agent with protocol adapters
cd agent && npm run dev

# 2. Wait 15 seconds for state report

# 3. Query database
kubectl exec -it -n customer-7f05d0d2 deployment/customer-7f05d0d2-customer-instance-postgres -- \
  psql -U iotistic -d iotistic -c "SELECT * FROM sensor_health_latest;"

# 4. Test API endpoint
curl http://7f05d0d2.localhost/api/v1/devices/5c629f26-8495-4747-86e3-c2d98851aa62/device-health

# 5. Test unhealthy sensors endpoint
curl http://7f05d0d2.localhost/api/v1/sensors/unhealthy
```

---

## Next Steps

1. **Restart API Deployment** (if using K8s):
   ```bash
   kubectl rollout restart deployment/customer-7f05d0d2-customer-instance-api -n customer-7f05d0d2
   ```

2. **Restart Agent** (to apply initialization order fix):
   ```bash
   # Stop current agent
   # Start with updated code
   cd agent && npm run dev
   ```

3. **Wait 15 Seconds** for agent to send state report with sensor health

4. **Verify Database**:
   ```bash
   kubectl exec -it -n customer-7f05d0d2 deployment/customer-7f05d0d2-customer-instance-postgres -- \
     psql -U iotistic -d iotistic -c "SELECT * FROM sensor_health_latest;"
   ```

5. **Test Dashboard Endpoints**:
   ```bash
   # Primary view
   curl http://7f05d0d2.localhost/api/v1/devices/5c629f26-8495-4747-86e3-c2d98851aa62/device-health
   
   # Combined view
   curl http://7f05d0d2.localhost/api/v1/devices/5c629f26-8495-4747-86e3-c2d98851aa62/sensors
   
   # Alerts
   curl http://7f05d0d2.localhost/api/v1/sensors/unhealthy
   ```

6. **Build Dashboard UI** (React components from guide above)

---

## Summary

✅ **Agent Changes**:
- Smart health indicators (checks data flow, not just connection)
- Fixed initialization order (ApiBinder now has access to features)
- Preserved error history (don't clear lastError on connect)

✅ **API Changes**:
- Fixed sensor_health parsing (object format, not array)
- Enhanced dashboard endpoints (device-health primary view)
- Separated device health (primary) from pipeline health (secondary)

✅ **Database**:
- Two history tables (sensor_health, protocol_adapter_health)
- Two views for efficient queries (latest status)
- Comprehensive indexes for dashboard performance

🎯 **User Value**:
- See actual device status: "Temperature sensor offline"
- Actionable errors: "ETIMEDOUT - check network"
- Historical trends: "24-hour uptime chart"
- Alert dashboard: "All unhealthy sensors across all devices"

📊 **Dashboard Priority**:
1. **Primary**: Protocol adapter device health (what users care about)
2. **Secondary**: Sensor pipeline infrastructure (for diagnostics)
3. **Alerts**: Cross-device unhealthy sensors (for monitoring)
