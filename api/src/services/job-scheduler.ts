/**
 * Job Scheduler Service
 * 
 * Manages scheduled jobs using node-cron. Creates one-time job executions
 * based on user-defined schedules (cron expressions or intervals).
 */

import * as cron from 'node-cron';
import { randomUUID } from 'crypto';
import poolWrapper from '../db/connection';

const pool = poolWrapper.pool;

interface ScheduledJobConfig {
  schedule_id: string;
  job_name: string;
  job_document: any;
  target_type: 'device' | 'group' | 'all';
  target_devices?: string[];
  target_filter?: any;
  schedule_type: 'cron' | 'interval';
  cron_expression?: string;
  interval_minutes?: number;
  max_executions?: number;
  timeout_minutes?: number;
  is_active: boolean;
  execution_count: number;
}

class JobSchedulerService {
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private intervalTimers: Map<string, NodeJS.Timeout> = new Map();
  private executionCounts: Map<string, number> = new Map();
  private isRunning: boolean = false;

  /**
   * Start the job scheduler service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[JobScheduler] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[JobScheduler] 🚀 Starting job scheduler service...');

    try {
      // Load all active scheduled jobs from database
      await this.loadScheduledJobs();
      console.log('[JobScheduler] ✅ Job scheduler started successfully');
    } catch (error) {
      console.error('[JobScheduler] ❌ Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop the job scheduler service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[JobScheduler] 🛑 Stopping job scheduler service...');

    // Stop all cron tasks
    for (const [scheduleId, task] of this.scheduledTasks) {
      task.stop();
      console.log(`[JobScheduler] Stopped cron task: ${scheduleId}`);
    }
    this.scheduledTasks.clear();

    // Clear all interval timers
    for (const [scheduleId, timer] of this.intervalTimers) {
      clearInterval(timer);
      console.log(`[JobScheduler] Stopped interval timer: ${scheduleId}`);
    }
    this.intervalTimers.clear();

    this.executionCounts.clear();
    this.isRunning = false;

    console.log('[JobScheduler] ✅ Job scheduler stopped');
  }

  /**
   * Load all active scheduled jobs from database
   */
  private async loadScheduledJobs(): Promise<void> {
    try {
      const result = await pool.query(
        `SELECT * FROM scheduled_jobs WHERE is_active = true`
      );

      console.log(`[JobScheduler] Loading ${result.rows.length} active scheduled jobs`);

      for (const config of result.rows) {
        await this.scheduleJob(config);
      }
    } catch (error) {
      console.error('[JobScheduler] Error loading scheduled jobs:', error);
      throw error;
    }
  }

  /**
   * Schedule a job based on configuration
   */
  async scheduleJob(config: ScheduledJobConfig): Promise<void> {
    const { schedule_id, schedule_type, cron_expression, interval_minutes } = config;

    // Initialize execution count
    this.executionCounts.set(schedule_id, config.execution_count || 0);

    if (schedule_type === 'cron' && cron_expression) {
      // Validate cron expression
      if (!cron.validate(cron_expression)) {
        throw new Error(`Invalid cron expression: ${cron_expression}`);
      }

      // Schedule cron job
      const task = cron.schedule(cron_expression, async () => {
        await this.executeScheduledJob(config);
      });

      this.scheduledTasks.set(schedule_id, task);
      console.log(`[JobScheduler] 📅 Scheduled cron job: ${config.job_name} (${cron_expression})`);

    } else if (schedule_type === 'interval' && interval_minutes) {
      // Schedule interval job
      const intervalMs = interval_minutes * 60 * 1000;
      const timer = setInterval(async () => {
        await this.executeScheduledJob(config);
      }, intervalMs);

      this.intervalTimers.set(schedule_id, timer);
      console.log(`[JobScheduler] ⏱️  Scheduled interval job: ${config.job_name} (every ${interval_minutes} minutes)`);

    } else {
      throw new Error(`Invalid schedule configuration for job: ${config.job_name}`);
    }
  }

  /**
   * Execute a scheduled job (create a new job execution)
   */
  private async executeScheduledJob(config: ScheduledJobConfig): Promise<void> {
    const { schedule_id, job_name, job_document, max_executions } = config;

    try {
      // Check if max executions reached
      const currentCount = this.executionCounts.get(schedule_id) || 0;
      if (max_executions && currentCount >= max_executions) {
        console.log(`[JobScheduler] ⚠️  Job ${job_name} reached max executions (${max_executions}), deactivating...`);
        await this.deactivateSchedule(schedule_id);
        return;
      }

      console.log(`[JobScheduler] ▶️  Triggering scheduled job: ${job_name} (execution #${currentCount + 1})`);

      // Get target devices
      const deviceUuids = await this.getTargetDevices(config);

      if (deviceUuids.length === 0) {
        console.warn(`[JobScheduler] ⚠️  No target devices found for job: ${job_name}`);
        return;
      }

      // Create new job execution
      const jobId = randomUUID();
      await pool.query(
        `INSERT INTO job_executions (
          job_id, job_name, job_document, target_type, target_devices,
          target_filter, execution_type, timeout_minutes, total_devices
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          jobId,
          job_name,
          JSON.stringify(job_document),
          config.target_type,
          deviceUuids,
          config.target_filter ? JSON.stringify(config.target_filter) : null,
          'oneTime',
          config.timeout_minutes || 60,
          deviceUuids.length
        ]
      );

      // Create device job status entries
      const deviceStatusValues = deviceUuids.map((uuid) => `('${jobId}', '${uuid}')`).join(', ');
      await pool.query(
        `INSERT INTO device_job_status (job_id, device_uuid) VALUES ${deviceStatusValues}`
      );

      // Update execution count
      const newCount = currentCount + 1;
      this.executionCounts.set(schedule_id, newCount);
      
      await pool.query(
        `UPDATE scheduled_jobs SET execution_count = $1, last_execution_at = CURRENT_TIMESTAMP WHERE schedule_id = $2`,
        [newCount, schedule_id]
      );

      console.log(`[JobScheduler] ✅ Created job execution ${jobId} for ${deviceUuids.length} device(s)`);

    } catch (error) {
      console.error(`[JobScheduler] ❌ Error executing scheduled job ${job_name}:`, error);
    }
  }

  /**
   * Get target devices based on configuration
   */
  private async getTargetDevices(config: ScheduledJobConfig): Promise<string[]> {
    const { target_type, target_devices, target_filter } = config;

    if (target_type === 'device' && target_devices) {
      return target_devices;
    }

    if (target_type === 'all') {
      const result = await pool.query(
        'SELECT uuid FROM devices WHERE is_active = true'
      );
      return result.rows.map((row: any) => row.uuid);
    }

    if (target_type === 'group' && target_filter) {
      // Apply filter (e.g., { "device_type": "raspberry-pi" })
      const filterKeys = Object.keys(target_filter);
      const filterQuery = filterKeys.map((key, idx) => `${key} = $${idx + 1}`).join(' AND ');
      const filterValues = filterKeys.map(key => target_filter[key]);

      const result = await pool.query(
        `SELECT uuid FROM devices WHERE is_active = true AND ${filterQuery}`,
        filterValues
      );
      return result.rows.map((row: any) => row.uuid);
    }

    return [];
  }

  /**
   * Deactivate a schedule
   */
  private async deactivateSchedule(scheduleId: string): Promise<void> {
    try {
      // Update database
      await pool.query(
        `UPDATE scheduled_jobs SET is_active = false WHERE schedule_id = $1`,
        [scheduleId]
      );

      // Stop the task/timer
      this.unscheduleJob(scheduleId);

      console.log(`[JobScheduler] 🔴 Deactivated schedule: ${scheduleId}`);
    } catch (error) {
      console.error(`[JobScheduler] Error deactivating schedule ${scheduleId}:`, error);
    }
  }

  /**
   * Unschedule a specific job
   */
  unscheduleJob(scheduleId: string): void {
    // Stop cron task if exists
    const task = this.scheduledTasks.get(scheduleId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(scheduleId);
      console.log(`[JobScheduler] Unscheduled cron task: ${scheduleId}`);
    }

    // Clear interval timer if exists
    const timer = this.intervalTimers.get(scheduleId);
    if (timer) {
      clearInterval(timer);
      this.intervalTimers.delete(scheduleId);
      console.log(`[JobScheduler] Unscheduled interval timer: ${scheduleId}`);
    }

    this.executionCounts.delete(scheduleId);
  }

  /**
   * Add a new scheduled job
   */
  async addScheduledJob(config: Omit<ScheduledJobConfig, 'schedule_id' | 'execution_count'>): Promise<string> {
    const scheduleId = randomUUID();

    try {
      // Insert into database
      await pool.query(
        `INSERT INTO scheduled_jobs (
          schedule_id, job_name, job_document, target_type, target_devices,
          target_filter, schedule_type, cron_expression, interval_minutes,
          max_executions, timeout_minutes, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          scheduleId,
          config.job_name,
          JSON.stringify(config.job_document),
          config.target_type,
          config.target_devices || null,
          config.target_filter ? JSON.stringify(config.target_filter) : null,
          config.schedule_type,
          config.cron_expression || null,
          config.interval_minutes || null,
          config.max_executions || null,
          config.timeout_minutes || 60,
          config.is_active
        ]
      );

      // Schedule the job if active
      if (config.is_active) {
        await this.scheduleJob({ ...config, schedule_id: scheduleId, execution_count: 0 });
      }

      console.log(`[JobScheduler] 📝 Added new scheduled job: ${config.job_name} (${scheduleId})`);
      return scheduleId;

    } catch (error) {
      console.error('[JobScheduler] Error adding scheduled job:', error);
      throw error;
    }
  }

  /**
   * Remove a scheduled job
   */
  async removeScheduledJob(scheduleId: string): Promise<void> {
    try {
      // Unschedule first
      this.unscheduleJob(scheduleId);

      // Delete from database
      await pool.query(
        `DELETE FROM scheduled_jobs WHERE schedule_id = $1`,
        [scheduleId]
      );

      console.log(`[JobScheduler] 🗑️  Removed scheduled job: ${scheduleId}`);
    } catch (error) {
      console.error('[JobScheduler] Error removing scheduled job:', error);
      throw error;
    }
  }

  /**
   * Get status of all scheduled jobs
   */
  getStatus(): any {
    return {
      isRunning: this.isRunning,
      activeCronJobs: this.scheduledTasks.size,
      activeIntervalJobs: this.intervalTimers.size,
      totalScheduledJobs: this.scheduledTasks.size + this.intervalTimers.size,
      executions: Object.fromEntries(this.executionCounts)
    };
  }
}

// Singleton instance
export const jobScheduler = new JobSchedulerService();
