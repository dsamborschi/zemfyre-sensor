# Sensor Configuration Flow

## Overview

This document explains how sensor configurations flow from the dashboard to the agent, enabling dynamic sensor management without requiring agent restarts or environment variable changes.

## Architecture

```
Dashboard (React)
    ↓ POST /api/v1/devices/:uuid/sensor-config
API (Express)
    ↓ Saves to target_state.config.sensors[]
    ↓ Increments version
    ↓ Publishes event
PostgreSQL (target_state table)
    ↓ Agent polls every 60s
Agent (ContainerManager)
    ↓ Emits 'target-state-changed' event
Agent (handleConfigUpdate)
    ↓ Merges env + target state configs
    ↓ Restarts SensorPublishFeature
Sensor Pipelines Active
```

## Configuration Sources

The agent supports **two sources** for sensor configuration, with **target state taking precedence**:

### 1. Environment Variable (Fallback)
```bash
SENSOR_PUBLISH_CONFIG='{"enabled":true,"sensors":[{"name":"sensor1","addr":"/tmp/sensor1.sock",...}]}'
```

- **Use case**: Base configuration, default sensors
- **Priority**: Lower (overridden by target state)
- **Changes**: Requires container restart

### 2. Target State (Primary)
```json
{
  "config": {
    "sensors": [
      {
        "name": "modbus-temperature",
        "enabled": true,
        "addr": "\\\\.\\pipe\\modbus-temp",
        "eomDelimiter": "\\n",
        "mqttTopic": "sensor/temperature",
        "bufferCapacity": 131072,
        "publishInterval": 30000,
        ...
      }
    ]
  }
}
```

- **Use case**: Dynamic configuration via dashboard
- **Priority**: Higher (overrides env config)
- **Changes**: Applied within ~60s (next poll)

## Flow Details

### 1. User Adds Sensor via Dashboard

**Component**: `dashboard/src/components/sensors/AddSensorDialog.tsx`

```tsx
const config: SensorPipelineConfig = {
  name: "modbus-temperature",
  enabled: true,
  addr: "\\\\.\\pipe\\modbus-temp", // Windows named pipe
  eomDelimiter: "\\n",
  mqttTopic: "sensor/temperature",
  bufferCapacity: 131072,
  publishInterval: 30000,
  bufferTimeMs: 0,
  bufferSize: 0,
  addrPollSec: 10,
  heartbeatTimeSec: 300,
  mqttHeartbeatTopic: "sensor/temperature/heartbeat"
};

await fetch(`/api/v1/devices/${deviceUuid}/sensor-config`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(config)
});
```

### 2. API Stores Configuration

**File**: `api/src/routes/device-state.ts`

```typescript
// POST /api/v1/devices/:uuid/sensor-config
router.post('/:uuid/sensor-config', deviceAuth, async (req, res) => {
  const { uuid } = req.params;
  const sensorConfig = req.body;
  
  // Get current target state
  const targetState = await DeviceTargetStateModel.getByDeviceUuid(uuid);
  
  // Initialize sensors array if needed
  if (!targetState.config.sensors) {
    targetState.config.sensors = [];
  }
  
  // Check for duplicates
  const existingIndex = targetState.config.sensors.findIndex(
    (s: any) => s.name === sensorConfig.name
  );
  
  if (existingIndex >= 0) {
    return res.status(409).json({ error: 'Sensor with this name already exists' });
  }
  
  // Add new sensor
  targetState.config.sensors.push(sensorConfig);
  
  // Increment version (triggers agent update)
  targetState.version++;
  
  // Save to database
  await DeviceTargetStateModel.update(uuid, targetState);
  
  // Publish event
  eventPublisher.publish('sensor_config.added', {
    deviceUuid: uuid,
    sensorName: sensorConfig.name,
    timestamp: new Date()
  });
  
  res.json({ success: true });
});
```

### 3. Agent Polls Target State

**File**: `agent/src/sync-state.ts`

The `ContainerManager` polls the API every 60 seconds (configurable):

```typescript
private async pollTargetState(): Promise<void> {
  const response = await fetch(`${this.config.apiUrl}/api/v1/devices/${deviceUuid}/target-state`, {
    headers: {
      'if-none-match': this.targetStateETag // ETag for efficient polling
    }
  });
  
  if (response.status === 304) {
    // No changes
    return;
  }
  
  const newTargetState = await response.json();
  
  if (JSON.stringify(this.targetState) !== JSON.stringify(newTargetState)) {
    this.targetState = newTargetState;
    this.emit('target-state-changed', newTargetState);
  }
}
```

### 4. Agent Applies Configuration

**File**: `agent/src/agent.ts`

#### On Startup (initializeSensorPublish)

```typescript
private async initializeSensorPublish(): Promise<void> {
  // 1. Load sensors from environment variable (fallback)
  let envSensors: any[] = [];
  const sensorConfigStr = process.env.SENSOR_PUBLISH_CONFIG;
  if (sensorConfigStr) {
    const envConfig = JSON.parse(sensorConfigStr);
    envSensors = envConfig.sensors || [];
  }
  
  // 2. Load sensors from target state (primary)
  let targetStateSensors: any[] = [];
  const targetState = this.containerManager?.getTargetState();
  if (targetState?.config?.sensors) {
    targetStateSensors = targetState.config.sensors;
  }
  
  // 3. Merge: env as base, target state overrides/adds
  const mergedSensors = [...envSensors];
  for (const targetSensor of targetStateSensors) {
    const existingIndex = mergedSensors.findIndex(s => s.name === targetSensor.name);
    if (existingIndex >= 0) {
      mergedSensors[existingIndex] = targetSensor; // Override
    } else {
      mergedSensors.push(targetSensor); // Add new
    }
  }
  
  // 4. Initialize SensorPublishFeature
  const sensorConfig = {
    enabled: true,
    sensors: mergedSensors
  };
  
  this.sensorPublish = new SensorPublishFeature(
    sensorConfig,
    this.agentLogger,
    this.deviceInfo.uuid
  );
  
  await this.sensorPublish.start();
}
```

#### On Config Update (handleConfigUpdate)

```typescript
private async handleConfigUpdate(config: Record<string, any>): Promise<void> {
  // ... other config handling (logging, settings, features)
  
  // Sensors Config - Update dynamically
  if (config.sensors && Array.isArray(config.sensors) && this.sensorPublish) {
    // Get current config
    const currentConfig = (this.sensorPublish as any).config;
    const existingSensors = currentConfig.sensors || [];
    const targetSensors = config.sensors;
    
    // Merge configurations
    const mergedSensors = [...existingSensors];
    for (const targetSensor of targetSensors) {
      const existingIndex = mergedSensors.findIndex(s => s.name === targetSensor.name);
      if (existingIndex >= 0) {
        mergedSensors[existingIndex] = targetSensor; // Update
      } else {
        mergedSensors.push(targetSensor); // Add new
        this.agentLogger?.info('Added new sensor configuration', {
          sensorName: targetSensor.name,
          addr: targetSensor.addr
        });
      }
    }
    
    // Update config and restart
    currentConfig.sensors = mergedSensors;
    await this.sensorPublish.stop();
    await this.sensorPublish.start();
  }
}
```

## Configuration Schema

### Dashboard → API (SensorPipelineConfig)

```typescript
interface SensorPipelineConfig {
  name: string;                    // Unique identifier
  enabled: boolean;                // Enable/disable sensor
  addr: string;                    // Socket/pipe path
  eomDelimiter: string;            // End-of-message delimiter (e.g., "\\n")
  mqttTopic: string;               // MQTT topic to publish to
  bufferCapacity: number;          // Buffer size in bytes (default: 131072)
  publishInterval: number;         // Publish interval in ms (default: 30000)
  bufferTimeMs: number;            // Buffer time in ms (default: 0)
  bufferSize: number;              // Buffer size in messages (default: 0)
  addrPollSec: number;             // Address poll interval in sec (default: 10)
  heartbeatTimeSec: number;        // Heartbeat interval in sec (default: 300)
  mqttHeartbeatTopic: string;      // Heartbeat topic (default: {mqttTopic}/heartbeat)
}
```

### Agent (SensorConfig - Zod Schema)

**File**: `agent/src/features/sensor-publish/types.ts`

```typescript
export const SensorConfigSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  addr: z.string(),                              // Socket/pipe path
  addrPollSec: z.number().optional().default(10),
  publishInterval: z.number().optional().default(30000),
  bufferTimeMs: z.number().optional().default(0),
  bufferSize: z.number().optional().default(0),
  bufferCapacity: z.number().optional().default(128 * 1024),
  eomDelimiter: z.string(),
  mqttTopic: z.string(),
  mqttHeartbeatTopic: z.string().optional(),
  heartbeatTimeSec: z.number().optional().default(300)
});
```

**Note**: The dashboard and agent use the **same schema**, so configs pass through without transformation.

## Timing & Performance

### Polling Interval
- **Default**: 60 seconds (`POLL_INTERVAL_MS=60000`)
- **Configurable**: Via `config.settings.targetStatePollIntervalMs`
- **ETag optimization**: 304 Not Modified when no changes

### Configuration Apply Time
- **Total latency**: ~60 seconds (one poll cycle)
- **Restart time**: ~1-2 seconds (SensorPublishFeature stop/start)
- **No downtime**: Other agent features continue running

### Optimization: Webhook (Future)
For instant updates, consider implementing webhook notification:

```typescript
// API publishes to webhook endpoint
await fetch(`${agentWebhookUrl}/config-changed`, {
  method: 'POST',
  body: JSON.stringify({ version: newVersion })
});

// Agent immediately polls for changes
```

## Event Sourcing

All sensor config changes are recorded as events:

```typescript
// sensor_config.added
{
  deviceUuid: "5c629f26-8495-4747-86e3-c2d98851aa62",
  sensorName: "modbus-temperature",
  timestamp: "2025-01-15T10:30:00Z"
}

// sensor_config.updated
{
  deviceUuid: "5c629f26-8495-4747-86e3-c2d98851aa62",
  sensorName: "modbus-temperature",
  changes: { publishInterval: 30000 },
  timestamp: "2025-01-15T10:35:00Z"
}

// sensor_config.deleted
{
  deviceUuid: "5c629f26-8495-4747-86e3-c2d98851aa62",
  sensorName: "modbus-temperature",
  timestamp: "2025-01-15T10:40:00Z"
}
```

## Testing the Flow

### 1. Start Agent with Base Config

```bash
export SENSOR_PUBLISH_CONFIG='{"enabled":true,"sensors":[{"name":"base-sensor","addr":"/tmp/base.sock","eomDelimiter":"\\n","mqttTopic":"sensor/base"}]}'
docker-compose up -d agent
```

### 2. Add Sensor via Dashboard

1. Open dashboard: `http://localhost:5173`
2. Navigate to Sensor Health Dashboard
3. Click "Add Sensor"
4. Fill in configuration:
   - Name: `modbus-temperature`
   - Socket/Pipe: `\\\\.\\pipe\\modbus-temp`
   - MQTT Topic: `sensor/temperature`
5. Click "Add Sensor Pipeline"

### 3. Verify Configuration Applied

Check agent logs (~60 seconds later):

```
[INFO] Sensor configuration detected (sensorCount: 1)
[INFO] Added new sensor configuration (sensorName: modbus-temperature, addr: \\\\.\\pipe\\modbus-temp)
[INFO] Sensor configuration updated successfully (totalSensors: 2, targetStateSensors: 1)
[INFO] Sensor Publish Feature initialized (sensorsConfigured: 2, fromEnv: 1, fromTargetState: 1)
```

### 4. Verify MQTT Publishing

```bash
# Subscribe to sensor topics
mosquitto_sub -h localhost -p 1883 -t 'sensor/#' -v

# Should see messages from both sensors:
# sensor/base {"value":23.5,"timestamp":"2025-01-15T10:30:00Z"}
# sensor/temperature {"value":24.2,"timestamp":"2025-01-15T10:30:05Z"}
```

## Troubleshooting

### Sensor Not Appearing in Agent

**Symptom**: Added sensor via dashboard but agent logs show no changes.

**Checks**:
1. **Polling enabled**: Agent must be polling target state
   ```bash
   docker logs agent | grep "Starting target state polling"
   ```

2. **Target state updated**: Check API response
   ```bash
   curl http://localhost:3002/api/v1/devices/{uuid}/sensor-config
   # Should include your sensor
   ```

3. **Polling interval**: Wait at least 60 seconds after adding sensor

4. **Agent restart**: If needed, restart to force config reload
   ```bash
   docker-compose restart agent
   ```

### Sensor Config Invalid

**Symptom**: Agent logs show "Failed to update sensor configuration" error.

**Checks**:
1. **Zod validation**: Check sensor config matches schema
   - Required: `name`, `addr`, `eomDelimiter`, `mqttTopic`
   - Defaults applied for optional fields

2. **Duplicate names**: Sensor names must be unique per device

3. **Socket/pipe path**: Must be valid absolute path
   - Windows: `\\\\.\\pipe\\name` (named pipe)
   - Linux: `/tmp/name.sock` (unix socket)

### Sensor Not Publishing Data

**Symptom**: Sensor added successfully but no MQTT messages.

**Checks**:
1. **Protocol adapter running**: Check if adapter is writing to socket/pipe
   ```bash
   # Windows
   ls \\\\.\\pipe\\modbus-temp
   
   # Linux
   ls -la /tmp/modbus-temp.sock
   ```

2. **Socket permissions**: Agent must have read access

3. **Data format**: Protocol adapter must write CSV to socket/pipe

4. **MQTT connection**: Check agent MQTT connection
   ```bash
   docker logs agent | grep "MQTT"
   ```

## Best Practices

### 1. Naming Convention
- Use descriptive names: `modbus-temperature`, `can-pressure`
- Include protocol: `modbus-*`, `opcua-*`, `can-*`
- Avoid spaces: Use hyphens or underscores

### 2. Socket/Pipe Paths
- **Windows**: Use `\\\\.\\pipe\\<name>` for named pipes
- **Linux**: Use `/tmp/<name>.sock` for unix sockets
- Keep paths short and simple

### 3. MQTT Topics
- Use hierarchical structure: `sensor/type/location`
- Examples:
  - `sensor/temperature/room1`
  - `sensor/pressure/tank-a`
  - `sensor/humidity/greenhouse`

### 4. Intervals
- **Publish interval**: Balance freshness vs bandwidth (30s recommended)
- **Address poll**: Match protocol adapter output rate (10s default)
- **Heartbeat**: Long interval for connectivity checks (300s default)

### 5. Buffer Settings
- **Buffer capacity**: 128KB default (enough for ~4000 readings)
- **Buffer time**: 0ms (publish immediately, let MQTT handle batching)
- **Buffer size**: 0 (no message count limit)

## Future Enhancements

### 1. Sensor Deletion
Currently, sensors can only be added/updated. Future API endpoint:

```typescript
// DELETE /api/v1/devices/:uuid/sensor-config/:sensorName
router.delete('/:uuid/sensor-config/:sensorName', deviceAuth, async (req, res) => {
  const { uuid, sensorName } = req.params;
  
  const targetState = await DeviceTargetStateModel.getByDeviceUuid(uuid);
  const index = targetState.config.sensors.findIndex(s => s.name === sensorName);
  
  if (index < 0) {
    return res.status(404).json({ error: 'Sensor not found' });
  }
  
  targetState.config.sensors.splice(index, 1);
  targetState.version++;
  
  await DeviceTargetStateModel.update(uuid, targetState);
  
  eventPublisher.publish('sensor_config.deleted', {
    deviceUuid: uuid,
    sensorName,
    timestamp: new Date()
  });
  
  res.json({ success: true });
});
```

Agent needs to handle sensor removal:

```typescript
// In handleConfigUpdate
// Remove sensors not in target state
const targetSensorNames = new Set(targetSensors.map(s => s.name));
const filteredSensors = mergedSensors.filter(s => 
  targetSensorNames.has(s.name) || !targetSensors.length
);
```

### 2. Sensor Status Reporting
Agent reports sensor status back to API:

```typescript
// Current state includes sensor health
{
  "sensors": {
    "modbus-temperature": {
      "state": "CONNECTED",
      "messagesPublished": 1234,
      "lastPublishTime": "2025-01-15T10:30:00Z",
      "errors": 0
    }
  }
}
```

Dashboard shows real-time sensor status.

### 3. Configuration Validation
API validates sensor configs before saving:

```typescript
import { SensorConfigSchema } from '@agent/features/sensor-publish/types';

router.post('/:uuid/sensor-config', deviceAuth, async (req, res) => {
  try {
    const validatedConfig = SensorConfigSchema.parse(req.body);
    // ... save to database
  } catch (error) {
    return res.status(400).json({ 
      error: 'Invalid sensor configuration',
      details: error.errors
    });
  }
});
```

### 4. Webhook Notifications
API notifies agent immediately on config changes:

```typescript
// Agent exposes webhook endpoint
app.post('/webhook/config-changed', (req, res) => {
  const { version } = req.body;
  
  if (version > this.currentVersion) {
    // Immediately poll for changes
    this.pollTargetState();
  }
  
  res.json({ success: true });
});

// API calls webhook after saving
await fetch(`${agentWebhookUrl}/webhook/config-changed`, {
  method: 'POST',
  body: JSON.stringify({ version: newTargetState.version })
});
```

## Related Documentation

- **Sensor Publish Feature**: `agent/src/features/sensor-publish/README.md`
- **Protocol Adapters**: `docs/MODBUS-SENSOR-INTEGRATION.md`
- **Target State**: `docs/AUTOMATIC-DEFAULT-TARGET-STATE.md`
- **API Endpoints**: `api/docs/README.md`
- **Dashboard**: `dashboard/docs/README.md`
