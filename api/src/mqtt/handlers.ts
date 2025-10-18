/**
 * MQTT Message Handlers
 * 
 * Processes incoming MQTT messages and stores them in the database
 */

import { query } from '../db/connection';
import type { SensorData, ShadowUpdate, LogMessage, MetricsData } from './mqtt-manager';

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
 * Handle shadow update from device (reported state)
 */
export async function handleShadowUpdate(update: ShadowUpdate): Promise<void> {
  try {
    if (update.reported) {
      // Update device shadow reported state
      await query(
        `INSERT INTO device_shadows (device_uuid, reported, version, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (device_uuid) 
         DO UPDATE SET
           reported = $2,
           version = GREATEST(device_shadows.version, $3),
           updated_at = $4`,
        [
          update.deviceUuid,
          JSON.stringify(update.reported),
          update.version,
          update.timestamp
        ]
      );

      console.log(`✅ Updated shadow reported state: ${update.deviceUuid}`);
    }

    if (update.desired) {
      // Update device shadow desired state
      await query(
        `INSERT INTO device_shadows (device_uuid, desired, version, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (device_uuid)
         DO UPDATE SET
           desired = $2,
           version = GREATEST(device_shadows.version, $3),
           updated_at = $4`,
        [
          update.deviceUuid,
          JSON.stringify(update.desired),
          update.version,
          update.timestamp
        ]
      );

      console.log(`✅ Updated shadow desired state: ${update.deviceUuid}`);
    }

  } catch (error) {
    console.error('❌ Failed to update shadow:', error);
    throw error;
  }
}

/**
 * Handle container logs from device
 */
export async function handleLogMessage(log: LogMessage): Promise<void> {
  try {
    // Store logs in database (consider log retention policies)
    await query(
      `INSERT INTO device_logs (device_uuid, container_id, container_name, message, level, stream, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        log.deviceUuid,
        log.containerId,
        log.containerName,
        log.message,
        log.level || 'info',
        log.stream || 'stdout',
        log.timestamp
      ]
    );

    // Optional: Stream to log aggregation service (e.g., Elasticsearch, Loki)
    // await forwardToLogAggregator(log);

  } catch (error) {
    console.error('❌ Failed to store log message:', error);
    // Don't throw - logs are non-critical
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

/**
 * Handle device status updates
 */
export async function handleDeviceStatus(deviceUuid: string, status: any): Promise<void> {
  try {
    const isOnline = status.status === 'online' || status.online === true;

    await query(
      `UPDATE devices 
       SET 
         is_online = $2,
         last_connectivity_event = CURRENT_TIMESTAMP
       WHERE uuid = $1`,
      [deviceUuid, isOnline]
    );

    console.log(`✅ Updated device status: ${deviceUuid} -> ${isOnline ? 'online' : 'offline'}`);

  } catch (error) {
    console.error('❌ Failed to update device status:', error);
    throw error;
  }
}
