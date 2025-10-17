/**
 * Cloud Multi-Device Management Routes with PostgreSQL
 * Balena-style API for managing IoT devices with two-phase authentication
 */

import express from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { query } from '../db/connection';
import {
  DeviceModel,
  DeviceTargetStateModel,
  DeviceCurrentStateModel,
  DeviceMetricsModel,
  DeviceLogsModel,
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

export const router = express.Router();

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
      details: { endpoint: '/api/v1/device/register' }
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
router.post('/api/v1/provisioning-keys', async (req, res) => {
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
router.get('/api/v1/provisioning-keys', async (req, res) => {
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
router.delete('/api/v1/provisioning-keys/:keyId', async (req, res) => {
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
// Provisioning & Authentication Endpoints
// ============================================================================

/**
 * Register new device with provisioning API key
 * POST /api/v1/device/register
 * 
 * Implements two-phase authentication with security enhancements:
 * 1. Validates provisioning key against database (not TODO anymore!)
 * 2. Hashes device API key before storage
 * 3. Rate limits provisioning attempts
 * 4. Logs all provisioning events for audit trail
 */
router.post('/api/v1/device/register', provisioningLimiter, async (req, res) => {
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

    // Increment provisioning key usage counter
    await incrementProvisioningKeyUsage(provisioningKeyRecord.id);

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
        fleetId: provisioningKeyRecord.fleet_id
      }
    });

    await logProvisioningAttempt(ipAddress!, uuid, provisioningKeyRecord.id, true, undefined, userAgent);

    const response = {
      id: device.id,
      uuid: device.uuid,
      deviceName: deviceName,
      deviceType: deviceType,
      applicationId: applicationId,
      fleetId: provisioningKeyRecord.fleet_id,
      createdAt: device.created_at.toISOString(),
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
 * SECURITY ENHANCED:
 * - Verifies deviceApiKey against hashed value in database
 * - Uses bcrypt.compare for secure verification
 * - Logs authentication events
 */
router.post('/api/v1/device/:uuid/key-exchange', keyExchangeLimiter, async (req, res) => {
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

// ============================================================================
// Existing Device State Endpoints
// ============================================================================

/**
 * Device polling for target state
 * GET /api/v1/device/:uuid/state
 * 
 * Supports ETag caching - returns 304 if state hasn't changed
 */
router.get('/api/v1/device/:uuid/state', async (req, res) => {
  try {
    const { uuid } = req.params;
    const ifNoneMatch = req.headers['if-none-match'];

    // Get or create device
    await DeviceModel.getOrCreate(uuid);

    // Get target state
    const targetState = await DeviceTargetStateModel.get(uuid);

    console.log(`📡 Device ${uuid.substring(0, 8)}... polling for target state`);
    
    if (!targetState) {
      // No target state yet - return empty state
      console.log('   No target state found - returning empty');
      const emptyState = { [uuid]: { apps: {} } };
      const etag = Buffer.from(JSON.stringify(emptyState))
        .toString('base64')
        .substring(0, 32);
      return res.set('ETag', etag).json(emptyState);
    }

    // Generate ETag
    const etag = DeviceTargetStateModel.generateETag(targetState);
    
    console.log(`   Version: ${targetState.version}, Updated: ${targetState.updated_at}`);
    console.log(`   Generated ETag: ${etag}`);
    console.log(`   Client ETag:    ${ifNoneMatch || 'none'}`);
    console.log(`   Apps in DB: ${JSON.stringify(Object.keys(targetState.apps || {}))}`);

    // Check if client has current version
    if (ifNoneMatch && ifNoneMatch === etag) {
      console.log('   ✅ ETags match - returning 304 Not Modified');
      return res.status(304).end();
    }
    
    console.log('   🎯 ETags differ - sending new state');

    // Return target state
    const response = {
      [uuid]: {
        apps: typeof targetState.apps === 'string' 
          ? JSON.parse(targetState.apps as any) 
          : targetState.apps
      }
    };

    res.set('ETag', etag).json(response);
  } catch (error: any) {
    console.error('Error getting device state:', error);
    res.status(500).json({
      error: 'Failed to get device state',
      message: error.message
    });
  }
});

/**
 * Device uploads logs
 * POST /api/v1/device/:uuid/logs
 */
router.post('/api/v1/device/:uuid/logs', async (req, res) => {
  try {
    const { uuid } = req.params;
    const logs = req.body;

    console.log(`📥 Received logs from device ${uuid.substring(0, 8)}...`);

    // Ensure device exists
    await DeviceModel.getOrCreate(uuid);

    // Store logs
    if (Array.isArray(logs)) {
      await DeviceLogsModel.store(uuid, logs);
      console.log(`   Stored ${logs.length} log entries`);
    }

    res.json({ status: 'ok', received: logs.length || 0 });
  } catch (error: any) {
    console.error('Error storing logs:', error);
    res.status(500).json({
      error: 'Failed to process logs',
      message: error.message
    });
  }
});

/**
 * Device reports current state
 * PATCH /api/v1/device/state
 */
router.patch('/api/v1/device/state', async (req, res) => {
  try {
    const stateReport = req.body;

    for (const uuid in stateReport) {
      const deviceState = stateReport[uuid];

      console.log(`📥 Received state report from device ${uuid.substring(0, 8)}...`);

      // Ensure device exists and mark as online
      await DeviceModel.getOrCreate(uuid);

      // Update current state
      await DeviceCurrentStateModel.update(
        uuid,
        deviceState.apps || {},
        deviceState.config || {},
        {
          ip_address: deviceState.ip_address,
          mac_address: deviceState.mac_address,
          os_version: deviceState.os_version,
          supervisor_version: deviceState.supervisor_version,
          uptime: deviceState.uptime,
        }
      );

      // Update device table with IP address and system info
      const updateFields: any = {};
      if (deviceState.ip_address) updateFields.ip_address = deviceState.ip_address;
      if (deviceState.local_ip) updateFields.ip_address = deviceState.local_ip; // Agent sends local_ip
      if (deviceState.mac_address) updateFields.mac_address = deviceState.mac_address;
      if (deviceState.os_version) updateFields.os_version = deviceState.os_version;
      if (deviceState.supervisor_version) updateFields.supervisor_version = deviceState.supervisor_version;
      
      if (Object.keys(updateFields).length > 0) {
        await DeviceModel.update(uuid, updateFields);
      }

      // Record metrics if provided
      if (
        deviceState.cpu_usage !== undefined ||
        deviceState.memory_usage !== undefined ||
        deviceState.storage_usage !== undefined
      ) {
        await DeviceMetricsModel.record(uuid, {
          cpu_usage: deviceState.cpu_usage,
          cpu_temp: deviceState.cpu_temp,
          memory_usage: deviceState.memory_usage,
          memory_total: deviceState.memory_total,
          storage_usage: deviceState.storage_usage,
          storage_total: deviceState.storage_total,
        });
      }
    }

    res.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Error processing state report:', error);
    res.status(500).json({
      error: 'Failed to process state report',
      message: error.message
    });
  }
});

/**
 * List all devices
 * GET /api/v1/devices
 */
router.get('/api/v1/devices', async (req, res) => {
  try {
    const isOnline = req.query.online === 'true' ? true : 
                     req.query.online === 'false' ? false : 
                     undefined;

    const devices = await DeviceModel.list({ isOnline });

    // Enhance with state info
    const enhancedDevices = await Promise.all(
      devices.map(async (device) => {
        const targetState = await DeviceTargetStateModel.get(device.uuid);
        const currentState = await DeviceCurrentStateModel.get(device.uuid);

        return {
          uuid: device.uuid,
          device_name: device.device_name,
          device_type: device.device_type,
          provisioning_state: device.provisioning_state,
          status: device.status,
          is_online: device.is_online,
          last_connectivity_event: device.last_connectivity_event,
          ip_address: device.ip_address,
          os_version: device.os_version,
          supervisor_version: device.supervisor_version,
          cpu_usage: device.cpu_usage,
          cpu_temp: device.cpu_temp,
          memory_usage: device.memory_usage,
          memory_total: device.memory_total,
          storage_usage: device.storage_usage,
          storage_total: device.storage_total,
          target_apps_count: targetState ? Object.keys(targetState.apps || {}).length : 0,
          current_apps_count: currentState ? Object.keys(currentState.apps || {}).length : 0,
          last_reported: currentState?.reported_at,
          created_at: device.created_at,
        };
      })
    );

    res.json({
      count: enhancedDevices.length,
      devices: enhancedDevices,
    });
  } catch (error: any) {
    console.error('Error listing devices:', error);
    res.status(500).json({
      error: 'Failed to list devices',
      message: error.message
    });
  }
});

/**
 * Get specific device
 * GET /api/v1/devices/:uuid
 */
router.get('/api/v1/devices/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;

    const device = await DeviceModel.getByUuid(uuid);
    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
      });
    }

    const targetState = await DeviceTargetStateModel.get(uuid);
    const currentState = await DeviceCurrentStateModel.get(uuid);

    res.json({
      device,
      target_state: targetState ? {
        apps: typeof targetState.apps === 'string' ? JSON.parse(targetState.apps as any) : targetState.apps,
        config: typeof targetState.config === 'string' ? JSON.parse(targetState.config as any) : targetState.config,
        version: targetState.version,
        updated_at: targetState.updated_at,
      } : { apps: {}, config: {} },
      current_state: currentState ? {
        apps: typeof currentState.apps === 'string' ? JSON.parse(currentState.apps as any) : currentState.apps,
        config: typeof currentState.config === 'string' ? JSON.parse(currentState.config as any) : currentState.config,
        system_info: typeof currentState.system_info === 'string' ? JSON.parse(currentState.system_info as any) : currentState.system_info,
        reported_at: currentState.reported_at,
      } : null,
    });
  } catch (error: any) {
    console.error('Error getting device:', error);
    res.status(500).json({
      error: 'Failed to get device',
      message: error.message
    });
  }
});

/**
 * Get device target state
 * GET /api/v1/devices/:uuid/target-state
 */
router.get('/api/v1/devices/:uuid/target-state', async (req, res) => {
  try {
    const { uuid } = req.params;
    const targetState = await DeviceTargetStateModel.get(uuid);

    res.json({
      uuid,
      apps: targetState ? 
        (typeof targetState.apps === 'string' ? JSON.parse(targetState.apps as any) : targetState.apps) :
        {},
      config: targetState ? 
        (typeof targetState.config === 'string' ? JSON.parse(targetState.config as any) : targetState.config) :
        {},
      version: targetState?.version,
      updated_at: targetState?.updated_at,
    });
  } catch (error: any) {
    console.error('Error getting target state:', error);
    res.status(500).json({
      error: 'Failed to get target state',
      message: error.message
    });
  }
});

/**
 * Set device target state
 * POST /api/v1/devices/:uuid/target-state
 */
router.post('/api/v1/devices/:uuid/target-state', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { apps, config } = req.body;

    if (!apps || typeof apps !== 'object') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Body must contain apps object'
      });
    }

    const targetState = await DeviceTargetStateModel.set(uuid, apps, config || {});

    console.log(`🎯 Target state updated for device ${uuid.substring(0, 8)}...`);
    console.log(`   Apps: ${Object.keys(apps).length}, Version: ${targetState.version}`);

    res.json({
      status: 'ok',
      message: 'Target state updated',
      uuid,
      version: targetState.version,
      apps,
      config,
    });
  } catch (error: any) {
    console.error('Error setting target state:', error);
    res.status(500).json({
      error: 'Failed to set target state',
      message: error.message
    });
  }
});

/**
 * Get device current state
 * GET /api/v1/devices/:uuid/current-state
 */
router.get('/api/v1/devices/:uuid/current-state', async (req, res) => {
  try {
    const { uuid } = req.params;
    const currentState = await DeviceCurrentStateModel.get(uuid);

    if (!currentState) {
      return res.status(404).json({
        error: 'No state reported yet',
        message: `Device ${uuid} has not reported its state yet`
      });
    }

    res.json({
      apps: typeof currentState.apps === 'string' ? JSON.parse(currentState.apps as any) : currentState.apps,
      config: typeof currentState.config === 'string' ? JSON.parse(currentState.config as any) : currentState.config,
      system_info: typeof currentState.system_info === 'string' ? JSON.parse(currentState.system_info as any) : currentState.system_info,
      reported_at: currentState.reported_at,
    });
  } catch (error: any) {
    console.error('Error getting current state:', error);
    res.status(500).json({
      error: 'Failed to get current state',
      message: error.message
    });
  }
});

/**
 * Clear device target state
 * DELETE /api/v1/devices/:uuid/target-state
 */
router.delete('/api/v1/devices/:uuid/target-state', async (req, res) => {
  try {
    const { uuid } = req.params;

    await DeviceTargetStateModel.clear(uuid);

    console.log(`🧹 Cleared target state for device ${uuid.substring(0, 8)}...`);

    res.json({
      status: 'ok',
      message: 'Target state cleared',
    });
  } catch (error: any) {
    console.error('Error clearing target state:', error);
    res.status(500).json({
      error: 'Failed to clear target state',
      message: error.message
    });
  }
});

/**
 * Get device logs
 * GET /api/v1/devices/:uuid/logs
 */
router.get('/api/v1/devices/:uuid/logs', async (req, res) => {
  try {
    const { uuid } = req.params;
    const serviceName = req.query.service as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = await DeviceLogsModel.get(uuid, {
      serviceName,
      limit,
      offset,
    });

    res.json({
      count: logs.length,
      logs,
    });
  } catch (error: any) {
    console.error('Error getting logs:', error);
    res.status(500).json({
      error: 'Failed to get logs',
      message: error.message
    });
  }
});

/**
 * Get device metrics
 * GET /api/v1/devices/:uuid/metrics
 */
router.get('/api/v1/devices/:uuid/metrics', async (req, res) => {
  try {
    const { uuid } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const metrics = await DeviceMetricsModel.getRecent(uuid, limit);

    res.json({
      count: metrics.length,
      metrics,
    });
  } catch (error: any) {
    console.error('Error getting metrics:', error);
    res.status(500).json({
      error: 'Failed to get metrics',
      message: error.message
    });
  }
});

/**
 * Enable/disable device (set is_active flag)
 * PATCH /api/v1/devices/:uuid/active
 * 
 * Body: { is_active: true/false }
 * 
 * This is an administrative control - does NOT affect connectivity.
 * Use cases:
 * - Decommissioning devices
 * - Maintenance mode
 * - Quarantine compromised devices
 * - Disable test devices
 */
router.patch('/api/v1/devices/:uuid/active', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'is_active must be a boolean (true or false)'
      });
    }

    const device = await DeviceModel.getByUuid(uuid);
    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
      });
    }

    const updatedDevice = await DeviceModel.update(uuid, { is_active });

    const action = is_active ? 'enabled' : 'disabled';
    console.log(`${is_active ? '✅' : '🚫'} Device ${action}: ${device.device_name || uuid.substring(0, 8) + '...'}`);

    await logAuditEvent({
      eventType: is_active ? AuditEventType.DEVICE_REGISTERED : AuditEventType.DEVICE_OFFLINE,
      deviceUuid: uuid,
      severity: AuditSeverity.INFO,
      details: {
        action: `device_${action}`,
        deviceName: device.device_name,
        previousState: device.is_active,
        newState: is_active
      }
    });

    res.json({
      status: 'ok',
      message: `Device ${action}`,
      device: {
        uuid: updatedDevice.uuid,
        device_name: updatedDevice.device_name,
        is_active: updatedDevice.is_active,
        is_online: updatedDevice.is_online
      }
    });
  } catch (error: any) {
    console.error('Error updating device active status:', error);
    res.status(500).json({
      error: 'Failed to update device status',
      message: error.message
    });
  }
});

/**
 * Delete device
 * DELETE /api/v1/devices/:uuid
 */
router.delete('/api/v1/devices/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;

    const device = await DeviceModel.getByUuid(uuid);
    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
      });
    }

    await DeviceModel.delete(uuid);

    console.log(`🗑️  Deleted device ${uuid.substring(0, 8)}...`);

    res.json({
      status: 'ok',
      message: 'Device deleted',
    });
  } catch (error: any) {
    console.error('Error deleting device:', error);
    res.status(500).json({
      error: 'Failed to delete device',
      message: error.message
    });
  }
});

// ============================================================================
// Admin / Monitoring Endpoints
// ============================================================================

/**
 * Get heartbeat monitor status and configuration
 * GET /api/v1/admin/heartbeat
 */
router.get('/api/v1/admin/heartbeat', async (req, res) => {
  try {
    const heartbeatMonitor = await import('../services/heartbeat-monitor');
    const config = heartbeatMonitor.default.getConfig();

    res.json({
      status: 'ok',
      heartbeat: config
    });
  } catch (error: any) {
    console.error('Error getting heartbeat config:', error);
    res.status(500).json({
      error: 'Failed to get heartbeat configuration',
      message: error.message
    });
  }
});

/**
 * Manually trigger heartbeat check
 * POST /api/v1/admin/heartbeat/check
 */
router.post('/api/v1/admin/heartbeat/check', async (req, res) => {
  try {
    console.log('🔍 Manual heartbeat check triggered');
    
    const heartbeatMonitor = await import('../services/heartbeat-monitor');
    await heartbeatMonitor.default.checkNow();

    res.json({
      status: 'ok',
      message: 'Heartbeat check completed'
    });
  } catch (error: any) {
    console.error('Error during manual heartbeat check:', error);
    res.status(500).json({
      error: 'Failed to perform heartbeat check',
      message: error.message
    });
  }
});

// ============================================================================
// Application Template Management (Hybrid Approach)
// ============================================================================

/**
 * Create application template (Docker Compose-like stack)
 * POST /api/v1/applications
 * 
 * Body: {
 *   appName: string,
 *   slug: string,
 *   description?: string,
 *   defaultConfig: {
 *     services: [
 *       { serviceName, image, defaultPorts?, defaultEnvironment?, defaultVolumes? }
 *     ]
 *   }
 * }
 * 
 * Returns: { appId, appName, slug }
 */
router.post('/api/v1/applications', async (req, res) => {
  try {
    const { appName, slug, description, defaultConfig } = req.body;

    // Validation
    if (!appName || typeof appName !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'appName is required and must be a string'
      });
    }

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'slug is required and must be a string (URL-safe identifier)'
      });
    }

    if (defaultConfig && typeof defaultConfig !== 'object') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'defaultConfig must be an object'
      });
    }

    // Check if slug already exists
    const existingApp = await query(
      'SELECT id, app_name FROM applications WHERE slug = $1',
      [slug]
    );

    if (existingApp.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Application with slug "${slug}" already exists (ID: ${existingApp.rows[0].id})`
      });
    }

    // Get next app ID from sequence (starts at 1000)
    const idResult = await query<{ nextval: number }>(
      "SELECT nextval('global_app_id_seq') as nextval"
    );
    const appId = idResult.rows[0].nextval;

    // Insert into applications table with explicit ID
    const result = await query(
      `INSERT INTO applications (id, app_name, slug, description, default_config)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        appId,
        appName,
        slug,
        description || '',
        JSON.stringify(defaultConfig || { services: [] })
      ]
    );

    const app = result.rows[0];

    // Also register in app_service_ids registry for tracking
    await query(
      `INSERT INTO app_service_ids (entity_type, entity_id, entity_name, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'app',
        appId,
        appName,
        JSON.stringify({ slug, description }),
        req.headers['x-user-id'] || 'system'
      ]
    );

    console.log(`✅ Created application template: ${appName} (ID: ${appId}, slug: ${slug})`);

    res.status(201).json({
      appId: app.id,
      appName: app.app_name,
      slug: app.slug,
      description: app.description,
      defaultConfig: typeof app.default_config === 'string' 
        ? JSON.parse(app.default_config) 
        : app.default_config,
      createdAt: app.created_at
    });

  } catch (error: any) {
    console.error('Error creating application template:', error);
    res.status(500).json({
      error: 'Failed to create application template',
      message: error.message
    });
  }
});

/**
 * List all application templates
 * GET /api/v1/applications
 * 
 * Query params: ?search=keyword
 */
router.get('/api/v1/applications', async (req, res) => {
  try {
    const { search } = req.query;

    let sql = 'SELECT * FROM applications WHERE 1=1';
    const params: any[] = [];

    if (search && typeof search === 'string') {
      params.push(`%${search}%`);
      sql += ` AND (app_name ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    sql += ' ORDER BY id DESC';

    const result = await query(sql, params);

    const applications = result.rows.map(app => ({
      appId: app.id,
      appName: app.app_name,
      slug: app.slug,
      description: app.description,
      defaultConfig: typeof app.default_config === 'string' 
        ? JSON.parse(app.default_config) 
        : app.default_config,
      createdAt: app.created_at,
      modifiedAt: app.modified_at
    }));

    res.json({
      count: applications.length,
      applications
    });

  } catch (error: any) {
    console.error('Error listing applications:', error);
    res.status(500).json({
      error: 'Failed to list applications',
      message: error.message
    });
  }
});

/**
 * Get specific application template
 * GET /api/v1/applications/:appId
 */
router.get('/api/v1/applications/:appId', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);

    if (isNaN(appId)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'appId must be a number'
      });
    }

    const result = await query(
      'SELECT * FROM applications WHERE id = $1',
      [appId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: `Application with ID ${appId} not found`
      });
    }

    const app = result.rows[0];

    res.json({
      appId: app.id,
      appName: app.app_name,
      slug: app.slug,
      description: app.description,
      defaultConfig: typeof app.default_config === 'string' 
        ? JSON.parse(app.default_config) 
        : app.default_config,
      createdAt: app.created_at,
      modifiedAt: app.modified_at
    });

  } catch (error: any) {
    console.error('Error getting application:', error);
    res.status(500).json({
      error: 'Failed to get application',
      message: error.message
    });
  }
});

/**
 * Update application template
 * PATCH /api/v1/applications/:appId
 * 
 * Body: { appName?, description?, defaultConfig? }
 */
router.patch('/api/v1/applications/:appId', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const { appName, description, defaultConfig } = req.body;

    if (isNaN(appId)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'appId must be a number'
      });
    }

    // Build dynamic UPDATE query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (appName !== undefined) {
      params.push(appName);
      updates.push(`app_name = $${paramIndex++}`);
    }

    if (description !== undefined) {
      params.push(description);
      updates.push(`description = $${paramIndex++}`);
    }

    if (defaultConfig !== undefined) {
      params.push(JSON.stringify(defaultConfig));
      updates.push(`default_config = $${paramIndex++}`);
    }

    updates.push(`modified_at = CURRENT_TIMESTAMP`);

    if (updates.length === 1) { // Only modified_at
      return res.status(400).json({
        error: 'Invalid request',
        message: 'At least one field must be provided for update'
      });
    }

    params.push(appId);
    const sql = `UPDATE applications SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: `Application with ID ${appId} not found`
      });
    }

    const app = result.rows[0];

    console.log(`✅ Updated application template: ${app.app_name} (ID: ${appId})`);

    res.json({
      appId: app.id,
      appName: app.app_name,
      slug: app.slug,
      description: app.description,
      defaultConfig: typeof app.default_config === 'string' 
        ? JSON.parse(app.default_config) 
        : app.default_config,
      modifiedAt: app.modified_at
    });

  } catch (error: any) {
    console.error('Error updating application:', error);
    res.status(500).json({
      error: 'Failed to update application',
      message: error.message
    });
  }
});

/**
 * Delete application template
 * DELETE /api/v1/applications/:appId
 */
router.delete('/api/v1/applications/:appId', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);

    if (isNaN(appId)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'appId must be a number'
      });
    }

    // Check if any devices are using this app
    const devicesUsing = await query(
      `SELECT device_uuid, apps 
       FROM device_target_state 
       WHERE apps::text LIKE $1`,
      [`%"appId":${appId}%`]
    );

    if (devicesUsing.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Cannot delete application: ${devicesUsing.rows.length} device(s) are using this app`,
        devicesAffected: devicesUsing.rows.map(r => r.device_uuid)
      });
    }

    const result = await query(
      'DELETE FROM applications WHERE id = $1 RETURNING app_name',
      [appId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: `Application with ID ${appId} not found`
      });
    }

    console.log(`🗑️  Deleted application template: ${result.rows[0].app_name} (ID: ${appId})`);

    res.json({
      status: 'ok',
      message: 'Application template deleted',
      appId
    });

  } catch (error: any) {
    console.error('Error deleting application:', error);
    res.status(500).json({
      error: 'Failed to delete application',
      message: error.message
    });
  }
});

/**
 * Deploy application to device (from template)
 * POST /api/v1/devices/:uuid/apps
 * 
 * Body: {
 *   appId: number,
 *   services: [
 *     {
 *       serviceName: string,
 *       image: string,
 *       ports?: string[],
 *       environment?: object,
 *       volumes?: string[],
 *       config?: object
 *     }
 *   ]
 * }
 * 
 * This copies the app template and deploys with device-specific configuration
 */
router.post('/api/v1/devices/:uuid/apps', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { appId, services } = req.body;

    // Validation
    if (!appId || typeof appId !== 'number') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'appId is required and must be a number'
      });
    }

    if (!services || !Array.isArray(services)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'services is required and must be an array'
      });
    }

    // Verify application exists
    const appResult = await query(
      'SELECT * FROM applications WHERE id = $1',
      [appId]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: `Application ${appId} not found in catalog`
      });
    }

    const app = appResult.rows[0];

    // Verify device exists
    const device = await DeviceModel.getByUuid(uuid);
    if (!device) {
      return res.status(404).json({
        error: 'Not found',
        message: `Device ${uuid} not found`
      });
    }

    // Get current target state
    const currentTarget = await DeviceTargetStateModel.get(uuid);
    const currentApps = currentTarget?.apps || {};

    // Generate service IDs for each service
    const servicesWithIds = await Promise.all(
      services.map(async (service: any, index: number) => {
        // Get next service ID from sequence
        const idResult = await query<{ nextval: number }>(
          "SELECT nextval('global_service_id_seq') as nextval"
        );
        const serviceId = idResult.rows[0].nextval;

        // Register service in registry
        await query(
          `INSERT INTO app_service_ids (entity_type, entity_id, entity_name, metadata, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'service',
            serviceId,
            service.serviceName,
            JSON.stringify({ 
              appId, 
              appName: app.app_name,
              imageName: service.image 
            }),
            req.headers['x-user-id'] || 'system'
          ]
        );

        return {
          serviceId,
          serviceName: service.serviceName,
          imageName: service.image,
          config: {
            ...(service.ports && { ports: service.ports }),
            ...(service.environment && { environment: service.environment }),
            ...(service.volumes && { volumes: service.volumes }),
            ...(service.config || {})
          }
        };
      })
    );

    // Add new app to target state
    const newApps = {
      ...currentApps,
      [appId]: {
        appId,
        appName: app.app_name,
        services: servicesWithIds
      }
    };

    // Update target state
    await DeviceTargetStateModel.set(uuid, newApps, currentTarget?.config || {});

    console.log(`🚀 Deployed app ${appId} (${app.app_name}) to device ${uuid.substring(0, 8)}...`);
    console.log(`   Services: ${servicesWithIds.map(s => s.serviceName).join(', ')}`);

    res.status(201).json({
      status: 'ok',
      message: 'Application deployed to device',
      deviceUuid: uuid,
      appId,
      appName: app.app_name,
      services: servicesWithIds
    });

  } catch (error: any) {
    console.error('Error deploying application:', error);
    res.status(500).json({
      error: 'Failed to deploy application',
      message: error.message
    });
  }
});

/**
 * Update deployed app on device
 * PATCH /api/v1/devices/:uuid/apps/:appId
 * 
 * Body: { services: [...] } - replaces services for this app
 */
router.patch('/api/v1/devices/:uuid/apps/:appId', async (req, res) => {
  try {
    const { uuid, appId: appIdStr } = req.params;
    const { services } = req.body;

    const appId = parseInt(appIdStr);
    if (isNaN(appId)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'appId must be a number'
      });
    }

    if (!services || !Array.isArray(services)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'services is required and must be an array'
      });
    }

    // Get current target state
    const currentTarget = await DeviceTargetStateModel.get(uuid);
    if (!currentTarget) {
      return res.status(404).json({
        error: 'Not found',
        message: `Device ${uuid} has no target state`
      });
    }

    const currentApps = currentTarget.apps || {};

    if (!currentApps[appId]) {
      return res.status(404).json({
        error: 'Not found',
        message: `App ${appId} not deployed on device ${uuid}`
      });
    }

    // Generate new service IDs for updated services
    const servicesWithIds = await Promise.all(
      services.map(async (service: any) => {
        const idResult = await query<{ nextval: number }>(
          "SELECT nextval('global_service_id_seq') as nextval"
        );
        const serviceId = idResult.rows[0].nextval;

        return {
          serviceId,
          serviceName: service.serviceName,
          imageName: service.image,
          config: {
            ...(service.ports && { ports: service.ports }),
            ...(service.environment && { environment: service.environment }),
            ...(service.volumes && { volumes: service.volumes }),
            ...(service.config || {})
          }
        };
      })
    );

    // Update app in target state
    currentApps[appId].services = servicesWithIds;

    // Save updated state
    await DeviceTargetStateModel.set(uuid, currentApps, currentTarget.config || {});

    console.log(`✅ Updated app ${appId} on device ${uuid.substring(0, 8)}...`);

    res.json({
      status: 'ok',
      message: 'Application updated on device',
      deviceUuid: uuid,
      appId,
      services: servicesWithIds
    });

  } catch (error: any) {
    console.error('Error updating application:', error);
    res.status(500).json({
      error: 'Failed to update application',
      message: error.message
    });
  }
});

/**
 * Remove app from device
 * DELETE /api/v1/devices/:uuid/apps/:appId
 */
router.delete('/api/v1/devices/:uuid/apps/:appId', async (req, res) => {
  try {
    const { uuid, appId: appIdStr } = req.params;

    const appId = parseInt(appIdStr);
    if (isNaN(appId)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'appId must be a number'
      });
    }

    // Get current target state
    const currentTarget = await DeviceTargetStateModel.get(uuid);
    if (!currentTarget) {
      return res.status(404).json({
        error: 'Not found',
        message: `Device ${uuid} has no target state`
      });
    }

    const currentApps = currentTarget.apps || {};

    if (!currentApps[appId]) {
      return res.status(404).json({
        error: 'Not found',
        message: `App ${appId} not deployed on device ${uuid}`
      });
    }

    const appName = currentApps[appId].appName;

    // Remove app from target state
    delete currentApps[appId];

    // Save updated state
    await DeviceTargetStateModel.set(uuid, currentApps, currentTarget.config || {});

    console.log(`🗑️  Removed app ${appId} (${appName}) from device ${uuid.substring(0, 8)}...`);

    res.json({
      status: 'ok',
      message: 'Application removed from device',
      deviceUuid: uuid,
      appId,
      appName
    });

  } catch (error: any) {
    console.error('Error removing application:', error);
    res.status(500).json({
      error: 'Failed to remove application',
      message: error.message
    });
  }
});

// ============================================================================
// App/Service ID Management Endpoints (Legacy - for backwards compatibility)
// ============================================================================

/**
 * Generate next app ID
 * POST /api/v1/apps/next-id
 * 
 * Body: { appName: string, metadata?: object }
 * Returns: { appId: number, appName: string }
 */
router.post('/api/v1/apps/next-id', async (req, res) => {
  try {
    const { appName, metadata } = req.body;

    if (!appName || typeof appName !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'appName is required and must be a string' 
      });
    }

    // Get next app ID from sequence
    const idResult = await query<{ nextval: number }>(
      "SELECT nextval('global_app_id_seq') as nextval"
    );
    const appId = idResult.rows[0].nextval;

    // Register the ID in registry table (for tracking/auditability)
    await query(
      `INSERT INTO app_service_ids (entity_type, entity_id, entity_name, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET
         entity_name = $3,
         metadata = $4`,
      [
        'app', 
        appId, 
        appName, 
        metadata ? JSON.stringify(metadata) : '{}',
        req.headers['x-user-id'] || 'system'
      ]
    );

    console.log(`✅ Generated app ID ${appId} for "${appName}"`);

    res.json({ 
      appId, 
      appName,
      metadata: metadata || {}
    });

  } catch (error: any) {
    console.error('Error generating app ID:', error);
    res.status(500).json({ 
      error: 'Failed to generate app ID',
      message: error.message 
    });
  }
});

/**
 * Generate next service ID
 * POST /api/v1/services/next-id
 * 
 * Body: { serviceName: string, appId: number, imageName?: string, metadata?: object }
 * Returns: { serviceId: number, serviceName: string, appId: number }
 */
router.post('/api/v1/services/next-id', async (req, res) => {
  try {
    const { serviceName, appId, imageName, metadata } = req.body;

    if (!serviceName || typeof serviceName !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'serviceName is required and must be a string' 
      });
    }

    if (!appId || typeof appId !== 'number') {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'appId is required and must be a number' 
      });
    }

    // Get next service ID from sequence
    const idResult = await query<{ nextval: number }>(
      "SELECT nextval('global_service_id_seq') as nextval"
    );
    const serviceId = idResult.rows[0].nextval;

    // Merge metadata with appId and imageName
    const fullMetadata = {
      appId,
      ...(imageName && { imageName }),
      ...(metadata || {})
    };

    // Register the ID in registry table
    await query(
      `INSERT INTO app_service_ids (entity_type, entity_id, entity_name, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET
         entity_name = $3,
         metadata = $4`,
      [
        'service', 
        serviceId, 
        serviceName, 
        JSON.stringify(fullMetadata),
        req.headers['x-user-id'] || 'system'
      ]
    );

    console.log(`✅ Generated service ID ${serviceId} for "${serviceName}" (app ${appId})`);

    res.json({ 
      serviceId, 
      serviceName, 
      appId,
      imageName,
      metadata: fullMetadata
    });

  } catch (error: any) {
    console.error('Error generating service ID:', error);
    res.status(500).json({ 
      error: 'Failed to generate service ID',
      message: error.message 
    });
  }
});

/**
 * Get all registered app/service IDs
 * GET /api/v1/apps-services/registry
 * 
 * Query params: ?type=app|service
 */
router.get('/api/v1/apps-services/registry', async (req, res) => {
  try {
    const { type } = req.query;

    let sql = 'SELECT * FROM app_service_ids WHERE 1=1';
    const params: any[] = [];

    if (type === 'app' || type === 'service') {
      params.push(type);
      sql += ` AND entity_type = $${params.length}`;
    }

    sql += ' ORDER BY entity_id DESC';

    const result = await query(sql, params);

    res.json({
      count: result.rows.length,
      items: result.rows.map(row => ({
        id: row.id,
        type: row.entity_type,
        entityId: row.entity_id,
        name: row.entity_name,
        metadata: row.metadata,
        createdBy: row.created_by,
        createdAt: row.created_at
      }))
    });

  } catch (error: any) {
    console.error('Error fetching app/service registry:', error);
    res.status(500).json({ 
      error: 'Failed to fetch registry',
      message: error.message 
    });
  }
});

/**
 * Get specific app or service by ID
 * GET /api/v1/apps-services/:type/:id
 * 
 * Params: type=app|service, id=number
 */
router.get('/api/v1/apps-services/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type !== 'app' && type !== 'service') {
      return res.status(400).json({ 
        error: 'Invalid type',
        message: 'type must be "app" or "service"' 
      });
    }

    const entityId = parseInt(id);
    if (isNaN(entityId)) {
      return res.status(400).json({ 
        error: 'Invalid ID',
        message: 'id must be a number' 
      });
    }

    const result = await query(
      'SELECT * FROM app_service_ids WHERE entity_type = $1 AND entity_id = $2',
      [type, entityId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not found',
        message: `${type} with ID ${entityId} not found` 
      });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      type: row.entity_type,
      entityId: row.entity_id,
      name: row.entity_name,
      metadata: row.metadata,
      createdBy: row.created_by,
      createdAt: row.created_at
    });

  } catch (error: any) {
    console.error('Error fetching app/service:', error);
    res.status(500).json({ 
      error: 'Failed to fetch app/service',
      message: error.message 
    });
  }
});

export default router;
