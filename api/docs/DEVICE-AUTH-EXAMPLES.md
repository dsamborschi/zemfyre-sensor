# Applying Device Authentication - Example

## Step-by-Step: Update device-state.ts

### 1. Import the Middleware

```typescript
// At the top of device-state.ts
import deviceAuth, { deviceAuthFromBody } from '../middleware/device-auth';
```

### 2. Apply to Device-Side Endpoints

```typescript
// ============================================================================
// Device State Endpoints (Device-Side - Used by devices themselves)
// ============================================================================

/**
 * Device polling for target state
 * GET /device/:uuid/state
 * 
 * 🔒 PROTECTED: Requires device API key
 */
router.get('/device/:uuid/state', deviceAuth, async (req, res) => {
  try {
    const { uuid } = req.params;
    
    // ✅ Device is now authenticated via req.device
    console.log(`📡 Device ${req.device.deviceName} polling for target state`);
    
    const ifNoneMatch = req.headers['if-none-match'];

    // Get target state (no need to verify device exists - middleware does this)
    const targetState = await DeviceTargetStateModel.get(uuid);
    
    // ... rest of logic
```

### 3. Apply to Log Upload Endpoint

```typescript
/**
 * Device uploads logs
 * POST /device/:uuid/logs
 * 
 * 🔒 PROTECTED: Requires device API key
 * 📊 RATE LIMITED: 100 logs/minute per device
 */
router.post(
  '/device/:uuid/logs',
  deviceAuth,
  deviceRateLimit(100, 60000), // Optional rate limiting
  async (req, res) => {
    try {
      const { uuid } = req.params;
      const logs = req.body;

      console.log(`📤 Device ${req.device.deviceName} uploading logs`);

      // Process logs
      // ...
```

### 4. Apply to State Reporting (UUID in Body)

```typescript
/**
 * Device reports current state + metrics
 * PATCH /device/state
 * 
 * 🔒 PROTECTED: Requires device API key
 * Note: Uses deviceAuthFromBody since UUID is in body, not URL
 */
router.patch('/device/state', deviceAuthFromBody, async (req, res) => {
  try {
    const stateReport = req.body;
    const { uuid } = stateReport;

    console.log(`📊 Device ${req.device.deviceName} reporting state`);

    // Validate device matches auth
    if (req.device.uuid !== uuid) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot report state for different device'
      });
    }

    // Process state report
    // ...
```

### 5. Leave Management Endpoints Unprotected (For Now)

```typescript
// ============================================================================
// Management API Endpoints (Used by dashboard/admin)
// ============================================================================

/**
 * Get device target state (Admin/Dashboard)
 * GET /devices/:uuid/target-state
 * 
 * 🔓 TODO: Add admin authentication
 */
router.get('/devices/:uuid/target-state', async (req, res) => {
  // These will get admin auth later (JWT, session, etc.)
  // For now, these are internal/trusted endpoints
});
```

---

## Complete Example: device-state.ts (Top Section)

```typescript
/**
 * Device State Management Routes
 * Handles device target state, current state, and state reporting
 */

import express from 'express';
import {
  DeviceModel,
  DeviceTargetStateModel,
  DeviceCurrentStateModel,
  DeviceMetricsModel,
  DeviceLogsModel,
} from '../db/models';
import { EventPublisher, objectsAreEqual } from '../services/event-sourcing';
import EventSourcingConfig from '../config/event-sourcing';
import deviceAuth, { deviceAuthFromBody, deviceRateLimit } from '../middleware/device-auth';

export const router = express.Router();

// Initialize event publisher for audit trail
const eventPublisher = new EventPublisher();

// ============================================================================
// Device State Endpoints (Device-Side - 🔒 Protected)
// ============================================================================

/**
 * Device polling for target state
 * GET /device/:uuid/state
 * 
 * 🔒 Authentication: Device API key required
 * 📦 Caching: ETag support (returns 304 if unchanged)
 */
router.get('/device/:uuid/state', deviceAuth, async (req, res) => {
  try {
    const { uuid } = req.params;
    const ifNoneMatch = req.headers['if-none-match'];

    // Device is authenticated (req.device available)
    console.log(`📡 Device ${req.device.deviceName} (${uuid.substring(0, 8)}...) polling for target state`);

    // Get target state
    const targetState = await DeviceTargetStateModel.get(uuid);
    
    if (!targetState) {
      // No target state - return empty
      const emptyState = { [uuid]: { apps: {} } };
      const etag = EventSourcingConfig.generateETag(emptyState);
      
      res.set('ETag', etag);
      return res.json(emptyState);
    }

    // Generate ETag
    const stateObject = { [uuid]: targetState };
    const etag = EventSourcingConfig.generateETag(stateObject);

    // Check ETag cache
    if (ifNoneMatch && ifNoneMatch === etag) {
      console.log(`   ✓ ETag match - returning 304 Not Modified`);
      return res.status(304).end();
    }

    console.log(`   ✓ Target state retrieved (${Object.keys(targetState.apps || {}).length} apps)`);

    res.set('ETag', etag);
    res.json(stateObject);

  } catch (error: any) {
    console.error('Error polling target state:', error);
    res.status(500).json({
      error: 'Failed to get target state',
      message: error.message
    });
  }
});

/**
 * Device uploads logs
 * POST /device/:uuid/logs
 * 
 * 🔒 Authentication: Device API key required
 * 📊 Rate Limit: 100 uploads per minute
 */
router.post(
  '/device/:uuid/logs',
  deviceAuth,
  deviceRateLimit(100, 60000),
  async (req, res) => {
    try {
      const { uuid } = req.params;
      const logs = req.body;

      console.log(`📤 Device ${req.device.deviceName} uploading ${logs.length || 0} log entries`);

      // Store logs
      await DeviceLogsModel.bulkInsert(uuid, logs);

      res.json({
        status: 'ok',
        message: 'Logs received',
        count: Array.isArray(logs) ? logs.length : 1
      });

    } catch (error: any) {
      console.error('Error storing logs:', error);
      res.status(500).json({
        error: 'Failed to store logs',
        message: error.message
      });
    }
  }
);

/**
 * Device reports current state + metrics
 * PATCH /device/state
 * 
 * 🔒 Authentication: Device API key required (UUID from body)
 * 📊 Rate Limit: 300 reports per minute (high frequency for real-time updates)
 */
router.patch(
  '/device/state',
  deviceAuthFromBody,
  deviceRateLimit(300, 60000),
  async (req, res) => {
    try {
      const stateReport = req.body;
      const { uuid, apps, metrics } = stateReport;

      // Verify device can only report its own state
      if (req.device.uuid !== uuid) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot report state for different device'
        });
      }

      console.log(`📊 Device ${req.device.deviceName} reporting state`);

      // Update current state
      await DeviceCurrentStateModel.upsert(uuid, { apps, metrics });

      // Update last_seen
      await DeviceModel.updateLastSeen(uuid);

      res.json({
        status: 'ok',
        message: 'State reported successfully'
      });

    } catch (error: any) {
      console.error('Error reporting state:', error);
      res.status(500).json({
        error: 'Failed to report state',
        message: error.message
      });
    }
  }
);

// ============================================================================
// Management API Endpoints (Admin/Dashboard - 🔓 Unprotected for now)
// ============================================================================
// TODO: Add admin authentication (JWT, session, etc.)

router.get('/devices/:uuid/target-state', async (req, res) => {
  // ... existing code
});

// ... rest of management endpoints
```

---

## Agent Side Updates

### Update api-binder.ts to Send API Key

```typescript
// agent/src/api-binder.ts

export class ApiBinder {
  private deviceApiKey: string; // Store API key from provisioning

  constructor(config) {
    // Load API key from device info
    this.deviceApiKey = deviceInfo.apiKey;
  }

  async pollTargetState() {
    const endpoint = `${this.config.cloudApiEndpoint}/api/${apiVersion}/device/${uuid}/state`;
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-API-Key': this.deviceApiKey, // ✅ Add this!
        ...(this.targetStateETag && { 'if-none-match': this.targetStateETag }),
      }
    });
  }

  async reportCurrentState(stateReport) {
    const endpoint = `${this.config.cloudApiEndpoint}/api/${apiVersion}/device/state`;
    
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-API-Key': this.deviceApiKey, // ✅ Add this!
      },
      body: JSON.stringify(stateReport)
    });
  }
}
```

---

## Testing the Authentication

### 1. Start API with Middleware

```bash
cd api
npm run dev
```

### 2. Test Without Auth (Should Fail)

```bash
curl http://localhost:4002/api/v1/device/test-uuid/state

# Expected: 401 Unauthorized
{
  "error": "Unauthorized",
  "message": "Device API key required. Send in X-Device-API-Key header."
}
```

### 3. Test With Valid Auth (Should Succeed)

```bash
# Use the API key from your device provisioning
curl http://localhost:4002/api/v1/device/test-uuid/state \
  -H "X-Device-API-Key: abc123..."

# Expected: 200 OK with target state
{
  "test-uuid": {
    "apps": {}
  }
}
```

### 4. Test With Invalid Auth (Should Fail)

```bash
curl http://localhost:4002/api/v1/device/test-uuid/state \
  -H "X-Device-API-Key: wrong-key"

# Expected: 401 Unauthorized
{
  "error": "Unauthorized",
  "message": "Invalid device API key"
}
```

---

## Summary

✅ **Middleware Created**: `api/src/middleware/device-auth.ts`  
✅ **Documentation**: `api/docs/DEVICE-AUTHENTICATION.md`  
✅ **Header Recommendation**: `X-Device-API-Key` (or `Authorization: Bearer`)  
✅ **Bcrypt Verification**: Secure comparison with stored hash  
✅ **Rate Limiting**: Optional per-device limits  
✅ **TypeScript Types**: Full type safety with `req.device`

**Next Steps:**
1. Update agent to send API key in headers
2. Apply middleware to device-state routes
3. Test end-to-end authentication flow
4. Consider admin authentication separately
