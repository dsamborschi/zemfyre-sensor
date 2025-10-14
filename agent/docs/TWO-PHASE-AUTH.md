# Two-Phase Authentication Implementation

## Overview

This implementation adds Balena-style two-phase authentication to the device provisioning system. It separates fleet-level provisioning keys from device-specific authentication keys for enhanced security.

## Architecture

### Key Types

1. **Provisioning API Key** (Fleet-level)
   - Shared across all devices in a fleet/application
   - Used only during initial registration
   - Removed after successful provisioning
   - Temporary, one-time use per device

2. **Device API Key** (Device-specific)
   - Unique per device, generated locally
   - Pre-generated before registration
   - Used for all subsequent API communication
   - Permanent, stored in device database

### Provisioning Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Device Initialization                                        │
├─────────────────────────────────────────────────────────────┤
│ 1. Generate UUID                                            │
│ 2. Generate deviceApiKey (crypto.randomBytes(32).hex())    │
│ 3. Store in local database                                  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Device Registration                                 │
├─────────────────────────────────────────────────────────────┤
│ POST /api/v1/device/register                                │
│                                                              │
│ Headers:                                                     │
│   Authorization: Bearer <provisioningApiKey>                │
│                                                              │
│ Body:                                                        │
│   uuid, deviceName, deviceType, deviceApiKey,               │
│   applicationId, macAddress, osVersion, supervisorVersion   │
│                                                              │
│ Response:                                                    │
│   { id, uuid, deviceName, deviceType, applicationId }       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Key Exchange                                        │
├─────────────────────────────────────────────────────────────┤
│ POST /api/v1/device/:uuid/key-exchange                      │
│                                                              │
│ Headers:                                                     │
│   Authorization: Bearer <deviceApiKey>                      │
│                                                              │
│ Body:                                                        │
│   { uuid, deviceApiKey }                                    │
│                                                              │
│ Response:                                                    │
│   { status: 'ok', device: { id, uuid, deviceName } }        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Cleanup                                             │
├─────────────────────────────────────────────────────────────┤
│ 1. Remove provisioningApiKey from device database          │
│ 2. Mark device as provisioned                               │
│ 3. Store deviceId from server                               │
│ 4. Set registeredAt timestamp                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Normal Operation                                             │
├─────────────────────────────────────────────────────────────┤
│ All subsequent API calls use deviceApiKey:                  │
│                                                              │
│ - GET /api/v1/device/:uuid/state (polling)                 │
│ - PATCH /api/v1/device/state (reporting)                   │
│ - POST /api/v1/device/:uuid/logs                           │
│                                                              │
│ Headers: Authorization: Bearer <deviceApiKey>               │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Device Table (Agent)

```sql
CREATE TABLE device (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  deviceId TEXT,                    -- Server-assigned ID
  deviceName TEXT,
  deviceType TEXT,
  
  -- Two-phase authentication
  deviceApiKey TEXT,                -- Device-specific key (permanent)
  provisioningApiKey TEXT,          -- Fleet-level key (temporary)
  
  -- Legacy field for backward compatibility
  apiKey TEXT,
  
  apiEndpoint TEXT,
  registeredAt INTEGER,
  provisioned BOOLEAN DEFAULT 0,
  
  -- Fleet/application
  applicationId INTEGER,
  
  -- Device metadata
  macAddress TEXT,
  osVersion TEXT,
  supervisorVersion TEXT,
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Usage

### Agent Side (Device)

```typescript
import { DeviceManager } from './src/provisioning/device-manager';

// Initialize device manager
const deviceManager = new DeviceManager();
await deviceManager.initialize();

// Provision with two-phase auth
const provisionedDevice = await deviceManager.provision({
  provisioningApiKey: 'fleet-key-from-cloud-dashboard', // Required
  apiEndpoint: 'https://cloud.example.com',
  applicationId: 123,
  deviceName: 'Living Room Sensor',
  deviceType: 'raspberry-pi-4',
  macAddress: '00:11:22:33:44:55',
  osVersion: 'Raspbian 11',
  supervisorVersion: '1.0.0',
});

console.log('Device provisioned:', provisionedDevice.uuid);
console.log('Device ID:', provisionedDevice.deviceId);
console.log('Device API Key:', provisionedDevice.deviceApiKey);
```

### Cloud API Side (Server)

The cloud API implements two endpoints:

1. **POST /api/v1/device/register** - Accept device registration with provisioning key
2. **POST /api/v1/device/:uuid/key-exchange** - Verify device can authenticate with device key

See `api/src/routes/cloud.ts` for implementation details.

## Security Benefits

### Compared to Single-Key Approach

**Before (Single Key)**:
- Same API key used for provisioning and operation
- If key leaks, attacker can register unlimited devices
- Key rotation difficult without re-provisioning all devices

**After (Two-Phase)**:
- Provisioning key only registers, cannot control devices
- Device key unique per device, limited blast radius
- Provisioning key can be rotated without affecting existing devices
- Device key pre-generated locally, never transmitted insecurely

### Key Properties

1. **Provisioning Key**:
   - Shared across fleet
   - Short-lived (removed after use)
   - Cannot be used to control devices
   - Can be revoked/rotated easily

2. **Device Key**:
   - Unique per device
   - Long-lived (permanent)
   - Used for all device operations
   - Cryptographically secure (64 hex chars from crypto.randomBytes)

## Testing

### Run Test Suite

```bash
cd agent
npm run build
npx tsx test-provisioning-flow.ts
```

### Manual Testing

1. Start cloud API:
```bash
cd api
npm run dev
```

2. Start agent with provisioning:
```bash
cd agent
npm run build
npx tsx test-provisioning-flow.ts
```

### Expected Output

```
🧪 Testing Two-Phase Authentication Provisioning Flow

📦 Initializing database...
📱 Device initialized:
   UUID: 3f4e5d6c-...
   Device API Key: a1b2c3d4e5f6...
   Provisioned: false

🔐 Starting provisioning flow...

🔐 Phase 1: Registering device with provisioning key...
📡 Registering device with API: http://localhost:3001/api/v1/device/register
   UUID: 3f4e5d6c-...
   Device Name: Test Device
   Device Type: raspberry-pi-4
✅ Device registered with ID: 42

🔐 Phase 2: Exchanging keys...
🔑 Exchanging keys for device: 3f4e5d6c-...
✅ Key exchange successful

🔐 Phase 3: Removing provisioning key...
✅ Device provisioned successfully

✅ All tests passed!
```

## Migration Guide

### Existing Devices

Devices using the old single-key system will continue to work. The `apiKey` field is preserved for backward compatibility. To migrate:

1. Run database migration: `npx knex migrate:latest`
2. Generate `deviceApiKey` for existing devices
3. Use key exchange endpoint to transition to new auth

### New Deployments

New devices will automatically use two-phase authentication. Ensure:

1. Cloud API has `/api/v1/device/register` and `/api/v1/device/:uuid/key-exchange` endpoints
2. Fleet/application has provisioning key configured
3. Devices configured with `provisioningApiKey` in environment or config

## Environment Variables

```bash
# Required for provisioning
PROVISIONING_API_KEY=your-fleet-provisioning-key

# Optional metadata
APPLICATION_ID=123
DEVICE_TYPE=raspberry-pi-4
MAC_ADDRESS=00:11:22:33:44:55
OS_VERSION=Raspbian 11
SUPERVISOR_VERSION=1.0.0
```

## API Reference

### POST /api/v1/device/register

Register new device with provisioning key.

**Headers**:
```
Authorization: Bearer <provisioningApiKey>
Content-Type: application/json
```

**Body**:
```json
{
  "uuid": "3f4e5d6c-7b8a-9c0d-1e2f-3a4b5c6d7e8f",
  "deviceName": "Living Room Sensor",
  "deviceType": "raspberry-pi-4",
  "deviceApiKey": "a1b2c3d4e5f6...",
  "applicationId": 123,
  "macAddress": "00:11:22:33:44:55",
  "osVersion": "Raspbian 11",
  "supervisorVersion": "1.0.0"
}
```

**Response**: 200 OK
```json
{
  "id": 42,
  "uuid": "3f4e5d6c-7b8a-9c0d-1e2f-3a4b5c6d7e8f",
  "deviceName": "Living Room Sensor",
  "deviceType": "raspberry-pi-4",
  "applicationId": 123,
  "createdAt": "2025-01-03T12:00:00.000Z"
}
```

### POST /api/v1/device/:uuid/key-exchange

Exchange provisioning key for device key authentication.

**Headers**:
```
Authorization: Bearer <deviceApiKey>
Content-Type: application/json
```

**Body**:
```json
{
  "uuid": "3f4e5d6c-7b8a-9c0d-1e2f-3a4b5c6d7e8f",
  "deviceApiKey": "a1b2c3d4e5f6..."
}
```

**Response**: 200 OK
```json
{
  "status": "ok",
  "message": "Key exchange successful",
  "device": {
    "id": 42,
    "uuid": "3f4e5d6c-7b8a-9c0d-1e2f-3a4b5c6d7e8f",
    "deviceName": "Living Room Sensor"
  }
}
```

## Troubleshooting

### "provisioningApiKey is required"
- Ensure you're passing `provisioningApiKey` in the provisioning config
- Check that environment variable `PROVISIONING_API_KEY` is set

### "Failed to register device"
- Verify cloud API is running and accessible
- Check `apiEndpoint` is correct
- Ensure provisioning key is valid

### "Key exchange failed"
- Device must be registered before key exchange
- Verify `deviceApiKey` matches what was sent during registration
- Check Authorization header contains correct device key

### Device Already Registered
- Use `deviceManager.reset()` to clear registration and re-provision
- Or skip to key exchange if device ID is known

## Comparison with Balena Supervisor

| Feature | Balena Supervisor | This Implementation |
|---------|------------------|---------------------|
| UUID Generation | Local (generateUniqueKey) | Local (crypto/uuid) |
| Device Key | Pre-generated | Pre-generated |
| Provisioning Key | From config.json | From config/env |
| Key Storage | config.json + SQLite | SQLite only |
| Key Exchange | balena-register-device lib | Native fetch API |
| Error Handling | Custom error classes | Generic errors |
| Retry Logic | Built-in | Not implemented |
| Config Backend | Dual (json + db) | Single (db) |

## Future Enhancements

- [ ] Add retry logic with exponential backoff
- [ ] Implement custom error classes
- [ ] Add config.json support for critical fields
- [ ] Support key rotation
- [ ] Add device key expiration/renewal
- [ ] Implement fleet-level key management API
- [ ] Add device group/fleet hierarchy
- [ ] Support offline provisioning mode

## References

- Balena Supervisor provisioning: `balena/src/lib/api-helper.ts`
- Balena device registration: `balena/src/lib/register-device.ts`
- Balena config system: `balena/src/config/`
