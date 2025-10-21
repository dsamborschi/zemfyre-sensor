/**
 * Device Provisioning and Authentication Routes
 * Handles two-phase device authentication and provisioning key management
 * 
 * Provisioning Key Management:
 * - POST /api/v1/provisioning-keys - Create new provisioning key for fleet
 * - GET /api/v1/provisioning-keys?fleetId=xxx - List provisioning keys for a fleet
 * - DELETE /api/v1/provisioning-keys/:keyId - Revoke a provisioning key
 * 
 * Two-Phase Device Authentication:
 * - POST /api/v1/device/register - Register new device (phase 1: provisioning key)
 * - POST /api/v1/device/:uuid/key-exchange - Exchange keys (phase 2: device key verification)
 */

import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import {
  DeviceModel,
} from '../db/models';
import { query } from '../db/connection';
import {
  validateProvisioningKey,
  incrementProvisioningKeyUsage,
  createProvisioningKey,
  revokeProvisioningKey,
  listProvisioningKeys
} from '../utils/provisioning-keys';
import {
  logAuditEvent,
  logProvisioningAttempt,
  checkProvisioningRateLimit,
  AuditEventType,
  AuditSeverity
} from '../utils/audit-logger';
import { EventPublisher } from '../services/event-sourcing';
import {
  getBrokerConfigForDevice,
  buildBrokerUrl,
  formatBrokerConfigForClient
} from '../utils/mqtt-broker-config';

export const router = express.Router();

// Initialize event publisher for audit trail
const eventPublisher = new EventPublisher();

// ============================================================================
// Rate Limiting Middleware
// ============================================================================

// Rate limit for provisioning endpoint - 5 attempts per 15 minutes per IP
const provisioningLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many provisioning attempts from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    await logAuditEvent({
      eventType: AuditEventType.RATE_LIMIT_EXCEEDED,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      severity: AuditSeverity.WARNING,
      details: { endpoint: '/device/register' }
    });
    res.status(429).json({
      error: 'Too many requests',
      message: 'Too many provisioning attempts from this IP, please try again later'
    });
  }
});

// Rate limit for key exchange - 10 attempts per hour
const keyExchangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many key exchange attempts, please try again later'
});

// ============================================================================
// Provisioning Key Management Endpoints
// ============================================================================

/**
 * Create a new provisioning key
 * POST /api/v1/provisioning-keys
 * 
 * Body:
 * - fleetId: Fleet/application identifier (required)
 * - maxDevices: Maximum number of devices (default: 100)
 * - expiresInDays: Expiration in days (default: 365)
 * - description: Key description (optional)
 * 
 * Auth: Requires admin authentication (basic implementation for now)
 */
router.post('/provisioning-keys', async (req, res) => {
  try {
    const { fleetId, maxDevices = 100, expiresInDays = 365, description } = req.body;

    // Basic validation
    if (!fleetId || typeof fleetId !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'fleetId is required and must be a string'
      });
    }

    if (maxDevices && (typeof maxDevices !== 'number' || maxDevices < 1 || maxDevices > 10000)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'maxDevices must be a number between 1 and 10000'
      });
    }

    if (expiresInDays && (typeof expiresInDays !== 'number' || expiresInDays < 1 || expiresInDays > 3650)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'expiresInDays must be a number between 1 and 3650 (10 years)'
      });
    }

    console.log(`🔑 Creating provisioning key for fleet: ${fleetId}`);

    const { id, key } = await createProvisioningKey(
      fleetId,
      maxDevices,
      expiresInDays,
      description,
      'api-admin' // TODO: Replace with actual authenticated user
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    console.log(`✅ Provisioning key created: ${id}`);

    res.status(201).json({
      id,
      key, // WARNING: Only returned once!
      fleetId,
      maxDevices,
      expiresAt: expiresAt.toISOString(),
      description,
      warning: 'Store this key securely - it cannot be retrieved again!'
    });
  } catch (error: any) {
    console.error('❌ Error creating provisioning key:', error);
    res.status(500).json({
      error: 'Failed to create provisioning key',
      message: error.message
    });
  }
});

/**
 * List provisioning keys for a fleet
 * GET /api/v1/provisioning-keys?fleetId=xxx
 * 
 * Returns key metadata (NOT the actual keys)
 */
router.get('/provisioning-keys', async (req, res) => {
  try {
    const { fleetId } = req.query;

    if (!fleetId || typeof fleetId !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'fleetId query parameter is required'
      });
    }

    console.log(`📋 Listing provisioning keys for fleet: ${fleetId}`);

    const keys = await listProvisioningKeys(fleetId);

    // Remove sensitive data before sending
    const sanitizedKeys = keys.map(k => ({
      id: k.id,
      fleet_id: k.fleet_id,
      description: k.description,
      max_devices: k.max_devices,
      devices_provisioned: k.devices_provisioned,
      expires_at: k.expires_at,
      is_active: k.is_active,
      created_at: k.created_at,
      created_by: k.created_by,
      last_used_at: k.last_used_at,
      // key_hash is intentionally excluded for security
    }));

    res.json({
      fleet_id: fleetId,
      count: sanitizedKeys.length,
      keys: sanitizedKeys
    });
  } catch (error: any) {
    console.error('❌ Error listing provisioning keys:', error);
    res.status(500).json({
      error: 'Failed to list provisioning keys',
      message: error.message
    });
  }
});

/**
 * Revoke a provisioning key
 * DELETE /api/v1/provisioning-keys/:keyId
 * 
 * Body:
 * - reason: Reason for revocation (optional)
 */
router.delete('/provisioning-keys/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;
    const { reason } = req.body;

    if (!keyId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'keyId is required'
      });
    }

    console.log(`🚫 Revoking provisioning key: ${keyId}`);

    await revokeProvisioningKey(keyId, reason);

    console.log(`✅ Provisioning key revoked: ${keyId}`);

    res.json({
      status: 'ok',
      message: 'Provisioning key revoked',
      keyId,
      reason
    });
  } catch (error: any) {
    console.error('❌ Error revoking provisioning key:', error);
    res.status(500).json({
      error: 'Failed to revoke provisioning key',
      message: error.message
    });
  }
});

// ============================================================================
// Provisioning & Authentication Endpoints (Two-Phase)
// ============================================================================

/**
 * Register new device with provisioning API key
 * POST /api/v1/device/register
 * 
 * Phase 1 of two-phase authentication:
 * 1. Validates provisioning key against database
 * 2. Hashes device API key before storage
 * 3. Rate limits provisioning attempts
 * 4. Logs all provisioning events for audit trail
 * 
 * Security Features:
 * - Provisioning key validation
 * - Rate limiting (5 attempts per 15 minutes per IP)
 * - Device API key hashing (bcrypt)
 * - Comprehensive audit logging
 * - Event sourcing for device lifecycle
 */
router.post('/device/register', provisioningLimiter, async (req, res) => {
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];
  let provisioningKeyRecord: any = null;

  try {
    const { uuid, deviceName, deviceType, deviceApiKey, applicationId, macAddress, osVersion, supervisorVersion } = req.body;
    const provisioningApiKey = req.headers.authorization?.replace('Bearer ', '');

    // Validate required fields
    if (!uuid || !deviceName || !deviceType || !deviceApiKey) {
      await logAuditEvent({
        eventType: AuditEventType.PROVISIONING_FAILED,
        ipAddress,
        userAgent,
        severity: AuditSeverity.WARNING,
        details: { reason: 'Missing required fields', uuid: uuid?.substring(0, 8) }
      });
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'uuid, deviceName, deviceType, and deviceApiKey are required'
      });
    }

    if (!provisioningApiKey) {
      await logAuditEvent({
        eventType: AuditEventType.PROVISIONING_FAILED,
        deviceUuid: uuid,
        ipAddress,
        userAgent,
        severity: AuditSeverity.WARNING,
        details: { reason: 'Missing provisioning API key' }
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Provisioning API key required in Authorization header'
      });
    }

    // SECURITY: Check provisioning rate limit for this IP
    await checkProvisioningRateLimit(ipAddress!);

    // SECURITY: Validate provisioning key against database
    console.log('🔐 Validating provisioning key...');
    const keyValidation = await validateProvisioningKey(provisioningApiKey, ipAddress);
    
    if (!keyValidation.valid) {
      await logProvisioningAttempt(ipAddress!, uuid, null, false, keyValidation.error, userAgent);
      return res.status(401).json({
        error: 'Invalid provisioning key',
        message: keyValidation.error
      });
    }

    provisioningKeyRecord = keyValidation.keyRecord!;
    console.log('✅ Provisioning key validated for fleet:', provisioningKeyRecord.fleet_id);

    await logAuditEvent({
      eventType: AuditEventType.PROVISIONING_STARTED,
      deviceUuid: uuid,
      ipAddress,
      userAgent,
      severity: AuditSeverity.INFO,
      details: {
        deviceName,
        deviceType,
        fleetId: provisioningKeyRecord.fleet_id
      }
    });

    // Check if device already exists
    let device = await DeviceModel.getByUuid(uuid);
    
    if (device) {
      console.log('⚠️  Device already registered, preventing duplicate registration');
      await logAuditEvent({
        eventType: AuditEventType.PROVISIONING_FAILED,
        deviceUuid: uuid,
        ipAddress,
        severity: AuditSeverity.WARNING,
        details: { reason: 'Device already registered', existingDeviceId: device.id }
      });
      
      // Log failed attempt but don't reveal device exists (security)
      await logProvisioningAttempt(ipAddress!, uuid, provisioningKeyRecord.id, false, 'Device already registered', userAgent);
      
      return res.status(409).json({
        error: 'Device registration failed',
        message: 'This device is already registered'
      });
    }

    // Create new device
    device = await DeviceModel.getOrCreate(uuid);
    console.log('✅ New device created');

    // SECURITY: Hash device API key before storage (NEVER store plain text!)
    const deviceApiKeyHash = await bcrypt.hash(deviceApiKey, 10);
    console.log('🔒 Device API key hashed for secure storage');

    // Store device metadata in the database
    device = await DeviceModel.update(uuid, {
      device_name: deviceName,
      device_type: deviceType,
      provisioning_state: 'registered',
      status: 'online',
      mac_address: macAddress,
      os_version: osVersion,
      supervisor_version: supervisorVersion,
      device_api_key_hash: deviceApiKeyHash,
      fleet_id: provisioningKeyRecord.fleet_id,
      provisioned_by_key_id: provisioningKeyRecord.id,
      provisioned_at: new Date(),
      is_online: true,
      is_active: true
    });

    console.log(`✅ Device metadata stored: ${deviceName} (${deviceType}) - State: registered, Status: online`);

    // 1. Generate MQTT username (device UUID) and random password
    const mqttUsername = "device_" + uuid;
    const mqttPassword = crypto.randomBytes(16).toString('base64');
    const mqttPasswordHash = await bcrypt.hash(mqttPassword, 10);

    // 2. Insert into mqtt_users (if not exists)
    await query(
      `INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)
       VALUES ($1, $2, false, true)
       ON CONFLICT (username) DO NOTHING
       RETURNING id, username`,
      [mqttUsername, mqttPasswordHash]
    );

    // 3. Insert default ACLs (allow publish/subscribe to sensor topics)
    // Access 7 = READ (1) + WRITE (2) + SUBSCRIBE (4)
    await query(
      `INSERT INTO mqtt_acls (username, topic, access, priority)
       VALUES ($1, $2, 7, 0)
       ON CONFLICT DO NOTHING`,
      [mqttUsername, `iot/device/${uuid}/#`]
    );

    // Increment provisioning key usage counter
    await incrementProvisioningKeyUsage(provisioningKeyRecord.id);

    // 🎉 EVENT SOURCING: Publish device provisioned event
    await eventPublisher.publish(
      'device.provisioned',
      'device',
      uuid,
      {
        device_name: deviceName,
        device_type: deviceType,
        fleet_id: provisioningKeyRecord.fleet_id,
        provisioned_at: new Date().toISOString(),
        ip_address: ipAddress,
        mac_address: macAddress,
        os_version: osVersion,
        supervisor_version: supervisorVersion,
        mqttUsername
      },
      {
        metadata: {
          user_agent: userAgent,
          provisioning_key_id: provisioningKeyRecord.id,
          endpoint: '/device/register'
        }
      }
    );

    // Log successful provisioning
    await logAuditEvent({
      eventType: AuditEventType.DEVICE_REGISTERED,
      deviceUuid: uuid,
      ipAddress,
      userAgent,
      severity: AuditSeverity.INFO,
      details: {
        deviceId: device.id,
        deviceName,
        deviceType,
        fleetId: provisioningKeyRecord.fleet_id,
        mqttUsername
      }
    });

    await logProvisioningAttempt(ipAddress!, uuid, provisioningKeyRecord.id, true, undefined, userAgent);

    // Fetch MQTT broker configuration from database
    // Use default broker if no specific broker is assigned to this device
    const brokerConfig = await getBrokerConfigForDevice(uuid);
    
    if (brokerConfig) {
      console.log(`📡 Using MQTT broker: ${brokerConfig.name} (${buildBrokerUrl(brokerConfig)})`);
    } else {
      console.log('⚠️  No broker configuration found in database, using environment variable fallback');
    }

    // Build broker URL (fallback to env var if no database config)
    const brokerUrl = brokerConfig 
      ? buildBrokerUrl(brokerConfig)
      : (process.env.MQTT_BROKER_URL || 'mqtt://mosquitto:1883');

    // Return device info + MQTT credentials + broker configuration
    const response = {
      id: device.id,
      uuid: device.uuid,
      deviceName: deviceName,
      deviceType: deviceType,
      applicationId: applicationId,
      fleetId: provisioningKeyRecord.fleet_id,
      createdAt: device.created_at.toISOString(),
      mqtt: {
        username: mqttUsername,
        password: mqttPassword,
        broker: brokerUrl,
        // Include detailed broker configuration if available
        ...(brokerConfig && {
          brokerConfig: formatBrokerConfigForClient(brokerConfig)
        }),
        topics: {
          publish: [`iot/device/${uuid}/#`],
          subscribe: [`iot/device/${uuid}/#`]
        }
      }
    };

    console.log('✅ Device registered successfully:', response.id);
    res.status(200).json(response);

  } catch (error: any) {
    console.error('❌ Error registering device:', error);
    
    await logAuditEvent({
      eventType: AuditEventType.PROVISIONING_FAILED,
      ipAddress,
      userAgent,
      severity: AuditSeverity.ERROR,
      details: { error: error.message }
    });

    await logProvisioningAttempt(
      ipAddress!, 
      req.body.uuid, 
      provisioningKeyRecord?.id || null, 
      false, 
      error.message,
      userAgent
    );

    res.status(500).json({
      error: 'Failed to register device',
      message: error.message
    });
  }
});

/**
 * Exchange keys - verify device can authenticate with deviceApiKey
 * POST /api/v1/device/:uuid/key-exchange
 * 
 * Phase 2 of two-phase authentication:
 * - Verifies deviceApiKey against hashed value in database
 * - Uses bcrypt.compare for secure verification
 * - Rate limited (10 attempts per hour)
 * - Logs all authentication events
 * 
 * Security Features:
 * - Secure key comparison using bcrypt
 * - Rate limiting to prevent brute force attacks
 * - Comprehensive audit logging
 * - No sensitive information in error messages
 */
router.post('/device/:uuid/key-exchange', keyExchangeLimiter, async (req, res) => {
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];

  try {
    const { uuid } = req.params;
    const { deviceApiKey } = req.body;
    const authKey = req.headers.authorization?.replace('Bearer ', '');

    if (!deviceApiKey || !authKey) {
      await logAuditEvent({
        eventType: AuditEventType.KEY_EXCHANGE_FAILED,
        deviceUuid: uuid,
        ipAddress,
        userAgent,
        severity: AuditSeverity.WARNING,
        details: { reason: 'Missing credentials' }
      });
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'deviceApiKey required in body and Authorization header'
      });
    }

    if (deviceApiKey !== authKey) {
      await logAuditEvent({
        eventType: AuditEventType.KEY_EXCHANGE_FAILED,
        deviceUuid: uuid,
        ipAddress,
        userAgent,
        severity: AuditSeverity.WARNING,
        details: { reason: 'Key mismatch between body and header' }
      });
      return res.status(401).json({
        error: 'Key mismatch',
        message: 'deviceApiKey in body must match Authorization header'
      });
    }

    console.log('🔑 Key exchange request for device:', uuid.substring(0, 8) + '...');

    // Verify device exists
    const device = await DeviceModel.getByUuid(uuid);
    
    if (!device) {
      await logAuditEvent({
        eventType: AuditEventType.KEY_EXCHANGE_FAILED,
        deviceUuid: uuid,
        ipAddress,
        userAgent,
        severity: AuditSeverity.WARNING,
        details: { reason: 'Device not found' }
      });
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not registered`
      });
    }

    // SECURITY: Verify deviceApiKey against hashed value in database
    if (!device.device_api_key_hash) {
      await logAuditEvent({
        eventType: AuditEventType.KEY_EXCHANGE_FAILED,
        deviceUuid: uuid,
        ipAddress,
        userAgent,
        severity: AuditSeverity.ERROR,
        details: { reason: 'No API key hash stored for device' }
      });
      return res.status(500).json({
        error: 'Configuration error',
        message: 'Device API key not configured'
      });
    }

    const keyMatches = await bcrypt.compare(deviceApiKey, device.device_api_key_hash);
    
    if (!keyMatches) {
      await logAuditEvent({
        eventType: AuditEventType.AUTHENTICATION_FAILED,
        deviceUuid: uuid,
        ipAddress,
        userAgent,
        severity: AuditSeverity.WARNING,
        details: { reason: 'Invalid device API key' }
      });
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid device API key'
      });
    }

    console.log('✅ Key exchange successful - device API key verified');

    await logAuditEvent({
      eventType: AuditEventType.KEY_EXCHANGE_SUCCESS,
      deviceUuid: uuid,
      ipAddress,
      userAgent,
      severity: AuditSeverity.INFO,
      details: { deviceName: device.device_name }
    });

    res.json({
      status: 'ok',
      message: 'Key exchange successful',
      device: {
        id: device.id,
        uuid: device.uuid,
        deviceName: device.device_name,
      }
    });
  } catch (error: any) {
    console.error('❌ Error during key exchange:', error);
    
    await logAuditEvent({
      eventType: AuditEventType.KEY_EXCHANGE_FAILED,
      deviceUuid: req.params.uuid,
      ipAddress,
      userAgent,
      severity: AuditSeverity.ERROR,
      details: { error: error.message }
    });

    res.status(500).json({
      error: 'Key exchange failed',
      message: error.message
    });
  }
});

export default router;
