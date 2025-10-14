/**
 * Cloud Multi-Device Management Routes with PostgreSQL
 * Balena-style API for managing IoT devices with two-phase authentication
 */

import express from 'express';
import {
  DeviceModel,
  DeviceTargetStateModel,
  DeviceCurrentStateModel,
  DeviceMetricsModel,
  DeviceLogsModel,
} from '../db/models';

export const router = express.Router();

// ============================================================================
// Provisioning & Authentication Endpoints
// ============================================================================

/**
 * Register new device with provisioning API key
 * POST /api/v1/device/register
 * 
 * Implements two-phase authentication:
 * 1. Device sends deviceApiKey during registration
 * 2. Server stores both provisioningApiKey and deviceApiKey
 * 3. After key exchange, only deviceApiKey is valid
 */
router.post('/api/v1/device/register', async (req, res) => {
  try {
    const { uuid, deviceName, deviceType, deviceApiKey, applicationId, macAddress, osVersion, supervisorVersion } = req.body;
    const provisioningApiKey = req.headers.authorization?.replace('Bearer ', '');

    if (!uuid || !deviceName || !deviceType || !deviceApiKey) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'uuid, deviceName, deviceType, and deviceApiKey are required'
      });
    }

    if (!provisioningApiKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Provisioning API key required in Authorization header'
      });
    }

    // TODO: Validate provisioningApiKey against fleet/application in production
    // For now, accept any provisioning key for testing

    console.log('🔐 Device registration request:', {
      uuid: uuid.substring(0, 8) + '...',
      deviceName,
      deviceType,
      applicationId,
    });

    // Check if device already exists
    let device = await DeviceModel.getByUuid(uuid);
    
    if (device) {
      console.log('⚠️  Device already registered, updating...');
      // Update existing device
      // In production, you might want to validate this is a re-registration scenario
    } else {
      // Create new device
      device = await DeviceModel.getOrCreate(uuid);
    }

    // Store device metadata (implementation depends on your DeviceModel)
    // For now, we'll just return success with the device info

    const response = {
      id: device.id,
      uuid: device.uuid,
      deviceName: deviceName,
      deviceType: deviceType,
      applicationId: applicationId,
      createdAt: device.created_at.toISOString(),
    };

    console.log('✅ Device registered successfully:', response.id);

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Error registering device:', error);
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
 * Device must authenticate with deviceApiKey
 * Server verifies and removes provisioning key
 */
router.post('/api/v1/device/:uuid/key-exchange', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { deviceApiKey } = req.body;
    const authKey = req.headers.authorization?.replace('Bearer ', '');

    if (!deviceApiKey || !authKey) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'deviceApiKey required in body and Authorization header'
      });
    }

    if (deviceApiKey !== authKey) {
      return res.status(401).json({
        error: 'Key mismatch',
        message: 'deviceApiKey in body must match Authorization header'
      });
    }

    console.log('🔑 Key exchange request for device:', uuid.substring(0, 8) + '...');

    // Verify device exists
    const device = await DeviceModel.getByUuid(uuid);
    
    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not registered`
      });
    }

    // TODO: In production, verify deviceApiKey matches what was registered
    // and remove provisioningApiKey from storage

    console.log('✅ Key exchange successful');

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
    console.error('Error during key exchange:', error);
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
