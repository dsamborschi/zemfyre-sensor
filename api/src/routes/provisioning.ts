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
import { query } from '../db/connection';
import {
  DeviceModel,
  DeviceTargetStateModel,
} from '../db/models';
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
import { SystemConfigModel } from '../db/system-config-model';
import { generateDefaultTargetState } from '../services/default-target-state-generator';

export const router = express.Router();

// Initialize event publisher for audit trail
const eventPublisher = new EventPublisher();

// ============================================================================
// Rate Limiting Middleware
// ============================================================================

/**
 * Dual Rate Limiting Strategy for Provisioning:
 * 
 * 1. provisioningLimiter (middleware): Limits ALL provisioning attempts
 *    - 5 attempts per 15 minutes per IP
 *    - In-memory tracking (fast, but resets on restart)
 *    - Prevents endpoint spamming
 * 
 * 2. checkProvisioningRateLimit (database): Limits FAILED attempts only
 *    - 10 failed attempts per hour per IP
 *    - Database-backed (persistent across restarts)
 *    - Prevents brute force attacks on provisioning keys
 * 
 * Both work together: middleware catches spam, database check catches attacks
 */
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
      details: { endpoint: '/device/register', type: 'middleware' }
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

    // Check license device limit before creating provisioning key
    const licenseValidator = (req as any).licenseValidator;
    if (licenseValidator) {
      const license = licenseValidator.getLicense();
      const maxDevicesAllowed = license.features.maxDevices;
      
      // Count current active devices
      const deviceCountResult = await query('SELECT COUNT(*) as count FROM devices WHERE is_active = true');
      const currentDeviceCount = parseInt(deviceCountResult.rows[0].count);
      
      if (currentDeviceCount >= maxDevicesAllowed) {
        await logAuditEvent({
          eventType: AuditEventType.PROVISIONING_FAILED,
          severity: AuditSeverity.WARNING,
          details: {
            reason: 'Device limit exceeded - cannot create provisioning key',
            currentDevices: currentDeviceCount,
            maxDevices: maxDevicesAllowed,
            plan: license.plan,
            fleetId
          }
        });

        return res.status(403).json({
          error: 'Device limit exceeded',
          message: `Your ${license.plan} plan allows a maximum of ${maxDevicesAllowed} devices. You currently have ${currentDeviceCount} active devices. Please upgrade your plan to add more devices.`,
          details: {
            currentDevices: currentDeviceCount,
            maxDevices: maxDevicesAllowed,
            plan: license.plan
          }
        });
      }

      console.log(`✅ License check passed: ${currentDeviceCount}/${maxDevicesAllowed} devices`);
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

// Helper functions for device registration

interface RegistrationRequest {
  uuid: string;
  deviceName: string;
  deviceType: string;
  deviceApiKey: string;
  applicationId?: string;
  macAddress?: string;
  osVersion?: string;
  agentVersion?: string;
}

/**
 * Validate registration request fields
 */
async function validateRegistrationRequest(
  req: any,
  ipAddress: string | undefined,
  userAgent: string | undefined
): Promise<{ valid: boolean; data?: RegistrationRequest; provisioningApiKey?: string }> {
  const { uuid, deviceName, deviceType, deviceApiKey, applicationId, macAddress, osVersion, agentVersion } = req.body;
  const provisioningApiKey = req.headers.authorization?.replace('Bearer ', '');

  // Check required fields
  if (!uuid || !deviceName || !deviceType || !deviceApiKey) {
    await logAuditEvent({
      eventType: AuditEventType.PROVISIONING_FAILED,
      ipAddress,
      userAgent,
      severity: AuditSeverity.WARNING,
      details: { reason: 'Missing required fields', uuid: uuid?.substring(0, 8) }
    });
    return { valid: false };
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
    return { valid: false };
  }

  return {
    valid: true,
    data: { uuid, deviceName, deviceType, deviceApiKey, applicationId, macAddress, osVersion, agentVersion },
    provisioningApiKey
  };
}

/**
 * Create device record in database
 */
async function createDeviceRecord(
  data: RegistrationRequest,
  provisioningKeyRecord: any
): Promise<any> {
  const { uuid, deviceName, deviceType, deviceApiKey, macAddress, osVersion, agentVersion } = data;

  // Hash device API key
  const deviceApiKeyHash = await bcrypt.hash(deviceApiKey, 10);
  console.log('🔒 Device API key hashed for secure storage');

  // Create device
  let device = await DeviceModel.getOrCreate(uuid);
  console.log('✅ New device created');

  // Update device metadata
  device = await DeviceModel.update(uuid, {
    device_name: deviceName,
    device_type: deviceType,
    provisioning_state: 'registered',
    status: 'online',
    mac_address: macAddress,
    os_version: osVersion,
    agent_version: agentVersion,
    device_api_key_hash: deviceApiKeyHash,
    fleet_id: provisioningKeyRecord.fleet_id,
    provisioned_by_key_id: provisioningKeyRecord.id,
    provisioned_at: new Date(),
    is_online: true,
    is_active: true
  });

  console.log(`✅ Device metadata stored: ${deviceName} (${deviceType})`);
  return device;
}

/**
 * Create MQTT credentials for device
 */
async function createMqttCredentials(uuid: string): Promise<{ username: string; password: string }> {
  const mqttUsername = `device_${uuid}`;
  const mqttPassword = crypto.randomBytes(16).toString('base64');
  const mqttPasswordHash = await bcrypt.hash(mqttPassword, 10);

  // Create MQTT user
  await query(
    `INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)
     VALUES ($1, $2, false, true)
     ON CONFLICT (username) DO NOTHING`,
    [mqttUsername, mqttPasswordHash]
  );

  // Create MQTT ACLs (access 7 = READ + WRITE + SUBSCRIBE)
  await query(
    `INSERT INTO mqtt_acls (username, topic, access, priority)
     VALUES ($1, $2, 7, 0)
     ON CONFLICT DO NOTHING`,
    [mqttUsername, `iot/device/${uuid}/#`]
  );

  console.log(`🔐 MQTT credentials created for: ${mqttUsername}`);
  return { username: mqttUsername, password: mqttPassword };
}

/**
 * Publish device provisioned event
 */
async function publishProvisioningEvent(
  data: RegistrationRequest,
  provisioningKeyRecord: any,
  mqttUsername: string,
  ipAddress: string | undefined,
  userAgent: string | undefined
): Promise<void> {
  await eventPublisher.publish(
    'device.provisioned',
    'device',
    data.uuid,
    {
      device_name: data.deviceName,
      device_type: data.deviceType,
      fleet_id: provisioningKeyRecord.fleet_id,
      provisioned_at: new Date().toISOString(),
      ip_address: ipAddress,
      mac_address: data.macAddress,
      os_version: data.osVersion,
      agent_version: data.agentVersion,
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
}

/**
 * Build provisioning response with MQTT config
 */
async function buildProvisioningResponse(
  device: any,
  data: RegistrationRequest,
  provisioningKeyRecord: any,
  mqttCredentials: { username: string; password: string }
): Promise<any> {
  const { uuid, deviceName, deviceType, applicationId } = data;

  // Fetch broker configuration
  const brokerConfig = await getBrokerConfigForDevice(uuid);
  
  if (brokerConfig) {
    console.log(`📡 Using MQTT broker: ${brokerConfig.name} (${buildBrokerUrl(brokerConfig)})`);
  } else {
    console.log('⚠️  No broker config in database, using environment fallback');
  }

  const brokerUrl = brokerConfig 
    ? buildBrokerUrl(brokerConfig)
    : (process.env.MQTT_BROKER_URL || 'mqtt://mosquitto:1883');

  return {
    id: device.id,
    uuid: device.uuid,
    deviceName,
    deviceType,
    applicationId,
    fleetId: provisioningKeyRecord.fleet_id,
    createdAt: device.created_at.toISOString(),
    mqtt: {
      username: mqttCredentials.username,
      password: mqttCredentials.password,
      broker: brokerUrl,
      ...(brokerConfig && {
        brokerConfig: formatBrokerConfigForClient(brokerConfig)
      }),
      topics: {
        publish: [`iot/device/${uuid}/#`],
        subscribe: [`iot/device/${uuid}/#`]
      }
    }
  };
}

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
    // Step 1: Validate request
    const validation = await validateRegistrationRequest(req, ipAddress, userAgent);
    
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'uuid, deviceName, deviceType, and deviceApiKey are required'
      });
    }

    if (!validation.provisioningApiKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Provisioning API key required in Authorization header'
      });
    }

    const data = validation.data!;
    const { uuid } = data;

    // Step 2: Check failed provisioning attempts (prevents brute force attacks)
    // Note: provisioningLimiter middleware already limits all attempts (5 per 15 min)
    // This additional check specifically blocks IPs with too many FAILED attempts (10 per hour)
    await checkProvisioningRateLimit(ipAddress!);

    // Step 3: Validate provisioning key
    console.log('🔐 Validating provisioning key...');
    const keyValidation = await validateProvisioningKey(validation.provisioningApiKey, ipAddress);
    
    if (!keyValidation.valid) {
      await logProvisioningAttempt(ipAddress!, uuid, null, false, keyValidation.error, userAgent);
      return res.status(401).json({
        error: 'Invalid provisioning key',
        message: keyValidation.error
      });
    }

    provisioningKeyRecord = keyValidation.keyRecord!;
    console.log('✅ Provisioning key validated for fleet:', provisioningKeyRecord.fleet_id);

    // Step 4: Log provisioning start
    await logAuditEvent({
      eventType: AuditEventType.PROVISIONING_STARTED,
      deviceUuid: uuid,
      ipAddress,
      userAgent,
      severity: AuditSeverity.INFO,
      details: {
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        fleetId: provisioningKeyRecord.fleet_id
      }
    });

    // Step 5: Check for duplicate registration
    const existingDevice = await DeviceModel.getByUuid(uuid);
    
    if (existingDevice) {
      // Check if device is FULLY provisioned
      // A device is considered fully provisioned if it has:
      // 1. provisioned_at timestamp set
      // 2. mqtt_username assigned
      // 3. provisioning_state is 'registered'
      const isFullyProvisioned = existingDevice.provisioned_at && 
                                 existingDevice.mqtt_username &&
                                 existingDevice.provisioning_state === 'registered';
      
      if (isFullyProvisioned) {
        // Device is complete - reject as duplicate
        console.log('⚠️  Device already registered and fully provisioned');
        await logAuditEvent({
          eventType: AuditEventType.PROVISIONING_FAILED,
          deviceUuid: uuid,
          ipAddress,
          severity: AuditSeverity.WARNING,
          details: { 
            reason: 'Device already registered', 
            existingDeviceId: existingDevice.id,
            provisionedAt: existingDevice.provisioned_at
          }
        });
        
        await logProvisioningAttempt(ipAddress!, uuid, provisioningKeyRecord.id, false, 'Device already registered', userAgent);
        
        return res.status(409).json({
          error: 'Device registration failed',
          message: 'This device is already registered and fully provisioned'
        });
      }
      
      await logAuditEvent({
        eventType: AuditEventType.PROVISIONING_FAILED, // Will be updated to success after completion
        deviceUuid: uuid,
        ipAddress,
        severity: AuditSeverity.INFO,
        details: { 
          reason: 'Incomplete provisioning detected - allowing retry',
          existingDeviceId: existingDevice.id,
          hasProvisionedAt: !!existingDevice.provisioned_at,
          hasMqttUsername: !!existingDevice.mqtt_username,
          provisioningState: existingDevice.provisioning_state
        }
      });
    }

    // Step 6: Create device record
    const device = await createDeviceRecord(data, provisioningKeyRecord);

    // Step 7: Create MQTT credentials
    const mqttCredentials = await createMqttCredentials(uuid);

    // Step 7b: Update device with MQTT username (marks provisioning as complete)
    await DeviceModel.update(uuid, {
      mqtt_username: mqttCredentials.username
    });
    console.log(`✅ Device record updated with MQTT username: ${mqttCredentials.username}`);

    // Step 7c: Create default target state based on license
    try {
      // Get license data from system_config
      const licenseData = await SystemConfigModel.get('license_data');
      console.log(`📋 Creating default target state for device ${uuid.substring(0, 8)}...`);
      
      // Generate default config based on license features
      const { apps, config } = generateDefaultTargetState(licenseData);
      
      // Set target state (will create or update)
      await DeviceTargetStateModel.set(uuid, apps, config);
      
      console.log(`✅ Default target state created:`, {
        plan: licenseData?.plan || 'unknown',
        metricsInterval: config.settings.metricsIntervalMs,
        loggingLevel: config.logging.level,
        cloudJobsEnabled: config.features.enableCloudJobs,
        metricsExportEnabled: config.features.enableMetricsExport
      });
    } catch (error) {
      console.error('⚠️  Failed to create default target state:', error);
      // Don't fail provisioning if target state creation fails
      await logAuditEvent({
        eventType: AuditEventType.PROVISIONING_FAILED,
        deviceUuid: uuid,
        ipAddress,
        severity: AuditSeverity.WARNING,
        details: { 
          reason: 'Failed to create default target state',
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }

    // Step 8: Increment provisioning key usage
    await incrementProvisioningKeyUsage(provisioningKeyRecord.id);

    // Step 9: Publish event
    await publishProvisioningEvent(data, provisioningKeyRecord, mqttCredentials.username, ipAddress, userAgent);

    // Step 10: Log success
    await logAuditEvent({
      eventType: AuditEventType.DEVICE_REGISTERED,
      deviceUuid: uuid,
      ipAddress,
      userAgent,
      severity: AuditSeverity.INFO,
      details: {
        deviceId: device.id,
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        fleetId: provisioningKeyRecord.fleet_id,
        mqttUsername: mqttCredentials.username
      }
    });

    await logProvisioningAttempt(ipAddress!, uuid, provisioningKeyRecord.id, true, undefined, userAgent);

    // Step 11: Build response
    const response = await buildProvisioningResponse(device, data, provisioningKeyRecord, mqttCredentials);

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
