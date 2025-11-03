/**
 * Device Sensor Configuration Routes
 * Manages sensor device configurations (Modbus, CAN, OPC-UA, MQTT, etc.)
 * 
 * Pattern: Dual-write with sync service
 * - Config in device_target_state remains source of truth for agent
 * - device_sensors table for efficient querying/display
 * 
 * Endpoints:
 * - GET /api/v1/devices/:uuid/sensors - List all sensors
 * - POST /api/v1/devices/:uuid/sensors - Add new sensor
 * - PUT /api/v1/devices/:uuid/sensors/:name - Update sensor
 * - DELETE /api/v1/devices/:uuid/sensors/:name - Delete sensor
 */

import express from 'express';
import { deviceSensorSync } from '../services/device-sensor-sync';

export const router = express.Router();

/**
 * List all sensors for a device
 * GET /api/v1/devices/:uuid/sensors
 * 
 * Reads from device_sensors table (faster, allows filtering/sorting)
 */
router.get('/devices/:uuid/sensors', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { protocol } = req.query; // Optional filter by protocol

    const sensors = await deviceSensorSync.getSensors(
      uuid, 
      protocol as string | undefined
    );

    res.json({
      devices: sensors, // Keep "devices" for backward compatibility
      count: sensors.length
    });
  } catch (error: any) {
    console.error('Error getting sensors:', error);
    res.status(500).json({
      error: 'Failed to get sensors',
      message: error.message
    });
  }
});

/**
 * Add new sensor
 * POST /api/v1/devices/:uuid/sensors
 * 
 * Dual-write: table + config (sync service handles both)
 */
router.post('/devices/:uuid/sensors', async (req, res) => {
  try {
    const { uuid } = req.params;
    const sensorConfig = req.body;

    // Validate required fields
    if (!sensorConfig.name || !sensorConfig.protocol || !sensorConfig.connection) {
      return res.status(400).json({
        error: 'Invalid sensor configuration',
        message: 'Required fields: name, protocol, connection'
      });
    }

    // Build complete sensor configuration
    const completeSensorConfig = {
      name: sensorConfig.name,
      protocol: sensorConfig.protocol,
      enabled: sensorConfig.enabled !== undefined ? sensorConfig.enabled : true,
      pollInterval: sensorConfig.pollInterval || 5000,
      connection: sensorConfig.connection,
      dataPoints: sensorConfig.dataPoints || [],
      metadata: sensorConfig.metadata || {}
    };

    // Add sensor using sync service (draft mode by default)
    const result = await deviceSensorSync.addSensor(
      uuid,
      completeSensorConfig,
      (req as any).user?.id || 'system'
      // deployImmediately defaults to false (draft mode)
    );

    res.json({
      status: 'ok',
      message: result.isDraft 
        ? 'Sensor saved to config. Click "Deploy" to trigger deployment.' 
        : 'Sensor added and deployed',
      device: result.sensor, // Return the saved sensor config
      version: result.version, // Config version (undefined for drafts)
      isDraft: result.isDraft || false
    });
  } catch (error: any) {
    console.error('Error adding sensor:', error);
    
    // Handle duplicate name error
    if (error.message.includes('already exists')) {
      return res.status(400).json({
        error: 'Sensor already exists',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to add sensor',
      message: error.message
    });
  }
});

/**
 * Update sensor
 * PUT /api/v1/devices/:uuid/sensors/:name
 * 
 * Dual-write: table + config (sync service handles both)
 */
router.put('/devices/:uuid/sensors/:name', async (req, res) => {
  try {
    const { uuid, name } = req.params;
    const updates = req.body;

    // Update sensor using sync service (handles dual-write)
    const result = await deviceSensorSync.updateSensor(
      uuid,
      name,
      updates,
      (req as any).user?.id || 'system'
    );

    res.json({
      status: 'ok',
      message: 'Sensor updated',
      device: result.sensor, // Keep "device" for backward compatibility
      version: result.version
    });
  } catch (error: any) {
    console.error('Error updating sensor:', error);
    
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Sensor not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to update sensor',
      message: error.message
    });
  }
});

/**
 * Delete sensor
 * DELETE /api/v1/devices/:uuid/sensors/:name
 * 
 * Dual-write: table + config (sync service handles both)
 */
router.delete('/devices/:uuid/sensors/:name', async (req, res) => {
  try {
    const { uuid, name } = req.params;

    // Delete sensor using sync service (handles dual-write)
    const result = await deviceSensorSync.deleteSensor(
      uuid,
      name,
      (req as any).user?.id || 'system'
    );

    res.json({
      status: 'ok',
      message: 'Sensor deleted',
      version: result.version
    });
  } catch (error: any) {
    console.error('Error deleting sensor:', error);
    
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Sensor not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to delete sensor',
      message: error.message
    });
  }
});
