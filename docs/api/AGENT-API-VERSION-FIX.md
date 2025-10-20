# Agent API Version Fix

## Problem

After refactoring the API to use centralized versioning, the **agent** was still using hardcoded `/api/v1` paths, causing fetch errors when connecting to the API.

### Error Symptoms
- Agent fetch failures when connecting to cloud API
- 404 errors on device state endpoints
- Connection failures for device registration, logs, and state reporting

### Root Cause
The API was refactored to use centralized versioning (`API_VERSION` environment variable), but the agent code still had hardcoded `/api/v1` paths.

---

## Files Fixed

### 1. ✅ `agent/src/api-binder.ts`
**Endpoints fixed:**
- `GET /device/:uuid/state` - Target state polling
- `PATCH /device/state` - Current state reporting

**Before:**
```typescript
const endpoint = `${this.config.cloudApiEndpoint}/api/v1/device/${deviceInfo.uuid}/state`;
```

**After:**
```typescript
const apiVersion = process.env.API_VERSION || 'v1';
const endpoint = `${this.config.cloudApiEndpoint}/api/${apiVersion}/device/${deviceInfo.uuid}/state`;
```

### 2. ✅ `agent/src/logging/cloud-backend.ts`
**Endpoints fixed:**
- `POST /device/:uuid/logs` - Log upload

**Before:**
```typescript
const endpoint = `${this.config.cloudEndpoint}/api/v1/device/${this.config.deviceUuid}/logs`;
```

**After:**
```typescript
const apiVersion = process.env.API_VERSION || 'v1';
const endpoint = `${this.config.cloudEndpoint}/api/${apiVersion}/device/${this.config.deviceUuid}/logs`;
```

### 3. ✅ `agent/src/jobs/cloud-jobs-adapter.ts`
**Endpoints fixed:**
- `GET /devices/:uuid/jobs/next` - Poll for next job
- `PATCH /devices/:uuid/jobs/:jobId/status` - Update job status
- `GET /devices/:uuid/jobs/:jobId` - Query job status
- `GET /devices/:uuid/jobs` - Get job history

**Added class property:**
```typescript
export class CloudJobsAdapter {
  // ... other properties
  private apiVersion: string;

  constructor(config: CloudJobsAdapterConfig, private jobEngine: JobEngine) {
    // Get API version from environment or default to v1
    this.apiVersion = process.env.API_VERSION || 'v1';
    // ...
  }
}
```

**Before:**
```typescript
const response = await this.httpClient.get(`/api/v1/devices/${this.config.deviceUuid}/jobs/next`);
```

**After:**
```typescript
const response = await this.httpClient.get(`/api/${this.apiVersion}/devices/${this.config.deviceUuid}/jobs/next`);
```

### 4. ✅ `agent/src/provisioning/device-manager.ts`
**Endpoints fixed:**
- `POST /device/register` - Two-phase auth registration
- `POST /device/:uuid/key-exchange` - Key exchange (auth phase 2)
- `GET /devices/:uuid` - Fetch device info

**Before:**
```typescript
const url = `${apiEndpoint}/api/v1/device/register`;
```

**After:**
```typescript
const apiVersion = process.env.API_VERSION || 'v1';
const url = `${apiEndpoint}/api/${apiVersion}/device/register`;
```

---

## How It Works

### Default Behavior (v1)
Both API and agent default to `v1` if no environment variable is set:
```bash
# No env var set
npm start  # Uses /api/v1/*
```

### Custom Version
Set `API_VERSION` environment variable on BOTH api and agent:
```bash
# API server
cd api
API_VERSION=v2 npm start

# Agent (on device)
cd agent
API_VERSION=v2 npm start
```

### Docker Deployment
```yaml
# docker-compose.yml
services:
  api:
    environment:
      - API_VERSION=v1
  
  agent:
    environment:
      - API_VERSION=v1  # Must match API version!
```

---

## Testing the Fix

### 1. Start API Server
```bash
cd api
npm run dev
# Server running on http://localhost:3002
```

### 2. Start Agent (in separate terminal)
```bash
cd agent
npm run dev
# Should connect successfully to API
```

### 3. Watch for Success Messages
```
✅ Device registered with ID: xxx
📡 Polling target state...
   Endpoint: http://localhost:3002/api/v1/device/xxx/state
   Response Status: 200
📤 Reported current state to cloud
```

### 4. Test with Different Version
```bash
# Terminal 1 - API with v2
cd api
API_VERSION=v2 npm run dev

# Terminal 2 - Agent with v2
cd agent
API_VERSION=v2 npm run dev
# Should now use /api/v2/* endpoints
```

---

## Important Notes

⚠️ **Version Mismatch**: Agent and API must use the same `API_VERSION`:
```bash
# ❌ WRONG - Will cause 404 errors
API: API_VERSION=v1
Agent: API_VERSION=v2

# ✅ CORRECT - Both must match
API: API_VERSION=v1
Agent: API_VERSION=v1
```

⚠️ **Environment Variables**: The `API_VERSION` environment variable must be set:
- **Before** the agent starts
- **In the same environment** where agent runs (not inherited in containers unless explicitly set)

---

## Build Status

✅ **Agent Build**: Success  
✅ **API Build**: Success  
✅ **TypeScript Compilation**: No errors  
✅ **Backward Compatibility**: Maintained (defaults to v1)

---

## Related Documentation

- `api/docs/API-VERSIONING-STRATEGY.md` - API versioning approach
- `api/docs/REFACTORING-COMPLETE.md` - API refactoring details

---

**Fixed Date**: October 18, 2025  
**Status**: ✅ Complete  
**Breaking Changes**: None (defaults to v1 for backward compatibility)
