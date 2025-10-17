/**
 * Rollback Manager Service
 * 
 * Handles automatic rollback of failed image updates.
 * Monitors health check results and triggers rollback when:
 * - Individual device health check fails
 * - Batch failure rate exceeds threshold
 * - Manual rollback requested
 */

import { Pool } from 'pg';
import { EventPublisher } from './event-sourcing';
import { imageUpdateConfig } from '../config/image-updates';

export interface RollbackResult {
  success: boolean;
  devicesRolledBack: number;
  devicesFailed: number;
  message: string;
}

export class RollbackManager {
  constructor(
    private pool: Pool,
    private eventPublisher: EventPublisher
  ) {}

  /**
   * Rollback a single device to previous image version
   */
  async rollbackDevice(
    deviceUuid: string,
    rolloutId: string,
    reason: string
  ): Promise<boolean> {
    console.log(`[RollbackManager] Rolling back device ${deviceUuid}: ${reason}`);

    try {
      // Get rollout and device info
      const query = await this.pool.query(
        `SELECT 
          ir.image_name,
          ir.old_tag,
          drs.new_image_tag,
          drs.old_image_tag
         FROM image_rollouts ir
         JOIN device_rollout_status drs ON ir.rollout_id = drs.rollout_id
         WHERE ir.rollout_id = $1 AND drs.device_uuid = $2`,
        [rolloutId, deviceUuid]
      );

      if (query.rows.length === 0) {
        console.error(`[RollbackManager] Device ${deviceUuid} not found in rollout ${rolloutId}`);
        return false;
      }

      const { image_name, old_tag } = query.rows[0];

      // Update device target state back to old version
      await this.updateDeviceTargetState(deviceUuid, image_name, old_tag);

      // Update device rollout status
      await this.pool.query(
        `UPDATE device_rollout_status
         SET status = 'rolled_back',
             rolled_back_at = NOW(),
             error_message = $1,
             updated_at = NOW()
         WHERE device_uuid = $2 AND rollout_id = $3`,
        [reason, deviceUuid, rolloutId]
      );

      // Log event
      await this.logRollbackEvent(rolloutId, deviceUuid, 'device_rolled_back', {
        reason,
        old_tag,
        image_name,
      });

      // Publish event
      await this.eventPublisher.publish(
        'image.device_rolled_back',
        'device',
        deviceUuid,
        {
          rollout_id: rolloutId,
          image_name,
          rolled_back_to: old_tag,
          reason,
        }
      );

      console.log(`[RollbackManager] Device ${deviceUuid} rolled back to ${image_name}:${old_tag}`);
      return true;

    } catch (error) {
      console.error(`[RollbackManager] Failed to rollback device ${deviceUuid}:`, error);
      return false;
    }
  }

  /**
   * Rollback all devices in a rollout
   */
  async rollbackAll(rolloutId: string, reason: string): Promise<RollbackResult> {
    console.log(`[RollbackManager] Rolling back all devices in rollout ${rolloutId}: ${reason}`);

    // Get all devices in rollout that need rollback
    const devicesQuery = await this.pool.query(
      `SELECT device_uuid
       FROM device_rollout_status
       WHERE rollout_id = $1
         AND status IN ('updated', 'healthy', 'unhealthy', 'failed')`,
      [rolloutId]
    );

    const devices = devicesQuery.rows;
    let rolledBack = 0;
    let failed = 0;

    // Rollback devices in parallel (with concurrency limit)
    const concurrency = 10;
    for (let i = 0; i < devices.length; i += concurrency) {
      const batch = devices.slice(i, i + concurrency);
      const promises = batch.map(device =>
        this.rollbackDevice(device.device_uuid, rolloutId, reason)
      );

      const results = await Promise.allSettled(promises);
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          rolledBack++;
        } else {
          failed++;
        }
      }
    }

    // Update rollout status
    await this.pool.query(
      `UPDATE image_rollouts
       SET status = 'rolled_back',
           rolled_back_devices = $1,
           updated_at = NOW()
       WHERE rollout_id = $2`,
      [rolledBack, rolloutId]
    );

    // Log event
    await this.logRollbackEvent(rolloutId, null, 'rollout_rolled_back', {
      reason,
      devices_rolled_back: rolledBack,
      devices_failed: failed,
    });

    // Publish event
    await this.eventPublisher.publish(
      'image.rollout_rolled_back',
      'rollout',
      rolloutId,
      {
        reason,
        devices_rolled_back: rolledBack,
        devices_failed: failed,
      }
    );

    console.log(`[RollbackManager] Rollback complete: ${rolledBack} rolled back, ${failed} failed`);

    return {
      success: failed === 0,
      devicesRolledBack: rolledBack,
      devicesFailed: failed,
      message: `Rolled back ${rolledBack}/${devices.length} devices`,
    };
  }

  /**
   * Rollback failed devices in a batch
   */
  async rollbackFailedInBatch(
    rolloutId: string,
    batchNumber: number
  ): Promise<RollbackResult> {
    console.log(`[RollbackManager] Rolling back failed devices in batch ${batchNumber}`);

    // Get failed/unhealthy devices in batch
    const devicesQuery = await this.pool.query(
      `SELECT device_uuid
       FROM device_rollout_status
       WHERE rollout_id = $1
         AND batch_number = $2
         AND status IN ('failed', 'unhealthy')`,
      [rolloutId, batchNumber]
    );

    const devices = devicesQuery.rows;
    
    if (devices.length === 0) {
      return {
        success: true,
        devicesRolledBack: 0,
        devicesFailed: 0,
        message: 'No failed devices to rollback',
      };
    }

    let rolledBack = 0;
    let failed = 0;

    for (const device of devices) {
      const success = await this.rollbackDevice(
        device.device_uuid,
        rolloutId,
        'Health check failed'
      );

      if (success) {
        rolledBack++;
      } else {
        failed++;
      }
    }

    console.log(`[RollbackManager] Batch rollback complete: ${rolledBack} rolled back, ${failed} failed`);

    return {
      success: failed === 0,
      devicesRolledBack: rolledBack,
      devicesFailed: failed,
      message: `Rolled back ${rolledBack}/${devices.length} failed devices`,
    };
  }

  /**
   * Check if rollout should be paused due to high failure rate
   */
  async checkAndPauseIfNeeded(rolloutId: string): Promise<boolean> {
    // Get rollout stats
    const statsQuery = await this.pool.query(
      `SELECT 
        total_devices,
        failed_devices,
        rolled_back_devices,
        failure_rate,
        status
       FROM image_rollouts
       WHERE rollout_id = $1`,
      [rolloutId]
    );

    if (statsQuery.rows.length === 0) {
      return false;
    }

    const rollout = statsQuery.rows[0];
    const failureRate = parseFloat(rollout.failure_rate) || 0;

    // Check if failure rate exceeds threshold
    if (failureRate > imageUpdateConfig.MAX_FAILURE_RATE) {
      console.warn(`[RollbackManager] Failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold ${(imageUpdateConfig.MAX_FAILURE_RATE * 100)}%`);

      // Pause rollout
      await this.pool.query(
        `UPDATE image_rollouts
         SET status = 'paused',
             updated_at = NOW()
         WHERE rollout_id = $1`,
        [rolloutId]
      );

      // Log event
      await this.logRollbackEvent(rolloutId, null, 'rollout_paused', {
        reason: 'High failure rate',
        failure_rate: failureRate,
        threshold: imageUpdateConfig.MAX_FAILURE_RATE,
      });

      // Publish event
      await this.eventPublisher.publish(
        'image.rollout_paused',
        'rollout',
        rolloutId,
        {
          reason: 'High failure rate',
          failure_rate: failureRate,
          threshold: imageUpdateConfig.MAX_FAILURE_RATE,
          failed_devices: rollout.failed_devices,
          total_devices: rollout.total_devices,
        }
      );

      console.log(`[RollbackManager] Rollout ${rolloutId} paused due to high failure rate`);
      return true;
    }

    return false;
  }

  /**
   * Auto-rollback unhealthy devices after health check
   */
  async autoRollbackUnhealthyDevices(rolloutId: string, batchNumber: number): Promise<void> {
    if (!imageUpdateConfig.AUTO_ROLLBACK) {
      console.log('[RollbackManager] Auto-rollback is disabled');
      return;
    }

    console.log(`[RollbackManager] Running auto-rollback for unhealthy devices in batch ${batchNumber}`);

    // Get unhealthy devices
    const devicesQuery = await this.pool.query(
      `SELECT device_uuid
       FROM device_rollout_status
       WHERE rollout_id = $1
         AND batch_number = $2
         AND status = 'unhealthy'`,
      [rolloutId, batchNumber]
    );

    const devices = devicesQuery.rows;

    if (devices.length === 0) {
      console.log('[RollbackManager] No unhealthy devices found');
      return;
    }

    console.log(`[RollbackManager] Found ${devices.length} unhealthy devices, rolling back...`);

    for (const device of devices) {
      await this.rollbackDevice(
        device.device_uuid,
        rolloutId,
        'Automatic rollback: health check failed'
      );
    }

    // Update rollout statistics
    await this.updateRolloutStats(rolloutId);

    // Check if rollout should be paused
    await this.checkAndPauseIfNeeded(rolloutId);
  }

  /**
   * Update device target state with old image tag (rollback)
   */
  private async updateDeviceTargetState(
    deviceUuid: string,
    imageName: string,
    oldTag: string
  ): Promise<void> {
    // Get current target state (apps is JSONB with nested structure)
    const currentStateQuery = await this.pool.query(
      'SELECT apps FROM device_target_state WHERE device_uuid = $1',
      [deviceUuid]
    );

    if (currentStateQuery.rows.length === 0) {
      console.warn(`[RollbackManager] No target state found for device: ${deviceUuid}`);
      return;
    }

    const apps = currentStateQuery.rows[0].apps || {};
    
    // Find and rollback all services with the matching image to old tag
    const imagePattern = `${imageName}:`;
    const updatedApps = { ...apps };
    
    // Iterate through apps and rollback matching services
    for (const appKey in updatedApps) {
      const app = updatedApps[appKey];
      if (app.services && Array.isArray(app.services)) {
        app.services = app.services.map((service: any) => {
          if (service.config?.image?.startsWith(imagePattern)) {
            return {
              ...service,
              config: {
                ...service.config,
                image: `${imageName}:${oldTag}`,
              },
              imageName: `${imageName}:${oldTag}`, // Update imageName too if present
            };
          }
          return service;
        });
      }
    }

    // Update database
    await this.pool.query(
      `UPDATE device_target_state 
       SET apps = $1, version = version + 1, updated_at = NOW()
       WHERE device_uuid = $2`,
      [JSON.stringify(updatedApps), deviceUuid]
    );

    console.log(`[RollbackManager] Updated target state for device ${deviceUuid}: ${imageName}:${oldTag}`);
  }

  /**
   * Update rollout statistics
   */
  private async updateRolloutStats(rolloutId: string): Promise<void> {
    const statsQuery = await this.pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'updated') as updated_devices,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_devices,
        COUNT(*) FILTER (WHERE status = 'healthy') as healthy_devices,
        COUNT(*) FILTER (WHERE status = 'rolled_back') as rolled_back_devices,
        COUNT(*) as total_devices
       FROM device_rollout_status
       WHERE rollout_id = $1`,
      [rolloutId]
    );

    const stats = statsQuery.rows[0];
    const totalProcessed = parseInt(stats.updated_devices || 0) +
                          parseInt(stats.failed_devices || 0) +
                          parseInt(stats.healthy_devices || 0) +
                          parseInt(stats.rolled_back_devices || 0);

    const failureRate = totalProcessed > 0
      ? (parseInt(stats.failed_devices || 0) + parseInt(stats.rolled_back_devices || 0)) / totalProcessed
      : 0;

    await this.pool.query(
      `UPDATE image_rollouts
       SET updated_devices = $1,
           failed_devices = $2,
           healthy_devices = $3,
           rolled_back_devices = $4,
           failure_rate = $5,
           updated_at = NOW()
       WHERE rollout_id = $6`,
      [
        stats.updated_devices,
        stats.failed_devices,
        stats.healthy_devices,
        stats.rolled_back_devices,
        failureRate,
        rolloutId,
      ]
    );
  }

  /**
   * Log rollback event
   */
  private async logRollbackEvent(
    rolloutId: string,
    deviceUuid: string | null,
    eventType: string,
    eventData: any
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO rollout_events (rollout_id, device_uuid, event_type, event_data)
       VALUES ($1, $2, $3, $4)`,
      [rolloutId, deviceUuid, eventType, JSON.stringify(eventData)]
    );
  }
}
