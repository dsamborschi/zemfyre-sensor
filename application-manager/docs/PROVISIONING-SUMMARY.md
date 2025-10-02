# Device Provisioning - Implementation Summary

## ✅ What Was Added

Device provisioning system inspired by balena-supervisor but simplified for standalone use.

---

## 📁 New Files Created

### Core Implementation

1. **`src/provisioning/types.ts`** (30 lines)
   - TypeScript types for provisioning
   - `DeviceInfo`, `ProvisioningConfig`, `ProvisionRequest`, `ProvisionResponse`

2. **`src/provisioning/device-manager.ts`** (250 lines)
   - Main `DeviceManager` class
   - UUID generation
   - Database persistence
   - Local provisioning
   - Simulated remote API registration
   - Device info management
   - Reset functionality

3. **`src/provisioning/index.ts`** (5 lines)
   - Module exports

4. **`src/migrations/20250102000000_add_device.js`** (30 lines)
   - Database migration for `device` table
   - Stores UUID, deviceId, deviceName, apiKey, etc.

### Documentation

5. **`docs/PROVISIONING.md`** (650+ lines)
   - Complete provisioning guide
   - API reference with examples
   - PowerShell, Node.js, Python examples
   - Backend integration guide
   - Security recommendations
   - Troubleshooting

6. **`docs/DEVICE-PROVISIONING-EXPLAINED.md`** (950+ lines)
   - Deep dive into balena's provisioning
   - Architecture and flow diagrams
   - API endpoints and authentication
   - Error handling and retry logic
   - Comparison with standalone

### Testing

7. **`test-provisioning.ps1`** (180 lines)
   - PowerShell test script
   - Tests all 6 provisioning endpoints
   - Color-coded output
   - Summary report
   - Optional reset

---

## 🔧 Modified Files

### `src/api/server.ts`

**Added:**
- Import `DeviceManager` and provisioning types
- Initialize `deviceManager` on startup
- 6 new API endpoints:
  - `GET /api/v1/device` - Get device info
  - `GET /api/v1/device/provisioned` - Check status
  - `POST /api/v1/device/provision` - Provision locally
  - `POST /api/v1/device/register` - Register with API
  - `PATCH /api/v1/device` - Update device
  - `POST /api/v1/device/reset` - Reset (unprovision)

**Changes:**
```typescript
// Initialize device manager
deviceManager = new DeviceManager();
await deviceManager.initialize();
```

### `package.json`

**Added Dependencies:**
```json
{
  "uuid": "^10.0.0",
  "@types/uuid": "^10.0.0"
}
```

---

## 🗄️ Database Schema

### New Table: `device`

```sql
CREATE TABLE device (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,        -- Device UUID
  deviceId TEXT,                     -- Device ID from API
  deviceName TEXT,                   -- Human-readable name
  deviceType TEXT,                   -- Hardware type
  apiKey TEXT,                       -- API authentication key
  apiEndpoint TEXT,                  -- Remote API URL
  registeredAt INTEGER,              -- Registration timestamp
  provisioned BOOLEAN DEFAULT 0,     -- Provisioning status
  createdAt TIMESTAMP DEFAULT NOW,
  updatedAt TIMESTAMP DEFAULT NOW
);
```

---

## 🚀 API Endpoints

### 1. Get Device Info
```http
GET /api/v1/device
```
Returns complete device information including UUID, provisioning status, etc.

### 2. Check Provisioned
```http
GET /api/v1/device/provisioned
```
Returns `{ provisioned: true/false }`

### 3. Provision Device (Local)
```http
POST /api/v1/device/provision
Content-Type: application/json

{
  "deviceName": "my-device",
  "deviceType": "raspberrypi4-64"
}
```
Sets local device configuration without remote API.

### 4. Register with API
```http
POST /api/v1/device/register
Content-Type: application/json

{
  "apiEndpoint": "https://api.example.com",
  "deviceName": "my-device",
  "deviceType": "raspberrypi4-64"
}
```
Registers device with remote API (currently simulated).

### 5. Update Device
```http
PATCH /api/v1/device
Content-Type: application/json

{
  "deviceName": "new-name",
  "apiEndpoint": "https://new-api.com"
}
```
Updates device name and/or API endpoint.

### 6. Reset Device
```http
POST /api/v1/device/reset
```
Unprovisioned device (clears deviceId, apiKey, etc.).

---

## 📊 Flow Diagram

```
┌─────────────────────────────────────────────┐
│          SERVER STARTS                      │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  Initialize Database                        │
│  - Run migrations                           │
│  - Create device table if not exists        │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  Initialize DeviceManager                   │
│  - Check if device exists in DB             │
│  - If not: generate UUID, create device     │
│  - If yes: load device info                 │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  Device State: UNPROVISIONED                │
│  - Has UUID                                 │
│  - No deviceId, deviceName, apiKey          │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  User Provisions Device                     │
│  POST /api/v1/device/provision              │
│  - Sets deviceName, deviceType              │
│  - Generates deviceId                       │
│  - Marks provisioned = true                 │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  Device State: PROVISIONED                  │
│  - Has UUID, deviceId, deviceName           │
│  - Ready for application management         │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  Optional: Register with Remote API         │
│  POST /api/v1/device/register               │
│  - Calls remote API                         │
│  - Receives deviceId and apiKey from API    │
│  - Stores for future authenticated requests │
└─────────────────────────────────────────────┘
```

---

## 🔑 Key Features

### 1. Automatic UUID Generation
- Uses `uuid` package to generate unique identifiers
- Fallback generator if package not loaded yet
- Persisted in database

### 2. Persistent Storage
- All device info stored in SQLite `device` table
- Survives server restarts
- Single source of truth

### 3. Flexible Provisioning
- **Local**: Just set name/type without remote API
- **Remote**: Simulated registration (customizable)
- **Hybrid**: Local first, register later

### 4. Simple API
- RESTful endpoints
- JSON request/response
- Standard HTTP methods (GET, POST, PATCH)

### 5. Reset Support
- Unprovision device for testing
- Preserves UUID
- Clears sensitive data (apiKey)

---

## 🆚 Comparison: Balena vs. Standalone

| Feature | Balena Supervisor | Standalone Container-Manager |
|---------|------------------|------------------------------|
| **Cloud Backend** | Required (balenaCloud) | Optional (your API) |
| **Provisioning Key** | From config.json | Not used |
| **UUID Generation** | Pre-generated | Auto-generated |
| **Device Registration** | POST to balena API | Simulated (customizable) |
| **Key Exchange** | Multi-step with retry | Single step |
| **API Authentication** | Bearer token | Not implemented |
| **Error Recovery** | Infinite retry + key regen | Manual |
| **VPN Integration** | Automatic | Not included |
| **Fleet Management** | Multi-device | Single device |
| **Complexity** | High (500+ lines) | Low (250 lines) |
| **Dependencies** | balena-register-device | uuid only |

---

## 🧪 Testing

### Quick Test

```powershell
# Start server
npm run dev

# Run provisioning tests
.\test-provisioning.ps1
```

### Manual Testing

```powershell
# 1. Get device info
Invoke-RestMethod http://localhost:3000/api/v1/device

# 2. Provision device
$body = @{ deviceName = "my-pi" } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/v1/device/provision `
  -Method Post -Body $body -ContentType "application/json"

# 3. Check status
Invoke-RestMethod http://localhost:3000/api/v1/device/provisioned

# 4. Update name
$body = @{ deviceName = "new-name" } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/v1/device `
  -Method Patch -Body $body -ContentType "application/json"

# 5. Reset
Invoke-RestMethod -Uri http://localhost:3000/api/v1/device/reset -Method Post
```

---

## 🔒 Security Notes

### Current State (Development)

⚠️ **Not production-ready** - Current implementation:
- No authentication on API endpoints
- API keys generated locally (not validated)
- Simulated remote registration
- No encryption for stored keys
- No rate limiting

### Production Checklist

For production deployment, add:

1. **API Authentication**
   ```typescript
   app.use('/api/v1', authenticateRequest);
   ```

2. **Key Encryption**
   ```typescript
   const encrypted = encrypt(apiKey, process.env.SECRET);
   ```

3. **HTTPS Only**
   ```typescript
   if (req.protocol !== 'https') return res.status(403).send('HTTPS required');
   ```

4. **Input Validation**
   ```typescript
   const schema = Joi.object({
     deviceName: Joi.string().alphanum().max(50),
     deviceType: Joi.string().valid('pi', 'generic'),
   });
   ```

5. **Rate Limiting**
   ```typescript
   app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
   ```

6. **Audit Logging**
   ```typescript
   logger.audit('device_provisioned', { uuid, deviceName, ip: req.ip });
   ```

---

## 🎯 Use Cases

### 1. Single Device Deployment
- Raspberry Pi running containers
- No cloud backend needed
- Local control only

### 2. Custom Fleet Management
- Build your own cloud backend
- Register devices via API
- Pull config from central server

### 3. Edge Computing
- Autonomous devices
- Intermittent connectivity
- Local-first operation

### 4. Development/Testing
- Quick prototyping
- Reset and re-provision easily
- No cloud dependencies

---

## 🚧 Future Enhancements

### Potential Additions

1. **API Key Middleware**
   ```typescript
   function requireAPIKey(req, res, next) {
     const key = req.headers['x-api-key'];
     if (validateKey(key)) next();
     else res.status(401).send('Unauthorized');
   }
   ```

2. **Device Groups**
   ```sql
   CREATE TABLE device_group (
     id INTEGER PRIMARY KEY,
     name TEXT,
     devices TEXT -- JSON array of UUIDs
   );
   ```

3. **Remote Config Sync**
   ```typescript
   async function syncConfig() {
     const config = await fetch(`${apiEndpoint}/device/${uuid}/config`);
     await applyConfig(config);
   }
   ```

4. **Heartbeat/Ping**
   ```typescript
   setInterval(async () => {
     await fetch(`${apiEndpoint}/device/${uuid}/ping`, {
       method: 'POST',
       body: JSON.stringify({ status: 'alive' })
     });
   }, 60000); // Every minute
   ```

5. **Device Tags**
   ```sql
   CREATE TABLE device_tag (
     deviceId INTEGER,
     key TEXT,
     value TEXT
   );
   ```

6. **Provisioning Events**
   ```typescript
   deviceManager.on('provisioned', (device) => {
     console.log('Device provisioned:', device);
     webhook.notify('device.provisioned', device);
   });
   ```

---

## 📚 Documentation

- **`docs/PROVISIONING.md`** - User guide with examples
- **`docs/DEVICE-PROVISIONING-EXPLAINED.md`** - Balena provisioning deep dive
- **`test-provisioning.ps1`** - Test script with examples

---

## ✨ Summary

### What You Get

✅ **Unique device identity** - Persistent UUID generation  
✅ **Database persistence** - SQLite storage for device info  
✅ **REST API** - 6 endpoints for device management  
✅ **Flexible provisioning** - Local or remote registration  
✅ **Reset support** - Easy testing and re-provisioning  
✅ **Production-ready structure** - Easy to add auth/encryption  

### What's Different from Balena

- ✅ Simpler (250 vs 500+ lines)
- ✅ Local-first (no cloud required)
- ✅ Single device focus
- ✅ Easy to customize
- ✅ Minimal dependencies

### Next Steps

1. **Test**: Run `.\test-provisioning.ps1`
2. **Integrate**: Call provisioning API from your app
3. **Customize**: Update `registerWithAPI()` for real backend
4. **Secure**: Add authentication for production
5. **Extend**: Add features as needed

---

**Device provisioning is now live! 🎉**

Your standalone container-manager now has a unique identity and can optionally register with remote APIs, just like balena-supervisor but with a simpler, local-first approach.
