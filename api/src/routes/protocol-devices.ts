/**
 * Protocol Adapter Device Configuration Routes
 * Manages Modbus, CAN, OPC-UA device configurations
 * 
 * Endpoints:
 * - GET /api/v1/devices/:uuid/protocol-devices - List all protocol adapter devices
 * - POST /api/v1/devices/:uuid/protocol-devices - Add new protocol adapter device
 * - PUT /api/v1/devices/:uuid/protocol-devices/:name - Update protocol adapter device
 * - DELETE /api/v1/devices/:uuid/protocol-devices/:name - Delete protocol adapter device
 */

import express from 'express';
import { query } from '../db/connection';
import { EventPublisher } from '../services/event-sourcing';

const eventPublisher = new EventPublisher();

export const router = express.Router();

// Helper to get/set target state (similar to device-state.ts)
async function getTargetState(uuid: string) {
  const result = await query(
    'SELECT apps, config, version FROM device_target_state WHERE device_uuid = $1',
    [uuid]
  );
  return result.rows[0] || null;
}

async function setTargetState(uuid: string, apps: any, config: any) {
  const result = await query(
    `INSERT INTO device_target_state (device_uuid, apps, config, version, updated_at, needs_deployment)
     VALUES ($1, $2, $3, 1, NOW(), true)
     ON CONFLICT (device_uuid) DO UPDATE SET
       apps = $2,
       config = $3,
       version = device_target_state.version + 1,
       updated_at = NOW(),
       needs_deployment = true
     RETURNING version`,
    [uuid, JSON.stringify(apps), JSON.stringify(config)]
  );
  return result.rows[0];
}

/**
 * List all protocol adapter devices for a device
 * GET /api/v1/devices/:uuid/protocol-devices
 */
router.get('/devices/:uuid/protocol-devices', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { protocol } = req.query; // Optional filter by protocol

    // Get current target state
    const targetState = await getTargetState(uuid);
    
    if (!targetState) {
      return res.json({ devices: [] });
    }

    // Get protocol adapter devices from config
    const config = targetState.config
      ? (typeof targetState.config === 'string' 
          ? JSON.parse(targetState.config) 
          : targetState.config)
      : {};

    const devices = config.protocolAdapterDevices || [];

    // Filter by protocol if specified
    const filteredDevices = protocol 
      ? devices.filter((d: any) => d.protocol === protocol)
      : devices;

    res.json({
      devices: filteredDevices,
      count: filteredDevices.length
    });
  } catch (error: any) {
    console.error('Error getting protocol adapter devices:', error);
    res.status(500).json({
      error: 'Failed to get protocol adapter devices',
      message: error.message
    });
  }
});

/**
 * Add new protocol adapter device
 * POST /api/v1/devices/:uuid/protocol-devices
 */
router.post('/devices/:uuid/protocol-devices', async (req, res) => {
  try {
    const { uuid } = req.params;
    const deviceConfig = req.body;

    console.log(`📥 Received protocol device POST for device ${uuid}`);
    console.log('📦 Device config:', JSON.stringify(deviceConfig, null, 2));

    // Validate required fields
    if (!deviceConfig.name || !deviceConfig.protocol || !deviceConfig.connection) {
      console.error('❌ Validation failed - missing required fields');
      return res.status(400).json({
        error: 'Invalid device configuration',
        message: 'Required fields: name, protocol, connection'
      });
    }

    // Get current target state
    const currentState = await getTargetState(uuid);
    
    // Get current config or initialize empty
    const config = currentState && currentState.config
      ? (typeof currentState.config === 'string' 
          ? JSON.parse(currentState.config) 
          : currentState.config)
      : {};

    // Initialize protocolAdapterDevices array if it doesn't exist
    if (!config.protocolAdapterDevices) {
      config.protocolAdapterDevices = [];
    }

    // Check if device with same name already exists
    const existingIndex = config.protocolAdapterDevices.findIndex((d: any) => d.name === deviceConfig.name);
    if (existingIndex !== -1) {
      return res.status(400).json({
        error: 'Device already exists',
        message: `A device with name "${deviceConfig.name}" already exists`
      });
    }

    // Build complete device configuration
    const completeDeviceConfig = {
      name: deviceConfig.name,
      protocol: deviceConfig.protocol,
      enabled: deviceConfig.enabled !== undefined ? deviceConfig.enabled : true,
      pollInterval: deviceConfig.pollInterval || 5000,
      connection: deviceConfig.connection,
      registers: deviceConfig.registers || [],
      metadata: deviceConfig.metadata || {}
    };

    // Add new device to config
    config.protocolAdapterDevices.push(completeDeviceConfig);

    // Get current apps or initialize empty
    const apps = currentState && currentState.apps
      ? (typeof currentState.apps === 'string' 
          ? JSON.parse(currentState.apps) 
          : currentState.apps)
      : {};

    // Update target state
    const targetState = await setTargetState(uuid, apps, config);

    console.log(`✅ Added protocol adapter device "${completeDeviceConfig.name}" (${completeDeviceConfig.protocol}) to device ${uuid.substring(0, 8)}...`);
    console.log(`📊 Total protocol devices in config: ${config.protocolAdapterDevices.length}`);

    // Publish event
    await eventPublisher.publish(
      'protocol_adapter_device.added',
      'device',
      uuid,
      {
        device_name: completeDeviceConfig.name,
        protocol: completeDeviceConfig.protocol,
        version: targetState.version
      }
    );

    res.json({
      status: 'ok',
      message: 'Protocol adapter device added',
      device: completeDeviceConfig,
      version: targetState.version
    });
  } catch (error: any) {
    console.error('Error adding protocol adapter device:', error);
    res.status(500).json({
      error: 'Failed to add protocol adapter device',
      message: error.message
    });
  }
});

/**
 * Update protocol adapter device
 * PUT /api/v1/devices/:uuid/protocol-devices/:name
 */
router.put('/devices/:uuid/protocol-devices/:name', async (req, res) => {
  try {
    const { uuid, name } = req.params;
    const updates = req.body;

    // Get current target state
    const currentState = await getTargetState(uuid);
    
    if (!currentState) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
      });
    }

    // Get current config
    const config = currentState.config
      ? (typeof currentState.config === 'string' 
          ? JSON.parse(currentState.config) 
          : currentState.config)
      : {};

    if (!config.protocolAdapterDevices) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Protocol adapter device "${name}" not found`
      });
    }

    // Find device
    const deviceIndex = config.protocolAdapterDevices.findIndex((d: any) => d.name === name);
    if (deviceIndex === -1) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Protocol adapter device "${name}" not found`
      });
    }

    // Update device
    config.protocolAdapterDevices[deviceIndex] = {
      ...config.protocolAdapterDevices[deviceIndex],
      ...updates
    };

    // Get current apps
    const apps = currentState.apps
      ? (typeof currentState.apps === 'string' 
          ? JSON.parse(currentState.apps) 
          : currentState.apps)
      : {};

    // Update target state
    const targetState = await setTargetState(uuid, apps, config);

    console.log(`📡 Updated protocol adapter device "${name}" on device ${uuid.substring(0, 8)}...`);

    // Publish event
    await eventPublisher.publish(
      'protocol_adapter_device.updated',
      'device',
      uuid,
      {
        device_name: name,
        version: targetState.version
      }
    );

    res.json({
      status: 'ok',
      message: 'Protocol adapter device updated',
      device: config.protocolAdapterDevices[deviceIndex],
      version: targetState.version
    });
  } catch (error: any) {
    console.error('Error updating protocol adapter device:', error);
    res.status(500).json({
      error: 'Failed to update protocol adapter device',
      message: error.message
    });
  }
});

/**
 * Delete protocol adapter device
 * DELETE /api/v1/devices/:uuid/protocol-devices/:name
 */
router.delete('/devices/:uuid/protocol-devices/:name', async (req, res) => {
  try {
    const { uuid, name } = req.params;

    // Get current target state
    const currentState = await getTargetState(uuid);
    
    if (!currentState) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Device ${uuid} not found`
      });
    }

    // Get current config
    const config = currentState.config
      ? (typeof currentState.config === 'string' 
          ? JSON.parse(currentState.config) 
          : currentState.config)
      : {};

    if (!config.protocolAdapterDevices) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Protocol adapter device "${name}" not found`
      });
    }

    // Find and remove device
    const deviceIndex = config.protocolAdapterDevices.findIndex((d: any) => d.name === name);
    if (deviceIndex === -1) {
      return res.status(404).json({
        error: 'Device not found',
        message: `Protocol adapter device "${name}" not found`
      });
    }

    config.protocolAdapterDevices.splice(deviceIndex, 1);

    // Get current apps
    const apps = currentState.apps
      ? (typeof currentState.apps === 'string' 
          ? JSON.parse(currentState.apps) 
          : currentState.apps)
      : {};

    // Update target state
    const targetState = await setTargetState(uuid, apps, config);

    console.log(`📡 Deleted protocol adapter device "${name}" from device ${uuid.substring(0, 8)}...`);

    // Publish event
    await eventPublisher.publish(
      'protocol_adapter_device.deleted',
      'device',
      uuid,
      {
        device_name: name,
        version: targetState.version
      }
    );

    res.json({
      status: 'ok',
      message: 'Protocol adapter device deleted',
      version: targetState.version
    });
  } catch (error: any) {
    console.error('Error deleting protocol adapter device:', error);
    res.status(500).json({
      error: 'Failed to delete protocol adapter device',
      message: error.message
    });
  }
});
