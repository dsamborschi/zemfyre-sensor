/**
 * Rollout Monitor Job
 * 
 * Background job that processes active rollouts:
 * - Checks if devices have updated
 * - Runs health checks after batch completion
 * - Advances to next batch when ready
 * - Handles scheduled rollouts
 * - Monitors failure rates
 */

import { Pool } from 'pg';
import { EventPublisher } from '../services/event-sourcing';
import { ImageUpdateManager } from '../services/image-update-manager';
import { imageUpdateConfig } from '../config/image-updates';

export class RolloutMonitor {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private pool: Pool,
    private checkIntervalSeconds: number = 30
  ) {}

  /**
   * Start the rollout monitor
   */
  start(): void {
    if (this.isRunning) {
      console.log('[RolloutMonitor] Already running');
      return;
    }

    console.log(`[RolloutMonitor] Starting monitor (check interval: ${this.checkIntervalSeconds}s)`);
    this.isRunning = true;

    // Run immediately
    this.runCheck();

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.runCheck();
    }, this.checkIntervalSeconds * 1000);
  }

  /**
   * Stop the rollout monitor
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[RolloutMonitor] Stopping monitor');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Run a single check cycle
   */
  private async runCheck(): Promise<void> {
    try {
      // Get active rollouts
      const rolloutsQuery = await this.pool.query(`
        SELECT * FROM image_rollouts
        WHERE status IN ('in_progress', 'pending')
        ORDER BY created_at ASC
      `);

      const rollouts = rolloutsQuery.rows;

      if (rollouts.length === 0) {
        // No active rollouts
        return;
      }

      console.log(`[RolloutMonitor] Processing ${rollouts.length} active rollouts`);

      for (const rollout of rollouts) {
        await this.processRollout(rollout);
      }

    } catch (error) {
      console.error('[RolloutMonitor] Error in check cycle:', error);
    }
  }

  /**
   * Process a single rollout
   */
  private async processRollout(rollout: any): Promise<void> {
    const rolloutId = rollout.rollout_id;
    console.log(`[RolloutMonitor] Processing rollout ${rolloutId} (${rollout.image_name}:${rollout.new_tag})`);

    const eventPublisher = new EventPublisher('rollout-monitor');
    const imageUpdateManager = new ImageUpdateManager(this.pool, eventPublisher);

    try {
      // Check if all devices in current batch have been updated
      const batchStatus = await this.checkBatchStatus(rolloutId, rollout.current_batch);

      console.log(`[RolloutMonitor] Batch ${rollout.current_batch} status:`, batchStatus);

      // If batch is complete, run health checks
      if (batchStatus.allUpdated && !batchStatus.healthChecked) {
        console.log(`[RolloutMonitor] Running health checks for batch ${rollout.current_batch}`);
        await imageUpdateManager.checkBatchHealth(rolloutId, rollout.current_batch);
      }

      // Check if ready to advance to next batch
      if (await this.canAdvanceToNextBatch(rolloutId, rollout)) {
        const batchSizes = JSON.parse(rollout.batch_sizes);
        const nextBatch = rollout.current_batch + 1;

        if (nextBatch <= batchSizes.length) {
          console.log(`[RolloutMonitor] Advancing to batch ${nextBatch}`);
          
          // Check delay between batches
          const lastBatchTime = await this.getLastBatchTime(rolloutId);
          const delayMinutes = rollout.batch_delay_minutes || imageUpdateConfig.BATCH_DELAY_MINUTES;
          const now = new Date();
          const timeSinceLastBatch = (now.getTime() - lastBatchTime.getTime()) / (1000 * 60);

          if (timeSinceLastBatch >= delayMinutes) {
            // Update current batch
            await this.pool.query(
              `UPDATE image_rollouts
               SET current_batch = $1,
                   updated_at = NOW()
               WHERE rollout_id = $2`,
              [nextBatch, rolloutId]
            );

            // Process next batch
            await imageUpdateManager.processNextBatch(rolloutId);

            await eventPublisher.publish(
              'image.batch_started',
              'rollout',
              rolloutId,
              {
                batch_number: nextBatch,
                total_batches: batchSizes.length,
              }
            );
          } else {
            const remainingMinutes = Math.ceil(delayMinutes - timeSinceLastBatch);
            console.log(`[RolloutMonitor] Waiting ${remainingMinutes} more minutes before next batch`);
          }
        } else {
          // All batches complete
          console.log(`[RolloutMonitor] All batches complete for rollout ${rolloutId}`);
          await imageUpdateManager.completeRollout(rolloutId);
        }
      }

    } catch (error) {
      console.error(`[RolloutMonitor] Error processing rollout ${rolloutId}:`, error);
      
      // Mark rollout as failed
      await this.pool.query(
        `UPDATE image_rollouts
         SET status = 'failed',
             updated_at = NOW()
         WHERE rollout_id = $1`,
        [rolloutId]
      );

      await eventPublisher.publish(
        'image.rollout_failed',
        'rollout',
        rolloutId,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
    }
  }

  /**
   * Check the status of devices in a batch
   */
  private async checkBatchStatus(
    rolloutId: string,
    batchNumber: number
  ): Promise<{
    total: number;
    scheduled: number;
    updated: number;
    healthy: number;
    unhealthy: number;
    failed: number;
    allUpdated: boolean;
    healthChecked: boolean;
  }> {
    const result = await this.pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
        COUNT(*) FILTER (WHERE status = 'updated') as updated,
        COUNT(*) FILTER (WHERE status = 'healthy') as healthy,
        COUNT(*) FILTER (WHERE status = 'unhealthy') as unhealthy,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
       FROM device_rollout_status
       WHERE rollout_id = $1 AND batch_number = $2`,
      [rolloutId, batchNumber]
    );

    const row = result.rows[0];
    const total = parseInt(row.total);
    const scheduled = parseInt(row.scheduled);
    const updated = parseInt(row.updated);
    const healthy = parseInt(row.healthy);
    const unhealthy = parseInt(row.unhealthy);
    const failed = parseInt(row.failed);

    return {
      total,
      scheduled,
      updated,
      healthy,
      unhealthy,
      failed,
      allUpdated: (updated + healthy + unhealthy + failed) === total,
      healthChecked: (healthy + unhealthy) > 0,
    };
  }

  /**
   * Check if rollout can advance to next batch
   */
  private async canAdvanceToNextBatch(rolloutId: string, rollout: any): Promise<boolean> {
    // Get current batch status
    const batchStatus = await this.checkBatchStatus(rolloutId, rollout.current_batch);

    // All devices must be processed (updated/healthy/unhealthy/failed)
    if (!batchStatus.allUpdated) {
      return false;
    }

    // Health checks must be run if enabled
    const policyQuery = await this.pool.query(
      `SELECT health_check_enabled FROM image_update_policies WHERE id = $1`,
      [rollout.policy_id]
    );

    if (policyQuery.rows.length > 0 && policyQuery.rows[0].health_check_enabled) {
      if (!batchStatus.healthChecked) {
        return false;
      }
    }

    // Check failure rate (handled by checkAndPauseIfNeeded)
    return rollout.status === 'in_progress';
  }

  /**
   * Get timestamp of when last batch was started
   */
  private async getLastBatchTime(rolloutId: string): Promise<Date> {
    const result = await this.pool.query(
      `SELECT MAX(scheduled_at) as last_scheduled
       FROM device_rollout_status
       WHERE rollout_id = $1`,
      [rolloutId]
    );

    if (result.rows.length > 0 && result.rows[0].last_scheduled) {
      return new Date(result.rows[0].last_scheduled);
    }

    // Fallback to rollout creation time
    const rolloutQuery = await this.pool.query(
      `SELECT created_at FROM image_rollouts WHERE rollout_id = $1`,
      [rolloutId]
    );

    return new Date(rolloutQuery.rows[0].created_at);
  }

  /**
   * Check if monitor is running
   */
  isMonitorRunning(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
let monitorInstance: RolloutMonitor | null = null;

/**
 * Get or create rollout monitor instance
 */
export function getRolloutMonitor(pool: Pool): RolloutMonitor {
  if (!monitorInstance) {
    monitorInstance = new RolloutMonitor(pool, 30); // Check every 30 seconds
  }
  return monitorInstance;
}
