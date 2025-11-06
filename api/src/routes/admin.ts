/**
 * Admin Routes
 * Administrative endpoints for system monitoring and configuration
 */

import express from 'express';
import {
  getVpnConfigForDevice,
  getDefaultVpnConfig,
  listVpnConfigs,
  updateVpnConfig,
  assignVpnConfigToDevice,
  VpnConfig
} from '../utils/vpn-config';
import { query } from '../db/connection';
import { SystemConfig } from '../config/system-config';

export const router = express.Router();

// ============================================================================
// Admin / Monitoring Endpoints
// ============================================================================

/**
 * Get heartbeat monitor status and configuration
 * GET /api/v1/admin/heartbeat
 */
router.get('/admin/heartbeat', async (req, res) => {
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
router.post('/admin/heartbeat/check', async (req, res) => {
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
// VPN Configuration Management
// ============================================================================

/**
 * List all VPN configurations
 * GET /api/v1/admin/vpn-configs
 * 
 * Query params:
 * - activeOnly: boolean (default: true)
 */
router.get('/admin/vpn-configs', async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly !== 'false';
    const configs = await listVpnConfigs(activeOnly);

    res.json({
      status: 'ok',
      count: configs.length,
      configs: configs
    });
  } catch (error: any) {
    console.error('Error listing VPN configs:', error);
    res.status(500).json({
      error: 'Failed to list VPN configurations',
      message: error.message
    });
  }
});

/**
 * Get default VPN configuration
 * GET /api/v1/admin/vpn-configs/default
 */
router.get('/admin/vpn-configs/default', async (req, res) => {
  try {
    const config = await getDefaultVpnConfig();

    if (!config) {
      return res.status(404).json({
        error: 'Not found',
        message: 'No default VPN configuration found'
      });
    }

    res.json({
      status: 'ok',
      config: config
    });
  } catch (error: any) {
    console.error('Error getting default VPN config:', error);
    res.status(500).json({
      error: 'Failed to get default VPN configuration',
      message: error.message
    });
  }
});

/**
 * Get VPN configuration by ID
 * GET /api/v1/admin/vpn-configs/:id
 */
router.get('/admin/vpn-configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const config = await SystemConfig.getVpnConfig(parseInt(id));

    if (!config) {
      return res.status(404).json({
        error: 'Not found',
        message: `VPN configuration ${id} not found`
      });
    }

    res.json({
      status: 'ok',
      config: config
    });
  } catch (error: any) {
    console.error('Error getting VPN config:', error);
    res.status(500).json({
      error: 'Failed to get VPN configuration',
      message: error.message
    });
  }
});

/**
 * Create new VPN configuration
 * POST /api/v1/admin/vpn-configs
 * 
 * Body:
 * - name: string (required)
 * - description: string (optional)
 * - enabled: boolean (default: false)
 * - server_host: string (required)
 * - server_port: number (default: 1194)
 * - protocol: string (default: 'udp')
 * - ca_cert_url: string (optional)
 * - vpn_subnet: string (default: '10.8.0.0')
 * - vpn_netmask: string (default: '255.255.0.0')
 * - cipher: string (default: 'AES-256-GCM')
 * - auth: string (default: 'SHA256')
 * - compress_lzo: boolean (default: true)
 * - is_default: boolean (default: false)
 */
router.post('/admin/vpn-configs', async (req, res) => {
  try {
    const {
      name,
      description,
      enabled = false,
      server_host,
      server_port = 1194,
      protocol = 'udp',
      ca_cert_url,
      vpn_subnet = '10.8.0.0',
      vpn_netmask = '255.255.0.0',
      cipher = 'AES-256-GCM',
      auth = 'SHA256',
      compress_lzo = true,
      is_default = false
    } = req.body;

    // Validation
    if (!name || !server_host) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'name and server_host are required'
      });
    }

    // Generate new ID from existing configs
    const allConfigs = await SystemConfig.getAllVpnConfigs();
    const maxId = allConfigs.reduce((max, cfg) => Math.max(max, cfg.id || 0), 0);
    const newId = maxId + 1;

    // Check for duplicate names
    const existingConfig = allConfigs.find(cfg => cfg.name === name && cfg.is_active !== false);
    if (existingConfig) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'VPN configuration with this name already exists'
      });
    }

    // If setting as default, unset other defaults first
    if (is_default) {
      const currentDefault = await SystemConfig.get<number>('vpn.defaultConfigId');
      if (currentDefault) {
        const defaultConfig = await SystemConfig.getVpnConfig(currentDefault);
        if (defaultConfig) {
          await SystemConfig.updateVpnConfig(currentDefault, { is_default: false });
        }
      }
    }

    // Create new config
    const newConfig = {
      id: newId,
      name,
      description,
      enabled,
      server_host,
      server_port,
      protocol,
      ca_cert_url,
      vpn_subnet,
      vpn_netmask,
      cipher,
      auth,
      compress_lzo,
      is_default,
      is_active: true,
      created_by: 'admin', // TODO: Get from auth context
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await SystemConfig.set(`vpn.configs.${newId}`, newConfig);

    // Update default ID if this is the default
    if (is_default) {
      await SystemConfig.set('vpn.defaultConfigId', newId);
    }

    // Update VPN IDs list
    const vpnIds = await SystemConfig.get<number[]>('vpn.ids') || [];
    if (!vpnIds.includes(newId)) {
      await SystemConfig.set('vpn.ids', [...vpnIds, newId]);
    }

    res.status(201).json({
      status: 'ok',
      message: 'VPN configuration created',
      config: newConfig
    });
  } catch (error: any) {
    console.error('Error creating VPN config:', error);
    
    res.status(500).json({
      error: 'Failed to create VPN configuration',
      message: error.message
    });
  }
});

/**
 * Update VPN configuration
 * PUT /api/v1/admin/vpn-configs/:id
 * 
 * Body: Partial VPN config fields to update
 */
router.put('/admin/vpn-configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // If setting as default, unset other defaults first and update default ID
    if (updates.is_default === true) {
      const currentDefault = await SystemConfig.get<number>('vpn.defaultConfigId');
      if (currentDefault && currentDefault !== parseInt(id)) {
        const defaultConfig = await SystemConfig.getVpnConfig(currentDefault);
        if (defaultConfig) {
          await SystemConfig.updateVpnConfig(currentDefault, { is_default: false });
        }
      }
      await SystemConfig.set('vpn.defaultConfigId', parseInt(id));
    }

    const config = await updateVpnConfig(parseInt(id), updates);

    if (!config) {
      return res.status(404).json({
        error: 'Not found',
        message: `VPN configuration ${id} not found or no fields to update`
      });
    }

    res.json({
      status: 'ok',
      message: 'VPN configuration updated',
      config: config
    });
  } catch (error: any) {
    console.error('Error updating VPN config:', error);
    res.status(500).json({
      error: 'Failed to update VPN configuration',
      message: error.message
    });
  }
});

/**
 * Enable/disable VPN configuration
 * PUT /api/v1/admin/vpn-configs/:id/enable
 * 
 * Body:
 * - enabled: boolean
 */
router.put('/admin/vpn-configs/:id/enable', async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'enabled field must be a boolean'
      });
    }

    const config = await updateVpnConfig(parseInt(id), { enabled });

    if (!config) {
      return res.status(404).json({
        error: 'Not found',
        message: `VPN configuration ${id} not found`
      });
    }

    res.json({
      status: 'ok',
      message: `VPN configuration ${enabled ? 'enabled' : 'disabled'}`,
      config: config
    });
  } catch (error: any) {
    console.error('Error enabling/disabling VPN config:', error);
    res.status(500).json({
      error: 'Failed to enable/disable VPN configuration',
      message: error.message
    });
  }
});

/**
 * Delete VPN configuration
 * DELETE /api/v1/admin/vpn-configs/:id
 */
router.delete('/admin/vpn-configs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if config exists
    const config = await SystemConfig.getVpnConfig(parseInt(id));

    if (!config) {
      return res.status(404).json({
        error: 'Not found',
        message: `VPN configuration ${id} not found`
      });
    }

    if (config.is_default) {
      return res.status(400).json({
        error: 'Invalid operation',
        message: 'Cannot delete default VPN configuration. Set another config as default first.'
      });
    }

    // Soft delete (mark as inactive)
    await SystemConfig.updateVpnConfig(parseInt(id), { 
      is_active: false, 
      updated_at: new Date().toISOString() 
    });

    res.json({
      status: 'ok',
      message: 'VPN configuration deleted'
    });
  } catch (error: any) {
    console.error('Error deleting VPN config:', error);
    res.status(500).json({
      error: 'Failed to delete VPN configuration',
      message: error.message
    });
  }
});

/**
 * Assign VPN configuration to a device
 * PUT /api/v1/admin/devices/:uuid/vpn-config
 * 
 * Body:
 * - vpn_config_id: number | null (null = use default)
 */
router.put('/admin/devices/:uuid/vpn-config', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { vpn_config_id } = req.body;

    if (vpn_config_id !== null && typeof vpn_config_id !== 'number') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'vpn_config_id must be a number or null'
      });
    }

    const success = await assignVpnConfigToDevice(uuid, vpn_config_id);

    if (!success) {
      return res.status(404).json({
        error: 'Not found',
        message: `Device ${uuid} not found`
      });
    }

    res.json({
      status: 'ok',
      message: vpn_config_id 
        ? `VPN configuration ${vpn_config_id} assigned to device`
        : 'Device will use default VPN configuration'
    });
  } catch (error: any) {
    console.error('Error assigning VPN config to device:', error);
    res.status(500).json({
      error: 'Failed to assign VPN configuration',
      message: error.message
    });
  }
});

/**
 * Get VPN configuration for a specific device
 * GET /api/v1/admin/devices/:uuid/vpn-config
 */
router.get('/admin/devices/:uuid/vpn-config', async (req, res) => {
  try {
    const { uuid } = req.params;

    const config = await getVpnConfigForDevice(uuid);

    if (!config) {
      return res.json({
        status: 'ok',
        message: 'VPN is not configured or enabled for this device',
        config: null
      });
    }

    res.json({
      status: 'ok',
      config: config
    });
  } catch (error: any) {
    console.error('Error getting device VPN config:', error);
    res.status(500).json({
      error: 'Failed to get device VPN configuration',
      message: error.message
    });
  }
});

export default router;
