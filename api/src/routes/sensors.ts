/**
 * Sensor Health Management Routes
 * Handles sensor health monitoring and historical data
 * 
 * Endpoints:
 * - GET /api/v1/devices/:uuid/sensors - List all sensors for a device (current status)
 * - GET /api/v1/devices/:uuid/sensors/:sensorName/history - Get historical data for charts
 * - GET /api/v1/sensors/unhealthy - Alert dashboard showing all unhealthy sensors
 * - GET /api/v1/devices/:uuid/protocol-adapters - List protocol adapter devices
 * - GET /api/v1/devices/:uuid/protocol-adapters/:adapterName/history - Protocol adapter history
 */

import express from 'express';
import { query } from '../db/connection';

export const router = express.Router();

/**
 * List all sensors for a device (current status)
 * Includes both sensor pipeline health AND protocol adapter device status
 * GET /api/v1/devices/:uuid/sensors
 */
router.get('/devices/:uuid/sensors', async (req, res) => {
  try {
    const { uuid } = req.params;

    // Get sensor pipeline health (named pipe connections)
    const sensorResult = await query(
      `SELECT 
        device_uuid,
        sensor_name,
        state,
        healthy,
        addr,
        enabled,
        messages_received,
        messages_published,
        bytes_received,
        bytes_published,
        reconnect_attempts,
        last_error,
        last_error_time,
        last_connected_time,
        last_publish_time,
        reported_at
      FROM sensor_health_latest
      WHERE device_uuid = $1
      ORDER BY sensor_name`,
      [uuid]
    );

    // Get protocol adapter device health (actual Modbus/CAN/OPC-UA devices)
    const adapterResult = await query(
      `SELECT 
        protocol_type,
        device_name,
        connected,
        last_poll,
        error_count,
        last_error,
        reported_at
      FROM protocol_adapter_health_latest
      WHERE device_uuid = $1
      ORDER BY protocol_type, device_name`,
      [uuid]
    );

    res.json({
      // Primary: Protocol adapter devices (what users care about)
      devices: adapterResult.rows.map((row: any) => ({
        name: row.device_name,
        protocol: row.protocol_type,
        connected: row.connected,
        lastPoll: row.last_poll,
        errorCount: row.error_count,
        lastError: row.last_error,
        lastSeen: row.reported_at
      })),
      // Secondary: Sensor pipeline infrastructure
      pipelines: sensorResult.rows.map((row: any) => ({
        name: row.sensor_name,
        state: row.state,
        healthy: row.healthy,
        messagesReceived: row.messages_received,
        messagesPublished: row.messages_published,
        lastActivity: row.last_publish_time,
        lastError: row.last_error,
        lastSeen: row.reported_at
      })),
      summary: {
        totalDevices: adapterResult.rows.length,
        connectedDevices: adapterResult.rows.filter((r: any) => r.connected).length,
        pipelinesHealthy: sensorResult.rows.filter((r: any) => r.healthy).length,
        totalPipelines: sensorResult.rows.length
      }
    });
  } catch (error: any) {
    console.error('Error fetching sensor health:', error);
    res.status(500).json({
      error: 'Failed to fetch sensor health',
      message: error.message
    });
  }
});

/**
 * Get sensor health history for time-series charts
 * GET /api/v1/devices/:uuid/sensors/:sensorName/history
 * Query params: ?hours=24 (default)
 */
router.get('/devices/:uuid/sensors/:sensorName/history', async (req, res) => {
  try {
    const { uuid, sensorName } = req.params;
    const hours = parseInt(req.query.hours as string) || 24;

    const result = await query(
      `SELECT 
        sensor_name,
        connected,
        healthy,
        messages_received,
        messages_sent,
        bytes_received,
        bytes_sent,
        reconnect_attempts,
        last_error,
        timestamp
      FROM sensor_health_history
      WHERE device_uuid = $1 
        AND sensor_name = $2
        AND timestamp > NOW() - INTERVAL '1 hour' * $3
      ORDER BY timestamp DESC
      LIMIT 1000`,
      [uuid, sensorName, hours]
    );

    res.json({
      sensor_name: sensorName,
      device_uuid: uuid,
      hours,
      count: result.rows.length,
      history: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching sensor history:', error);
    res.status(500).json({
      error: 'Failed to fetch sensor history',
      message: error.message
    });
  }
});

/**
 * Get all unhealthy sensors across all devices (alert dashboard)
 * GET /api/v1/sensors/unhealthy
 */
router.get('/sensors/unhealthy', async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        s.device_uuid,
        d.device_name,
        s.sensor_name,
        s.state,
        s.healthy,
        s.last_error,
        s.last_error_time,
        s.last_connected_time,
        s.reconnect_attempts,
        s.reported_at as last_seen,
        EXTRACT(EPOCH FROM (NOW() - s.reported_at)) as seconds_since_report
      FROM sensor_health_latest s
      JOIN devices d ON d.uuid = s.device_uuid
      WHERE s.healthy = false 
         OR s.state != 'CONNECTED'
         OR s.reported_at < NOW() - INTERVAL '5 minutes'
      ORDER BY s.reported_at DESC`
    );

    res.json({
      count: result.rows.length,
      unhealthy_sensors: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching unhealthy sensors:', error);
    res.status(500).json({
      error: 'Failed to fetch unhealthy sensors',
      message: error.message
    });
  }
});

/**
 * Get device health overview (PRIMARY DASHBOARD VIEW)
 * Shows protocol adapter devices with their connection status
 * This is what users care about most - actual sensor device connectivity
 * GET /api/v1/devices/:uuid/device-health
 */
router.get('/devices/:uuid/device-health', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { protocolType } = req.query;

    let whereClause = 'device_uuid = $1';
    const params: any[] = [uuid];

    if (protocolType) {
      whereClause += ' AND protocol_type = $2';
      params.push(protocolType);
    }

    const result = await query(
      `SELECT 
        protocol_type,
        device_name,
        connected,
        last_poll,
        error_count,
        last_error,
        reported_at,
        CASE 
          WHEN connected = true THEN 'online'
          WHEN error_count > 0 THEN 'error'
          ELSE 'offline'
        END as status
      FROM protocol_adapter_health_latest
      WHERE ${whereClause}
      ORDER BY protocol_type, device_name`,
      params
    );

    const devices = result.rows.map((row: any) => ({
      name: row.device_name,
      protocol: row.protocol_type,
      status: row.status,
      connected: row.connected,
      lastPoll: row.last_poll,
      errorCount: row.error_count,
      lastError: row.last_error,
      lastSeen: row.reported_at
    }));

    const summary = {
      total: devices.length,
      online: devices.filter((d: any) => d.status === 'online').length,
      offline: devices.filter((d: any) => d.status === 'offline').length,
      errors: devices.filter((d: any) => d.status === 'error').length
    };

    res.json({
      deviceUuid: uuid,
      summary,
      devices
    });
  } catch (error: any) {
    console.error('Error fetching device health:', error);
    res.status(500).json({
      error: 'Failed to fetch device health',
      message: error.message
    });
  }
});

/**
 * List all protocol adapter devices for a device
 * GET /api/v1/devices/:uuid/protocol-adapters
 */
router.get('/devices/:uuid/protocol-adapters', async (req, res) => {
  try {
    const { uuid } = req.params;

    const result = await query(
      `SELECT 
        device_uuid,
        protocol_type,
        device_name,
        connected,
        last_poll,
        error_count,
        last_error,
        reported_at
      FROM protocol_adapter_health_latest
      WHERE device_uuid = $1
      ORDER BY protocol_type, device_name`,
      [uuid]
    );

    res.json({
      count: result.rows.length,
      protocol_adapters: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching protocol adapter health:', error);
    res.status(500).json({
      error: 'Failed to fetch protocol adapter health',
      message: error.message
    });
  }
});

/**
 * Get protocol adapter health history for time-series charts
 * GET /api/v1/devices/:uuid/protocol-adapters/:protocol/:deviceName/history
 * Query params: ?hours=24 (default)
 */
router.get('/devices/:uuid/protocol-adapters/:protocol/:deviceName/history', async (req, res) => {
  try {
    const { uuid, protocol, deviceName } = req.params;
    const hours = parseInt(req.query.hours as string) || 24;

    const result = await query(
      `SELECT 
        protocol_type,
        device_name,
        connected,
        last_poll,
        error_count,
        last_error,
        timestamp
      FROM protocol_adapter_health_history
      WHERE device_uuid = $1 
        AND protocol_type = $2
        AND device_name = $3
        AND timestamp > NOW() - INTERVAL '1 hour' * $4
      ORDER BY timestamp DESC
      LIMIT 1000`,
      [uuid, protocol, deviceName, hours]
    );

    res.json({
      device_uuid: uuid,
      protocol_type: protocol,
      device_name: deviceName,
      hours,
      count: result.rows.length,
      history: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching protocol adapter history:', error);
    res.status(500).json({
      error: 'Failed to fetch protocol adapter history',
      message: error.message
    });
  }
});

/**
 * Get sensor uptime statistics for a device
 * GET /api/v1/devices/:uuid/sensors/uptime
 * Query params: ?hours=24 (default)
 */
router.get('/devices/:uuid/sensors/uptime', async (req, res) => {
  try {
    const { uuid } = req.params;
    const hours = parseInt(req.query.hours as string) || 24;

    const result = await query(
      `SELECT 
        sensor_name,
        COUNT(*) as total_reports,
        SUM(CASE WHEN connected THEN 1 ELSE 0 END) as connected_reports,
        ROUND(100.0 * SUM(CASE WHEN connected THEN 1 ELSE 0 END) / COUNT(*), 2) as uptime_percentage,
        MAX(last_error) as last_error,
        MAX(last_error_time) as last_error_time,
        MAX(reconnect_attempts) as max_reconnects
      FROM sensor_health_history
      WHERE device_uuid = $1
        AND timestamp > NOW() - INTERVAL '1 hour' * $2
      GROUP BY sensor_name
      ORDER BY sensor_name`,
      [uuid, hours]
    );

    res.json({
      device_uuid: uuid,
      hours,
      sensors: result.rows
    });
  } catch (error: any) {
    console.error('Error calculating sensor uptime:', error);
    res.status(500).json({
      error: 'Failed to calculate sensor uptime',
      message: error.message
    });
  }
});

export default router;
