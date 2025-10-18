# Device Authentication Implementation - Complete

## Overview

Successfully implemented device authentication across the entire API-Agent communication stack. All device endpoints now require `X-Device-API-Key` header for authentication.

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Device Provisioning (Initial Setup)                          │
├─────────────────────────────────────────────────────────────────┤
│ POST /api/v1/device/register                                    │
│   Headers: X-Provisioning-Key: <fleet-level-key>               │
│   Body: { deviceName, fleetId, hwInfo }                        │
│   Response: { uuid, deviceApiKey }                              │
│                                                                  │
│ Agent stores: deviceInfo.apiKey                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. All Subsequent API Calls                                     │
├─────────────────────────────────────────────────────────────────┤
│ Headers: X-Device-API-Key: <device-specific-api-key>           │
│                                                                  │
│ API Middleware:                                                 │
│   - Extracts UUID from params/body                              │
│   - Queries device_api_key_hash from database                   │
│   - bcrypt.compare(apiKey, hash)                               │
│   - Attaches req.device = { id, uuid, deviceName, ... }        │
└─────────────────────────────────────────────────────────────────┘
```

## Files Modified

### API Side (Authentication Middleware)

**1. `api/src/middleware/device-auth.ts`** - NEW
- `deviceAuth(req, res, next)` - Authenticates via `req.params.uuid`
- `deviceAuthFromBody(req, res, next)` - Authenticates via `req.body.deviceUuid`
- `deviceRateLimit(maxRequests, windowMs)` - Per-device rate limiting
- TypeScript: `req.device` interface augmentation

**2. `api/src/routes/device-state.ts`** - UPDATED
- Applied `deviceAuth` to:
  - `GET /device/:uuid/state` - Target state polling
  - `POST /device/:uuid/logs` - Log streaming
- Applied `deviceAuthFromBody` to:
  - `PATCH /device/state` - Current state reporting

**3. `api/src/routes/device-jobs.ts`** - UPDATED
- Applied `deviceAuth` to:
  - `GET /devices/:uuid/jobs/next` - Job polling
  - `PATCH /devices/:uuid/jobs/:jobId/status` - Status updates

### Agent Side (Sending API Keys)

**4. `agent/src/api-binder.ts`** - UPDATED
- `pollTargetState()` - Added `X-Device-API-Key: deviceInfo.apiKey` header
- `reportCurrentState()` - Added `X-Device-API-Key: deviceInfo.apiKey` header

**5. `agent/src/logging/cloud-backend.ts`** - UPDATED
- Updated `CloudLogBackendConfig` interface to include `deviceApiKey?: string`
- Updated constructor to accept and store `deviceApiKey`
- `sendLogs()` - Added `X-Device-API-Key: this.config.deviceApiKey` header

**6. `agent/src/jobs/cloud-jobs-adapter.ts`** - UPDATED
- Updated `CloudJobsAdapterConfig` interface to include `deviceApiKey?: string`
- Updated Axios HTTP client default headers: `X-Device-API-Key: this.config.deviceApiKey`
- All job endpoints now send API key: `pollForJob()`, `updateJobStatus()`, `queryJob()`, `getJobHistory()`

**7. `agent/src/supervisor.ts`** - UPDATED
- CloudLogBackend instantiation: Added `deviceApiKey: deviceInfo.apiKey`
- CloudJobsAdapter instantiation: Added `deviceApiKey: deviceInfo.apiKey`

## Agent Components Authentication Summary

| Component | Method | Endpoint | Auth Header |
|-----------|--------|----------|-------------|
| **API Binder** | pollTargetState() | GET /api/v1/device/:uuid/state | ✅ X-Device-API-Key |
| **API Binder** | reportCurrentState() | PATCH /api/v1/device/state | ✅ X-Device-API-Key |
| **Cloud Backend** | sendLogs() | POST /api/v1/device/:uuid/logs | ✅ X-Device-API-Key |
| **Jobs Adapter** | pollForJob() | GET /api/v1/devices/:uuid/jobs/next | ✅ X-Device-API-Key |
| **Jobs Adapter** | updateJobStatus() | PATCH /api/v1/devices/:uuid/jobs/:id/status | ✅ X-Device-API-Key |
| **Jobs Adapter** | queryJob() | GET /api/v1/devices/:uuid/jobs/:id | ✅ X-Device-API-Key |
| **Jobs Adapter** | getJobHistory() | GET /api/v1/devices/:uuid/jobs/history | ✅ X-Device-API-Key |

## Security Features

### 1. Bcrypt Password Hashing
- API keys stored as bcrypt hashes in database (`device_api_key_hash`)
- Salt rounds: 10 (configurable in environment)
- Hash verification: `bcrypt.compare(providedKey, storedHash)`

### 2. Rate Limiting
- **Per-Device Rate Limiting**: Custom Map-based tracking
  - Default: 100 requests per device per 15 minutes
  - Configurable via `deviceRateLimit(maxRequests, windowMs)`
- **Provisioning Endpoint**: Global rate limiting
  - Default: 10 requests per IP per 15 minutes
  - Uses `express-rate-limit` middleware

### 3. Two-Phase Authentication
- **Phase 1**: Provisioning key (fleet-level, shared secret)
  - Used only during initial device registration
  - Header: `X-Provisioning-Key`
- **Phase 2**: Device API key (device-specific, unique per device)
  - Used for all subsequent API calls
  - Header: `X-Device-API-Key`

### 4. TypeScript Type Safety
```typescript
declare global {
  namespace Express {
    interface Request {
      device?: {
        id: number;
        uuid: string;
        deviceName: string;
        deviceType?: string;
        isActive: boolean;
        fleetId?: number;
      };
    }
  }
}
```

## Environment Variables

### API
```bash
# Device authentication
BCRYPT_ROUNDS=10                    # Hash strength (default: 10)
RATE_LIMIT_WINDOW_MS=900000        # 15 minutes (default)
RATE_LIMIT_MAX_REQUESTS=100        # Per device (default)

# Provisioning
PROVISIONING_KEY=<fleet-shared-secret>
PROVISIONING_RATE_LIMIT_MAX=10     # Per IP (default)
```

### Agent
```bash
# Device identity (stored after provisioning)
DEVICE_UUID=<unique-device-id>
DEVICE_API_KEY=<device-specific-key>

# Cloud API endpoint
CLOUD_API_ENDPOINT=https://api.example.com
API_VERSION=v1
```

## Testing

### 1. Provisioning Flow
```bash
# Register new device
curl -X POST http://localhost:3001/api/v1/device/register \
  -H "X-Provisioning-Key: your-fleet-key" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceName": "test-device-01",
    "fleetId": 1,
    "hwInfo": {
      "arch": "armv7l",
      "cpus": 4,
      "memory": 1024
    }
  }'

# Response:
{
  "uuid": "abc123...",
  "deviceApiKey": "def456..."  // Store this!
}
```

### 2. Authenticated Requests
```bash
# Poll target state
curl -X GET http://localhost:3001/api/v1/device/abc123/state \
  -H "X-Device-API-Key: def456..."

# Report current state
curl -X PATCH http://localhost:3001/api/v1/device/state \
  -H "X-Device-API-Key: def456..." \
  -H "Content-Type: application/json" \
  -d '{
    "deviceUuid": "abc123...",
    "services": [...],
    "networks": [...]
  }'

# Stream logs
curl -X POST http://localhost:3001/api/v1/device/abc123/logs \
  -H "X-Device-API-Key: def456..." \
  -H "Content-Type: application/x-ndjson" \
  -d '{"message": "test log", "timestamp": "2024-01-01T00:00:00Z"}'

# Poll for jobs
curl -X GET http://localhost:3001/api/v1/devices/abc123/jobs/next \
  -H "X-Device-API-Key: def456..."
```

### 3. Error Responses

**Missing API Key**:
```json
{
  "error": "Unauthorized",
  "message": "Missing X-Device-API-Key header"
}
```

**Invalid API Key**:
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

**Rate Limited**:
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded for device abc123. Try again in 15 minutes."
}
```

**Inactive Device**:
```json
{
  "error": "Forbidden",
  "message": "Device is inactive"
}
```

## Migration from Unauthenticated Setup

If you have existing devices without authentication:

1. **Update API**:
   ```bash
   cd api
   npm install bcrypt express-rate-limit
   # Middleware is already in place
   ```

2. **Update Database**:
   ```sql
   -- Add device_api_key_hash column if not exists
   ALTER TABLE devices ADD COLUMN device_api_key_hash TEXT;
   ```

3. **Re-provision Devices**:
   - Each device must call `/api/v1/device/register` again
   - Store returned `deviceApiKey` in agent config
   - Restart agent with new `DEVICE_API_KEY` environment variable

4. **Verify**:
   ```bash
   # Check agent logs for successful authentication
   docker-compose logs -f device-agent | grep "X-Device-API-Key"
   ```

## Future Enhancements

- [ ] **JWT Tokens**: Replace static API keys with short-lived tokens
- [ ] **API Key Rotation**: Automatic periodic key rotation
- [ ] **Audit Logging**: Track all authentication attempts
- [ ] **Admin Authentication**: Protect management endpoints (not device-facing)
- [ ] **mTLS Support**: Mutual TLS for enhanced security
- [ ] **API Key Scopes**: Fine-grained permissions per device

## Documentation

See also:
- `api/docs/DEVICE-AUTHENTICATION.md` - Middleware implementation details
- `api/docs/DEVICE-AUTH-EXAMPLES.md` - Code examples for applying middleware
- `api/docs/API-VERSIONING-STRATEGY.md` - API versioning approach

---

**Status**: ✅ Complete - All device endpoints authenticated, all agent components sending API keys

**Last Updated**: 2024 (Implementation Complete)
