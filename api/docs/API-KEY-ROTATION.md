# API Key Rotation System

Complete guide to the automatic periodic API key rotation system for enhanced security.

## Overview

The API key rotation system automatically rotates device API keys on a configurable schedule to improve security posture and meet compliance requirements.

### Key Features

- ✅ **Automatic Rotation**: Scheduled checks identify devices needing rotation
- ✅ **Grace Period**: Old keys remain valid during transition (default: 7 days)
- ✅ **MQTT Notification**: Devices notified of new keys via MQTT
- ✅ **Rotation History**: Complete audit trail of all key changes
- ✅ **Emergency Revocation**: Immediate key invalidation for compromised devices
- ✅ **Configurable Schedule**: Per-device rotation intervals (default: 90 days)

## Architecture

### Components

1. **Database Schema** (`014_add_api_key_rotation.sql`)
   - Expiry tracking columns on `devices` table
   - `device_api_key_history` table for audit trail
   - Auto-archival trigger for old keys
   - `devices_needing_rotation` view for monitoring

2. **Rotation Service** (`services/api-key-rotation.ts`)
   - Generate cryptographically secure keys
   - Rotate single device or batch rotation
   - MQTT notifications
   - Grace period management
   - Emergency revocation

3. **Scheduler** (`services/rotation-scheduler.ts`)
   - Periodic rotation checks (default: 1 hour)
   - Automatic revocation of expired grace periods
   - Configurable intervals

4. **API Endpoints** (`routes/rotation.ts`)
   - Device-initiated rotation
   - Key status checks
   - Rotation history
   - Admin emergency revocation

## Database Schema

### Devices Table Additions

```sql
-- Expiry tracking
api_key_expires_at TIMESTAMP,
api_key_last_rotated_at TIMESTAMP,

-- Rotation configuration
api_key_rotation_enabled BOOLEAN DEFAULT true,
api_key_rotation_days INTEGER DEFAULT 90
```

### History Table

```sql
CREATE TABLE device_api_key_history (
  id SERIAL PRIMARY KEY,
  device_uuid VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  issued_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  revoked_reason TEXT,
  is_active BOOLEAN DEFAULT false,
  FOREIGN KEY (device_uuid) REFERENCES devices(uuid) ON DELETE CASCADE
);
```

### Automatic Archival Trigger

```sql
CREATE OR REPLACE FUNCTION archive_device_api_key()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.device_api_key_hash IS DISTINCT FROM NEW.device_api_key_hash THEN
    INSERT INTO device_api_key_history (device_uuid, key_hash, issued_at)
    VALUES (OLD.uuid, OLD.device_api_key_hash, OLD.api_key_last_rotated_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_archive_device_api_key
  BEFORE UPDATE OF device_api_key_hash ON devices
  FOR EACH ROW
  EXECUTE FUNCTION archive_device_api_key();
```

## Configuration

### Environment Variables

```bash
# Enable/disable rotation scheduler (default: true)
ENABLE_API_KEY_ROTATION=true

# Enable/disable automatic revocation (default: true)
ENABLE_API_KEY_REVOCATION=true

# How often to check for devices needing rotation (minutes, default: 60)
ROTATION_CHECK_INTERVAL_MINUTES=60

# How often to revoke expired grace period keys (minutes, default: 60)
REVOCATION_CHECK_INTERVAL_MINUTES=60

# MQTT broker for device notifications (optional but recommended)
MQTT_BROKER_URL=mqtt://mosquitto:1883
```

### Per-Device Configuration

```sql
-- Disable rotation for specific device
UPDATE devices 
SET api_key_rotation_enabled = false 
WHERE uuid = 'device-uuid';

-- Change rotation interval (e.g., 30 days instead of 90)
UPDATE devices 
SET api_key_rotation_days = 30 
WHERE uuid = 'device-uuid';
```

## API Endpoints

### 1. Rotate API Key (Device-Initiated)

**Endpoint**: `POST /api/v1/device/:uuid/rotate-key`

**Authentication**: Requires valid current API key (`X-Device-API-Key` header)

**Request**:
```bash
curl -X POST http://localhost:4002/api/v1/device/abc-123/rotate-key \
  -H "X-Device-API-Key: current-api-key" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Manual rotation requested"}'
```

**Response**:
```json
{
  "success": true,
  "message": "API key rotated successfully",
  "data": {
    "new_api_key": "new-64-char-hex-key",
    "expires_at": "2025-04-15T12:00:00.000Z",
    "grace_period_ends": "2025-01-22T12:00:00.000Z",
    "old_key_valid_until": "2025-01-22T12:00:00.000Z"
  }
}
```

**Rate Limiting**: Max 5 requests per hour per IP

### 2. Check Key Status

**Endpoint**: `GET /api/v1/device/:uuid/key-status`

**Authentication**: Requires valid API key

**Request**:
```bash
curl http://localhost:4002/api/v1/device/abc-123/key-status \
  -H "X-Device-API-Key: your-api-key"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "device_uuid": "abc-123",
    "device_name": "Office Sensor",
    "rotation_enabled": true,
    "rotation_days": 90,
    "expires_at": "2025-04-15T12:00:00.000Z",
    "last_rotated_at": "2025-01-15T12:00:00.000Z",
    "days_until_expiry": 89,
    "needs_rotation": false,
    "total_rotations": 3,
    "active_keys": 1
  }
}
```

### 3. Rotation History

**Endpoint**: `GET /api/v1/device/:uuid/rotation-history?limit=10`

**Authentication**: Requires valid API key

**Request**:
```bash
curl "http://localhost:4002/api/v1/device/abc-123/rotation-history?limit=10" \
  -H "X-Device-API-Key: your-api-key"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 3,
      "issued_at": "2025-01-15T12:00:00.000Z",
      "expires_at": "2025-01-22T12:00:00.000Z",
      "revoked_at": null,
      "revoked_reason": null,
      "is_active": true
    },
    {
      "id": 2,
      "issued_at": "2024-10-17T12:00:00.000Z",
      "expires_at": "2024-10-24T12:00:00.000Z",
      "revoked_at": "2024-10-24T12:05:00.000Z",
      "revoked_reason": "Grace period expired",
      "is_active": false
    }
  ]
}
```

### 4. Emergency Revocation (Admin Only)

**Endpoint**: `POST /api/v1/admin/device/:uuid/emergency-revoke`

**Authentication**: Admin authentication (to be implemented)

**Request**:
```bash
curl -X POST http://localhost:4002/api/v1/admin/device/abc-123/emergency-revoke \
  -H "Content-Type: application/json" \
  -d '{"reason": "Security breach detected"}'
```

**Response**:
```json
{
  "success": true,
  "message": "API key emergency revocation complete",
  "data": {
    "device_uuid": "abc-123",
    "reason": "Security breach detected",
    "revoked_at": "2025-01-15T14:30:00.000Z"
  }
}
```

## MQTT Notifications

When a key is rotated, the device receives an MQTT message:

**Topic**: `device/{uuid}/config/api-key-rotation`

**Payload**:
```json
{
  "event": "api_key_rotated",
  "new_api_key": "new-64-char-hex-key",
  "expires_at": "2025-04-15T12:00:00.000Z",
  "grace_period_ends": "2025-01-22T12:00:00.000Z",
  "message": "Your API key has been rotated. Please update your configuration.",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

## Rotation Flow

### Automatic Rotation

1. **Scheduler** runs every hour (configurable)
2. **Query** `devices_needing_rotation` view (keys expiring within 7 days)
3. For each device:
   - Generate new cryptographically secure key (32 random bytes = 64 hex chars)
   - Hash with bcrypt (10 salt rounds)
   - Update `devices` table with new hash and expiry
   - Old key archived to `device_api_key_history` via trigger
   - Grace period set (default: 7 days from now)
   - MQTT notification sent to device
4. **Auto-Revocation** scheduler runs every hour
   - Finds keys in history with `expires_at` <= NOW and `is_active = true`
   - Sets `is_active = false`, `revoked_at = NOW`, `revoked_reason = 'Grace period expired'`

### Device-Initiated Rotation

1. Device calls `POST /device/:uuid/rotate-key` with current valid key
2. API verifies authentication (deviceAuth middleware)
3. Same rotation process as automatic, but reason logged
4. Device receives new key in response immediately
5. Device updates local configuration
6. Old key valid for grace period

### Emergency Revocation

1. Admin calls `POST /admin/device/:uuid/emergency-revoke` with reason
2. New key generated and updated immediately
3. **All** old keys in history set to `is_active = false` (no grace period)
4. MQTT notification sent with `grace_period_ends = NOW`
5. Device must update immediately or lose access

## Security Model

### Key Generation

- Uses Node.js `crypto.randomBytes(32)` for cryptographic randomness
- 256 bits of entropy (64 hex characters)
- Converted to hex string for easy transmission

### Key Storage

- **Never stored in plain text**
- Hashed with bcrypt (10 salt rounds)
- Verified on each request with `bcrypt.compare()`
- History stores only hashes, not original keys

### Grace Period

- Default: 7 days
- Old key remains valid during grace period
- Allows devices time to update configuration
- Prevents service interruption
- Configurable via `KeyRotationConfig.gracePeriodDays`

### Rate Limiting

- Rotation requests: 5 per hour per IP
- Prevents brute-force rotation attacks
- Device status checks: Not rate-limited (read-only)

## Monitoring & Troubleshooting

### Check Devices Needing Rotation

```sql
SELECT * FROM devices_needing_rotation;
```

### View Rotation History for Device

```sql
SELECT * FROM device_api_key_history 
WHERE device_uuid = 'abc-123' 
ORDER BY issued_at DESC;
```

### Find Active Keys (During Grace Period)

```sql
SELECT 
  d.uuid,
  d.device_name,
  COUNT(h.id) as active_keys
FROM devices d
LEFT JOIN device_api_key_history h ON d.uuid = h.device_uuid AND h.is_active = true
GROUP BY d.uuid, d.device_name
HAVING COUNT(h.id) > 1;
```

### Check Rotation Scheduler Status

Look for these log messages:
```
🔄 Starting API key rotation scheduler (check every 60 minutes)
🔒 Starting API key revocation scheduler (check every 60 minutes)
```

### Manual Rotation

```typescript
import { rotateDeviceApiKey } from './services/api-key-rotation';

const rotation = await rotateDeviceApiKey('device-uuid', {
  rotationDays: 90,
  gracePeriodDays: 7,
  notifyDevice: true,
  autoRevoke: true
});

console.log('New API key:', rotation.newKey);
```

## Best Practices

1. **Enable MQTT**: Devices need real-time notification of rotation
2. **Monitor Grace Periods**: Ensure devices update before expiry
3. **Audit Logs**: Review `audit_logs` table for rotation events
4. **Regular Intervals**: 90 days is recommended for balance of security and operations
5. **Emergency Plan**: Document emergency revocation procedure
6. **Backup Communication**: Have out-of-band method to communicate keys if MQTT fails

## Compliance

This system helps meet security compliance requirements:

- **PCI-DSS**: Regular credential rotation
- **NIST**: Key management lifecycle
- **ISO 27001**: Access control and monitoring
- **SOC 2**: Audit trail and key history

## Future Enhancements

- [ ] Notification via email/SMS in addition to MQTT
- [ ] Configurable grace periods per device
- [ ] Automatic rotation based on usage patterns
- [ ] Integration with hardware security modules (HSM)
- [ ] Multi-key support (rotate to new key before old expires)
- [ ] Rotation policies (e.g., rotate on geolocation change)

## See Also

- [Device Authentication Guide](./DEVICE-AUTHENTICATION.md)
- [MQTT Integration](./MQTT-INTEGRATION-COMPLETE.md)
- [Security Implementation](../docs/SECURITY-IMPLEMENTATION-COMPLETE.md)
