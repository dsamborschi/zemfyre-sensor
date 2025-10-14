/**
 * Cloud Multi-Device Management Routes with PostgreSQL
 * Balena-style API for managing IoT devices with two-phase authentication
 */

import express from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import {
  DeviceModel,
  DeviceTargetStateModel,
  DeviceCurrentStateModel,
  DeviceMetricsModel,
  DeviceLogsModel,
} from '../db/models';
import {
  validateProvisioningKey,
  incrementProvisioningKeyUsage
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

    if (!targetState) {
      // No target state yet - return empty state
      const emptyState = { [uuid]: { apps: {} } };
      const etag = Buffer.from(JSON.stringify(emptyState))
        .toString('base64')
        .substring(0, 32);
      return res.set('ETag', etag).json(emptyState);
    }

    // Generate ETag
    const etag = DeviceTargetStateModel.generateETag(targetState);

    // Check if client has current version
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

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

export default router;
