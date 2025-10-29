/**
 * MQTT Jobs Subscriber Service
 * 
 * Listens for job status updates from devices via MQTT and saves them to the database.
 * Handles the server-side of the AWS IoT Jobs MQTT protocol.
 */

import { getMqttJobsNotifier } from './mqtt-jobs-notifier';
import { pool } from '../db/connection';

export class MqttJobsSubscriber {
  private notifier = getMqttJobsNotifier();
  private initialized = false;

  /**
   * Initialize the subscriber and register handlers
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('[MqttJobsSubscriber] Initializing job update subscriber');

    // Register wildcard handler for all job updates
    this.notifier.onJobUpdate('*', async (update) => {
      await this.handleJobUpdate(update);
    });

    this.initialized = true;
    console.log('[MqttJobsSubscriber] Job update subscriber initialized');
  }

  /**
   * Handle job status update from device
   */
  private async handleJobUpdate(update: {
    deviceUuid: string;
    jobId: string;
    status: string;
    statusDetails?: {
      reason?: string;
      stdout?: string;
      stderr?: string;
      progress?: number;
      [key: string]: any;
    };
    expectedVersion?: number;
    executionNumber?: number;
    clientToken?: string;
  }): Promise<void> {
    const { deviceUuid, jobId, status, statusDetails } = update;

    console.log(`[MqttJobsSubscriber] Processing update for job ${jobId}:`, {
      deviceUuid,
      status,
      hasDetails: !!statusDetails,
    });

    try {
      // Check if record exists
      const existing = await pool.query(
        'SELECT * FROM device_job_status WHERE job_id = $1 AND device_uuid = $2',
        [jobId, deviceUuid]
      );

      const now = new Date();
      const stdout = statusDetails?.stdout || null;
      const stderr = statusDetails?.stderr || null;
      const reason = statusDetails?.reason || null;

      if (existing.rows.length > 0) {
        // Update existing record
        let updateQuery = `
          UPDATE device_job_status 
          SET status = $1, 
              updated_at = $2,
              reason = COALESCE($3, reason)
        `;
        const params: any[] = [status, now, reason];
        let paramIndex = 4;

        // Add stdout if provided
        if (stdout) {
          updateQuery += `, stdout = $${paramIndex}`;
          params.push(stdout);
          paramIndex++;
        }

        // Add stderr if provided
        if (stderr) {
          updateQuery += `, stderr = $${paramIndex}`;
          params.push(stderr);
          paramIndex++;
        }

        // Set started_at if status is IN_PROGRESS and not already set
        if (status === 'IN_PROGRESS' && !existing.rows[0].started_at) {
          updateQuery += `, started_at = $${paramIndex}`;
          params.push(now);
          paramIndex++;
        }

        // Set completed_at if status is terminal (SUCCEEDED, FAILED, etc.)
        if (['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELED'].includes(status)) {
          updateQuery += `, completed_at = $${paramIndex}`;
          params.push(now);
          paramIndex++;
        }

        updateQuery += ` WHERE job_id = $${paramIndex} AND device_uuid = $${paramIndex + 1}`;
        params.push(jobId, deviceUuid);

        await pool.query(updateQuery, params);

        console.log(`[MqttJobsSubscriber] Updated job ${jobId} status to ${status}`);
      } else {
        // Insert new record (should already exist from job creation, but handle just in case)
        console.warn(`[MqttJobsSubscriber] Job status record not found, creating new one for ${jobId}`);

        await pool.query(
          `INSERT INTO device_job_status 
           (job_id, device_uuid, status, queued_at, started_at, completed_at, stdout, stderr, reason, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            jobId,
            deviceUuid,
            status,
            now, // queued_at
            status === 'IN_PROGRESS' ? now : null,
            ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELED'].includes(status) ? now : null,
            stdout,
            stderr,
            reason,
            now,
          ]
        );

        console.log(`[MqttJobsSubscriber] Created job status record for ${jobId}`);
      }
    } catch (error) {
      console.error(`[MqttJobsSubscriber] Failed to update job ${jobId}:`, error);
    }
  }

  /**
   * Stop the subscriber
   */
  async stop(): Promise<void> {
    console.log('[MqttJobsSubscriber] Stopping job update subscriber');
    this.notifier.removeHandler('*');
    this.initialized = false;
  }
}

// Singleton instance
let instance: MqttJobsSubscriber | null = null;

export function getMqttJobsSubscriber(): MqttJobsSubscriber {
  if (!instance) {
    instance = new MqttJobsSubscriber();
    
    // Auto-initialize
    instance.initialize().catch((error) => {
      console.error('[MqttJobsSubscriber] Failed to initialize:', error);
    });
  }
  
  return instance;
}
