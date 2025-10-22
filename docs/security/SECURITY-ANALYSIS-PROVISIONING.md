# Security Analysis: Iotistic vs AWS IoT Fleet Provisioning

## Executive Summary

After analyzing AWS IoT Device Client's Fleet Provisioning implementation and comparing it with your current Iotistic provisioning system, I've identified several **critical security gaps** and provide actionable recommendations below.

---

## Current Iotistic Implementation Review

### ✅ What You're Doing Well

1. **Two-Phase Authentication Pattern** (similar to Balena)
   - ✅ Separate provisioning key (fleet-level) and device API key (device-specific)
   - ✅ One-time provisioning key removal after registration
   - ✅ Key exchange verification step

2. **Basic Security Practices**
   - ✅ Cryptographically secure key generation (`crypto.randomBytes(32)`)
   - ✅ Device-specific API keys pre-generated
   - ✅ Keys stored in local SQLite database

3. **Transport Security**
   - ✅ HTTPS/TLS for API communication (assuming production uses HTTPS)

---

## 🚨 Critical Security Gaps (Compared to AWS IoT)

### 1. **NO CERTIFICATE-BASED AUTHENTICATION** 
**Severity: CRITICAL**

**AWS IoT Approach:**
- Uses **X.509 certificates** for device authentication
- Mutual TLS (mTLS) - both client and server authenticate each other
- Certificates tied to IAM policies for fine-grained permissions
- Private keys can be stored in secure hardware (HSM/TPM)

**Your Current Approach:**
- ❌ Plain API keys sent in HTTP headers (`Authorization: Bearer <key>`)
- ❌ No certificate verification
- ❌ Keys stored in plain SQLite database
- ❌ No secure element/TPM integration

**Risk:**
- API keys can be intercepted if TLS is compromised
- Keys in SQLite are vulnerable to file system attacks
- No hardware root of trust

**Recommendation:**
```typescript
// Option 1: Add X.509 certificate support
interface DeviceInfo {
  uuid: string;
  deviceCertificate?: string;  // PEM-encoded X.509 cert
  devicePrivateKey?: string;   // Path to private key (or HSM reference)
  certificateArn?: string;     // Cloud-side certificate identifier
  // ... existing fields
}

// Option 2: Use JSON Web Tokens (JWT) instead of plain keys
function generateDeviceJWT(uuid: string, privateKey: string): string {
  return jwt.sign(
    { uuid, iat: Date.now(), exp: Date.now() + 86400000 },
    privateKey,
    { algorithm: 'RS256' }  // Asymmetric signing
  );
}
```

---

### 2. **NO PROVISIONING KEY VALIDATION**
**Severity: CRITICAL**

**AWS IoT Approach:**
- Claim certificates have **strictly scoped IAM policies**
- Can only publish to specific Fleet Provisioning topics
- Cannot access other devices or resources
- Template-based authorization

**Your Current Approach:**
```typescript
// TODO: Validate provisioningApiKey against fleet/application in production
// For now, accept any provisioning key for testing ❌❌❌
```

**Risk:**
- **ANY provisioning key is accepted** - no validation at all!
- Malicious actors can register unlimited devices
- No rate limiting or abuse prevention

**Recommendation:**
```typescript
// Store valid provisioning keys in database
interface ProvisioningKey {
  id: string;
  key_hash: string;  // bcrypt hashed
  fleet_id: string;
  max_devices: number;
  devices_provisioned: number;
  expires_at: Date;
  is_active: boolean;
}

// Validate provisioning key
async function validateProvisioningKey(key: string): Promise<ProvisioningKey> {
  const keyRecord = await db.query(
    'SELECT * FROM provisioning_keys WHERE is_active = true AND expires_at > NOW()'
  );
  
  for (const record of keyRecord.rows) {
    if (await bcrypt.compare(key, record.key_hash)) {
      // Check device limit
      if (record.devices_provisioned >= record.max_devices) {
        throw new Error('Provisioning key device limit exceeded');
      }
      return record;
    }
  }
  
  throw new Error('Invalid provisioning key');
}
```

---

### 3. **NO CERTIFICATE SIGNING REQUEST (CSR) SUPPORT**
**Severity: HIGH**

**AWS IoT Approach:**
- Supports **CSR-based provisioning** (CreateCertificateFromCsr API)
- Private key **NEVER leaves the device**
- Device generates key pair locally, sends only public key via CSR
- Ideal for secure hardware elements

**Your Current Approach:**
- ❌ API keys generated on device, sent to cloud
- ❌ No CSR support
- ❌ Private keys could theoretically be transmitted

**Recommendation:**
```typescript
// Add CSR-based provisioning
interface ProvisionRequest {
  uuid: string;
  deviceName: string;
  deviceType: string;
  csr?: string;  // Certificate Signing Request (PEM format)
  publicKey?: string;  // Alternative: raw public key
  // ... existing fields
}

async function provisionWithCSR(csr: string): Promise<{certificate: string}> {
  // Generate certificate from CSR using CA
  const cert = await certificateAuthority.signCSR(csr, {
    validity: 365, // days
    subject: { CN: this.deviceInfo.uuid },
    extensions: {
      keyUsage: ['digitalSignature', 'keyEncipherment'],
      extKeyUsage: ['clientAuth']
    }
  });
  
  return { certificate: cert.toString('pem') };
}
```

---

### 4. **NO KEY ROTATION MECHANISM**
**Severity: HIGH**

**AWS IoT Approach:**
- Built-in certificate rotation
- Old certificates can be deactivated
- New certificates issued without re-provisioning

**Your Current Approach:**
- ❌ Keys are generated once and stored forever
- ❌ No expiration dates
- ❌ No rotation mechanism
- ❌ Compromised key = device must be re-provisioned

**Recommendation:**
```typescript
interface DeviceApiKey {
  uuid: string;
  key_hash: string;
  issued_at: Date;
  expires_at: Date;
  revoked: boolean;
}

async function rotateDeviceKey(uuid: string): Promise<string> {
  const oldKey = await DeviceKeyModel.getCurrent(uuid);
  
  // Mark old key for revocation after grace period
  await DeviceKeyModel.update(oldKey.id, {
    expires_at: new Date(Date.now() + 86400000) // 24 hour grace
  });
  
  // Generate new key
  const newKey = crypto.randomBytes(32).toString('hex');
  await DeviceKeyModel.create({
    uuid,
    key_hash: await bcrypt.hash(newKey, 10),
    issued_at: new Date(),
    expires_at: new Date(Date.now() + 31536000000) // 1 year
  });
  
  return newKey;
}
```

---

### 5. **KEYS STORED IN PLAIN TEXT**
**Severity: CRITICAL**

**AWS IoT Approach:**
- Private keys **never** stored on cloud
- Only public certificates stored
- Supports hardware security modules (HSM/TPM)

**Your Current Approach:**
```typescript
// SQLite database stores keys in plain text ❌
deviceApiKey: this.deviceInfo.deviceApiKey || null,  
provisioningApiKey: this.deviceInfo.provisioningApiKey || null,
```

**Risk:**
- Database compromise = all device keys leaked
- File system access = keys stolen
- Backups contain plain-text keys

**Recommendation:**
```typescript
// 1. Hash keys in database (one-way)
const keyHash = await bcrypt.hash(apiKey, 10);
await db.models('device').update({ deviceApiKeyHash: keyHash });

// 2. Encrypt sensitive data at rest
import { createCipheriv, createDecipheriv } from 'crypto';

class SecureStorage {
  private masterKey: Buffer;
  
  constructor() {
    // Load master key from environment or HSM
    this.masterKey = Buffer.from(process.env.MASTER_KEY!, 'hex');
  }
  
  encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }
  
  decrypt(encryptedData: string): string {
    const buffer = Buffer.from(encryptedData, 'base64');
    const iv = buffer.subarray(0, 16);
    const authTag = buffer.subarray(16, 32);
    const encrypted = buffer.subarray(32);
    
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);
    
    return decipher.update(encrypted) + decipher.final('utf8');
  }
}
```

---

### 6. **NO RATE LIMITING OR ABUSE PREVENTION**
**Severity: HIGH**

**AWS IoT Approach:**
- Request throttling per account
- DDoS protection via AWS Shield
- Failed authentication lockout

**Your Current Approach:**
- ❌ No rate limiting on provisioning endpoint
- ❌ No failed attempt tracking
- ❌ Attacker can spam registrations

**Recommendation:**
```typescript
import rateLimit from 'express-rate-limit';

// Rate limit provisioning endpoint
const provisioningLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 provisioning attempts per IP
  message: 'Too many provisioning attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/api/v1/device/register', provisioningLimiter, async (req, res) => {
  // ... existing code
});

// Track failed attempts
interface ProvisioningAttempt {
  ip: string;
  uuid: string;
  success: boolean;
  timestamp: Date;
}

async function checkFailedAttempts(ip: string): Promise<void> {
  const recentFails = await db.query(
    `SELECT COUNT(*) FROM provisioning_attempts 
     WHERE ip = $1 AND success = false 
     AND timestamp > NOW() - INTERVAL '1 hour'`,
    [ip]
  );
  
  if (recentFails.rows[0].count > 10) {
    throw new Error('Too many failed attempts. IP temporarily blocked.');
  }
}
```

---

### 7. **NO AUDIT LOGGING**
**Severity: MEDIUM**

**AWS IoT Approach:**
- Full CloudTrail logging of all provisioning events
- Immutable audit logs
- Integration with CloudWatch for monitoring

**Your Current Approach:**
- ❌ Basic console.log statements
- ❌ No structured logging
- ❌ No audit trail for security events

**Recommendation:**
```typescript
import winston from 'winston';

const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'audit.log' }),
    new winston.transports.Console()
  ]
});

// Log security events
auditLogger.info('device_provisioning_started', {
  event: 'PROVISION_START',
  uuid: uuid.substring(0, 8) + '...',
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  timestamp: new Date().toISOString()
});

auditLogger.warn('invalid_provisioning_key', {
  event: 'PROVISION_FAILED',
  reason: 'Invalid provisioning key',
  ip: req.ip,
  timestamp: new Date().toISOString()
});
```

---

### 8. **NO DEVICE IDENTITY VERIFICATION**
**Severity: MEDIUM**

**AWS IoT Approach:**
- Device can provide hardware identifiers (serial numbers, TPM attestation)
- Template parameters verify device authenticity
- Integration with device manufacturer registries

**Your Current Approach:**
- ❌ Any device can claim any UUID
- ❌ No verification of MAC address or serial number
- ❌ No attestation or proof of identity

**Recommendation:**
```typescript
interface DeviceIdentity {
  uuid: string;
  serialNumber: string;  // From hardware
  tpmAttestationData?: string;  // TPM quote
  manufacturerCert?: string;  // Device manufacturer certificate
  hardwareSignature?: string;  // Signed by device hardware
}

async function verifyDeviceIdentity(identity: DeviceIdentity): Promise<boolean> {
  // 1. Verify serial number format
  if (!isValidSerialNumber(identity.serialNumber)) {
    throw new Error('Invalid serial number format');
  }
  
  // 2. Check against manufacturer database
  const isAuthorized = await manufacturerRegistry.verify(identity.serialNumber);
  if (!isAuthorized) {
    throw new Error('Device not authorized by manufacturer');
  }
  
  // 3. Verify TPM attestation if provided
  if (identity.tpmAttestationData) {
    const tpmValid = await tpm.verifyAttestation(identity.tpmAttestationData);
    if (!tpmValid) {
      throw new Error('TPM attestation failed');
    }
  }
  
  return true;
}
```

---

## Priority Recommendations (Ranked)

### 🔴 **CRITICAL - Implement Immediately:**

1. **Validate Provisioning Keys** (1-2 days)
   - Create `provisioning_keys` table
   - Hash keys with bcrypt
   - Enforce expiration and device limits
   - Remove TODO comment accepting any key!

2. **Hash Device API Keys** (1 day)
   - Never store plain-text keys in database
   - Use bcrypt or Argon2 for hashing
   - Verify keys during authentication

3. **Add Rate Limiting** (1 day)
   - Install `express-rate-limit`
   - Limit provisioning endpoint to 5 attempts/15 min per IP
   - Track failed attempts

### 🟡 **HIGH - Implement Soon:**

4. **Certificate-Based Authentication** (1-2 weeks)
   - Add X.509 certificate support
   - Implement CSR-based provisioning
   - Integrate with OpenSSL or PKI library

5. **Key Rotation** (1 week)
   - Add key expiration dates
   - Implement rotation endpoint
   - Grace period for old keys

6. **Audit Logging** (2-3 days)
   - Switch to structured logging (Winston/Bunyan)
   - Log all security events
   - Ship logs to centralized system

### 🟢 **MEDIUM - Plan for Future:**

7. **Hardware Security Module Support** (2-4 weeks)
   - Research TPM/HSM integration
   - Add secure enclave support
   - Implement attestation

8. **Device Identity Verification** (1-2 weeks)
   - Serial number validation
   - Manufacturer certificate verification
   - Hardware-based attestation

---

## Sample Secure Implementation

Here's a complete rewrite of your registration endpoint with security improvements:

```typescript
// api/src/routes/cloud.ts - SECURE VERSION

import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';

// Rate limiter
const provisioningLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many provisioning attempts'
});

// Provisioning key validation
async function validateProvisioningKey(key: string): Promise<{
  id: string;
  fleet_id: string;
  max_devices: number;
  devices_provisioned: number;
}> {
  const keys = await query(
    `SELECT * FROM provisioning_keys 
     WHERE is_active = true 
     AND expires_at > NOW()`
  );
  
  for (const record of keys.rows) {
    if (await bcrypt.compare(key, record.key_hash)) {
      // Check device limit
      if (record.devices_provisioned >= record.max_devices) {
        throw new Error('Device limit exceeded for this provisioning key');
      }
      
      // Log usage
      await auditLogger.info('provisioning_key_used', {
        key_id: record.id,
        fleet_id: record.fleet_id,
        devices_remaining: record.max_devices - record.devices_provisioned
      });
      
      return record;
    }
  }
  
  // Log failed attempt
  await auditLogger.warn('invalid_provisioning_key_attempt', {
    ip: req.ip,
    timestamp: new Date()
  });
  
  throw new Error('Invalid provisioning key');
}

router.post('/api/v1/device/register', provisioningLimiter, async (req, res) => {
  try {
    const { uuid, deviceName, deviceType, deviceApiKey, applicationId, 
            macAddress, osVersion, supervisorVersion, csr } = req.body;
    const provisioningApiKey = req.headers.authorization?.replace('Bearer ', '');

    // Validate inputs
    if (!uuid || !deviceName || !deviceType) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    if (!provisioningApiKey) {
      return res.status(401).json({
        error: 'Provisioning API key required'
      });
    }

    // Validate provisioning key (CRITICAL!)
    const provisioningKeyRecord = await validateProvisioningKey(provisioningApiKey);
    
    // Check if device already exists
    const existingDevice = await DeviceModel.getByUuid(uuid);
    if (existingDevice) {
      // Prevent duplicate registration
      await auditLogger.warn('duplicate_device_registration', {
        uuid: uuid.substring(0, 8) + '...',
        existing_device_id: existingDevice.id
      });
      
      return res.status(409).json({
        error: 'Device already registered'
      });
    }

    // Generate device certificate if CSR provided
    let certificate, privateKey;
    if (csr) {
      certificate = await certificateAuthority.signCSR(csr);
      // Private key stays on device
    } else {
      // Fall back to API key (less secure)
      if (!deviceApiKey) {
        return res.status(400).json({
          error: 'Either CSR or deviceApiKey required'
        });
      }
    }

    // Create device
    const device = await DeviceModel.create({
      uuid,
      device_name: deviceName,
      device_type: deviceType,
      provisioning_state: 'registered',
      status: 'online',
      mac_address: macAddress,
      os_version: osVersion,
      supervisor_version: supervisorVersion,
      fleet_id: provisioningKeyRecord.fleet_id,
      certificate_pem: certificate,
      // Hash device API key (never store plain text!)
      device_api_key_hash: deviceApiKey ? await bcrypt.hash(deviceApiKey, 10) : null,
      provisioned_at: new Date(),
      is_online: true,
      is_active: true
    });

    // Increment provisioning key usage counter
    await query(
      `UPDATE provisioning_keys 
       SET devices_provisioned = devices_provisioned + 1 
       WHERE id = $1`,
      [provisioningKeyRecord.id]
    );

    // Audit log
    await auditLogger.info('device_provisioned_successfully', {
      device_id: device.id,
      uuid: uuid.substring(0, 8) + '...',
      device_name: deviceName,
      fleet_id: provisioningKeyRecord.fleet_id,
      ip: req.ip
    });

    res.status(200).json({
      id: device.id,
      uuid: device.uuid,
      deviceName: deviceName,
      certificate: certificate, // Return certificate if generated
      createdAt: device.created_at.toISOString()
    });
    
  } catch (error: any) {
    await auditLogger.error('device_provisioning_failed', {
      error: error.message,
      ip: req.ip
    });
    
    res.status(500).json({
      error: 'Provisioning failed',
      message: error.message
    });
  }
});
```

---

## Database Schema Updates

```sql
-- Provisioning keys table
CREATE TABLE IF NOT EXISTS provisioning_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash VARCHAR(255) NOT NULL,  -- bcrypt hashed
    fleet_id VARCHAR(100) NOT NULL,
    max_devices INTEGER DEFAULT 100,
    devices_provisioned INTEGER DEFAULT 0,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    CONSTRAINT devices_not_exceeded CHECK (devices_provisioned <= max_devices)
);

-- Device API keys with expiration
CREATE TABLE IF NOT EXISTS device_api_keys (
    id SERIAL PRIMARY KEY,
    device_uuid UUID NOT NULL REFERENCES devices(uuid) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,  -- bcrypt hashed
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    revoked_reason VARCHAR(255),
    UNIQUE(device_uuid, key_hash)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    device_uuid UUID,
    user_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_device_uuid ON audit_logs(device_uuid);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Provisioning attempts tracking
CREATE TABLE IF NOT EXISTS provisioning_attempts (
    id BIGSERIAL PRIMARY KEY,
    ip_address INET NOT NULL,
    device_uuid UUID,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provisioning_attempts_ip ON provisioning_attempts(ip_address, created_at);
```

---

## Conclusion

Your current provisioning system has **good foundations** (two-phase auth, key generation) but lacks **critical security controls** found in production-grade systems like AWS IoT.

**Immediate Action Items:**
1. ✅ Implement provisioning key validation (remove TODO comment!)
2. ✅ Hash all API keys in database
3. ✅ Add rate limiting
4. ✅ Implement audit logging

**Long-term Goals:**
1. 🎯 Move to certificate-based authentication
2. 🎯 Add CSR support to keep private keys secure
3. 🎯 Implement key rotation
4. 🎯 Add hardware security module support

This will bring your system from **prototype security** to **production-grade security**.
