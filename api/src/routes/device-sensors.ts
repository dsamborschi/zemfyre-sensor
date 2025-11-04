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


// ============================================================================
// Sensor Configuration Management
// ============================================================================

/**
 * Get sensor-publish configuration
 * GET /api/v1/devices/:uuid/sensor-config
 */
// router.get('/devices/:uuid/sensor-config', async (req, res) => {
//   try {
//     const { uuid } = req.params;
    
//     // Get current target state
//     const targetState = await DeviceTargetStateModel.get(uuid);
    
//     if (!targetState) {
//       return res.json({
//         sensors: []
//       });
//     }

//     // Parse config to get sensors
//     const config = typeof targetState.config === 'string' 
//       ? JSON.parse(targetState.config) 
//       : targetState.config || {};

//     res.json({
//       sensors: config.sensors || []
//     });
//   } catch (error: any) {
//     console.error('Error getting sensor config:', error);
//     res.status(500).json({
//       error: 'Failed to get sensor configuration',
//       message: error.message
//     });
//   }
// });

/**
 * Add sensor to sensor-publish configuration
 * POST /api/v1/devices/:uuid/sensor-config
 */
// router.post('/devices/:uuid/sensor-config', async (req, res) => {
//   try {
//     const { uuid } = req.params;
//     const sensorConfig = req.body;

//     // Validate required fields
//     if (!sensorConfig.name || !sensorConfig.protocolType || !sensorConfig.platform) {
//       return res.status(400).json({
//         error: 'Invalid sensor configuration',
//         message: 'Required fields: name, protocolType, platform'
//       });
//     }

//     // Auto-generate socket/pipe path based on platform and sensor name
//     const addr = sensorConfig.platform === 'windows'
//       ? `\\\\.\\pipe\\${sensorConfig.name}`
//       : `/tmp/${sensorConfig.name}.sock`;

//     // Auto-generate MQTT topic based on protocol type and sensor name
//     const mqttTopic = `${sensorConfig.protocolType}/${sensorConfig.name}`;
//     const mqttHeartbeatTopic = `${mqttTopic}/heartbeat`;

//     // Build complete sensor configuration
//     const completeSensorConfig = {
//       name: sensorConfig.name,
//       protocolType: sensorConfig.protocolType,
//       enabled: sensorConfig.enabled !== undefined ? sensorConfig.enabled : true,
//       addr,
//       eomDelimiter: sensorConfig.eomDelimiter || '\\n',
//       mqttTopic,
//       mqttHeartbeatTopic,
//       bufferCapacity: sensorConfig.bufferCapacity || 8192,
//       publishInterval: sensorConfig.publishInterval || 30000,
//       bufferTimeMs: sensorConfig.bufferTimeMs || 5000,
//       bufferSize: sensorConfig.bufferSize || 10,
//       addrPollSec: sensorConfig.addrPollSec || 10,
//       heartbeatTimeSec: sensorConfig.heartbeatTimeSec || 300,
//     };

//     // Get current target state
//     const currentState = await DeviceTargetStateModel.get(uuid);
    
//     // Get current config or initialize empty
//     const config = currentState && currentState.config
//       ? (typeof currentState.config === 'string' 
//           ? JSON.parse(currentState.config) 
//           : currentState.config)
//       : {};

//     // Initialize sensors array if it doesn't exist
//     if (!config.sensors) {
//       config.sensors = [];
//     }

//     // Check if sensor with same name already exists
//     const existingIndex = config.sensors.findIndex((s: any) => s.name === completeSensorConfig.name);
//     if (existingIndex !== -1) {
//       return res.status(400).json({
//         error: 'Sensor already exists',
//         message: `A sensor with name "${completeSensorConfig.name}" already exists`
//       });
//     }

//     // Add new sensor to config
//     config.sensors.push(completeSensorConfig);

//     // Get current apps or initialize empty
//     const apps = currentState && currentState.apps
//       ? (typeof currentState.apps === 'string' 
//           ? JSON.parse(currentState.apps) 
//           : currentState.apps)
//       : {};

//     // Update target state with new sensor config
//     const targetState = await DeviceTargetStateModel.set(uuid, apps, config);

//     console.log(`📡 Added sensor "${completeSensorConfig.name}" to device ${uuid.substring(0, 8)}...`);
//     console.log(`   Socket/Pipe: ${completeSensorConfig.addr}`);
//     console.log(`   MQTT Topic: ${completeSensorConfig.mqttTopic}`);

//     // Publish event
//     await eventPublisher.publish(
//       'sensor_config.added',
//       'device',
//       uuid,
//       {
//         sensor: completeSensorConfig,
//         version: targetState.version
//       },
//       {
//         metadata: {
//           ip_address: req.ip,
//           user_agent: req.headers['user-agent'],
//           endpoint: '/devices/:uuid/sensor-config'
//         }
//       }
//     );

//     res.json({
//       status: 'ok',
//       message: 'Sensor configuration added',
//       sensor: completeSensorConfig,
//       version: targetState.version
//     });
//   } catch (error: any) {
//     console.error('Error adding sensor config:', error);
//     res.status(500).json({
//       error: 'Failed to add sensor configuration',
//       message: error.message
//     });
//   }
// });

/**
 * Update sensor configuration
 * PUT /api/v1/devices/:uuid/sensor-config/:sensorName
 */
// router.put('/devices/:uuid/sensor-config/:sensorName', async (req, res) => {
//   try {
//     const { uuid, sensorName } = req.params;
//     const updatedConfig = req.body;

//     // Get current target state
//     const currentState = await DeviceTargetStateModel.get(uuid);
    
//     if (!currentState || !currentState.config) {
//       return res.status(404).json({
//         error: 'Sensor not found',
//         message: `No sensor configuration found for "${sensorName}"`
//       });
//     }

//     const config = typeof currentState.config === 'string' 
//       ? JSON.parse(currentState.config) 
//       : currentState.config;

//     if (!config.sensors) {
//       return res.status(404).json({
//         error: 'Sensor not found',
//         message: `No sensor configuration found for "${sensorName}"`
//       });
//     }

//     // Find sensor by name
//     const sensorIndex = config.sensors.findIndex((s: any) => s.name === sensorName);
//     if (sensorIndex === -1) {
//       return res.status(404).json({
//         error: 'Sensor not found',
//         message: `Sensor "${sensorName}" not found`
//       });
//     }

//     // Update sensor config
//     config.sensors[sensorIndex] = { ...config.sensors[sensorIndex], ...updatedConfig };

//     // Get current apps
//     const apps = typeof currentState.apps === 'string' 
//       ? JSON.parse(currentState.apps) 
//       : currentState.apps || {};

//     // Update target state
//     const targetState = await DeviceTargetStateModel.set(uuid, apps, config);

//     console.log(`📡 Updated sensor "${sensorName}" on device ${uuid.substring(0, 8)}...`);

//     // Publish event
//     await eventPublisher.publish(
//       'sensor_config.updated',
//       'device',
//       uuid,
//       {
//         sensor_name: sensorName,
//         sensor: config.sensors[sensorIndex],
//         version: targetState.version
//       },
//       {
//         metadata: {
//           ip_address: req.ip,
//           user_agent: req.headers['user-agent'],
//           endpoint: '/devices/:uuid/sensor-config/:sensorName'
//         }
//       }
//     );

//     res.json({
//       status: 'ok',
//       message: 'Sensor configuration updated',
//       sensor: config.sensors[sensorIndex],
//       version: targetState.version
//     });
//   } catch (error: any) {
//     console.error('Error updating sensor config:', error);
//     res.status(500).json({
//       error: 'Failed to update sensor configuration',
//       message: error.message
//     });
//   }
// });

// /**
//  * Delete sensor configuration
//  * DELETE /api/v1/devices/:uuid/sensor-config/:sensorName
//  */
// router.delete('/devices/:uuid/sensor-config/:sensorName', async (req, res) => {
//   try {
//     const { uuid, sensorName } = req.params;

//     // Get current target state
//     const currentState = await DeviceTargetStateModel.get(uuid);
    
//     if (!currentState || !currentState.config) {
//       return res.status(404).json({
//         error: 'Sensor not found',
//         message: `No sensor configuration found for "${sensorName}"`
//       });
//     }

//     const config = typeof currentState.config === 'string' 
//       ? JSON.parse(currentState.config) 
//       : currentState.config;

//     if (!config.sensors) {
//       return res.status(404).json({
//         error: 'Sensor not found',
//         message: `No sensor configuration found for "${sensorName}"`
//       });
//     }

//     // Find sensor by name
//     const sensorIndex = config.sensors.findIndex((s: any) => s.name === sensorName);
//     if (sensorIndex === -1) {
//       return res.status(404).json({
//         error: 'Sensor not found',
//         message: `Sensor "${sensorName}" not found`
//       });
//     }

//     // Remove sensor from config
//     const removedSensor = config.sensors.splice(sensorIndex, 1)[0];

//     // Get current apps
//     const apps = typeof currentState.apps === 'string' 
//       ? JSON.parse(currentState.apps) 
//       : currentState.apps || {};

//     // Update target state
//     const targetState = await DeviceTargetStateModel.set(uuid, apps, config);

//     console.log(`🗑️  Removed sensor "${sensorName}" from device ${uuid.substring(0, 8)}...`);

//     // Publish event
//     await eventPublisher.publish(
//       'sensor_config.deleted',
//       'device',
//       uuid,
//       {
//         sensor_name: sensorName,
//         sensor: removedSensor,
//         version: targetState.version
//       },
//       {
//         metadata: {
//           ip_address: req.ip,
//           user_agent: req.headers['user-agent'],
//           endpoint: '/devices/:uuid/sensor-config/:sensorName'
//         }
//       }
//     );

//     res.json({
//       status: 'ok',
//       message: 'Sensor configuration deleted',
//       sensor: removedSensor,
//       version: targetState.version
//     });
//   } catch (error: any) {
//     console.error('Error deleting sensor config:', error);
//     res.status(500).json({
//       error: 'Failed to delete sensor configuration',
//       message: error.message
//     });
//   }
// });

