/**
 * MQTT Message Handlers
 * 
 * Processes incoming MQTT messages and stores them in the database
 */

import { query } from '../db/connection';
import type { SensorData, MetricsData } from './mqtt-manager';

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
 * Handle device metrics
 */
export async function handleMetrics(metrics: MetricsData): Promise<void> {
  try {
    // Store in device_metrics table (with partitioning)
    await query(
      `INSERT INTO device_metrics (
        device_uuid, 
        cpu_usage, 
        memory_usage, 
        memory_total, 
        storage_usage, 
        storage_total, 
        cpu_temp,
        network_stats,
        recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        metrics.deviceUuid,
        metrics.cpu_usage,
        metrics.memory_usage,
        metrics.memory_total,
        metrics.storage_usage,
        metrics.storage_total,
        metrics.cpu_temp,
        JSON.stringify(metrics.network || {}),
        metrics.timestamp
      ]
    );

    // Update device last_seen timestamp
    await query(
      `UPDATE devices 
       SET 
         cpu_usage = $2,
         memory_usage = $3,
         memory_total = $4,
         storage_usage = $5,
         storage_total = $6,
         cpu_temp = $7,
         last_connectivity_event = $8
       WHERE uuid = $1`,
      [
        metrics.deviceUuid,
        metrics.cpu_usage,
        metrics.memory_usage,
        metrics.memory_total,
        metrics.storage_usage,
        metrics.storage_total,
        metrics.cpu_temp,
        new Date()
      ]
    );

  } catch (error) {
    console.error('❌ Failed to store metrics:', error);
    throw error;
  }
}


