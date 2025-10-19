/**
 * Digital Twin API Routes
 * 
 * Endpoints for querying and managing device digital twins.
 * Digital twins provide a real-time virtual representation of physical devices,
 * including system metrics, health status, connectivity, and sensor readings.
 */

import express from 'express';
import { query } from '../db/connection';
import {
  logAuditEvent,
  AuditEventType,
  AuditSeverity
} from '../utils/audit-logger';

export const router = express.Router();

// ============================================================================
// Digital Twin Query Endpoints
// ============================================================================

/**
 * Get digital twin state for a specific device
 * GET /api/v1/devices/:uuid/twin
 * 
 * Returns the complete digital twin state including:
 * - Device identity (UUID, model, firmware)
 * - System metrics (CPU, memory, disk, temperature)
 * - Health status (uptime, errors)
 * - Connectivity status (MQTT, cloud)
 * - Sensor readings (if available)
 */
router.get('/devices/:uuid/twin', async (req, res) => {
  try {
    const { uuid } = req.params;

    // Get device shadow containing digital twin state
    const result = await query(
      `SELECT 
        device_uuid,
        shadow_name,
        reported_state,
        desired_state,
        version,
        updated_at
       FROM device_shadows
       WHERE device_uuid = $1 AND shadow_name = 'device-state'`,
      [uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Digital twin not found',
        message: `No digital twin found for device ${uuid}`
      });
    }

    const shadow = result.rows[0];
    const twin = shadow.reported_state || {};

    // Enhance with metadata
    const response = {
      deviceUuid: shadow.device_uuid,
      shadowName: shadow.shadow_name,
      version: shadow.version,
      lastUpdated: shadow.updated_at,
      
      // Digital twin state components
      identity: twin.identity || null,
      system: twin.system || null,
      health: twin.health || null,
      connectivity: twin.connectivity || null,
      readings: twin.readings || null,
      
      // Legacy fields (if present)
      sensors: twin.sensors || null,
      metrics: twin.metrics || null,
    };

    res.json(response);

    // Log audit event
    await logAuditEvent({
      eventType: AuditEventType.DEVICE_TWIN_ACCESSED,
      severity: AuditSeverity.INFO,
      deviceUuid: uuid,
      details: {
        message: `Digital twin accessed for device ${uuid}`,
        endpoint: '/devices/:uuid/twin',
        method: 'GET'
      }
    });

  } catch (error: any) {
    console.error('Error fetching digital twin:', error);
    res.status(500).json({
      error: 'Failed to fetch digital twin',
      message: error.message
    });
  }
});

/**
 * Get all digital twins across the fleet
 * GET /api/v1/fleet/twins
 * 
 * Query parameters:
 * - health: Filter by health status (healthy, degraded, critical)
 * - online: Filter by connectivity (true/false)
 * - limit: Maximum number of results (default: 50)
 * - offset: Pagination offset (default: 0)
 */
router.get('/fleet/twins', async (req, res) => {
  try {
    const health = req.query.health as string | undefined;
    const online = req.query.online === 'true' ? true : 
                   req.query.online === 'false' ? false : 
                   undefined;
    const limit = parseInt(req.query.limit as string || '50', 10);
    const offset = parseInt(req.query.offset as string || '0', 10);

    // Build query with filters
    let sqlQuery = `
      SELECT 
        device_uuid,
        shadow_name,
        reported_state,
        version,
        updated_at
      FROM device_shadows
      WHERE shadow_name = 'device-state'
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Apply health filter
    if (health) {
      sqlQuery += ` AND reported_state->'health'->>'status' = $${paramIndex}`;
      params.push(health);
      paramIndex++;
    }

    // Apply connectivity filter
    if (online !== undefined) {
      sqlQuery += ` AND reported_state->'connectivity'->>'mqttConnected' = $${paramIndex}`;
      params.push(online.toString());
      paramIndex++;
    }

    // Add ordering and pagination
    sqlQuery += ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sqlQuery, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM device_shadows
      WHERE shadow_name = 'device-state'
    `;
    
    const countParams: any[] = [];
    let countParamIndex = 1;
    
    if (health) {
      countQuery += ` AND reported_state->'health'->>'status' = $${countParamIndex}`;
      countParams.push(health);
      countParamIndex++;
    }
    
    if (online !== undefined) {
      countQuery += ` AND reported_state->'connectivity'->>'mqttConnected' = $${countParamIndex}`;
      countParams.push(online.toString());
    }

    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    // Transform results
    const twins = result.rows.map(row => {
      const twin = row.reported_state || {};
      return {
        deviceUuid: row.device_uuid,
        version: row.version,
        lastUpdated: row.updated_at,
        
        // Summary fields for fleet view
        identity: {
          model: twin.identity?.model,
          firmwareVersion: twin.identity?.firmwareVersion
        },
        system: {
          cpuUsage: twin.system?.cpuUsage,
          memoryUsage: twin.system?.memoryUsage,
          memoryTotal: twin.system?.memoryTotal,
          diskUsage: twin.system?.diskUsage,
          diskTotal: twin.system?.diskTotal,
          temperature: twin.system?.temperature
        },
        health: {
          status: twin.health?.status,
          uptime: twin.health?.uptime,
          errorCount: twin.health?.errors?.length || 0
        },
        connectivity: {
          mqttConnected: twin.connectivity?.mqttConnected,
          cloudConnected: twin.connectivity?.cloudConnected,
          lastHeartbeat: twin.connectivity?.lastHeartbeat
        }
      };
    });

    res.json({
      total,
      limit,
      offset,
      count: twins.length,
      twins
    });

    // Log audit event
    await logAuditEvent({
      eventType: AuditEventType.FLEET_TWIN_ACCESSED,
      severity: AuditSeverity.INFO,
      details: {
        message: 'Fleet digital twins accessed',
        endpoint: '/fleet/twins',
        method: 'GET',
        filters: { health, online },
        resultCount: twins.length
      }
    });

  } catch (error: any) {
    console.error('Error fetching fleet twins:', error);
    res.status(500).json({
      error: 'Failed to fetch fleet twins',
      message: error.message
    });
  }
});

/**
 * Get fleet health summary
 * GET /api/v1/fleet/health
 * 
 * Returns aggregated health statistics across all devices
 */
router.get('/fleet/health', async (req, res) => {
  try {
    // Get all device twins
    const result = await query(
      `SELECT 
        reported_state
       FROM device_shadows
       WHERE shadow_name = 'device-state'`,
      []
    );

    // Aggregate health statistics
    let healthy = 0;
    let degraded = 0;
    let critical = 0;
    let offline = 0;
    let totalCpu = 0;
    let totalMemory = 0;
    let totalMemoryCapacity = 0;
    let totalDisk = 0;
    let totalDiskCapacity = 0;
    let deviceCount = 0;
    let mqttConnected = 0;
    let cloudConnected = 0;

    result.rows.forEach(row => {
      const twin = row.reported_state || {};
      deviceCount++;

      // Health status
      const status = twin.health?.status;
      if (status === 'healthy') healthy++;
      else if (status === 'degraded') degraded++;
      else if (status === 'critical') critical++;

      // Connectivity
      if (twin.connectivity?.mqttConnected) mqttConnected++;
      if (twin.connectivity?.cloudConnected) cloudConnected++;
      
      // Check if offline (no heartbeat in last 5 minutes)
      const lastHeartbeat = twin.connectivity?.lastHeartbeat;
      if (lastHeartbeat) {
        const heartbeatAge = Date.now() - new Date(lastHeartbeat).getTime();
        if (heartbeatAge > 5 * 60 * 1000) offline++;
      } else {
        offline++;
      }

      // System metrics
      if (twin.system) {
        totalCpu += twin.system.cpuUsage || 0;
        totalMemory += twin.system.memoryUsage || 0;
        totalMemoryCapacity += twin.system.memoryTotal || 0;
        totalDisk += twin.system.diskUsage || 0;
        totalDiskCapacity += twin.system.diskTotal || 0;
      }
    });

    // Calculate averages
    const avgCpu = deviceCount > 0 ? Math.round((totalCpu / deviceCount) * 10) / 10 : 0;
    const avgMemoryUsage = deviceCount > 0 ? Math.round((totalMemory / totalMemoryCapacity) * 100 * 10) / 10 : 0;
    const avgDiskUsage = deviceCount > 0 ? Math.round((totalDisk / totalDiskCapacity) * 100 * 10) / 10 : 0;

    const summary = {
      totalDevices: deviceCount,
      health: {
        healthy,
        degraded,
        critical,
        healthyPercentage: deviceCount > 0 ? Math.round((healthy / deviceCount) * 100) : 0
      },
      connectivity: {
        online: deviceCount - offline,
        offline,
        mqttConnected,
        cloudConnected,
        onlinePercentage: deviceCount > 0 ? Math.round(((deviceCount - offline) / deviceCount) * 100) : 0
      },
      systemMetrics: {
        averageCpuUsage: avgCpu,
        averageMemoryUsage: avgMemoryUsage,
        averageDiskUsage: avgDiskUsage,
        totalMemory: totalMemoryCapacity,
        totalDisk: totalDiskCapacity
      },
      timestamp: new Date().toISOString()
    };

    res.json(summary);

    // Log audit event
    await logAuditEvent({
      eventType: AuditEventType.FLEET_HEALTH_ACCESSED,
      severity: AuditSeverity.INFO,
      details: {
        message: 'Fleet health summary accessed',
        endpoint: '/fleet/health',
        method: 'GET',
        totalDevices: deviceCount
      }
    });

  } catch (error: any) {
    console.error('Error calculating fleet health:', error);
    res.status(500).json({
      error: 'Failed to calculate fleet health',
      message: error.message
    });
  }
});

/**
 * Get digital twin history for a device
 * GET /api/v1/devices/:uuid/twin/history
 * 
 * Query parameters:
 * - from: Start timestamp (ISO 8601, default: 7 days ago)
 * - to: End timestamp (ISO 8601, default: now)
 * - limit: Maximum number of results (default: 100, max: 1000)
 * - field: Specific field to track (e.g., 'system.cpuUsage', 'health.status')
 */
router.get('/devices/:uuid/twin/history', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { 
      from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
      to = new Date().toISOString(), 
      limit = 100,
      field
    } = req.query;

    // Validate limit
    const limitNum = Math.min(parseInt(limit as string) || 100, 1000);

    // Base query
    const queryText = `
      SELECT 
        id,
        device_uuid,
        shadow_name,
        reported_state,
        version,
        timestamp
      FROM device_shadow_history
      WHERE device_uuid = $1
        AND shadow_name = 'device-state'
        AND timestamp >= $2
        AND timestamp <= $3
      ORDER BY timestamp DESC
      LIMIT $4
    `;

    const result = await query(queryText, [uuid, from, to, limitNum]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'No history found',
        message: `No shadow history found for device ${uuid} in the specified time range`
      });
    }

    // If field parameter is provided, extract time-series for that specific field
    if (field) {
      const fieldPath = (field as string).split('.');
      const timeSeries = result.rows.map(row => {
        let value = row.reported_state;
        for (const key of fieldPath) {
          value = value?.[key];
          if (value === undefined) break;
        }
        return {
          timestamp: row.timestamp,
          value,
          version: row.version
        };
      });

      // Calculate statistics
      const values = timeSeries
        .filter(point => typeof point.value === 'number')
        .map(point => point.value);
      
      const stats = values.length > 0 ? {
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        average: values.reduce((a, b) => a + b, 0) / values.length,
        latest: values[0]
      } : null;

      return res.json({
        deviceUuid: uuid,
        field: field as string,
        timeRange: { from, to },
        count: timeSeries.length,
        statistics: stats,
        data: timeSeries
      });
    }

    // Return complete shadow snapshots
    const history = result.rows.map(row => ({
      timestamp: row.timestamp,
      version: row.version,
      state: row.reported_state
    }));

    res.json({
      deviceUuid: uuid,
      timeRange: { from, to },
      count: history.length,
      limit: limitNum,
      history
    });

    // Log audit event
    await logAuditEvent({
      eventType: AuditEventType.DEVICE_TWIN_HISTORY_ACCESSED,
      severity: AuditSeverity.INFO,
      deviceUuid: uuid,
      details: {
        message: `Digital twin history accessed for device ${uuid}`,
        endpoint: '/devices/:uuid/twin/history',
        method: 'GET',
        timeRange: { from, to },
        resultCount: history.length,
        field: field || null
      }
    });

  } catch (error: any) {
    console.error('Error fetching twin history:', error);
    res.status(500).json({
      error: 'Failed to fetch twin history',
      message: error.message
    });
  }
});

/**
 * Detect anomalies in device twin metrics
 * GET /api/v1/devices/:uuid/twin/anomalies
 * 
 * Query parameters:
 * - field: Field to analyze (e.g., 'system.cpuUsage', 'system.memoryUsagePercent')
 * - from: Start timestamp (ISO 8601, default: 7 days ago)
 * - to: End timestamp (ISO 8601, default: now)
 * - threshold: Z-score threshold for anomaly detection (default: 2.5)
 * 
 * Uses statistical analysis (Z-score) to detect outliers in time-series data
 */
router.get('/devices/:uuid/twin/anomalies', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { 
      field = 'system.cpuUsage',
      from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      to = new Date().toISOString(),
      threshold = 2.5
    } = req.query;

    const thresholdNum = parseFloat(threshold as string);

    // Fetch historical data for the specified field
    const queryText = `
      SELECT 
        timestamp,
        reported_state,
        version
      FROM device_shadow_history
      WHERE device_uuid = $1
        AND shadow_name = 'device-state'
        AND timestamp >= $2
        AND timestamp <= $3
      ORDER BY timestamp ASC
    `;

    const result = await query(queryText, [uuid, from, to]);

    if (result.rows.length < 10) {
      return res.status(400).json({
        error: 'Insufficient data',
        message: 'Need at least 10 data points for anomaly detection',
        hint: 'Try expanding the time range'
      });
    }

    // Extract time-series for the specified field
    const fieldPath = (field as string).split('.');
    const timeSeries = result.rows.map(row => {
      let value = row.reported_state;
      for (const key of fieldPath) {
        value = value?.[key];
        if (value === undefined) break;
      }
      return {
        timestamp: row.timestamp,
        value: typeof value === 'number' ? value : null,
        version: row.version
      };
    }).filter(point => point.value !== null);

    if (timeSeries.length < 10) {
      return res.status(400).json({
        error: 'Insufficient numeric data',
        message: `Field '${field}' does not contain enough numeric values`,
        hint: 'Verify the field path is correct and contains numeric data'
      });
    }

    // Calculate mean and standard deviation
    const values = timeSeries.map(point => point.value!);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Detect anomalies using Z-score method
    const anomalies = timeSeries
      .map(point => {
        const zScore = (point.value! - mean) / stdDev;
        const isAnomaly = Math.abs(zScore) > thresholdNum;
        return {
          timestamp: point.timestamp,
          value: point.value,
          zScore,
          isAnomaly,
          severity: isAnomaly 
            ? (Math.abs(zScore) > 3 ? 'critical' : 'warning')
            : 'normal'
        };
      })
      .filter(point => point.isAnomaly);

    // Categorize anomalies
    const anomalyStats = {
      total: anomalies.length,
      critical: anomalies.filter(a => a.severity === 'critical').length,
      warning: anomalies.filter(a => a.severity === 'warning').length,
      percentage: (anomalies.length / timeSeries.length * 100).toFixed(2)
    };

    res.json({
      deviceUuid: uuid,
      field: field as string,
      timeRange: { from, to },
      statistics: {
        dataPoints: timeSeries.length,
        mean,
        stdDev,
        min: Math.min(...values),
        max: Math.max(...values)
      },
      anomalyDetection: {
        threshold: thresholdNum,
        method: 'Z-score',
        detected: anomalyStats
      },
      anomalies: anomalies.map(a => ({
        timestamp: a.timestamp,
        value: a.value,
        zScore: parseFloat(a.zScore.toFixed(2)),
        severity: a.severity,
        deviation: parseFloat(((a.value! - mean) / mean * 100).toFixed(2)) + '%'
      }))
    });

    // Log audit event
    await logAuditEvent({
      eventType: AuditEventType.DEVICE_TWIN_ANOMALIES_ACCESSED,
      severity: anomalies.length > 0 ? AuditSeverity.WARNING : AuditSeverity.INFO,
      deviceUuid: uuid,
      details: {
        message: `Anomaly detection performed on device ${uuid}`,
        endpoint: '/devices/:uuid/twin/anomalies',
        method: 'GET',
        field: field as string,
        anomaliesDetected: anomalies.length,
        timeRange: { from, to }
      }
    });

  } catch (error: any) {
    console.error('Error detecting anomalies:', error);
    res.status(500).json({
      error: 'Failed to detect anomalies',
      message: error.message
    });
  }
});

/**
 * Get devices with critical health issues
 * GET /api/v1/fleet/alerts
 * 
 * Returns devices that require attention:
 * - Critical or degraded health status
 * - High CPU usage (>80%)
 * - High memory usage (>90%)
 * - High disk usage (>90%)
 * - Offline devices
 */
router.get('/fleet/alerts', async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        device_uuid,
        shadow_name,
        reported_state,
        updated_at
       FROM device_shadows
       WHERE shadow_name = 'device-state'`,
      []
    );

    const alerts: any[] = [];

    result.rows.forEach(row => {
      const twin = row.reported_state || {};
      const deviceAlerts: string[] = [];

      // Check health status
      const health = twin.health?.status;
      if (health === 'critical') {
        deviceAlerts.push('Critical health status');
      } else if (health === 'degraded') {
        deviceAlerts.push('Degraded health status');
      }

      // Check CPU usage
      const cpuUsage = twin.system?.cpuUsage;
      if (cpuUsage && cpuUsage > 80) {
        deviceAlerts.push(`High CPU usage: ${cpuUsage}%`);
      }

      // Check memory usage
      const memoryUsage = twin.system?.memoryUsage;
      const memoryTotal = twin.system?.memoryTotal;
      if (memoryUsage && memoryTotal) {
        const memoryPercent = (memoryUsage / memoryTotal) * 100;
        if (memoryPercent > 90) {
          deviceAlerts.push(`High memory usage: ${Math.round(memoryPercent)}%`);
        }
      }

      // Check disk usage
      const diskUsage = twin.system?.diskUsage;
      const diskTotal = twin.system?.diskTotal;
      if (diskUsage && diskTotal) {
        const diskPercent = (diskUsage / diskTotal) * 100;
        if (diskPercent > 90) {
          deviceAlerts.push(`High disk usage: ${Math.round(diskPercent)}%`);
        }
      }

      // Check connectivity
      const lastHeartbeat = twin.connectivity?.lastHeartbeat;
      if (lastHeartbeat) {
        const heartbeatAge = Date.now() - new Date(lastHeartbeat).getTime();
        if (heartbeatAge > 5 * 60 * 1000) {
          deviceAlerts.push(`Device offline (no heartbeat for ${Math.round(heartbeatAge / 60000)} minutes)`);
        }
      } else {
        deviceAlerts.push('Device offline (no heartbeat data)');
      }

      // Add to alerts if any issues found
      if (deviceAlerts.length > 0) {
        alerts.push({
          deviceUuid: row.device_uuid,
          model: twin.identity?.model,
          alerts: deviceAlerts,
          health: twin.health,
          system: twin.system,
          connectivity: twin.connectivity,
          lastUpdated: row.updated_at
        });
      }
    });

    // Sort by number of alerts (most critical first)
    alerts.sort((a, b) => b.alerts.length - a.alerts.length);

    res.json({
      total: alerts.length,
      alerts
    });

    // Log audit event
    await logAuditEvent({
      eventType: AuditEventType.FLEET_ALERTS_ACCESSED,
      severity: AuditSeverity.WARNING,
      details: {
        message: 'Fleet alerts accessed',
        endpoint: '/fleet/alerts',
        method: 'GET',
        alertCount: alerts.length
      }
    });

  } catch (error: any) {
    console.error('Error fetching fleet alerts:', error);
    res.status(500).json({
      error: 'Failed to fetch fleet alerts',
      message: error.message
    });
  }
});

export default router;
