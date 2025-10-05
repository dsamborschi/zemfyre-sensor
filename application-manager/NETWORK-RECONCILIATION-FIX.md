# Network Reconciliation Fix

## Problem
When adding networks to an existing service's target state, the reconciliation was not detecting the change and therefore not recreating the container with the new network configuration.

## Root Cause
In `application-manager/src/container-manager.ts`, the `stepsToUpdateApp()` function was comparing service configurations to detect changes, but it was **only checking** for:
- `portsChanged`
- `envChanged` 
- `volumesChanged`

It was **NOT checking** for `networksChanged`!

## Fix Applied
Added network comparison to the configuration change detection:

```typescript
const networksChanged = JSON.stringify(currentSvc.config.networks || []) !== 
                        JSON.stringify(targetSvc.config.networks || []);

const configChanged = portsChanged || envChanged || volumesChanged || networksChanged;
```

**File Modified**: `application-manager/src/container-manager.ts` (lines 604-615)

## Impact
Now when you add or remove networks from a service in the target state:
1. ✅ Reconciliation **detects** the network change
2. ✅ Creates the Docker network (if needed)
3. ✅ **Stops** the old container
4. ✅ **Removes** the old container  
5. ✅ **Starts** a new container with the network connections
6. ✅ Network cleanup happens when services are removed

## Testing

### Via Application Manager API

1. **Start the application-manager** (with real Docker):
   ```bash
   cd application-manager
   USE_REAL_DOCKER=true npm run dev
   ```

2. **Get current state** to see your nginx container:
   ```bash
   curl http://localhost:3002/api/v1/state
   ```

3. **Update target state** with network:
   ```bash
   curl -X POST http://localhost:3002/api/v1/state/target \
     -H "Content-Type: application/json" \
     -d '{
       "apps": {
         "1759606743039": {
           "appId": 1759606743039,
           "appName": "test",
           "services": [{
             "serviceId": 1,
             "serviceName": "nginx",
             "imageName": "nginx:alpine",
             "appId": 1759606743039,
             "appName": "test",
             "config": {
               "image": "nginx:alpine",
               "ports": ["9976:80"],
               "networks": ["backend"]
             }
           }]
         }
       }
     }'
   ```

4. **Apply the changes**:
   ```bash
   curl -X POST http://localhost:3002/api/v1/state/apply
   ```

5. **Verify network created and container connected**:
   ```bash
   docker network ls | grep backend
   docker network inspect 1759606743039_backend
   docker inspect <container-id> | grep -A 10 Networks
   ```

### Expected Behavior

**Before fix**: Nothing happened - container kept running without network

**After fix**: 
- Network `1759606743039_backend` is created
- Old nginx container is stopped and removed
- New nginx container is started and connected to `1759606743039_backend` network
- Container can now communicate with other services on the same network

## Verification

Check the application-manager logs for evidence of reconciliation:
```bash
docker logs application-manager
```

You should see:
```
Creating network: 1759606743039_backend
Stopping container: <old-container-id>
Removing container: <old-container-id>
Starting container for service: nginx
Container started with ID: <new-container-id>
```

## Related Changes

This fix completes the network implementation by ensuring that:
- ✅ Networks are created before containers (Phase 2 - Backend)
- ✅ Networks are displayed in UI (Phase 3 - Frontend)
- ✅ Network changes trigger reconciliation (**THIS FIX**)
- ✅ Containers are connected to networks on startup (Phase 2)
- ✅ Network cleanup happens when apps are removed (Phase 2)

## Build Status
✅ TypeScript compilation successful  
✅ No breaking changes to existing functionality

---

**Date**: October 4, 2025  
**Issue**: Network changes not triggering reconciliation  
**Status**: ✅ **FIXED**
