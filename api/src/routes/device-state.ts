/**
 * Device State Management Routes
 * Handles device target state, current state, and state reporting
 * 
 * Separated from cloud.ts for better organization
 * 
 * Device-Side Endpoints (used by devices themselves):
 * - GET  /api/v1/device/:uuid/state - Device polls for target state (ETag cached)
 * - POST /api/v1/device/:uuid/logs - Device uploads logs
 * - PATCH /api/v1/device/state - Device reports current state + metrics
 * 
 * Management API Endpoints (used by dashboard/admin):
 * - GET /api/v1/devices/:uuid/target-state - Get device target state
 * - POST /api/v1/devices/:uuid/target-state - Set device target state
 * - PUT /api/v1/devices/:uuid/target-state - Update device target state
 * - GET /api/v1/devices/:uuid/current-state - Get device current state
 * - DELETE /api/v1/devices/:uuid/target-state - Clear device target state
 * - GET /api/v1/devices/:uuid/logs - Get device logs
 * - GET /api/v1/devices/:uuid/metrics - Get device metrics
 */

import express from 'express';
import { query } from '../db/connection';
import {
  DeviceModel,
  DeviceTargetStateModel,
  DeviceCurrentStateModel,
  DeviceMetricsModel,
  DeviceLogsModel,
} from '../db/models';
import { EventPublisher, objectsAreEqual } from '../services/event-sourcing';
import EventSourcingConfig from '../config/event-sourcing';
import deviceAuth, { deviceAuthFromBody } from '../middleware/device-auth';
import { resolveAppsImages } from '../services/docker-registry';

export const router = express.Router();

// Initialize event publisher for audit trail
const eventPublisher = new EventPublisher();

// ============================================================================
// Device State Endpoints (Device-Side - Used by devices themselves)
// ============================================================================

/**
 * Device polling for target state
 * GET /api/v1/device/:uuid/state
 * 
 * Supports ETag caching - returns 304 if state hasn't changed
 */
router.get('/device/:uuid/state', deviceAuth, async (req, res) => {
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
      const emptyState = { [uuid]: { apps: {}, config: {} } };
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

    // Return target state (including config if present)
    const response = {
      [uuid]: {
        apps: typeof targetState.apps === 'string' 
          ? JSON.parse(targetState.apps as any) 
          : targetState.apps,
        config: typeof targetState.config === 'string'
          ? JSON.parse(targetState.config as any)
          : targetState.config || {}
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
router.post('/device/:uuid/logs', deviceAuth, async (req, res) => {
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
router.patch('/device/state', deviceAuthFromBody, async (req, res) => {
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
          agent_version: deviceState.agent_version,
          uptime: deviceState.uptime,
        }
      );

      // 🎉 EVENT SOURCING: Publish current state updated event
      // NOTE: Uses EventSourcingConfig to determine if we should publish
      const oldState = await DeviceCurrentStateModel.get(uuid);
      
      // Use hash comparison for efficient change detection
      const stateChanged = !oldState || !objectsAreEqual(oldState.apps, deviceState.apps);

      // Check config to see if we should publish state updates
      if (EventSourcingConfig.shouldPublishStateUpdate(stateChanged)) {
        await eventPublisher.publish(
          'current_state.updated',
          'device',
          uuid,
          {
            apps: deviceState.apps || {},
            config: deviceState.config || {},
            system_info: {
              ip_address: deviceState.ip_address || deviceState.local_ip,
              mac_address: deviceState.mac_address,
              os_version: deviceState.os_version,
              agent_version: deviceState.agent_version,
              uptime: deviceState.uptime,
              cpu_usage: deviceState.cpu_usage,
              memory_usage: deviceState.memory_usage,
              storage_usage: deviceState.storage_usage
            },
            apps_count: Object.keys(deviceState.apps || {}).length,
            reported_at: new Date().toISOString(),
            changed_from: oldState ? {
              apps_count: Object.keys(oldState.apps || {}).length
            } : null
          },
          {
            metadata: {
              ip_address: req.ip,
              endpoint: '/device/state',
              change_detection: stateChanged ? 'apps_changed' : 'no_change',
              config_mode: EventSourcingConfig.PUBLISH_STATE_UPDATES
            }
          }
        );
      }

      // 🎉 EVENT SOURCING: Heartbeat events are too noisy!
      // We DON'T publish heartbeat on every state report (would be thousands per day)
      // Instead, connectivity is tracked by:
      // - device.online: Published when device comes back after being offline
      // - device.offline: Published by heartbeat monitor when device stops communicating
      // - current_state.updated: Published only when state actually changes

      // Update device table with IP address and system info
      const updateFields: any = {};
      if (deviceState.ip_address) updateFields.ip_address = deviceState.ip_address;
      if (deviceState.local_ip) updateFields.ip_address = deviceState.local_ip; // Agent sends local_ip
      if (deviceState.mac_address) updateFields.mac_address = deviceState.mac_address;
      if (deviceState.os_version) updateFields.os_version = deviceState.os_version;
      if (deviceState.agent_version) updateFields.agent_version = deviceState.agent_version;
      
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
          top_processes: deviceState.top_processes,
        });
        
        // Also update the latest snapshot in devices table
        if (deviceState.top_processes) {
          await query(
            `UPDATE devices SET top_processes = $1 WHERE uuid = $2`,
            [JSON.stringify(deviceState.top_processes), uuid]
          );
        }
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

// ============================================================================
// Management API Endpoints (Cloud-Side - Used by dashboard/admin)
// ============================================================================

/**
 * Get device target state
 * GET /api/v1/devices/:uuid/target-state
 */
router.get('/devices/:uuid/target-state', deviceAuth, async (req, res) => {
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
 * 
 * Accepts apps as either:
 * - Array: [{ appId: 1, appName: "app1", ... }, ...]
 * - Object: { 1: { appId: 1, appName: "app1", ... }, ... }
 */
router.post('/devices/:uuid/target-state', deviceAuth, async (req, res) => {
  try {
    const { uuid } = req.params;
    let { apps, config } = req.body;

    if (!apps || typeof apps !== 'object') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Body must contain apps (array or object)'
      });
    }

    // Normalize apps to Record<number, App> format
    try {
      apps = normalizeAppsFormat(apps);
    } catch (error: any) {
      return res.status(400).json({
        error: 'Invalid apps format',
        message: error.message
      });
    }

    // 🎯 RESOLVE IMAGE DIGESTS
    // Convert all :latest and floating tags to @sha256:... digests
    // This enables automatic updates when new images are pushed
    console.log(`🔍 Resolving image digests for device ${uuid.substring(0, 8)}...`);
    try {
      apps = await resolveAppsImages(apps);
    } catch (error: any) {
      console.warn(`⚠️  Digest resolution failed: ${error.message}`);
      console.warn(`   Continuing with tag-based references`);
      // Continue with original apps - digest resolution is best-effort
    }

    // Get old state for diff
    const oldTargetState = await DeviceTargetStateModel.get(uuid);

    const targetState = await DeviceTargetStateModel.set(uuid, apps, config || {});

    console.log(`🎯 Target state updated for device ${uuid.substring(0, 8)}...`);
    console.log(`   Apps: ${Object.keys(apps).length}, Version: ${targetState.version}`);

    // 🎉 EVENT SOURCING: Publish target state updated event
    await eventPublisher.publish(
      'target_state.updated',
      'device',
      uuid,
      {
        new_state: { apps, config },
        old_state: oldTargetState ? {
          apps: typeof oldTargetState.apps === 'string' ? JSON.parse(oldTargetState.apps as any) : oldTargetState.apps,
          config: typeof oldTargetState.config === 'string' ? JSON.parse(oldTargetState.config as any) : oldTargetState.config
        } : { apps: {}, config: {} },
        version: targetState.version,
        apps_added: Object.keys(apps).filter(appId => !oldTargetState?.apps?.[appId]),
        apps_removed: oldTargetState ? Object.keys(oldTargetState.apps || {}).filter(appId => !apps[appId]) : [],
        apps_count: Object.keys(apps).length
      },
      {
        metadata: {
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          endpoint: '/devices/:uuid/target-state'
        }
      }
    );

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
 * Convert apps array to Record<number, App> format
 * Supports both array input (clean API) and object input (backward compatibility)
 */
function normalizeAppsFormat(apps: any): Record<number, any> {
  // If already an object, return as-is
  if (!Array.isArray(apps)) {
    return apps;
  }

  // Convert array to object keyed by appId
  return apps.reduce((acc, app) => {
    if (!app.appId) {
      throw new Error('Each app in array must have an appId field');
    }
    acc[app.appId] = app;
    return acc;
  }, {} as Record<number, any>);
}

/**
 * Update device target state (alias for POST - supports PUT)
 * PUT /api/v1/devices/:uuid/target-state
 * 
 * Accepts apps as either:
 * - Array: [{ appId: 1, appName: "app1", ... }, ...]
 * - Object: { 1: { appId: 1, appName: "app1", ... }, ... }
 */
router.put('/devices/:uuid/target-state', deviceAuth, async (req, res) => {
  try {
    const { uuid } = req.params;
    let { apps, config } = req.body;

    if (!apps || typeof apps !== 'object') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Body must contain apps (array or object)'
      });
    }

    // Normalize apps to Record<number, App> format
    try {
      apps = normalizeAppsFormat(apps);
    } catch (error: any) {
      return res.status(400).json({
        error: 'Invalid apps format',
        message: error.message
      });
    }

    // 🎯 RESOLVE IMAGE DIGESTS
    // Convert all :latest and floating tags to @sha256:... digests
    console.log(`🔍 Resolving image digests for device ${uuid.substring(0, 8)}...`);
    try {
      apps = await resolveAppsImages(apps);
    } catch (error: any) {
      console.warn(`⚠️  Digest resolution failed: ${error.message}`);
      console.warn(`   Continuing with tag-based references`);
    }

    // Get old state for diff
    const oldTargetState = await DeviceTargetStateModel.get(uuid);

    const targetState = await DeviceTargetStateModel.set(uuid, apps, config || {});

    console.log(`🎯 Target state updated for device ${uuid.substring(0, 8)}...`);
    console.log(`   Apps: ${Object.keys(apps).length}, Version: ${targetState.version}`);

    // 🎉 EVENT SOURCING: Publish target state updated event
    await eventPublisher.publish(
      'target_state.updated',
      'device',
      uuid,
      {
        new_state: { apps, config },
        old_state: oldTargetState ? {
          apps: typeof oldTargetState.apps === 'string' ? JSON.parse(oldTargetState.apps as any) : oldTargetState.apps,
          config: typeof oldTargetState.config === 'string' ? JSON.parse(oldTargetState.config as any) : oldTargetState.config
        } : { apps: {}, config: {} },
        version: targetState.version,
        apps_added: Object.keys(apps).filter(appId => !oldTargetState?.apps?.[appId]),
        apps_removed: oldTargetState ? Object.keys(oldTargetState.apps || {}).filter(appId => !apps[appId]) : [],
        apps_count: Object.keys(apps).length
      },
      {
        metadata: {
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          endpoint: '/devices/:uuid/target-state'
        }
      }
    );

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
router.get('/devices/:uuid/current-state', async (req, res) => {
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
router.delete('/devices/:uuid/target-state', deviceAuth, async (req, res) => {
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
router.get('/devices/:uuid/logs', deviceAuth, async (req, res) => {
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
router.get('/devices/:uuid/metrics', deviceAuth,async (req, res) => {
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
 * Get current top processes for device
 * GET /api/v1/devices/:uuid/processes
 */
router.get('/devices/:uuid/processes', async (req, res) => {
  try {
    const { uuid } = req.params;

    // Get device to check if it exists and get latest processes
    const device = await DeviceModel.getByUuid(uuid);
    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
      });
    }

    res.json({
      device_uuid: uuid,
      top_processes: device.top_processes || [],
      is_online: device.is_online,
      last_updated: device.modified_at,
    });
  } catch (error: any) {
    console.error('Error getting top processes:', error);
    res.status(500).json({
      error: 'Failed to get top processes',
      message: error.message
    });
  }
});

/**
 * Get historical process metrics for device
 * GET /api/v1/devices/:uuid/processes/history
 */
router.get('/devices/:uuid/processes/history', async (req, res) => {
  try {
    const { uuid } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const hours = parseInt(req.query.hours as string) || 24;

    // Query metrics with process data
    const result = await query(
      `SELECT top_processes, recorded_at 
       FROM device_metrics 
       WHERE device_uuid = $1 
         AND top_processes IS NOT NULL
         AND recorded_at >= NOW() - INTERVAL '${hours} hours'
       ORDER BY recorded_at DESC 
       LIMIT $2`,
      [uuid, limit]
    );

    // Parse JSONB data
    const history = result.rows.map(row => ({
      top_processes: typeof row.top_processes === 'string' 
        ? JSON.parse(row.top_processes) 
        : row.top_processes,
      recorded_at: row.recorded_at,
    }));

    res.json({
      device_uuid: uuid,
      count: history.length,
      history,
    });
  } catch (error: any) {
    console.error('Error getting process history:', error);
    res.status(500).json({
      error: 'Failed to get process history',
      message: error.message
    });
  }
});

export default router;
