# Service Control via Replicas - Quick Reference

## Overview

Services are now controlled declaratively using the `replicas` field, similar to Kubernetes. This allows you to start, stop, and scale services by simply changing a number in the target state.

## The `replicas` Field

```typescript
{
  "apps": {
    "web": {
      "serviceName": "web",
      "image": "nginx:latest",
      "replicas": 1,  // ← Controls service state
      ...
    }
  }
}
```

### Values
- `replicas: 0` - Service is **stopped** (containers removed, config preserved)
- `replicas: 1` - Service is **running** (1 instance)
- `replicas: undefined` - Defaults to **1** (backwards compatible)
- `replicas: 2+` - **Future**: Multiple instances (K3s orchestrator only)

## Common Operations

### Stop a Service
```typescript
// Set replicas to 0
await DeviceTargetStateModel.set(deviceUuid, {
  "web": {
    serviceName: "web",
    image: "nginx:latest",
    replicas: 0,  // ← Service will stop
    environment: { ... },
    ports: ["80:80"]
  }
});

// Agent polls in 60s → Reconciliation stops & removes container
// Config is preserved in database
```

### Start a Service
```typescript
// Set replicas to 1+ (or remove the field)
await DeviceTargetStateModel.set(deviceUuid, {
  "web": {
    serviceName: "web",
    image: "nginx:latest",
    replicas: 1,  // ← Service will start
    environment: { ... },
    ports: ["80:80"]
  }
});

// Agent polls → Reconciliation starts container
```

### Restart a Service (Two Options)

**Option 1: Quick (Direct API - Current Method)**
```typescript
// Via device-api actions (bypasses target state)
POST /v2/device/services/web/restart
// Immediately restarts without changing target state
```

**Option 2: Declarative (Target State - Recommended)**
```typescript
// Stop (replicas: 0) then Start (replicas: 1)
// 1. Stop
await DeviceTargetStateModel.set(deviceUuid, {
  "web": { ...config, replicas: 0 }
});
await wait(2000); // Wait for agent to poll & stop

// 2. Start
await DeviceTargetStateModel.set(deviceUuid, {
  "web": { ...config, replicas: 1 }
});
```

### Update Service Configuration
```typescript
// Change any config - reconciliation will recreate container
await DeviceTargetStateModel.set(deviceUuid, {
  "web": {
    serviceName: "web",
    image: "nginx:1.25",  // ← Update image
    replicas: 1,
    environment: {
      ...existing,
      "DEBUG": "true"  // ← Add env var
    },
    ports: ["8080:80"]  // ← Change port
  }
});

// Agent polls → Container recreated with new config
```

## API Endpoint Patterns

### Cloud API (Recommended)

```typescript
// api/src/routes/apps.ts

// Stop service
router.post('/devices/:uuid/apps/:appName/stop', async (req, res) => {
  const { uuid, appName } = req.params;
  
  const targetState = await DeviceTargetStateModel.get(uuid);
  const apps = targetState?.apps || {};
  
  // Set replicas to 0
  apps[appName] = {
    ...apps[appName],
    replicas: 0
  };
  
  await DeviceTargetStateModel.set(uuid, apps);
  
  // Optional: MQTT notification for immediate action
  await mqttClient.publish(
    `device/${uuid}/target-state/update`,
    JSON.stringify({ apps })
  );
  
  res.json({ success: true, message: 'Service will stop' });
});

// Start service
router.post('/devices/:uuid/apps/:appName/start', async (req, res) => {
  const { uuid, appName } = req.params;
  const { replicas = 1 } = req.body;
  
  const targetState = await DeviceTargetStateModel.get(uuid);
  const apps = targetState?.apps || {};
  
  // Set replicas to desired count
  apps[appName] = {
    ...apps[appName],
    replicas
  };
  
  await DeviceTargetStateModel.set(uuid, apps);
  
  await mqttClient.publish(
    `device/${uuid}/target-state/update`,
    JSON.stringify({ apps })
  );
  
  res.json({ success: true, message: `Service will start with ${replicas} replicas` });
});

// Scale service (future K3s)
router.post('/devices/:uuid/apps/:appName/scale', async (req, res) => {
  const { uuid, appName } = req.params;
  const { replicas } = req.body;
  
  if (typeof replicas !== 'number' || replicas < 0) {
    return res.status(400).json({ error: 'Invalid replicas count' });
  }
  
  const targetState = await DeviceTargetStateModel.get(uuid);
  const apps = targetState?.apps || {};
  
  apps[appName] = {
    ...apps[appName],
    replicas
  };
  
  await DeviceTargetStateModel.set(uuid, apps);
  
  await mqttClient.publish(
    `device/${uuid}/target-state/update`,
    JSON.stringify({ apps })
  );
  
  res.json({ 
    success: true, 
    message: `Service will scale to ${replicas} replicas` 
  });
});
```

## Reconciliation Flow

```
1. User/API changes target state in database
   └─> DeviceTargetStateModel.set(uuid, apps)

2. Agent polls every 60s (or receives MQTT notification)
   └─> GET /api/v1/device/{uuid}/state
   └─> ETag comparison (304 if unchanged)

3. Target state downloaded
   └─> containerManager.setTarget(newState)
   └─> Event 'target-state-changed' emitted

4. Reconciliation triggered
   └─> containerManager.applyTargetState()
   └─> Calculate steps: compare target vs current

5. Steps executed
   replicas: 0 → 1:
     - Download image
     - Start container
     
   replicas: 1 → 0:
     - Stop container
     - Remove container
     
   config changed:
     - Stop old container
     - Remove old container
     - Download new image (if changed)
     - Start new container

6. Current state updated
   └─> Reported back to cloud via MQTT/polling
```

## Reconciliation Logic

**ContainerManager calculates steps based on replicas:**

```typescript
// NEW SERVICE (not in current state)
if (!currentSvc && targetSvc) {
  const replicas = targetSvc.replicas ?? 1;
  
  if (replicas === 0) {
    // Skip - service is in stopped state
    continue;
  }
  
  // Download & start
  steps.push(downloadImage, startContainer);
}

// EXISTING SERVICE (compare current vs target)
if (currentSvc && targetSvc) {
  const currentReplicas = currentSvc.replicas ?? 1;
  const targetReplicas = targetSvc.replicas ?? 1;
  
  if (targetReplicas === 0 && currentSvc.containerId) {
    // Stop service (replicas changed to 0)
    steps.push(stopContainer, removeContainer);
  }
  
  if (currentReplicas === 0 && targetReplicas > 0) {
    // Start service (replicas changed from 0)
    steps.push(downloadImage, startContainer);
  }
  
  // Check other config changes...
}

// REMOVED SERVICE (in current, not in target)
if (currentSvc && !targetSvc) {
  // Stop & remove
  steps.push(stopContainer, removeContainer);
}
```

## Advantages

### ✅ Declarative Control
- Define desired state, system converges automatically
- No need to track current state manually
- Resilient to failures (will retry on next poll)

### ✅ Auditable
- All state changes stored in database
- Version tracking via ETag
- Easy to see "what should be running"

### ✅ Config Preservation
- Service config stays in database when stopped
- Easy to restart with same settings
- No need to re-specify ports, volumes, env vars

### ✅ Cloud-Native Pattern
- Same pattern as Kubernetes (replicas field)
- Easy to understand for DevOps teams
- Works across both Docker and K3s orchestrators

### ✅ Backward Compatible
- `replicas: undefined` defaults to 1
- Existing services without replicas field still work
- No breaking changes to current deployments

## Example: Complete Service Lifecycle

```typescript
// 1. Deploy new service (replicas defaults to 1)
await DeviceTargetStateModel.set('device-123', {
  "nginx": {
    serviceName: "nginx",
    image: "nginx:latest",
    environment: { "ENV": "production" },
    ports: ["80:80"]
    // replicas not specified → defaults to 1 → starts automatically
  }
});

// 2. Service is running...

// 3. Stop for maintenance
await DeviceTargetStateModel.set('device-123', {
  "nginx": {
    serviceName: "nginx",
    image: "nginx:latest",
    environment: { "ENV": "production" },
    ports: ["80:80"],
    replicas: 0  // ← Stops service, keeps config
  }
});

// 4. Update config while stopped (no recreation needed)
await DeviceTargetStateModel.set('device-123', {
  "nginx": {
    serviceName: "nginx",
    image: "nginx:1.25",  // ← Update image
    environment: { "ENV": "staging" },  // ← Change env
    ports: ["8080:80"],  // ← Change port
    replicas: 0  // ← Still stopped
  }
});

// 5. Start with new config
await DeviceTargetStateModel.set('device-123', {
  "nginx": {
    serviceName: "nginx",
    image: "nginx:1.25",
    environment: { "ENV": "staging" },
    ports: ["8080:80"],
    replicas: 1  // ← Starts with new config
  }
});

// 6. Permanently remove service
await DeviceTargetStateModel.set('device-123', {
  // "nginx" key removed → service will be stopped & removed
});
```

## Testing

```bash
# Start agent with logging
cd agent && npm run dev

# In another terminal, watch database changes
psql -U postgres iotistic -c "SELECT device_uuid, apps FROM device_target_state;"

# Test stop
curl -X POST http://localhost:4002/api/devices/{uuid}/apps/web/stop

# Test start
curl -X POST http://localhost:4002/api/devices/{uuid}/apps/web/start

# Check current state
curl http://localhost:48484/v2/applications/state
```

## Future: Multi-Replica Support (K3s)

```typescript
// K3s orchestrator supports multiple replicas
{
  "web": {
    serviceName: "web",
    image: "nginx:latest",
    replicas: 3,  // ← K3s creates 3 pods
    ports: ["80:80"]
  }
}

// Docker driver: replicas > 1 starts 1 container (max supported)
// K3s driver: replicas > 1 creates N pods with load balancing
```

## Migration from Direct API Calls

### Before (Direct Docker API)
```typescript
// device-api/actions.ts
export async function stopService(serviceName: string) {
  const docker = containerManager.getDocker();
  const container = docker.getContainer(containerId);
  await container.stop();  // ← Direct API call
}
```

### After (Target State Manipulation)
```typescript
// api/src/routes/apps.ts
router.post('/devices/:uuid/apps/:appName/stop', async (req, res) => {
  const targetState = await DeviceTargetStateModel.get(uuid);
  const apps = targetState?.apps || {};
  
  apps[appName] = { ...apps[appName], replicas: 0 };
  
  await DeviceTargetStateModel.set(uuid, apps);  // ← Declarative
  
  // Reconciliation handles the actual stop operation
});
```

## Summary

**Replicas field provides Kubernetes-like declarative control:**
- `replicas: 0` = Stopped (config preserved)
- `replicas: 1+` = Running (N instances)
- `undefined` = Running (1 instance, default)

**Benefits:**
- Declarative (define desired state)
- Auditable (database tracks all changes)
- Resilient (retries on failures)
- Cloud-native (same pattern as K8s)
- Works with both Docker and K3s orchestrators

**State flow:**
```
API → Database → Agent Poll → Reconciliation → Docker/K3s → Current State
```

Everything is controlled by modifying the JSON in the database. The agent automatically converges to the desired state. 🎯
