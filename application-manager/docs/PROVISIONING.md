# Device Provisioning in Standalone Container-Manager

## Overview

Device provisioning allows your container-manager to have a unique identity and optionally register with a remote API. This is inspired by balena-supervisor's provisioning but simplified for standalone use.

---

## Features

✅ **Automatic UUID Generation** - Each device gets a unique identifier  
✅ **Local Provisioning** - Set device config without remote API  
✅ **Remote Registration** - Register with your own API backend  
✅ **Persistent Storage** - Device info stored in SQLite database  
✅ **REST API** - Full HTTP API for provisioning operations  
✅ **Reset Support** - Unprovision device for testing

---

## Quick Start

### 1. Start the Server

```bash
npm run dev
# or with Docker
npm run start:docker
```

### 2. Check Device Status

```bash
curl http://localhost:3000/api/v1/device
```

**Response:**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "provisioned": false
}
```

### 3. Provision the Device

**Local Provisioning (Simple):**
```bash
curl -X POST http://localhost:3000/api/v1/device/provision \
  -H "Content-Type: application/json" \
  -d '{
    "deviceName": "my-raspberry-pi",
    "deviceType": "raspberrypi4-64"
  }'
```

**Response:**
```json
{
  "status": "success",
  "message": "Device provisioned successfully",
  "device": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "deviceId": "dev_1704196800000",
    "deviceName": "my-raspberry-pi",
    "deviceType": "raspberrypi4-64",
    "provisioned": true,
    "registeredAt": 1704196800000
  }
}
```

---

## API Reference

### Get Device Information

```http
GET /api/v1/device
```

**Response:**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "deviceId": "dev_1704196800000",
  "deviceName": "my-raspberry-pi",
  "deviceType": "raspberrypi4-64",
  "apiKey": "abc123...",
  "apiEndpoint": "https://api.example.com",
  "registeredAt": 1704196800000,
  "provisioned": true
}
```

### Check Provisioning Status

```http
GET /api/v1/device/provisioned
```

**Response:**
```json
{
  "provisioned": true
}
```

### Provision Device (Local)

```http
POST /api/v1/device/provision
Content-Type: application/json
```

**Request Body:**
```json
{
  "uuid": "custom-uuid",           // Optional: use specific UUID
  "deviceName": "my-device",       // Optional: device name
  "deviceType": "generic",         // Optional: device type
  "apiEndpoint": "https://...",    // Optional: API endpoint
  "apiKey": "custom-key"          // Optional: API key
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Device provisioned successfully",
  "device": {
    "uuid": "custom-uuid",
    "deviceId": "dev_1704196800000",
    "deviceName": "my-device",
    "deviceType": "generic",
    "provisioned": true,
    "registeredAt": 1704196800000
  }
}
```

### Register with Remote API

```http
POST /api/v1/device/register
Content-Type: application/json
```

**Request Body:**
```json
{
  "apiEndpoint": "https://api.example.com",
  "deviceName": "my-device",
  "deviceType": "raspberrypi4-64",
  "macAddress": "b8:27:eb:xx:xx:xx",
  "osVersion": "11.0.0",
  "supervisorVersion": "1.0.0"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Device registered with API",
  "response": {
    "deviceId": "dev_1704196800000",
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "deviceName": "my-device",
    "apiKey": "generated-api-key-here",
    "registeredAt": 1704196800000
  }
}
```

**Note:** Currently simulates API registration. To integrate with real API:
1. Update `DeviceManager.registerWithAPI()` in `src/provisioning/device-manager.ts`
2. Add actual HTTP POST to your backend
3. Handle API response and errors

### Update Device

```http
PATCH /api/v1/device
Content-Type: application/json
```

**Request Body:**
```json
{
  "deviceName": "new-name",
  "apiEndpoint": "https://new-api.com"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Device updated",
  "device": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "deviceName": "new-name",
    "apiEndpoint": "https://new-api.com",
    "provisioned": true
  }
}
```

### Reset Device (Unprovision)

```http
POST /api/v1/device/reset
```

**Response:**
```json
{
  "status": "success",
  "message": "Device reset successfully",
  "device": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "provisioned": false
  }
}
```

---

## Database Schema

The device information is stored in the `device` table:

```sql
CREATE TABLE device (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  deviceId TEXT,
  deviceName TEXT,
  deviceType TEXT,
  apiKey TEXT,
  apiEndpoint TEXT,
  registeredAt INTEGER,
  provisioned BOOLEAN DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Fields:**
- `uuid` - Unique device identifier (generated or provided)
- `deviceId` - ID from remote API (if registered)
- `deviceName` - Human-readable device name
- `deviceType` - Device hardware type (e.g., "raspberrypi4-64")
- `apiKey` - API authentication key
- `apiEndpoint` - Remote API URL
- `registeredAt` - Timestamp when device was provisioned
- `provisioned` - Whether device is provisioned

---

## Usage Examples

### PowerShell Examples

```powershell
# Get device info
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/device" -Method Get

# Provision device
$body = @{
  deviceName = "my-pi"
  deviceType = "raspberrypi4-64"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/v1/device/provision" `
  -Method Post `
  -Body $body `
  -ContentType "application/json"

# Check if provisioned
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/device/provisioned" -Method Get

# Update device name
$body = @{ deviceName = "new-name" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/device" `
  -Method Patch `
  -Body $body `
  -ContentType "application/json"

# Reset device
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/device/reset" -Method Post
```

### Node.js Example

```javascript
const axios = require('axios');
const API = 'http://localhost:3000/api/v1';

async function provisionDevice() {
  // Get device info
  const device = await axios.get(`${API}/device`);
  console.log('Device:', device.data);

  // Provision if not already provisioned
  if (!device.data.provisioned) {
    const result = await axios.post(`${API}/device/provision`, {
      deviceName: 'my-device',
      deviceType: 'raspberrypi4-64',
    });
    console.log('Provisioned:', result.data);
  }

  // Check status
  const status = await axios.get(`${API}/device/provisioned`);
  console.log('Provisioned:', status.data.provisioned);
}

provisionDevice();
```

### Python Example

```python
import requests

API = 'http://localhost:3000/api/v1'

# Get device info
response = requests.get(f'{API}/device')
device = response.json()
print('Device:', device)

# Provision if needed
if not device['provisioned']:
    response = requests.post(f'{API}/device/provision', json={
        'deviceName': 'my-device',
        'deviceType': 'raspberrypi4-64'
    })
    print('Provisioned:', response.json())

# Check status
response = requests.get(f'{API}/device/provisioned')
print('Provisioned:', response.json()['provisioned'])
```

---

## Integrating with Your Own Backend

To register devices with your own API backend:

### 1. Create Backend Endpoint

```javascript
// Express.js example
app.post('/api/device/register', async (req, res) => {
  const { uuid, deviceName, deviceType, macAddress } = req.body;
  
  // Generate device ID and API key
  const deviceId = `dev_${Date.now()}`;
  const apiKey = generateSecureKey();
  
  // Store in database
  await db.devices.insert({
    deviceId,
    uuid,
    deviceName,
    deviceType,
    macAddress,
    apiKey,
    registeredAt: Date.now(),
  });
  
  res.json({
    deviceId,
    uuid,
    deviceName,
    apiKey,
    registeredAt: Date.now(),
  });
});
```

### 2. Update Device Manager

Edit `src/provisioning/device-manager.ts`:

```typescript
async registerWithAPI(apiEndpoint: string, provisionRequest: ProvisionRequest): Promise<ProvisionResponse> {
  console.log('📡 Registering device with API:', apiEndpoint);
  
  // Make actual API call
  const response = await fetch(`${apiEndpoint}/device/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(provisionRequest),
  });
  
  if (!response.ok) {
    throw new Error(`API registration failed: ${response.statusText}`);
  }
  
  const result: ProvisionResponse = await response.json();
  
  // Update local device info
  this.deviceInfo.deviceId = result.deviceId;
  this.deviceInfo.deviceName = result.deviceName;
  this.deviceInfo.apiKey = result.apiKey;
  this.deviceInfo.apiEndpoint = apiEndpoint;
  this.deviceInfo.registeredAt = result.registeredAt;
  this.deviceInfo.provisioned = true;
  
  await this.saveDeviceInfo();
  
  return result;
}
```

### 3. Register Device

```bash
curl -X POST http://localhost:3000/api/v1/device/register \
  -H "Content-Type: application/json" \
  -d '{
    "apiEndpoint": "https://your-api.com/api",
    "deviceName": "my-device",
    "deviceType": "raspberrypi4-64"
  }'
```

---

## Comparison with Balena

### What Balena Has

- ✅ Cloud-based device registration
- ✅ Provisioning API key from config.json
- ✅ Device API key exchange
- ✅ Multi-step provisioning flow
- ✅ Retry logic with backoff
- ✅ Error recovery
- ✅ VPN integration
- ✅ Fleet management

### What Standalone Has

- ✅ Local device identity (UUID)
- ✅ Simple provisioning API
- ✅ Optional remote registration
- ✅ Persistent storage
- ✅ No cloud dependency
- ✅ Easy to integrate with any backend
- ✅ Reset/unprovision support

### Key Differences

| Feature | Balena | Standalone |
|---------|--------|------------|
| **Cloud Required** | Yes (balenaCloud) | No (optional) |
| **Provisioning Key** | From config.json | Optional |
| **Device Registration** | POST to balena API | Simulated (customizable) |
| **Key Exchange** | Automatic | Not implemented |
| **Retry Logic** | Infinite with backoff | Manual |
| **VPN** | Automatic | Not included |
| **Fleet Management** | Yes | No (single device) |
| **Complexity** | High | Low |

---

## Development Workflow

### 1. Fresh Start

```bash
# Clean database
rm -rf data/
npm run dev
```

### 2. Provision Device

```bash
curl -X POST http://localhost:3000/api/v1/device/provision \
  -H "Content-Type: application/json" \
  -d '{"deviceName": "test-device"}'
```

### 3. Test Application Management

```bash
# Set target state (device is now provisioned)
curl -X POST http://localhost:3000/api/v1/state/target \
  -H "Content-Type: application/json" \
  -d '{
    "apps": {
      "1001": {
        "appId": 1001,
        "appName": "My App",
        "services": [...]
      }
    }
  }'
```

### 4. Reset for Testing

```bash
curl -X POST http://localhost:3000/api/v1/device/reset
```

---

## Security Considerations

### Current Implementation (Development)

- ⚠️ No authentication required for API calls
- ⚠️ API key generated locally (not validated)
- ⚠️ Simulated remote registration
- ⚠️ No encryption for stored keys

### Production Recommendations

1. **Add API Authentication**
   ```typescript
   app.use('/api/v1', requireAuth);
   ```

2. **Encrypt API Keys**
   ```typescript
   import crypto from 'crypto';
   const encrypted = encrypt(apiKey, deviceSecret);
   ```

3. **Use HTTPS**
   ```typescript
   const https = require('https');
   const server = https.createServer(sslOptions, app);
   ```

4. **Validate Requests**
   ```typescript
   const schema = Joi.object({
     deviceName: Joi.string().required(),
     deviceType: Joi.string().required(),
   });
   ```

5. **Rate Limiting**
   ```typescript
   import rateLimit from 'express-rate-limit';
   app.use('/api/v1/device', rateLimit({ max: 10 }));
   ```

---

## Troubleshooting

### Device UUID Changes on Restart

**Problem:** UUID regenerates every time
**Solution:** Device info is persisted in database. Check `data/database.sqlite` exists

### Cannot Provision Device

**Problem:** `Device manager not initialized` error
**Solution:** Ensure `deviceManager.initialize()` is called in server startup

### Database Locked

**Problem:** SQLite database locked
**Solution:** Stop all server instances and delete `data/database.sqlite-journal`

### Migration Fails

**Problem:** Migration errors on startup
**Solution:** 
```bash
rm -rf data/database.sqlite
npm run dev  # Will recreate database
```

---

## Testing

See `test-api.ps1` for complete test script:

```powershell
.\test-api.ps1
```

This will test:
- Device info retrieval
- Provisioning
- Status checks
- Updates
- Reset

---

## Future Enhancements

### Possible Additions

1. **API Key Validation** - Middleware to validate API keys
2. **Device Groups** - Organize devices into groups
3. **Remote Config** - Pull config from remote API
4. **Heartbeat** - Regular check-ins with remote API
5. **Device Tags** - Custom metadata for devices
6. **Provisioning Events** - Event emitter for provisioning lifecycle
7. **Webhook Support** - Notify external systems on provision
8. **Multi-Device Support** - Manage multiple device identities

---

## Summary

This provisioning system provides:

✅ **Unique device identity** with persistent UUID  
✅ **Flexible provisioning** - local or remote  
✅ **Simple REST API** for all operations  
✅ **Database persistence** for device state  
✅ **Easy integration** with custom backends  

Unlike balena-supervisor's complex cloud-based provisioning, this standalone version is:
- Simple and local-first
- No cloud dependency required
- Easy to customize for your needs
- Perfect for single-device deployments

For fleet management with cloud backend, refer to the balena provisioning documentation in `docs/DEVICE-PROVISIONING-EXPLAINED.md`.
