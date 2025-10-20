# Cloud API Migration Guide

## Overview

The application has been migrated from `server.ts` (single-device) to `cloud-server.ts` (multi-device) architecture. The new Cloud API uses **device-centric endpoints** that support managing multiple devices from a single API.

## Architecture Changes

### Before (server.ts - Single Device)
```
Frontend → server.ts (port 3002) → ContainerManager → Docker
```

### After (cloud-server.ts - Multi-Device)
```
Frontend → cloud-server.ts (port 3002) → Multiple Devices
   ↓
Device API Binder → cloud-server.ts (reports state)
```

## API Endpoint Changes

### State Management

| Old Endpoint | New Endpoint | Notes |
|--------------|--------------|-------|
| `GET /api/v1/state` | `GET /api/v1/devices/:uuid` | Get combined state |
| `POST /api/v1/state/target` | `POST /api/v1/devices/:uuid/target-state` | Set target state |
| `POST /api/v1/state/apply` | `POST /api/v1/devices/:uuid/target-state` | Apply handled by device |

### Application Management

| Old Endpoint | New Endpoint | Notes |
|--------------|--------------|-------|
| `GET /api/v1/apps` | `GET /api/v1/devices/:uuid/current-state` | Apps in current state |
| `GET /api/v1/apps/:appId` | `GET /api/v1/devices/:uuid/current-state` | Parse apps object |
| `POST /api/v1/apps/:appId` | `POST /api/v1/devices/:uuid/target-state` | Update target state |
| `DELETE /api/v1/apps/:appId` | `POST /api/v1/devices/:uuid/target-state` | Remove from target |

### Device Management

| Old Endpoint | New Endpoint | Notes |
|--------------|--------------|-------|
| `GET /api/v1/device` | `GET /api/v1/devices/:uuid` | Device info |
| `GET /api/v1/device/provisioned` | `GET /api/v1/devices/:uuid` | Check is_online |

### Metrics & Monitoring

| Old Endpoint | New Endpoint | Notes |
|--------------|--------------|-------|
| `GET /api/v1/metrics` | `GET /api/v1/devices/:uuid/current-state` | Metrics in current state |
| `GET /api/v1/status` | `GET /api/v1/devices/:uuid` | Device status |

### New Endpoints (Multi-Device)

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/devices` | List all devices |
| `GET /api/v1/devices/:uuid/target-state` | Get target state only |
| `GET /api/v1/devices/:uuid/current-state` | Get current state only |
| `DELETE /api/v1/devices/:uuid/target-state` | Clear target state |

## Frontend Changes

### Updated: `application-manager-api.ts`

**New Functions:**
```typescript
// Set the device UUID to manage
setDeviceUuid(uuid: string): void

// Get the current device UUID
getDeviceUuid(): string

// List all devices
applicationManagerApi.listDevices()
```

**Modified Endpoints:**
All endpoints now use `/api/v1/devices/:uuid/` pattern with `currentDeviceUuid`.

### Using the API

```typescript
import { setDeviceUuid, applicationManagerApi } from '@/services/application-manager-api'

// Switch to specific device
setDeviceUuid('device-uuid-123')

// Get device state
const response = await fetch(applicationManagerApi.getState())
const state = await response.json()
// Returns: { uuid, target_state, current_state, is_online, last_reported }

// Set target state
await fetch(applicationManagerApi.setTargetState(), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    apps: {
      1: {
        serviceName: 'web',
        image: 'nginx:latest',
        // ... service config
      }
    }
  })
})
```

### Multi-Device Support

```typescript
// Get all devices
const devicesResponse = await fetch(applicationManagerApi.listDevices())
const { devices } = await devicesResponse.json()

// Switch between devices
devices.forEach(device => {
  setDeviceUuid(device.uuid)
  // Now all API calls go to this device
})
```

## Response Format Changes

### State Response

**Before:**
```json
{
  "current": {
    "apps": { ... }
  },
  "target": {
    "apps": { ... }
  }
}
```

**After:**
```json
{
  "uuid": "device-uuid",
  "target_state": {
    "apps": { ... }
  },
  "current_state": {
    "apps": { ... },
    "cpu_usage": 25.3,
    "memory_usage": 1024,
    "is_online": true,
    "last_reported": 1696724400000
  },
  "is_online": true,
  "last_reported": 1696724400000
}
```

### Metrics Response

Metrics are now embedded in `current_state`:

**Before:**
```json
{
  "cpu_usage": 25.3,
  "memory_usage": 1024,
  "memory_total": 4096
}
```

**After:**
```json
{
  "uuid": "device-uuid",
  "apps": { ... },
  "cpu_usage": 25.3,
  "memory_usage": 1024,
  "memory_total": 4096,
  "storage_usage": 10240,
  "storage_total": 51200,
  "temperature": 52.5,
  "uptime": 86400,
  "is_online": true,
  "last_reported": 1696724400000
}
```

## Device API Binder Integration

Devices now use the **API Binder** to communicate with the cloud:

```typescript
import { ApiBinder } from './api-binder'

const binder = new ApiBinder(containerManager, deviceManager, {
  cloudApiEndpoint: 'http://cloud-server:3002',
  pollInterval: 60000,      // Poll for target state every 60s
  reportInterval: 10000,    // Report current state every 10s
  metricsInterval: 300000,  // Report metrics every 5min
})

// Start polling and reporting
await binder.startPoll()
await binder.startReporting()
```

### Device-Side Endpoints (for devices only)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/device/:uuid/state` | GET | Device polls for target state (ETag cached) |
| `/api/v1/device/state` | PATCH | Device reports current state + metrics |
| `/api/v1/device/:uuid/logs` | POST | Device uploads logs |

## Migration Checklist

- [x] Update `application-manager-api.ts` with new endpoints
- [ ] Update stores to use new response formats
- [ ] Update components to handle device switching
- [ ] Add device UUID to URL routing (e.g., `/devices/:uuid/apps`)
- [ ] Update WebSocket to use device UUID
- [ ] Test multi-device scenarios
- [ ] Update documentation

## Breaking Changes

1. **Device UUID Required**: All API calls now require a device UUID
2. **Response Format**: State responses have different structure
3. **Metrics Location**: Metrics are in `current_state`, not separate endpoint
4. **No Direct Container Control**: Cloud API doesn't control containers, devices do

## Backwards Compatibility

The cloud-server.ts does **NOT** include backwards-compatible single-device endpoints. All clients must migrate to the new device-centric API structure.

## Testing

```bash
# Start cloud server
cd application-manager
npm run dev

# Test device listing
curl http://localhost:3002/api/v1/devices

# Test device state (replace with actual UUID)
curl http://localhost:3002/api/v1/devices/local

# Set target state
curl -X POST http://localhost:3002/api/v1/devices/local/target-state \
  -H "Content-Type: application/json" \
  -d '{"apps":{"1":{"serviceName":"web","image":"nginx"}}}'
```

## Rollback Plan

If issues occur, you can:
1. Revert to `server.ts` in `src/api/server.ts`
2. Revert `application-manager-api.ts` changes
3. Remove `setDeviceUuid` imports from stores
4. Restart the application

---

**Next Steps:**
1. Update frontend components to handle new response formats
2. Add device selection UI
3. Test with real devices using API Binder
4. Update WebSocket to broadcast device UUID
