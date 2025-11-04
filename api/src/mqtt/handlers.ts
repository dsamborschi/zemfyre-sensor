/**
 * MQTT Message Handlers
 * 
 * Processes incoming MQTT messages and stores them in the database
 */

import { query } from '../db/connection';
import type { SensorData, MetricsData } from './mqtt-manager';
import { processDeviceStateReport } from '../services/device-state-handler';

/**
 * Handle incoming sensor data
 * Store in sensor_data table or time-series database
 */
export async function handleSensorData(data: SensorData): Promise<void> {
  try {
    // Store sensor data in database
    // You can create a sensor_data table or use InfluxDB for time-series data
    
    await query(
      `INSERT INTO sensor_data (device_uuid, sensor_name, data, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        data.deviceUuid,
        data.sensorName,
        JSON.stringify(data.data),
        data.timestamp,
        JSON.stringify(data.metadata || {})
      ]
    );

    console.log(`✅ Stored sensor data: ${data.deviceUuid}/${data.sensorName}`);

  } catch (error) {
    console.error('❌ Failed to store sensor data:', error);
    throw error;
  }
}

/**
 * Handle device state updates (MQTT primary path)
 * Processes full device state reports including config, apps, and metrics
 * Dual-write: PostgreSQL (durable) + Redis pub/sub (real-time)
 */
export async function handleDeviceState(payload: any): Promise<void> {
  try {
    // Use shared service for consistent state processing
    await processDeviceStateReport(payload, {
      source: 'mqtt',
      topic: 'device/+/state'
    });

    // Publish to Redis for real-time distribution (MQTT-specific, non-blocking)
    try {
      const { redisClient } = await import('../redis/client');
      const deviceUuid = Object.keys(payload)[0];
      const state = payload[deviceUuid];
      
      if (deviceUuid && state) {
        // Publish full state to device:{uuid}:state channel
        await redisClient.publishDeviceState(deviceUuid, state);
        
        // Publish metrics-only to device:{uuid}:metrics channel (if metrics present)
        if (
          state.cpu_usage !== undefined ||
          state.memory_usage !== undefined ||
          state.storage_usage !== undefined
        ) {
          const metrics = {
            cpu_usage: state.cpu_usage,
            cpu_temp: state.temperature,
            memory_usage: state.memory_usage,
            memory_total: state.memory_total,
            storage_usage: state.storage_usage,
            storage_total: state.storage_total,
            top_processes: state.top_processes,
            network_interfaces: state.network_interfaces,
          };
          await redisClient.publishDeviceMetrics(deviceUuid, metrics);
        }
      }
    } catch (error) {
      // Log but don't throw - graceful degradation
      console.error('⚠️  Failed to publish to Redis (continuing with PostgreSQL only):', error);
    }

  } catch (error) {
    console.error('❌ Failed to handle device state:', error);
    throw error;
  }
}


