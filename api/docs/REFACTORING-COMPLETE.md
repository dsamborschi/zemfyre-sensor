# API Versioning Refactoring - Complete ✅

## What Was Done

Successfully refactored all route files to use **centralized API versioning**.

### Files Modified

1. ✅ **src/routes/provisioning.ts** - Removed `/api/v1` prefix from 5 endpoints
2. ✅ **src/routes/devices.ts** - Removed `/api/v1` prefix from 7 endpoints  
3. ✅ **src/routes/admin.ts** - Removed `/api/v1` prefix from 2 endpoints
4. ✅ **src/routes/apps.ts** - Removed `/api/v1` prefix from 9 endpoints
5. ✅ **src/routes/device-state.ts** - Removed `/api/v1` prefix from 10 endpoints
6. ✅ **src/index.ts** - Updated all route mounts to use `API_BASE`

### Total Routes Refactored: 33 endpoints

---

## Before vs After

### Before (Hardcoded)
```typescript
// routes/devices.ts
router.get('/api/v1/devices', async (req, res) => { ... });
router.post('/api/v1/devices/:uuid/apps', async (req, res) => { ... });

// index.ts
app.use(devicesRoutes); // Routes handle their own /api/v1 prefix
```

### After (Centralized)
```typescript
// routes/devices.ts
router.get('/devices', async (req, res) => { ... });
router.post('/devices/:uuid/apps', async (req, res) => { ... });

// index.ts
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;

app.use(API_BASE, devicesRoutes); // Version controlled centrally
```

---

## How to Switch API Versions

### Method 1: Change the Constant (One Line!)
```typescript
// src/index.ts
const API_VERSION = 'v2'; // Changed from 'v1'
```

### Method 2: Environment Variable (Recommended)
```bash
# Development
API_VERSION=v2 npm run dev

# Production
API_VERSION=v2 npm start

# Docker
docker run -e API_VERSION=v2 iotistic/api:latest
```

---

## Endpoint Mapping

All endpoints now automatically use the configured version:

### Provisioning Routes
- `POST /api/v1/provisioning-keys` → `POST /api/${API_VERSION}/provisioning-keys`
- `GET /api/v1/provisioning-keys` → `GET /api/${API_VERSION}/provisioning-keys`
- `DELETE /api/v1/provisioning-keys/:keyId` → `DELETE /api/${API_VERSION}/provisioning-keys/:keyId`
- `POST /api/v1/device/register` → `POST /api/${API_VERSION}/device/register`
- `POST /api/v1/device/:uuid/key-exchange` → `POST /api/${API_VERSION}/device/:uuid/key-exchange`

### Device Management Routes
- `GET /api/v1/devices` → `GET /api/${API_VERSION}/devices`
- `GET /api/v1/devices/:uuid` → `GET /api/${API_VERSION}/devices/:uuid`
- `PATCH /api/v1/devices/:uuid/active` → `PATCH /api/${API_VERSION}/devices/:uuid/active`
- `DELETE /api/v1/devices/:uuid` → `DELETE /api/${API_VERSION}/devices/:uuid`
- `POST /api/v1/devices/:uuid/apps` → `POST /api/${API_VERSION}/devices/:uuid/apps`
- `PATCH /api/v1/devices/:uuid/apps/:appId` → `PATCH /api/${API_VERSION}/devices/:uuid/apps/:appId`
- `DELETE /api/v1/devices/:uuid/apps/:appId` → `DELETE /api/${API_VERSION}/devices/:uuid/apps/:appId`

### Admin Routes
- `GET /api/v1/admin/heartbeat` → `GET /api/${API_VERSION}/admin/heartbeat`
- `POST /api/v1/admin/heartbeat/check` → `POST /api/${API_VERSION}/admin/heartbeat/check`

### Application Routes
- `POST /api/v1/applications` → `POST /api/${API_VERSION}/applications`
- `GET /api/v1/applications` → `GET /api/${API_VERSION}/applications`
- `GET /api/v1/applications/:appId` → `GET /api/${API_VERSION}/applications/:appId`
- `PATCH /api/v1/applications/:appId` → `PATCH /api/${API_VERSION}/applications/:appId`
- `DELETE /api/v1/applications/:appId` → `DELETE /api/${API_VERSION}/applications/:appId`
- `POST /api/v1/apps/next-id` → `POST /api/${API_VERSION}/apps/next-id`
- `POST /api/v1/services/next-id` → `POST /api/${API_VERSION}/services/next-id`
- `GET /api/v1/apps-services/registry` → `GET /api/${API_VERSION}/apps-services/registry`
- `GET /api/v1/apps-services/:type/:id` → `GET /api/${API_VERSION}/apps-services/:type/:id`

### Device State Routes
- `GET /api/v1/device/:uuid/state` → `GET /api/${API_VERSION}/device/:uuid/state`
- `POST /api/v1/device/:uuid/logs` → `POST /api/${API_VERSION}/device/:uuid/logs`
- `PATCH /api/v1/device/state` → `PATCH /api/${API_VERSION}/device/state`
- `GET /api/v1/devices/:uuid/target-state` → `GET /api/${API_VERSION}/devices/:uuid/target-state`
- `POST /api/v1/devices/:uuid/target-state` → `POST /api/${API_VERSION}/devices/:uuid/target-state`
- `PUT /api/v1/devices/:uuid/target-state` → `PUT /api/${API_VERSION}/devices/:uuid/target-state`
- `GET /api/v1/devices/:uuid/current-state` → `GET /api/${API_VERSION}/devices/:uuid/current-state`
- `DELETE /api/v1/devices/:uuid/target-state` → `DELETE /api/${API_VERSION}/devices/:uuid/target-state`
- `GET /api/v1/devices/:uuid/logs` → `GET /api/${API_VERSION}/devices/:uuid/logs`
- `GET /api/v1/devices/:uuid/metrics` → `GET /api/${API_VERSION}/devices/:uuid/metrics`

### Other Routes (Already Centralized)
- Webhooks: `POST /api/${API_VERSION}/webhooks/*`
- Rollouts: `GET/POST /api/${API_VERSION}/rollouts/*`
- Image Registry: `GET/POST/PUT/DELETE /api/${API_VERSION}/images/*`
- Device Jobs: `GET/POST /api/${API_VERSION}/jobs/*`
- Scheduled Jobs: `GET/POST /api/${API_VERSION}/scheduled-jobs/*`

---

## Build & Test Status

✅ **TypeScript Compilation**: No errors  
✅ **Build**: Successful  
✅ **Route Validation**: All 33 endpoints verified  
✅ **Backward Compatibility**: Maintained (URLs unchanged with default v1)

---

## Benefits Achieved

1. ✅ **Single Source of Truth**: Change version in ONE place
2. ✅ **Environment-Based**: Different versions for dev/staging/prod
3. ✅ **Future-Proof**: Easy to add v2 without touching route files
4. ✅ **Consistent**: All routes follow the same pattern
5. ✅ **Maintainable**: Clear separation of concerns

---

## Next Steps (Optional)

### When you need API v2:

**Option 1: Switch Everything to v2**
```bash
API_VERSION=v2 npm start
```
All endpoints automatically use `/api/v2/*`

**Option 2: Support Both Versions Simultaneously**
```typescript
// Create routes/v1/ and routes/v2/ folders
import devicesV1 from './routes/v1/devices';
import devicesV2 from './routes/v2/devices';

app.use('/api/v1', devicesV1);
app.use('/api/v2', devicesV2);
```

See `docs/API-VERSIONING-STRATEGY.md` for complete guide.

---

## Testing the Change

```bash
# Start server with v1 (default)
npm start

# Test endpoints
curl http://localhost:3002/api/v1/devices
curl http://localhost:3002/api/v1/applications

# Switch to v2
API_VERSION=v2 npm start

# Same endpoints now on v2
curl http://localhost:3002/api/v2/devices
curl http://localhost:3002/api/v2/applications
```

---

**Refactoring Date**: October 18, 2025  
**Status**: ✅ Complete  
**Breaking Changes**: None (backward compatible)
