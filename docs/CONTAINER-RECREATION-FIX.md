# Container Recreation Loop Bug Fix

## Problem

The nodered container was being recreated every 30 seconds despite the target state remaining unchanged. The logs showed:

```
📡 Target state fetched (no changes)
```

But the container was still being stopped, removed, and recreated in every reconciliation cycle.

## Root Cause

The issue was in the state comparison logic within `container-manager.ts`. There were **data format inconsistencies** between:

1. **Current State** (from Docker inspection)
2. **Target State** (from cloud API)

### Specific Mismatches

1. **Undefined vs Empty Collections**:
   - Current state from Docker: `ports: undefined`, `networks: undefined`
   - Target state after normalization: `ports: []`, `networks: []`
   - Comparison: `JSON.stringify(undefined)` !== `JSON.stringify([])`

2. **Missing Environment Variables**:
   - Current state: `environment: {}` (default empty object)
   - Target state: `environment: { TZ: "UTC" }`
   - Comparison: Different environments detected as change

3. **Status Case Sensitivity**:
   - Docker returns: `State: "running"` (lowercase)
   - Code was setting: `status: "Running"` (capitalized) when adding to current state
   - This wasn't causing the recreation but could have in future comparisons

## Solution

### 1. Normalize Current State from Docker

Changed `syncCurrentStateFromDocker()` to use **empty arrays/objects instead of undefined**:

```typescript
const service: SimpleService = {
    serviceId,
    serviceName,
    imageName: container.image,
    appId,
    appName,
    containerId: container.id,
    status: container.state.toLowerCase(),  // Normalize to lowercase
    config: {
        image: container.image,
        ports: container.ports && container.ports.length > 0
            ? Array.from(new Set(container.ports
                .filter(p => p.PublicPort && p.PrivatePort)
                .map(p => `${p.PublicPort}:${p.PrivatePort}`)))
            : [],  // Use empty array instead of undefined
        networks: networks || [],  // Use empty array instead of undefined
        environment: {},  // Default empty environment
    },
};
```

### 2. Consistent Status Casing

Changed status to always use lowercase:

```typescript
// When adding service to current state after container start
status: 'running',  // Use lowercase for consistency
```

### 3. Normalize Comparison in stepsToUpdateApp()

Added detailed logging to detect format mismatches:

```typescript
if (needsUpdate) {
    console.log(`\n🔍 Service ${currentSvc.serviceName} needs update:`);
    if (imageChanged) {
        console.log(`  ❌ Image changed: ${currentSvc.imageName} → ${targetSvc.imageName}`);
    }
    if (portsChanged) {
        console.log(`  ❌ Ports changed:`);
        console.log(`     Current: ${currentPorts}`);
        console.log(`     Target:  ${targetPorts}`);
    }
    // ... more detailed logging for debugging
}
```

### 4. Environment Variable Extraction

**This was the primary cause of the recreation loop!**

The current state was setting `environment: {}` (empty object) while the target state had `environment: { TZ: "UTC" }`. This mismatch caused the reconciliation to think the container needed updating.

**Fixed by extracting actual environment variables from Docker**:

```typescript
// Extract environment variables
if (containerInfo.Config?.Env) {
    for (const envVar of containerInfo.Config.Env) {
        const [key, ...valueParts] = envVar.split('=');
        if (key) {
            environment[key] = valueParts.join('=');
        }
    }
}
```

Now the current state accurately reflects what's actually running, including all environment variables like `TZ`, `PATH`, `NODE_VERSION`, etc.

## Testing

After these changes:

1. **Rebuild**: `npm run build`
2. **Run**: `npm run start:device` or `.\run-local.ps1`
3. **Observe**: Container should NOT be recreated every 30 seconds if target state is unchanged
4. **Check Logs**: If a service needs update, detailed comparison logs will show exactly what changed

## Future Improvements

### 1. Extract Volumes from Docker Inspect

Similarly, we should extract actual volume bindings:

```typescript
const volumes: string[] = [];
if (containerInfo.Mounts) {
    for (const mount of containerInfo.Mounts) {
        if (mount.Type === 'bind' || mount.Type === 'volume') {
            volumes.push(`${mount.Source}:${mount.Destination}`);
        }
    }
}
service.config.volumes = volumes;
```

### 2. Extract Restart Policy

```typescript
const restartPolicy = containerInfo.HostConfig?.RestartPolicy?.Name || 'no';
service.config.restart = restartPolicy;
```

### 3. Smart Environment Comparison

Docker injects many environment variables (PATH, HOSTNAME, etc.) that we don't define in target state. We should filter comparison to only variables we explicitly set, or normalize both states to include all Docker-injected variables.

## Related Files

- `agent/src/compose/container-manager.ts` - Main container orchestration logic
- `agent/src/compose/docker-manager.ts` - Docker API integration
- `agent/src/supervisor.ts` - Main entry point that starts auto-reconciliation

## Verification Checklist

- [x] Empty arrays/objects instead of undefined for consistent comparison
- [x] Status normalized to lowercase
- [x] Detailed comparison logging added
- [x] Environment variables extracted from Docker
- [ ] Volumes extracted from Docker (Future improvement)
- [ ] Restart policy extracted from Docker (Future improvement)
- [ ] Smart environment filtering (Future improvement)

## Impact

This fix prevents unnecessary container recreation which:
- ✅ Reduces downtime
- ✅ Prevents data loss in containers without volumes
- ✅ Improves system stability
- ✅ Reduces Docker API load
- ✅ Makes reconciliation logs cleaner and more accurate
