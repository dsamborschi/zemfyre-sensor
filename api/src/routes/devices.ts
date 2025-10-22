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
router.patch('/devices/:uuid/apps/:appId', async (req, res) => {
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
       SET mqtt_broker_id = $1, updated_at = CURRENT_TIMESTAMP 
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
