// ...existing code...
/**
 * Update device details (name, type, IP, MAC)
 * PATCH /api/v1/devices/:uuid
 * Body: { deviceName, deviceType, ipAddress, macAddress }
 */


/**
 * Device Management Routes
 * Endpoints for managing individual devices and their deployed applications
 */

import express from 'express';
import { query } from '../db/connection';
import {
  DeviceModel,
  DeviceTargetStateModel,
  DeviceCurrentStateModel,
} from '../db/models';
import {
  logAuditEvent,
  AuditEventType,
  AuditSeverity
} from '../utils/audit-logger';
import { EventPublisher } from '../services/event-sourcing';

export const router = express.Router();


router.patch('/devices/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { deviceName, deviceType, ipAddress, macAddress } = req.body;

    // Validate at least one field is present
    if (!deviceName && !deviceType && !ipAddress && !macAddress) {
      return res.status(400).json({
        error: 'No fields to update',
        message: 'At least one of deviceName, deviceType, ipAddress, or macAddress must be provided.'
      });
    }

    const device = await DeviceModel.getByUuid(uuid);
    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
      });
    }

    // Build update object
    const updateFields = {};
    if (deviceName) updateFields['device_name'] = deviceName;
    if (deviceType) updateFields['device_type'] = deviceType;
    if (ipAddress) updateFields['ip_address'] = ipAddress;
    if (macAddress) updateFields['mac_address'] = macAddress;
    updateFields['modified_at'] = new Date();

    const updatedDevice = await DeviceModel.update(uuid, updateFields);

    await logAuditEvent({
      eventType: AuditEventType.DEVICE_CONFIG_UPDATE,
      deviceUuid: uuid,
      severity: AuditSeverity.INFO,
      details: {
        updatedFields: Object.keys(updateFields),
        deviceName,
        deviceType,
        ipAddress,
        macAddress
      }
    });

    res.json({
      success: true,
      device: {
        uuid: updatedDevice.uuid,
        deviceName: updatedDevice.device_name,
        deviceType: updatedDevice.device_type,
        ipAddress: updatedDevice.ip_address,
        macAddress: updatedDevice.mac_address,
        isOnline: updatedDevice.is_online,
        isActive: updatedDevice.is_active,
        modifiedAt: updatedDevice.modified_at
      }
    });
  } catch (error: any) {
    console.error('Error updating device:', error);
    res.status(500).json({
      error: 'Failed to update device',
      message: error.message
    });
  }
});

/**
 * Update device details (name, type, IP, MAC)
 * PATCH /api/v1/devices/:uuid
 * Body: { deviceName, deviceType, ipAddress, macAddress }
 */
router.patch('/devices/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { deviceName, deviceType, ipAddress, macAddress } = req.body;

    // Validate at least one field is present
    if (!deviceName && !deviceType && !ipAddress && !macAddress) {
      return res.status(400).json({
        error: 'No fields to update',
        message: 'At least one of deviceName, deviceType, ipAddress, or macAddress must be provided.'
      });
    }

    const device = await DeviceModel.getByUuid(uuid);
    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
      });
    }

    // Build update object
    const updateFields = {};
    if (deviceName) updateFields['device_name'] = deviceName;
    if (deviceType) updateFields['device_type'] = deviceType;
    if (ipAddress) updateFields['ip_address'] = ipAddress;
    if (macAddress) updateFields['mac_address'] = macAddress;
    updateFields['modified_at'] = new Date();

    const updatedDevice = await DeviceModel.update(uuid, updateFields);

    await logAuditEvent({
      eventType: AuditEventType.DEVICE_CONFIG_UPDATE,
      deviceUuid: uuid,
      severity: AuditSeverity.INFO,
      details: {
        updatedFields: Object.keys(updateFields),
        deviceName,
        deviceType,
        ipAddress,
        macAddress
      }
    });

    res.json({
      success: true,
      device: {
        uuid: updatedDevice.uuid,
        deviceName: updatedDevice.device_name,
        deviceType: updatedDevice.device_type,
        ipAddress: updatedDevice.ip_address,
        macAddress: updatedDevice.mac_address,
        isOnline: updatedDevice.is_online,
        isActive: updatedDevice.is_active,
        modifiedAt: updatedDevice.modified_at
      }
    });
  } catch (error: any) {
    console.error('Error updating device:', error);
    res.status(500).json({
      error: 'Failed to update device',
      message: error.message
    });
  }
});

// Initialize event publisher for audit trail
const eventPublisher = new EventPublisher();

// ============================================================================
// Device Listing and Management Endpoints
// ============================================================================

/**
 * List all devices
 * GET /api/v1/devices
 */
router.get('/devices', async (req, res) => {
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
          agent_version: device.agent_version,
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
router.get('/devices/:uuid', async (req, res) => {
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
        needs_deployment: targetState.needs_deployment || false,
        last_deployed_at: targetState.last_deployed_at || null,
        deployed_by: targetState.deployed_by || null,
        updated_at: targetState.updated_at,
      } : { apps: {}, config: {}, version: 1, needs_deployment: false },
      current_state: currentState ? {
        apps: typeof currentState.apps === 'string' ? JSON.parse(currentState.apps as any) : currentState.apps,
        config: typeof currentState.config === 'string' ? JSON.parse(currentState.config as any) : currentState.config,
        version: currentState.version || 0, // Include version for sync status comparison
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

/**
 * Register a new device (pre-registration before agent connects)
 * POST /api/v1/devices
 * 
 * Body:
 * - deviceName: Device name
 * - deviceType: Device type (gateway, edge-device, etc.)
 * - ipAddress: IP address (optional)
 * - macAddress: MAC address (optional)
 */
router.post('/devices', async (req, res) => {
  try {
    const { deviceName, deviceType, ipAddress, macAddress } = req.body;

    if (!deviceName) {
      return res.status(400).json({
        error: 'Device name required',
        message: 'deviceName is required'
      });
    }

    // Generate UUID for the device
    const { v4: uuidv4 } = require('uuid');
    const deviceUuid = uuidv4();

    // Create device record in database with is_active=false, provisioning_state='pending'
    const result = await query(
      `INSERT INTO devices (
        uuid, 
        device_name, 
        device_type, 
        ip_address, 
        mac_address,
        is_online, 
        is_active,
        provisioning_state,
        created_at, 
        modified_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *`,
      [
        deviceUuid,
        deviceName,
        deviceType || 'gateway',
        ipAddress || null,
        macAddress || null,
        false, // Not online until agent connects
        false,  // Not active until agent connects with provisioning key
        'pending' // Waiting for agent to provision
      ]
    );

    const device = result.rows[0];

    // Create empty target state for the device
    await query(
      `INSERT INTO device_target_state (
        device_uuid, 
        apps, 
        config, 
        version, 
        needs_deployment,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [deviceUuid, JSON.stringify({}), JSON.stringify({}), 1, false]
    );

    // Log audit event
    await logAuditEvent({
      eventType: AuditEventType.DEVICE_REGISTERED,
      severity: AuditSeverity.INFO,
      deviceUuid: deviceUuid,
      details: {
        deviceName,
        deviceType: deviceType || 'gateway',
        ipAddress,
        macAddress,
        action: 'pre-registered'
      }
    });

    console.log(`✅ Device pre-registered: ${deviceName} (${deviceUuid})`);

    res.status(201).json({
      success: true,
      device: {
        uuid: device.uuid,
        deviceName: device.device_name,
        deviceType: device.device_type,
        ipAddress: device.ip_address,
        macAddress: device.mac_address,
        isOnline: device.is_online,
        isActive: device.is_active,
        createdAt: device.created_at
      }
    });
  } catch (error: any) {
    console.error('Error registering device:', error);
    res.status(500).json({
      error: 'Failed to register device',
      message: error.message
    });
  }
});

/**
 * Activate/deactivate device
 * PATCH /api/v1/devices/:uuid/active
 */
router.patch('/devices/:uuid/active', async (req, res) => {
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

    // 🎉 EVENT SOURCING: Publish device online/offline event
    await eventPublisher.publish(
      is_active ? 'device.online' : 'device.offline',
      'device',
      uuid,
      {
        device_name: device.device_name,
        device_type: device.device_type,
        previous_state: device.is_active,
        new_state: is_active,
        reason: is_active ? 'administratively enabled' : 'administratively disabled',
        changed_at: new Date().toISOString()
      },
      {
        metadata: {
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          endpoint: '/devices/:uuid/active'
        }
      }
    );

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
router.delete('/devices/:uuid', async (req, res) => {
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
// Device Application Deployment Endpoints
// ============================================================================

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
router.post('/devices/:uuid/apps', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { appId, appName, services } = req.body;

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

    // Try to get app from catalog, but allow ad-hoc apps if appName is provided
    let appNameToUse = appName;
    const appResult = await query(
      'SELECT * FROM applications WHERE id = $1',
      [appId]
    );

    if (appResult.rows.length > 0) {
      // Use catalog app name
      appNameToUse = appResult.rows[0].app_name;
    } else if (!appName) {
      // No catalog entry and no appName provided
      return res.status(400).json({
        error: 'Invalid request',
        message: `Application ${appId} not found in catalog. Please provide appName for ad-hoc deployment.`
      });
    }
    // else: use the provided appName for ad-hoc deployment

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
              appName: appNameToUse,
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
        appName: appNameToUse,
        services: servicesWithIds
      }
    };

    // Update target state
    await DeviceTargetStateModel.set(uuid, newApps, currentTarget?.config || {});

    console.log(`🚀 Deployed app ${appId} (${appNameToUse}) to device ${uuid.substring(0, 8)}...`);
    console.log(`   Services: ${servicesWithIds.map(s => s.serviceName).join(', ')}`);

    res.status(201).json({
      status: 'ok',
      message: 'Application deployed to device',
      deviceUuid: uuid,
      appId,
      appName: appNameToUse,
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
router.patch('/devices/:uuid/apps/:appId', async (req, res) => {
  try {
    const { uuid, appId: appIdStr } = req.params;
    const { appName, services } = req.body;

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

    // Preserve existing service IDs or generate new ones for new services
    const existingServices = currentApps[appId].services || [];
    const servicesWithIds = await Promise.all(
      services.map(async (service: any) => {
        // Try to find existing service by name to preserve its ID
        const existingService = existingServices.find((s: any) => s.serviceName === service.serviceName);
        
        let serviceId: number;
        if (existingService && existingService.serviceId) {
          // Preserve existing service ID
          serviceId = existingService.serviceId;
        } else {
          // Generate new ID for new services only
          const idResult = await query<{ nextval: number }>(
            "SELECT nextval('global_service_id_seq') as nextval"
          );
          serviceId = idResult.rows[0].nextval;
        }

        return {
          serviceId,
          serviceName: service.serviceName,
          imageName: service.image,
          ...(service.state && { state: service.state }), // Include state field for container control
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
    
    // Update app name if provided
    if (appName) {
      currentApps[appId].appName = appName;
    }

    // Save updated state
    await DeviceTargetStateModel.set(uuid, currentApps, currentTarget.config || {});

    console.log(`✅ Updated app ${appId} on device ${uuid.substring(0, 8)}...`);

    res.json({
      status: 'ok',
      message: 'Application updated on device',
      deviceUuid: uuid,
      appId,
      appName: currentApps[appId].appName,
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
router.delete('/devices/:uuid/apps/:appId', async (req, res) => {
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

/**
 * Deploy specific app to device
 * POST /api/v1/devices/:uuid/apps/:appId/deploy
 * 
 * Deploys a specific app by incrementing version
 */
router.post('/devices/:uuid/apps/:appId/deploy', async (req, res) => {
  try {
    const { uuid, appId: appIdStr } = req.params;
    const deployedBy = req.body.deployedBy || 'dashboard';

    const appId = parseInt(appIdStr);
    if (isNaN(appId)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'appId must be a number'
      });
    }

    console.log(`🚀 Deploying app ${appId} to device ${uuid.substring(0, 8)}... by ${deployedBy}`);

    // Verify device exists
    const device = await DeviceModel.getByUuid(uuid);
    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
      });
    }

    // Check if app exists in target state
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
        message: `App ${appId} not found in target state`
      });
    }

    const appName = currentApps[appId].appName;

    // Deploy target state (increments version so device picks up changes)
    const deployedState = await DeviceTargetStateModel.deploy(uuid, deployedBy);

    await logAuditEvent({
      eventType: AuditEventType.DEVICE_CONFIG_UPDATE,
      deviceUuid: uuid,
      severity: AuditSeverity.INFO,
      details: {
        action: 'deploy_app',
        appId,
        appName,
        version: deployedState.version,
        deployedBy
      }
    });

    console.log(`✅ Deployed app ${appId} (${appName}) - version ${deployedState.version} to device ${uuid.substring(0, 8)}...`);

    res.json({
      status: 'ok',
      message: `Application ${appName} deployed successfully`,
      version: deployedState.version,
      appId,
      appName,
      deployedBy: deployedState.deployed_by
    });

  } catch (error: any) {
    console.error('Error deploying app:', error);
    res.status(500).json({
      error: 'Failed to deploy application',
      message: error.message
    });
  }
});

/**
 * Deploy target state to device
 * POST /api/v1/devices/:uuid/deploy
 * 
 * Increments version so device will pick up changes
 */
router.post('/devices/:uuid/deploy', async (req, res) => {
  try {
    const { uuid } = req.params;
    const deployedBy = req.body.deployedBy || 'dashboard';

    console.log(`🚀 Deploying target state to device ${uuid.substring(0, 8)}... by ${deployedBy}`);

    // Verify device exists
    const device = await DeviceModel.getByUuid(uuid);
    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
      });
    }

    // Check if there's anything to deploy
    const currentTarget = await DeviceTargetStateModel.get(uuid);
    if (!currentTarget) {
      return res.status(404).json({
        error: 'Not found',
        message: `Device ${uuid} has no target state to deploy`
      });
    }

    if (!currentTarget.needs_deployment) {
      return res.status(400).json({
        error: 'Nothing to deploy',
        message: 'Target state is already deployed',
        version: currentTarget.version
      });
    }

    // Deploy target state (increments version)
    const deployedState = await DeviceTargetStateModel.deploy(uuid, deployedBy);

    await logAuditEvent({
      eventType: AuditEventType.DEVICE_CONFIG_UPDATE,
      deviceUuid: uuid,
      severity: AuditSeverity.INFO,
      details: {
        action: 'deploy',
        version: deployedState.version,
        deployedBy,
        appsCount: Object.keys(deployedState.apps || {}).length
      }
    });

    console.log(`✅ Deployed version ${deployedState.version} to device ${uuid.substring(0, 8)}...`);

    res.json({
      status: 'ok',
      message: 'Target state deployed successfully',
      deviceUuid: uuid,
      version: deployedState.version,
      deployedBy,
      deployedAt: deployedState.last_deployed_at,
      appsCount: Object.keys(deployedState.apps || {}).length
    });

  } catch (error: any) {
    console.error('Error deploying target state:', error);
    res.status(500).json({
      error: 'Failed to deploy target state',
      message: error.message
    });
  }
});

/**
 * Cancel pending deployment
 * POST /api/v1/devices/:uuid/deploy/cancel
 * 
 * Resets needs_deployment flag without changing version
 * Discards pending changes and reverts to last deployed state
 */
router.post('/devices/:uuid/deploy/cancel', async (req, res) => {
  try {
    const { uuid } = req.params;

    console.log(`❌ Canceling pending deployment for device ${uuid.substring(0, 8)}...`);

    // Verify device exists
    const device = await DeviceModel.getByUuid(uuid);
    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
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

    if (!currentTarget.needs_deployment) {
      return res.status(400).json({
        error: 'Nothing to cancel',
        message: 'No pending changes to cancel',
        version: currentTarget.version
      });
    }

    // Get last deployed state from history
    const history = await query(
      `SELECT apps, config, version 
       FROM device_target_state_history 
       WHERE device_uuid = $1 
       ORDER BY deployed_at DESC 
       LIMIT 1`,
      [uuid]
    );

    if (history.rows.length === 0) {
      // No history, just reset the flag
      await query(
        `UPDATE device_target_state 
         SET needs_deployment = false 
         WHERE device_uuid = $1`,
        [uuid]
      );
    } else {
      // Restore from history
      const lastDeployed = history.rows[0];
      await query(
        `UPDATE device_target_state 
         SET apps = $1, 
             config = $2, 
             needs_deployment = false 
         WHERE device_uuid = $3`,
        [lastDeployed.apps, lastDeployed.config, uuid]
      );
    }

    await logAuditEvent({
      eventType: AuditEventType.DEVICE_CONFIG_UPDATE,
      deviceUuid: uuid,
      severity: AuditSeverity.INFO,
      details: {
        action: 'cancel_deployment',
        version: currentTarget.version,
        restoredFrom: history.rows.length > 0 ? 'history' : 'current'
      }
    });

    console.log(`✅ Canceled pending deployment for device ${uuid.substring(0, 8)}...`);

    res.json({
      status: 'ok',
      message: 'Pending deployment canceled successfully',
      deviceUuid: uuid,
      version: currentTarget.version
    });

  } catch (error: any) {
    console.error('Error canceling deployment:', error);
    res.status(500).json({
      error: 'Failed to cancel deployment',
      message: error.message
    });
  }
});

// ============================================================================
// Device Broker Management
// ============================================================================

/**
 * Assign device to a new MQTT broker
 * PUT /api/v1/devices/:uuid/broker
 * 
 * Notifies device via shadow delta to reconnect to new broker
 */
router.put('/devices/:uuid/broker', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { brokerId } = req.body;

    if (!brokerId || typeof brokerId !== 'number') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'brokerId is required and must be a number'
      });
    }

    console.log(`🔄 Assigning device ${uuid.substring(0, 8)}... to broker ${brokerId}`);

    // 1. Verify device exists
    const device = await DeviceModel.getByUuid(uuid);
    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
      });
    }

    // 2. Verify broker exists
    const brokerResult = await query(
      `SELECT 
        id, name, description, protocol, host, port, username,
        use_tls, ca_cert, client_cert, verify_certificate,
        client_id_prefix, keep_alive, clean_session,
        reconnect_period, connect_timeout
      FROM mqtt_broker_config 
      WHERE id = $1 AND is_active = true`,
      [brokerId]
    );

    if (brokerResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Broker not found',
        message: `Broker ${brokerId} not found or inactive`
      });
    }

    const broker = brokerResult.rows[0];
    const brokerUrl = `${broker.protocol}://${broker.host}:${broker.port}`;

    // 3. Update device broker assignment in database
    await query(
  `UPDATE devices 
   SET mqtt_broker_id = $1, modified_at = CURRENT_TIMESTAMP 
   WHERE uuid = $2`,
      [brokerId, uuid]
    );

    console.log(`✅ Device broker updated in database`);

    // 4. Prepare broker configuration for device
    const brokerConfig = {
      brokerId: broker.id,
      brokerName: broker.name,
      broker: brokerUrl,
      protocol: broker.protocol,
      host: broker.host,
      port: broker.port,
      useTls: broker.use_tls,
      verifyCertificate: broker.verify_certificate,
      clientIdPrefix: broker.client_id_prefix || 'Iotistic',
      keepAlive: broker.keep_alive || 60,
      cleanSession: broker.clean_session !== false,
      reconnectPeriod: broker.reconnect_period || 1000,
      connectTimeout: broker.connect_timeout || 30000,
      ...(broker.ca_cert && { caCert: broker.ca_cert }),
      ...(broker.client_cert && { clientCert: broker.client_cert })
    };

    // 5. Update device shadow with new broker configuration
    const shadowResult = await query(
      `INSERT INTO device_shadows (device_uuid, desired, version)
       VALUES ($1, jsonb_build_object('mqtt', $2::jsonb), 1)
       ON CONFLICT (device_uuid) 
       DO UPDATE SET 
         desired = jsonb_set(
           COALESCE(device_shadows.desired, '{}'::jsonb),
           '{mqtt}',
           $2::jsonb
         ),
         version = device_shadows.version + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING version`,
      [uuid, JSON.stringify(brokerConfig)]
    );

    const version = shadowResult.rows[0].version;
    console.log(`📋 Shadow updated (version ${version})`);

    // 6. Try to publish MQTT delta message (if MQTT manager available)
    let mqttPublished = false;
    try {
      const { getMqttManager } = require('../mqtt');
      const mqttManager = getMqttManager();
      
      if (mqttManager && mqttManager.isConnected()) {
        await mqttManager.publish(
          `iot/device/${uuid}/shadow/name/device-state/update/delta`,
          JSON.stringify({
            state: {
              mqtt: brokerConfig
            },
            metadata: {
              mqtt: {
                timestamp: Date.now()
              }
            },
            version: version,
            timestamp: Math.floor(Date.now() / 1000)
          }),
          { qos: 1 }
        );
        mqttPublished = true;
        console.log(`📡 Published shadow delta via MQTT`);
      } else {
        console.log(`⚠️  MQTT manager not available, device will get update on next shadow sync`);
      }
    } catch (error) {
      console.warn('⚠️  Could not publish shadow delta via MQTT:', error);
      // Non-fatal - device will get update via shadow sync
    }

    // 7. Log audit event
    await logAuditEvent({
      eventType: 'device.config.updated' as any,  // Custom event type
      deviceUuid: uuid,
      severity: AuditSeverity.INFO,
      details: {
        change: 'broker_assignment',
        newBrokerId: brokerId,
        brokerName: broker.name,
        brokerUrl: brokerUrl,
        shadowVersion: version,
        mqttNotified: mqttPublished
      }
    });

    res.json({
      success: true,
      message: `Device assigned to broker: ${broker.name}`,
      device: {
        uuid: device.uuid,
        name: device.device_name
      },
      broker: {
        id: broker.id,
        name: broker.name,
        url: brokerUrl
      },
      shadow: {
        version: version,
        mqttNotified: mqttPublished,
        message: mqttPublished 
          ? 'Device will be notified immediately via MQTT'
          : 'Device will receive update on next shadow sync'
      }
    });

  } catch (error: any) {
    console.error('❌ Error assigning device to broker:', error);
    
    await logAuditEvent({
      eventType: 'device.config.update.failed' as any,  // Custom event type
      deviceUuid: req.params.uuid,
      severity: AuditSeverity.ERROR,
      details: {
        error: error.message,
        brokerId: req.body.brokerId
      }
    });

    res.status(500).json({
      error: 'Failed to assign device to broker',
      message: error.message
    });
  }
});

export default router;
