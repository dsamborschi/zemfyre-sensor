# Device Authentication Middleware Guide

## Overview

The device authentication middleware secures device-specific API endpoints using API keys generated during device provisioning.

## Authentication Flow

```
Device → API Request with Header → Middleware → Verify API Key → Allow/Deny
```

## Header Options (Choose One)

### Option 1: Custom Header (Recommended for IoT)
```http
X-Device-API-Key: abc123def456...
```

### Option 2: Standard Authorization Header
```http
Authorization: Bearer abc123def456...
```

---

## Usage in Route Files

### Basic Usage

```typescript
import { Router } from 'express';
import deviceAuth from '../middleware/device-auth';

const router = Router();

// Protected endpoint - requires device authentication
router.get('/device/:uuid/state', deviceAuth, async (req, res) => {
  // req.device is now available with authenticated device info
  console.log('Authenticated device:', req.device.uuid);
  console.log('Device name:', req.device.deviceName);
  
  // Your logic here
  res.json({ state: 'ok' });
});
```

### Available Device Info in `req.device`

After successful authentication, `req.device` contains:

```typescript
{
  id: number;           // Database ID
  uuid: string;         // Device UUID
  deviceName: string;   // Friendly name
  deviceType: string;   // Type (e.g., "raspberry-pi")
  isActive: boolean;    // Active status
  fleetId?: string;     // Fleet ID (if assigned)
}
```

### With Rate Limiting

```typescript
import deviceAuth, { deviceRateLimit } from '../middleware/device-auth';

// 100 requests per minute per device
router.post(
  '/device/:uuid/logs',
  deviceAuth,
  deviceRateLimit(100, 60000),
  async (req, res) => {
    // Handle logs upload
  }
);
```

### For Endpoints Without :uuid in Path

Some endpoints have UUID in the body instead of URL:

```typescript
import { deviceAuthFromBody } from '../middleware/device-auth';

router.patch('/device/state', deviceAuthFromBody, async (req, res) => {
  // req.body.uuid is used for authentication
  // req.device is populated
});
```

---

## Agent/Device Side Implementation

### Current Implementation (Already Working!)

Your agent already sends the API key correctly in `key-exchange`:

```typescript
// agent/src/provisioning/device-manager.ts
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${deviceApiKey}`,  // ✅ Already doing this!
  },
  body: JSON.stringify({ uuid, deviceApiKey })
});
```

### Update for All Device Endpoints

```typescript
// agent/src/api-binder.ts (example)
const response = await fetch(endpoint, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'X-Device-API-Key': deviceInfo.apiKey,  // Add this!
  }
});
```

---

## Applying to Existing Routes

### device-state.ts Routes to Protect

```typescript
import deviceAuth, { deviceAuthFromBody } from '../middleware/device-auth';

// Poll for target state (device polls this)
router.get('/device/:uuid/state', deviceAuth, async (req, res) => {
  // Only authenticated device can access
});

// Report current state (device reports)
router.patch('/device/state', deviceAuthFromBody, async (req, res) => {
  // UUID from body, API key in header
});

// Upload logs (device uploads)
router.post('/device/:uuid/logs', deviceAuth, async (req, res) => {
  // Protected log upload
});
```

### devices.ts Routes (Admin Access)

These are **admin** endpoints for managing devices - don't use device auth here:

```typescript
// ❌ Don't use deviceAuth for admin endpoints
router.get('/devices', async (req, res) => {
  // List all devices - admin only (add admin auth later)
});

// ✅ Could use for device self-query
router.get('/devices/:uuid', deviceAuth, async (req, res) => {
  // Device can query its own info
  if (req.device.uuid !== req.params.uuid) {
    return res.status(403).json({ error: 'Can only access own device info' });
  }
});
```

---

## Security Best Practices

### 1. HTTPS Only in Production
```typescript
// index.ts
if (process.env.NODE_ENV === 'production' && !req.secure) {
  return res.status(403).json({ error: 'HTTPS required' });
}
```

### 2. Rate Limiting
```typescript
// Prevent brute force attacks
router.post('/device/:uuid/state', 
  deviceAuth,
  deviceRateLimit(300, 60000), // 300 req/min
  handler
);
```

### 3. Log Failed Attempts
Already built into middleware - logs to console

### 4. Separate Admin vs Device Auth
- Device auth: `X-Device-API-Key` header
- Admin auth: Different middleware (JWT, session, etc.)

---

## Error Responses

### 401 Unauthorized - Missing API Key
```json
{
  "error": "Unauthorized",
  "message": "Device API key required. Send in X-Device-API-Key header."
}
```

### 401 Unauthorized - Invalid API Key
```json
{
  "error": "Unauthorized",
  "message": "Invalid device API key"
}
```

### 403 Forbidden - Device Inactive
```json
{
  "error": "Forbidden",
  "message": "Device is inactive. Contact administrator."
}
```

### 404 Not Found - Device Doesn't Exist
```json
{
  "error": "Not Found",
  "message": "Device not found"
}
```

### 429 Too Many Requests - Rate Limited
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Max 100 requests per 60s",
  "retryAfter": 45
}
```

---

## Testing

### cURL Examples

```bash
# With X-Device-API-Key header
curl http://localhost:4002/api/v1/device/abc-123/state \
  -H "X-Device-API-Key: your-device-api-key-here"

# With Authorization header
curl http://localhost:4002/api/v1/device/abc-123/state \
  -H "Authorization: Bearer your-device-api-key-here"

# Report state (body has UUID)
curl -X PATCH http://localhost:4002/api/v1/device/state \
  -H "X-Device-API-Key: your-device-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"uuid":"abc-123","apps":{"1234":{"status":"running"}}}'
```

### From Agent

The agent will automatically include the API key it received during provisioning:

```typescript
// Store API key after provisioning
this.deviceInfo.apiKey = provisionResponse.deviceApiKey;

// Use in all subsequent requests
const headers = {
  'Content-Type': 'application/json',
  'X-Device-API-Key': this.deviceInfo.apiKey
};
```

---

## Migration Checklist

- [ ] Add `device-auth.ts` middleware (✅ Done)
- [ ] Update agent to send API key in headers
- [ ] Apply middleware to device-state routes
- [ ] Test authentication flow
- [ ] Add rate limiting if needed
- [ ] Document for device developers
- [ ] Consider admin authentication separately

---

## Performance Considerations

### Database Queries
Each authenticated request performs:
1. 1 SELECT to fetch device + verify key (bcrypt compare)

**Optimization options:**
- Cache device info in Redis (TTL: 5-15 minutes)
- Skip `last_seen` update (currently commented out)
- Use database connection pooling (already configured)

### Bcrypt Performance
- ~10ms per verification on modern hardware
- Acceptable for IoT polling intervals (30-60s typical)

### Expected Load
- 100 devices × 1 req/min = 100 req/min = 1.67 req/s
- Each request: ~10ms auth + handler time
- Server can easily handle 100+ req/s

---

## Alternative Authentication Methods

If you need different auth later:

### JWT Tokens (for web/mobile apps)
```typescript
// For admin dashboard, mobile apps
router.get('/devices', jwtAuth, async (req, res) => {
  // req.user from JWT
});
```

### Mutual TLS (mTLS)
```typescript
// For high-security deployments
// Devices have client certificates
app.use((req, res, next) => {
  if (!req.client.authorized) {
    return res.status(401).send('Invalid certificate');
  }
  next();
});
```

### API Key + HMAC Signatures
```typescript
// For request tampering prevention
// Sign request body with shared secret
const signature = crypto
  .createHmac('sha256', deviceSecret)
  .update(JSON.stringify(req.body))
  .digest('hex');
```

But for IoT devices, **API key in header is the sweet spot** ✅
