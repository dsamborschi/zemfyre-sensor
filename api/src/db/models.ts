/**
 * Database models for device management
 * PostgreSQL queries and data access layer
 */

import { query, transaction } from './connection';
import { PoolClient } from 'pg';

// Types
export interface Device {
  id: number;
  uuid: string;
  device_name?: string;
  device_type?: string;
  provisioning_state?: string;
  status?: string;
  is_online: boolean;
  is_active: boolean;
  last_connectivity_event?: Date;
  ip_address?: string;
  mac_address?: string;
  os_version?: string;
  supervisor_version?: string;
  memory_usage?: number;
  memory_total?: number;
  storage_usage?: number;
  storage_total?: number;
  cpu_usage?: number;
  cpu_temp?: number;
  // Security fields
  device_api_key_hash?: string;
  fleet_id?: string;
  provisioned_at?: Date;
  provisioned_by_key_id?: string;
  created_at: Date;
  modified_at: Date;
}

export interface DeviceTargetState {
  id: number;
  device_uuid: string;
  apps: any;
  config: any;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface DeviceCurrentState {
  id: number;
  device_uuid: string;
  apps: any;
  config: any;
  system_info: any;
  reported_at: Date;
}

export interface DeviceMetrics {
  device_uuid: string;
  cpu_usage?: number;
  cpu_temp?: number;
  memory_usage?: number;
  memory_total?: number;
  storage_usage?: number;
  storage_total?: number;
  recorded_at: Date;
}

/**
 * Device Model
 */
export class DeviceModel {
  /**
   * Get or create device by UUID
   */
  static async getOrCreate(uuid: string): Promise<Device> {
    const result = await query<Device>(
      `INSERT INTO devices (uuid, is_online, is_active)
       VALUES ($1, true, true)
       ON CONFLICT (uuid) DO UPDATE SET
         is_online = true,
         last_connectivity_event = CURRENT_TIMESTAMP
       RETURNING *`,
      [uuid]
    );
    return result.rows[0];
  }

  /**
   * Get device by UUID
   */
  static async getByUuid(uuid: string): Promise<Device | null> {
    const result = await query<Device>(
      'SELECT * FROM devices WHERE uuid = $1',
      [uuid]
    );
    return result.rows[0] || null;
  }

  /**
   * List all devices
   */
  static async list(filters: {
    isOnline?: boolean;
    isActive?: boolean;
  } = {}): Promise<Device[]> {
    let sql = 'SELECT * FROM devices WHERE 1=1';
    const params: any[] = [];

    if (filters.isOnline !== undefined) {
      params.push(filters.isOnline);
      sql += ` AND is_online = $${params.length}`;
    }

    if (filters.isActive !== undefined) {
      params.push(filters.isActive);
      sql += ` AND is_active = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query<Device>(sql, params);
    return result.rows;
  }

  /**
   * Update device info
   */
  static async update(uuid: string, data: Partial<Device>): Promise<Device> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'uuid' && key !== 'id') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    values.push(uuid);

    const result = await query<Device>(
      `UPDATE devices SET ${fields.join(', ')} WHERE uuid = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Mark device as offline
   */
  static async markOffline(uuid: string): Promise<void> {
    await query(
      'UPDATE devices SET is_online = false WHERE uuid = $1',
      [uuid]
    );
  }

  /**
   * Delete device
   */
  static async delete(uuid: string): Promise<void> {
    await query('DELETE FROM devices WHERE uuid = $1', [uuid]);
  }
}

/**
 * Device Target State Model
 */
export class DeviceTargetStateModel {
  /**
   * Get target state for device
   */
  static async get(deviceUuid: string): Promise<DeviceTargetState | null> {
    const result = await query<DeviceTargetState>(
      'SELECT * FROM device_target_state WHERE device_uuid = $1',
      [deviceUuid]
    );
    return result.rows[0] || null;
  }

  /**
   * Set target state for device
   */
  static async set(
    deviceUuid: string,
    apps: any,
    config: any = {}
  ): Promise<DeviceTargetState> {
    // Ensure device exists
    await DeviceModel.getOrCreate(deviceUuid);

    const result = await query<DeviceTargetState>(
      `INSERT INTO device_target_state (device_uuid, apps, config, version, updated_at)
       VALUES ($1, $2, $3, 1, CURRENT_TIMESTAMP)
       ON CONFLICT (device_uuid) DO UPDATE SET
         apps = $2,
         config = $3,
         version = device_target_state.version + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [deviceUuid, JSON.stringify(apps), JSON.stringify(config)]
    );

    return result.rows[0];
  }

  /**
   * Clear target state
   */
  static async clear(deviceUuid: string): Promise<void> {
    await query(
      `UPDATE device_target_state SET apps = '{}', config = '{}', updated_at = CURRENT_TIMESTAMP
       WHERE device_uuid = $1`,
      [deviceUuid]
    );
  }

  /**
   * Generate ETag for target state
   */
  static generateETag(state: DeviceTargetState): string {
    const data = {
      apps: state.apps,
      version: state.version,
      updated_at: state.updated_at
    };
    return Buffer.from(JSON.stringify(data)).toString('base64').substring(0, 32);
  }
}

/**
 * Device Current State Model
 */
export class DeviceCurrentStateModel {
  /**
   * Get current state for device
   */
  static async get(deviceUuid: string): Promise<DeviceCurrentState | null> {
    const result = await query<DeviceCurrentState>(
      'SELECT * FROM device_current_state WHERE device_uuid = $1',
      [deviceUuid]
    );
    return result.rows[0] || null;
  }

  /**
   * Update current state
   */
  static async update(
    deviceUuid: string,
    apps: any,
    config: any = {},
    systemInfo: any = {}
  ): Promise<DeviceCurrentState> {
    // Ensure device exists
    await DeviceModel.getOrCreate(deviceUuid);

    const result = await query<DeviceCurrentState>(
      `INSERT INTO device_current_state (device_uuid, apps, config, system_info, reported_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (device_uuid) DO UPDATE SET
         apps = $2,
         config = $3,
         system_info = $4,
         reported_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [deviceUuid, JSON.stringify(apps), JSON.stringify(config), JSON.stringify(systemInfo)]
    );

    return result.rows[0];
  }
}

/**
 * Device Metrics Model
 */
export class DeviceMetricsModel {
  /**
   * Record device metrics
   */
  static async record(deviceUuid: string, metrics: Partial<DeviceMetrics>): Promise<void> {
    await query(
      `INSERT INTO device_metrics (
        device_uuid, cpu_usage, cpu_temp, memory_usage, memory_total,
        storage_usage, storage_total, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        deviceUuid,
        metrics.cpu_usage,
        metrics.cpu_temp,
        metrics.memory_usage,
        metrics.memory_total,
        metrics.storage_usage,
        metrics.storage_total,
      ]
    );

    // Also update device table with latest metrics
    await DeviceModel.update(deviceUuid, {
      cpu_usage: metrics.cpu_usage,
      cpu_temp: metrics.cpu_temp,
      memory_usage: metrics.memory_usage,
      memory_total: metrics.memory_total,
      storage_usage: metrics.storage_usage,
      storage_total: metrics.storage_total,
    } as Partial<Device>);
  }

  /**
   * Get recent metrics for device
   */
  static async getRecent(deviceUuid: string, limit: number = 100): Promise<DeviceMetrics[]> {
    const result = await query<DeviceMetrics>(
      `SELECT * FROM device_metrics 
       WHERE device_uuid = $1 
       ORDER BY recorded_at DESC 
       LIMIT $2`,
      [deviceUuid, limit]
    );
    return result.rows;
  }

  /**
   * Clean old metrics (keep last 30 days)
   */
  static async cleanup(daysToKeep: number = 30): Promise<number> {
    const result = await query(
      `DELETE FROM device_metrics 
       WHERE recorded_at < NOW() - INTERVAL '${daysToKeep} days'`
    );
    return result.rowCount || 0;
  }
}

/**
 * Device Logs Model
 */
export class DeviceLogsModel {
  /**
   * Store device logs
   */
  static async store(
    deviceUuid: string,
    logs: Array<{
      serviceName?: string;
      timestamp?: Date;
      message: string;
      isSystem?: boolean;
      isStderr?: boolean;
    }>
  ): Promise<void> {
    if (logs.length === 0) return;

    const values: any[] = [];
    const placeholders: string[] = [];

    logs.forEach((log, index) => {
      const offset = index * 6;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
      );
      values.push(
        deviceUuid,
        log.serviceName || null,
        log.timestamp || new Date(),
        log.message,
        log.isSystem || false,
        log.isStderr || false
      );
    });

    await query(
      `INSERT INTO device_logs (device_uuid, service_name, timestamp, message, is_system, is_stderr)
       VALUES ${placeholders.join(', ')}`,
      values
    );
  }

  /**
   * Get logs for device
   */
  static async get(
    deviceUuid: string,
    options: {
      serviceName?: string;
      limit?: number;
      offset?: number;
      since?: Date;
    } = {}
  ): Promise<any[]> {
    let sql = 'SELECT * FROM device_logs WHERE device_uuid = $1';
    const params: any[] = [deviceUuid];
    let paramIndex = 2;

    if (options.serviceName) {
      sql += ` AND service_name = $${paramIndex}`;
      params.push(options.serviceName);
      paramIndex++;
    }

    if (options.since) {
      sql += ` AND timestamp >= $${paramIndex}`;
      params.push(options.since);
      paramIndex++;
    }

    sql += ' ORDER BY timestamp DESC';

    if (options.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options.offset) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Clean old logs (keep last 7 days)
   */
  static async cleanup(daysToKeep: number = 7): Promise<number> {
    const result = await query(
      `DELETE FROM device_logs 
       WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'`
    );
    return result.rowCount || 0;
  }
}

export default {
  DeviceModel,
  DeviceTargetStateModel,
  DeviceCurrentStateModel,
  DeviceMetricsModel,
  DeviceLogsModel,
};
