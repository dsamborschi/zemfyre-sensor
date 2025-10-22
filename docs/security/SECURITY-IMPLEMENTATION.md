# Security Implementation Guide

## Overview

This document describes the security improvements implemented in the Iotistic provisioning system, based on AWS IoT Fleet Provisioning best practices.

## Security Enhancements Implemented

### ✅ 1. Provisioning Key Validation

**Before**: Any provisioning key was accepted (TODO comment)
**After**: Keys validated against PostgreSQL database with:
- bcrypt hashing (never store plain text)
- Expiration dates
- Device limits per key
- Fleet/application isolation

**Database Table**: `provisioning_keys`
```sql
CREATE TABLE provisioning_keys (
    id UUID PRIMARY KEY,
    key_hash VARCHAR(255) NOT NULL,  -- bcrypt hashed
    fleet_id VARCHAR(100) NOT NULL,
    max_devices INTEGER DEFAULT 100,
    devices_provisioned INTEGER DEFAULT 0,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    ...
);
```

### ✅ 2. Device API Key Hashing

**Before**: Device API keys stored in plain text in database
**After**: Keys hashed with bcrypt before storage

**Changes**:
- Registration endpoint hashes `deviceApiKey` with `bcrypt.hash(key, 10)`
- Key exchange endpoint verifies with `bcrypt.compare(key, hash)`
- `device_api_key_hash` column added to `devices` table

### ✅ 3. Rate Limiting

**Implementation**: `express-rate-limit` middleware

**Limits**:
- Provisioning endpoint: 5 attempts per 15 minutes per IP
- Key exchange endpoint: 10 attempts per hour per IP

**Features**:
- Logs rate limit violations to audit log
- Tracks failed attempts in `provisioning_attempts` table
- IP-based blocking for repeated failures (10+ failed attempts in 1 hour)

### ✅ 4. Comprehensive Audit Logging

**Implementation**: Winston + PostgreSQL dual logging

**Logged Events**:
- `provisioning_started` - Device registration initiated
- `provisioning_success` / `provisioning_failed` - Registration outcome
- `provisioning_key_invalid` - Invalid key used
- `provisioning_limit_exceeded` - Device limit reached
- `key_exchange_success` / `key_exchange_failed` - Key exchange outcome
- `authentication_failed` - Failed authentication attempts
- `rate_limit_exceeded` - Rate limit violations

**Storage**:
- File: `logs/audit.log` (rotated, max 10MB, 10 files)
- Database: `audit_logs` table with JSONB details

### ✅ 5. Provisioning Attempt Tracking

**Purpose**: Detect abuse and enable forensics

**Table**: `provisioning_attempts`
```sql
CREATE TABLE provisioning_attempts (
    id BIGSERIAL PRIMARY KEY,
    ip_address INET NOT NULL,
    device_uuid UUID,
    provisioning_key_id UUID,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Usage**:
- Track all provisioning attempts (success and failure)
- Identify suspicious patterns
- Support rate limiting decisions

## Setup Instructions

### 1. Install Dependencies

```bash
cd api
npm install bcrypt express-rate-limit winston @types/bcrypt
```

### 2. Run Database Migrations

```bash
# Run migrations
npx ts-node scripts/run-migrations.ts
```

This creates:
- `provisioning_keys` table
- `device_api_keys` table (for future key rotation)
- `audit_logs` table
- `provisioning_attempts` table
- Additional columns in `devices` table

### 3. Create Provisioning Key

```bash
# Create a provisioning key for testing
FLEET_ID="production-fleet" \
MAX_DEVICES="100" \
EXPIRES_IN_DAYS="365" \
DESCRIPTION="Production provisioning key" \
npx ts-node scripts/create-provisioning-key.ts
```

**Output**:
```
✅ Provisioning key created successfully!

══════════════════════════════════════════════════════════════
Key ID:          abc123...
Fleet ID:        production-fleet
Max Devices:     100
Expires in:      365 days
Description:     Production provisioning key
══════════════════════════════════════════════════════════════

🔐 PROVISIONING KEY (save this securely):
──────────────────────────────────────────────────────────────
a1b2c3d4e5f6...64-character-hex-string...
──────────────────────────────────────────────────────────────

⚠️  WARNING: This key will only be displayed once!
```

**Save this key** - it cannot be recovered! The database only stores the bcrypt hash.

### 4. Update Device Installation

Use the provisioning key during device installation:

```bash
# Method 1: Environment variable
PROVISIONING_API_KEY="your-key-here" ./bin/install.sh

# Method 2: Interactive prompt (prompts for key)
./bin/install.sh
```

## API Changes

### Registration Endpoint

**POST** `/api/v1/device/register`

**Changes**:
1. **Validates provisioning key** against database (no longer accepts any key)
2. **Hashes device API key** before storage
3. **Rate limited** to 5 attempts per 15 minutes per IP
4. **Logs all attempts** to audit log and provisioning_attempts table
5. **Prevents duplicate registration** (409 Conflict if device exists)

**Response Codes**:
- `200` - Success
- `400` - Missing required fields
- `401` - Invalid/expired provisioning key
- `409` - Device already registered
- `429` - Rate limit exceeded
- `500` - Server error

### Key Exchange Endpoint

**POST** `/api/v1/device/:uuid/key-exchange`

**Changes**:
1. **Verifies device API key** against hashed value in database
2. **Rate limited** to 10 attempts per hour per IP
3. **Logs authentication events** to audit log

**Response Codes**:
- `200` - Success
- `400` - Missing credentials
- `401` - Invalid device API key
- `404` - Device not found
- `429` - Rate limit exceeded
- `500` - Server error

## Security Best Practices

### ✅ Implemented

1. **Never store plain-text keys** - All keys hashed with bcrypt
2. **Validate all provisioning keys** - Database lookup with expiration check
3. **Rate limiting** - Prevent brute force attacks
4. **Audit logging** - Complete trail of security events
5. **Device limits** - Provisioning keys have max device count
6. **Key expiration** - Provisioning keys expire after configurable period
7. **IP tracking** - Log IP addresses for abuse detection

### 🟡 Recommended (Future Enhancements)

From the security analysis document:

1. **Certificate-based authentication** - Replace/supplement API keys with X.509 certificates
2. **CSR-based provisioning** - Private keys never leave device
3. **Key rotation** - Automatic rotation of device API keys
4. **Hardware security** - TPM/HSM integration for private key storage
5. **Device attestation** - Verify device identity with manufacturer certificates
6. **Fleet templates** - Policy-based provisioning similar to AWS IoT

## Monitoring & Operations

### View Audit Logs

```sql
-- Recent provisioning events
SELECT event_type, device_uuid, ip_address, severity, created_at, details
FROM audit_logs
WHERE event_type LIKE 'provisioning%'
ORDER BY created_at DESC
LIMIT 20;

-- Failed authentication attempts
SELECT event_type, device_uuid, ip_address, created_at, details
FROM audit_logs
WHERE event_type IN ('authentication_failed', 'provisioning_key_invalid')
ORDER BY created_at DESC
LIMIT 20;

-- Rate limit violations
SELECT ip_address, COUNT(*) as violations, MAX(created_at) as last_violation
FROM audit_logs
WHERE event_type = 'rate_limit_exceeded'
GROUP BY ip_address
ORDER BY violations DESC;
```

### Provisioning Key Management

```sql
-- List active provisioning keys
SELECT id, fleet_id, max_devices, devices_provisioned, expires_at, created_at
FROM provisioning_keys
WHERE is_active = true
ORDER BY created_at DESC;

-- Check key usage
SELECT 
    pk.fleet_id,
    pk.max_devices,
    pk.devices_provisioned,
    pk.devices_provisioned::float / pk.max_devices * 100 as usage_percent,
    pk.expires_at
FROM provisioning_keys pk
WHERE pk.is_active = true;

-- Revoke a provisioning key
UPDATE provisioning_keys
SET is_active = false
WHERE id = 'key-id-here';
```

### Provisioning Attempts Analysis

```sql
-- Failed attempts by IP
SELECT ip_address, COUNT(*) as attempts, MAX(created_at) as last_attempt
FROM provisioning_attempts
WHERE success = false
AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY ip_address
ORDER BY attempts DESC;

-- Successful provisioning by fleet
SELECT 
    d.fleet_id,
    COUNT(*) as devices_provisioned,
    MIN(d.provisioned_at) as first_device,
    MAX(d.provisioned_at) as last_device
FROM devices d
WHERE d.fleet_id IS NOT NULL
GROUP BY d.fleet_id;
```

## Troubleshooting

### Device Registration Fails with "Invalid provisioning key"

**Causes**:
1. Key expired
2. Key not in database
3. Key typo/corruption
4. Device limit reached

**Resolution**:
```bash
# Check key status
psql -d Iotistic -c "SELECT id, fleet_id, is_active, expires_at, devices_provisioned, max_devices FROM provisioning_keys;"

# Create new key if needed
npx ts-node scripts/create-provisioning-key.ts
```

### Rate Limit Exceeded

**Causes**:
1. Too many failed attempts from same IP
2. Multiple devices provisioning simultaneously from same network

**Resolution**:
```sql
-- Check failed attempts
SELECT * FROM provisioning_attempts 
WHERE ip_address = 'your-ip-here' 
AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Clear attempts (if legitimate)
DELETE FROM provisioning_attempts 
WHERE ip_address = 'your-ip-here' 
AND created_at < NOW() - INTERVAL '1 hour';
```

### Device API Key Not Working After Registration

**Causes**:
1. Key not hashed during registration (old device)
2. Database migration not run
3. Key corruption

**Resolution**:
```sql
-- Check if device has key hash
SELECT uuid, device_name, device_api_key_hash IS NOT NULL as has_key 
FROM devices 
WHERE uuid = 'device-uuid-here';

-- Re-register device with new key (delete old device first)
DELETE FROM devices WHERE uuid = 'device-uuid-here';
-- Then re-run device provisioning
```

## Migration from Old System

If you have existing devices registered before security implementation:

1. **Backup database** before running migrations
2. **Run migrations** to add new columns
3. **Devices without hashed keys** will fail authentication
4. **Re-provision existing devices** with new provisioning keys
5. **Old devices** can be deleted: `DELETE FROM devices WHERE device_api_key_hash IS NULL;`

**Migration Script** (optional):
```sql
-- Find devices without security metadata
SELECT uuid, device_name, device_api_key_hash IS NULL as needs_migration
FROM devices
WHERE device_api_key_hash IS NULL
OR fleet_id IS NULL;

-- Clean up old devices (CAUTION!)
-- DELETE FROM devices WHERE device_api_key_hash IS NULL;
```

## References

- [Security Analysis Document](./SECURITY-ANALYSIS-PROVISIONING.md)
- [AWS IoT Fleet Provisioning](../aws-iot-device-client/source/fleetprovisioning/README.md)
- [bcrypt npm package](https://www.npmjs.com/package/bcrypt)
- [express-rate-limit](https://www.npmjs.com/package/express-rate-limit)
- [Winston Logger](https://github.com/winstonjs/winston)

## Support

For issues or questions:
1. Check audit logs for error details
2. Review provisioning_attempts table
3. Verify provisioning key status
4. Check device API key hash exists

---

**Last Updated**: October 14, 2025
**Version**: 1.0.0
