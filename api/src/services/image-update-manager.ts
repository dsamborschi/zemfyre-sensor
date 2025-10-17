/**
 * Image Update Manager
 * 
 * Core service for managing Docker image rollouts across device fleet.
 * Handles rollout creation, device selection, batch processing, and state updates.
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { imageUpdateConfig } from '../config/image-updates';
import { EventPublisher } from './event-sourcing';
import { HealthChecker, HealthCheckConfig } from './health-checker';
import { RollbackManager } from './rollback-manager';

export interface RolloutFilters {
  fleet_id?: string;
  device_tags?: string[];
  device_uuids?: string[];
}

export interface CreateRolloutOptions {
  imageName: string;
  oldTag: string;
  newTag: string;
  registry?: string;
  strategy?: 'auto' | 'staged' | 'manual' | 'scheduled';
  policyId?: number;
  filters?: RolloutFilters;
  webhookPayload?: any;
}

export interface RolloutDevice {
  device_uuid: string;
  device_name: string;
  current_image_tag: string;
}

export interface BatchInfo {
  batchNumber: number;
  deviceCount: number;
  deviceUuids: string[];
}

export class ImageUpdateManager {
  private healthChecker: HealthChecker;
  private rollbackManager: RollbackManager;

  constructor(
    private pool: Pool,
    private eventPublisher: EventPublisher
  ) {
    this.healthChecker = new HealthChecker(pool, eventPublisher);
    this.rollbackManager = new RollbackManager(pool, eventPublisher);
  }

  /**
   * Create a new rollout
   */
  async createRollout(options: CreateRolloutOptions): Promise<string> {
    const {
      imageName,
      oldTag,
      newTag,
      registry = 'docker.io',
      strategy = imageUpdateConfig.DEFAULT_STRATEGY,
      policyId,
      filters,
      webhookPayload,
    } = options;

    console.log(`[ImageUpdateManager] Creating rollout: ${imageName}:${oldTag} → ${newTag}`);

    // Find affected devices
    const affectedDevices = await this.findAffectedDevices(imageName, oldTag, filters);
    
    if (affectedDevices.length === 0) {
      console.log('[ImageUpdateManager] No devices found using this image');
      throw new Error('No devices found using this image');
    }

    console.log(`[ImageUpdateManager] Found ${affectedDevices.length} affected devices`);

    // Calculate batch sizes based on strategy
    const batchSizes = this.calculateBatchSizes(affectedDevices.length, strategy);

    // Create rollout record
    const rolloutId = uuidv4();
    
    const query = `
      INSERT INTO image_rollouts (
        rollout_id, image_name, old_tag, new_tag, registry,
        policy_id, strategy, total_devices, batch_sizes,
        status, current_batch, webhook_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      rolloutId,
      imageName,
      oldTag,
      newTag,
      registry,
      policyId,
      strategy,
      affectedDevices.length,
      JSON.stringify(batchSizes),
      'pending',
      0, // current_batch
      webhookPayload ? JSON.stringify(webhookPayload) : null,
    ]);

    // Create device rollout status records
    await this.createDeviceRolloutRecords(rolloutId, affectedDevices, batchSizes);

    // Publish event
    await this.eventPublisher.publish(
      'image.rollout_created',
      'rollout',
      rolloutId,
      {
        image_name: imageName,
        old_tag: oldTag,
        new_tag: newTag,
        strategy,
        total_devices: affectedDevices.length,
        batch_count: batchSizes.length,
      }
    );

    console.log(`[ImageUpdateManager] Rollout created: ${rolloutId}`);

    return rolloutId;
  }

  /**
   * Find devices currently using a specific image
   */
  async findAffectedDevices(
    imageName: string,
    currentTag: string,
    filters?: RolloutFilters
  ): Promise<RolloutDevice[]> {
    // Query to find devices with services using the specified image
    // The apps field is JSONB: {"appId": {"services": [{"config": {"image": "name:tag"}}]}}
    // Note: Some services use config.image, others use imageName field directly
    let query = `
      SELECT DISTINCT
        d.uuid as device_uuid,
        d.device_name,
        $2 as current_image_tag
      FROM devices d
      JOIN device_target_state ts ON d.uuid = ts.device_uuid,
      jsonb_each(ts.apps) as app(key, value),
      jsonb_array_elements(value->'services') as service
      WHERE (
        service->'config'->>'image' = $1 OR
        service->>'imageName' = $1
      )
        AND d.is_active = true
    `;

    // Construct full image string with tag
    const fullImageString = `${imageName}:${currentTag}`;
    const params: any[] = [fullImageString, currentTag];
    let paramIndex = 3;

    // Apply filters
    if (filters?.fleet_id) {
      query += ` AND d.fleet_id = $${paramIndex}`;
      params.push(filters.fleet_id);
      paramIndex++;
    }

    if (filters?.device_tags && filters.device_tags.length > 0) {
      query += ` AND d.device_tags && $${paramIndex}::text[]`;
      params.push(filters.device_tags);
      paramIndex++;
    }

    if (filters?.device_uuids && filters.device_uuids.length > 0) {
      query += ` AND d.uuid = ANY($${paramIndex}::uuid[])`;
      params.push(filters.device_uuids);
      paramIndex++;
    }

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Calculate batch sizes based on strategy
   */
  private calculateBatchSizes(totalDevices: number, strategy: string): number[] {
    if (strategy === 'auto') {
      // All devices in one batch
      return [totalDevices];
    }

    if (strategy === 'staged') {
      // Use configured batch percentages
      const batches = imageUpdateConfig.STAGED_BATCHES.map((percentage, index) => {
        if (index === 0) {
          // First batch: percentage of total
          return Math.max(1, Math.floor(totalDevices * percentage));
        } else {
          // Subsequent batches: percentage of remaining
          const previousTotal = imageUpdateConfig.STAGED_BATCHES
            .slice(0, index)
            .reduce((sum, p) => sum + Math.floor(totalDevices * p), 0);
          
          if (index === imageUpdateConfig.STAGED_BATCHES.length - 1) {
            // Last batch: all remaining devices
            return totalDevices - previousTotal;
          } else {
            return Math.max(1, Math.floor(totalDevices * percentage));
          }
        }
      });

      return batches.filter(b => b > 0);
    }

    // Manual/scheduled: all devices in one batch (to be triggered manually)
    return [totalDevices];
  }

  /**
   * Create device rollout status records and assign to batches
   */
  private async createDeviceRolloutRecords(
    rolloutId: string,
    devices: RolloutDevice[],
    batchSizes: number[]
  ): Promise<void> {
    const records: any[] = [];
    let deviceIndex = 0;

    // Assign devices to batches
    for (let batchNum = 0; batchNum < batchSizes.length; batchNum++) {
      const batchSize = batchSizes[batchNum];
      
      for (let i = 0; i < batchSize && deviceIndex < devices.length; i++) {
        const device = devices[deviceIndex];
        records.push({
          rollout_id: rolloutId,
          device_uuid: device.device_uuid,
          batch_number: batchNum + 1, // 1-indexed
          status: 'pending',
          old_image_tag: device.current_image_tag,
        });
        deviceIndex++;
      }
    }

    // Bulk insert
    if (records.length > 0) {
      const query = `
        INSERT INTO device_rollout_status (
          rollout_id, device_uuid, batch_number, status, old_image_tag
        ) VALUES ${records.map((_, i) => 
          `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
        ).join(', ')}
      `;

      const params = records.flatMap(r => [
        r.rollout_id,
        r.device_uuid,
        r.batch_number,
        r.status,
        r.old_image_tag,
      ]);

      await this.pool.query(query, params);
    }

    console.log(`[ImageUpdateManager] Created ${records.length} device rollout records`);
  }

  /**
   * Start a rollout (update target state for first batch)
   */
  async startRollout(rolloutId: string): Promise<void> {
    console.log(`[ImageUpdateManager] Starting rollout: ${rolloutId}`);

    // Get rollout info
    const rolloutQuery = await this.pool.query(
      'SELECT * FROM image_rollouts WHERE rollout_id = $1',
      [rolloutId]
    );

    if (rolloutQuery.rows.length === 0) {
      throw new Error(`Rollout not found: ${rolloutId}`);
    }

    const rollout = rolloutQuery.rows[0];

    // Update rollout status
    await this.pool.query(
      `UPDATE image_rollouts 
       SET status = 'in_progress', 
           current_batch = 1,
           started_at = NOW()
       WHERE rollout_id = $1`,
      [rolloutId]
    );

    // Process first batch
    await this.processNextBatch(rolloutId);

    // Publish event
    await this.eventPublisher.publish(
      'image.rollout_started',
      'rollout',
      rolloutId,
      {
        image_name: rollout.image_name,
        new_tag: rollout.new_tag,
        total_devices: rollout.total_devices,
      }
    );
  }

  /**
   * Process next batch in rollout
   */
  async processNextBatch(rolloutId: string): Promise<void> {
    console.log(`[ImageUpdateManager] Processing next batch for rollout: ${rolloutId}`);

    // Get rollout info
    const rolloutQuery = await this.pool.query(
      'SELECT * FROM image_rollouts WHERE rollout_id = $1',
      [rolloutId]
    );

    if (rolloutQuery.rows.length === 0) {
      throw new Error(`Rollout not found: ${rolloutId}`);
    }

    const rollout = rolloutQuery.rows[0];
    const currentBatch = rollout.current_batch;

    // Get devices in current batch
    const devicesQuery = await this.pool.query(
      `SELECT device_uuid, batch_number
       FROM device_rollout_status
       WHERE rollout_id = $1 AND batch_number = $2 AND status = 'pending'`,
      [rolloutId, currentBatch]
    );

    const devices = devicesQuery.rows;

    if (devices.length === 0) {
      console.log(`[ImageUpdateManager] No pending devices in batch ${currentBatch}`);
      return;
    }

    console.log(`[ImageUpdateManager] Updating ${devices.length} devices in batch ${currentBatch}`);

    // Update target state for each device
    for (const device of devices) {
      await this.updateDeviceTargetState(
        device.device_uuid,
        rollout.image_name,
        rollout.new_tag
      );

      // Update device status to scheduled
      await this.pool.query(
        `UPDATE device_rollout_status
         SET status = 'scheduled', scheduled_at = NOW()
         WHERE rollout_id = $1 AND device_uuid = $2`,
        [rolloutId, device.device_uuid]
      );

      // Log event
      await this.logRolloutEvent(
        rolloutId,
        device.device_uuid,
        'device_scheduled',
        { batch_number: currentBatch }
      );

      // Publish event
      await this.eventPublisher.publish(
        'image.device_scheduled',
        'device',
        device.device_uuid,
        {
          rollout_id: rolloutId,
          batch_number: currentBatch,
          image_name: rollout.image_name,
          new_tag: rollout.new_tag,
        }
      );
    }

    // Update rollout progress
    await this.updateRolloutProgress(rolloutId);
  }

  /**
   * Update device target state with new image tag
   */
  private async updateDeviceTargetState(
    deviceUuid: string,
    imageName: string,
    newTag: string
  ): Promise<void> {
    // Get current target state (apps is JSONB with nested structure)
    const currentStateQuery = await this.pool.query(
      'SELECT apps FROM device_target_state WHERE device_uuid = $1',
      [deviceUuid]
    );

    if (currentStateQuery.rows.length === 0) {
      console.warn(`[ImageUpdateManager] No target state found for device: ${deviceUuid}`);
      return;
    }

    const apps = currentStateQuery.rows[0].apps || {};
    
    // Find and update all services with the matching image
    const oldImagePattern = `${imageName}:`;
    const updatedApps = { ...apps };
    
    // Iterate through apps and update matching services
    // Note: Some services use config.image, others use imageName field
    for (const appKey in updatedApps) {
      const app = updatedApps[appKey];
      if (app.services && Array.isArray(app.services)) {
        app.services = app.services.map((service: any) => {
          // Check both config.image and imageName fields
          const hasConfigImage = service.config?.image?.startsWith(oldImagePattern);
          const hasImageName = service.imageName?.startsWith(oldImagePattern);
          
          if (hasConfigImage || hasImageName) {
            const newImage = `${imageName}:${newTag}`;
            return {
              ...service,
              // Update config.image if it exists
              ...(service.config?.image && {
                config: {
                  ...service.config,
                  image: newImage,
                }
              }),
              // Update imageName if it exists
              ...(service.imageName && {
                imageName: newImage
              })
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

    console.log(`[ImageUpdateManager] Updated target state for device ${deviceUuid}: ${imageName}:${newTag}`);
  }

  /**
   * Update rollout progress statistics
   */
  private async updateRolloutProgress(rolloutId: string): Promise<void> {
    const statsQuery = await this.pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'updated') as updated_devices,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_devices,
        COUNT(*) FILTER (WHERE status = 'healthy') as healthy_devices,
        COUNT(*) FILTER (WHERE status = 'rolled_back') as rolled_back_devices
       FROM device_rollout_status
       WHERE rollout_id = $1`,
      [rolloutId]
    );

    const stats = statsQuery.rows[0];
    const totalDevices = parseInt(stats.updated_devices || 0) +
                        parseInt(stats.failed_devices || 0) +
                        parseInt(stats.healthy_devices || 0) +
                        parseInt(stats.rolled_back_devices || 0);

    const failureRate = totalDevices > 0
      ? parseInt(stats.failed_devices || 0) / totalDevices
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
   * Log rollout event
   */
  private async logRolloutEvent(
    rolloutId: string,
    deviceUuid: string | null,
    eventType: string,
    eventData: any,
    message?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO rollout_events (rollout_id, device_uuid, event_type, event_data, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [rolloutId, deviceUuid, eventType, JSON.stringify(eventData), message]
    );
  }

  /**
   * Get rollout by ID
   */
  async getRollout(rolloutId: string): Promise<any> {
    const result = await this.pool.query(
      'SELECT * FROM image_rollouts WHERE rollout_id = $1',
      [rolloutId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get devices in rollout with their status
   */
  async getRolloutDevices(rolloutId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        drs.*,
        d.device_name
       FROM device_rollout_status drs
       JOIN devices d ON drs.device_uuid = d.uuid
       WHERE drs.rollout_id = $1
       ORDER BY drs.batch_number, d.device_name`,
      [rolloutId]
    );

    return result.rows;
  }

  /**
   * Run health checks for a batch and handle results
   */
  async checkBatchHealth(rolloutId: string, batchNumber: number): Promise<void> {
    console.log(`[ImageUpdateManager] Running health checks for batch ${batchNumber}`);

    // Get rollout info to get health check config
    const rolloutQuery = await this.pool.query(
      `SELECT ir.*, iup.health_check_config
       FROM image_rollouts ir
       LEFT JOIN image_update_policies iup ON ir.policy_id = iup.id
       WHERE ir.rollout_id = $1`,
      [rolloutId]
    );

    if (rolloutQuery.rows.length === 0) {
      console.error(`[ImageUpdateManager] Rollout not found: ${rolloutId}`);
      return;
    }

    const rollout = rolloutQuery.rows[0];
    const healthCheckConfig = HealthChecker.parseHealthCheckConfig(
      rollout.health_check_config
    );

    // Run health checks for batch
    const results = await this.healthChecker.checkBatchHealth(
      rolloutId,
      batchNumber,
      healthCheckConfig
    );

    console.log(`[ImageUpdateManager] Batch ${batchNumber} health check results: ${results.healthy}/${results.total} healthy`);

    // Auto-rollback unhealthy devices if enabled
    if (imageUpdateConfig.AUTO_ROLLBACK && results.unhealthy > 0) {
      await this.rollbackManager.autoRollbackUnhealthyDevices(rolloutId, batchNumber);
    }

    // Check if failure rate exceeds threshold
    await this.rollbackManager.checkAndPauseIfNeeded(rolloutId);

    // Publish batch completion event
    await this.eventPublisher.publish(
      'image.batch_completed',
      'rollout',
      rolloutId,
      {
        batch_number: batchNumber,
        total_devices: results.total,
        healthy_devices: results.healthy,
        unhealthy_devices: results.unhealthy,
      }
    );
  }

  /**
   * Pause a rollout
   */
  async pauseRollout(rolloutId: string, reason: string): Promise<void> {
    console.log(`[ImageUpdateManager] Pausing rollout ${rolloutId}: ${reason}`);

    await this.pool.query(
      `UPDATE image_rollouts
       SET status = 'paused',
           updated_at = NOW()
       WHERE rollout_id = $1`,
      [rolloutId]
    );

    await this.logRolloutEvent(rolloutId, null, 'rollout_paused', { reason });

    await this.eventPublisher.publish(
      'image.rollout_paused',
      'rollout',
      rolloutId,
      { reason }
    );
  }

  /**
   * Resume a paused rollout
   */
  async resumeRollout(rolloutId: string): Promise<void> {
    console.log(`[ImageUpdateManager] Resuming rollout ${rolloutId}`);

    await this.pool.query(
      `UPDATE image_rollouts
       SET status = 'in_progress',
           updated_at = NOW()
       WHERE rollout_id = $1`,
      [rolloutId]
    );

    await this.logRolloutEvent(rolloutId, null, 'rollout_resumed', {});

    await this.eventPublisher.publish(
      'image.rollout_resumed',
      'rollout',
      rolloutId,
      {}
    );
  }

  /**
   * Cancel a rollout
   */
  async cancelRollout(rolloutId: string, reason: string): Promise<void> {
    console.log(`[ImageUpdateManager] Canceling rollout ${rolloutId}: ${reason}`);

    await this.pool.query(
      `UPDATE image_rollouts
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE rollout_id = $1`,
      [rolloutId]
    );

    await this.logRolloutEvent(rolloutId, null, 'rollout_cancelled', { reason });

    await this.eventPublisher.publish(
      'image.rollout_cancelled',
      'rollout',
      rolloutId,
      { reason }
    );
  }

  /**
   * Complete a rollout
   */
  async completeRollout(rolloutId: string): Promise<void> {
    console.log(`[ImageUpdateManager] Completing rollout ${rolloutId}`);

    await this.pool.query(
      `UPDATE image_rollouts
       SET status = 'completed',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE rollout_id = $1`,
      [rolloutId]
    );

    await this.logRolloutEvent(rolloutId, null, 'rollout_completed', {});

    await this.eventPublisher.publish(
      'image.rollout_completed',
      'rollout',
      rolloutId,
      {}
    );
  }

  /**
   * Get health checker instance
   */
  getHealthChecker(): HealthChecker {
    return this.healthChecker;
  }

  /**
   * Get rollback manager instance
   */
  getRollbackManager(): RollbackManager {
    return this.rollbackManager;
  }
}
