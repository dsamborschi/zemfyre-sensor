/**
 * Scheduled Jobs API Routes
 * 
 * Endpoints for managing recurring/scheduled jobs
 */

import express, { Request, Response } from 'express';
import poolWrapper from '../db/connection';
import { jobScheduler } from '../services/job-scheduler';
import * as cron from 'node-cron';

const router = express.Router();
const pool = poolWrapper.pool;

/**
 * GET /api/v1/jobs/schedules
 * List all scheduled jobs
 */
router.get('/jobs/schedules', async (req: Request, res: Response) => {
  try {
    const { active } = req.query;

    let query = 'SELECT * FROM scheduled_jobs WHERE 1=1';
    const params: any[] = [];

    if (active !== undefined) {
      query += ' AND is_active = $1';
      params.push(active === 'true');
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    return res.status(200).json({
      schedules: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching scheduled jobs:', error);
    return res.status(500).json({
      error: 'Failed to fetch scheduled jobs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/jobs/schedules/:scheduleId
 * Get a specific scheduled job
 */
router.get('/jobs/schedules/:scheduleId', async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;

    const result = await pool.query(
      'SELECT * FROM scheduled_jobs WHERE schedule_id = $1',
      [scheduleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled job not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching scheduled job:', error);
    return res.status(500).json({
      error: 'Failed to fetch scheduled job',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/jobs/schedules
 * Create a new scheduled job
 */
router.post('/jobs/schedules', async (req: Request, res: Response) => {
  try {
    const {
      job_name,
      description,
      job_document,
      target_type,
      target_devices,
      target_filter,
      schedule_type,
      cron_expression,
      interval_minutes,
      max_executions,
      timeout_minutes,
      created_by,
    } = req.body;

    // Validation
    if (!job_name || !job_document) {
      return res.status(400).json({
        error: 'job_name and job_document are required',
      });
    }

    if (!target_type || !['device', 'group', 'all'].includes(target_type)) {
      return res.status(400).json({
        error: 'target_type must be one of: device, group, all',
      });
    }

    if (!schedule_type || !['cron', 'interval'].includes(schedule_type)) {
      return res.status(400).json({
        error: 'schedule_type must be one of: cron, interval',
      });
    }

    // Validate schedule configuration
    if (schedule_type === 'cron') {
      if (!cron_expression) {
        return res.status(400).json({
          error: 'cron_expression is required for cron schedule type',
        });
      }
      if (!cron.validate(cron_expression)) {
        return res.status(400).json({
          error: 'Invalid cron expression',
        });
      }
    } else if (schedule_type === 'interval') {
      if (!interval_minutes || interval_minutes < 1) {
        return res.status(400).json({
          error: 'interval_minutes must be >= 1',
        });
      }
    }

    // Create scheduled job via scheduler service
    const scheduleId = await jobScheduler.addScheduledJob({
      job_name,
      job_document,
      target_type,
      target_devices: target_devices || undefined,
      target_filter: target_filter || undefined,
      schedule_type,
      cron_expression: cron_expression || undefined,
      interval_minutes: interval_minutes || undefined,
      max_executions: max_executions || undefined,
      timeout_minutes: timeout_minutes || 60,
      is_active: true,
    });

    const result = await pool.query(
      'SELECT * FROM scheduled_jobs WHERE schedule_id = $1',
      [scheduleId]
    );

    return res.status(201).json({
      schedule: result.rows[0],
      message: 'Scheduled job created successfully',
    });
  } catch (error: any) {
    console.error('Error creating scheduled job:', error);
    return res.status(500).json({
      error: 'Failed to create scheduled job',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/v1/jobs/schedules/:scheduleId
 * Update a scheduled job
 */
router.patch('/jobs/schedules/:scheduleId', async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;
    const {
      job_name,
      description,
      job_document,
      cron_expression,
      interval_minutes,
      max_executions,
      is_active,
    } = req.body;

    // Check if schedule exists
    const existing = await pool.query(
      'SELECT * FROM scheduled_jobs WHERE schedule_id = $1',
      [scheduleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled job not found' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (job_name !== undefined) {
      updates.push(`job_name = $${paramIndex}`);
      params.push(job_name);
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }

    if (job_document !== undefined) {
      updates.push(`job_document = $${paramIndex}`);
      params.push(JSON.stringify(job_document));
      paramIndex++;
    }

    if (cron_expression !== undefined) {
      if (!cron.validate(cron_expression)) {
        return res.status(400).json({ error: 'Invalid cron expression' });
      }
      updates.push(`cron_expression = $${paramIndex}`);
      params.push(cron_expression);
      paramIndex++;
    }

    if (interval_minutes !== undefined) {
      updates.push(`interval_minutes = $${paramIndex}`);
      params.push(interval_minutes);
      paramIndex++;
    }

    if (max_executions !== undefined) {
      updates.push(`max_executions = $${paramIndex}`);
      params.push(max_executions);
      paramIndex++;
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(is_active);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(scheduleId);
    const result = await pool.query(
      `UPDATE scheduled_jobs SET ${updates.join(', ')} WHERE schedule_id = $${paramIndex} RETURNING *`,
      params
    );

    // If schedule was updated, reload it in the scheduler
    if (is_active !== undefined || cron_expression !== undefined || interval_minutes !== undefined) {
      jobScheduler.unscheduleJob(scheduleId);
      if (result.rows[0].is_active) {
        await jobScheduler.scheduleJob(result.rows[0]);
      }
    }

    return res.status(200).json({
      schedule: result.rows[0],
      message: 'Scheduled job updated successfully',
    });
  } catch (error) {
    console.error('Error updating scheduled job:', error);
    return res.status(500).json({
      error: 'Failed to update scheduled job',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/v1/jobs/schedules/:scheduleId
 * Delete a scheduled job
 */
router.delete('/jobs/schedules/:scheduleId', async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;

    await jobScheduler.removeScheduledJob(scheduleId);

    return res.status(200).json({
      message: 'Scheduled job deleted successfully',
      scheduleId,
    });
  } catch (error) {
    console.error('Error deleting scheduled job:', error);
    return res.status(500).json({
      error: 'Failed to delete scheduled job',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/jobs/schedules/:scheduleId/pause
 * Pause a scheduled job
 */
router.post('/jobs/schedules/:scheduleId/pause', async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;

    const result = await pool.query(
      `UPDATE scheduled_jobs SET is_active = false WHERE schedule_id = $1 RETURNING *`,
      [scheduleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled job not found' });
    }

    jobScheduler.unscheduleJob(scheduleId);

    return res.status(200).json({
      schedule: result.rows[0],
      message: 'Scheduled job paused',
    });
  } catch (error) {
    console.error('Error pausing scheduled job:', error);
    return res.status(500).json({
      error: 'Failed to pause scheduled job',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/jobs/schedules/:scheduleId/resume
 * Resume a paused scheduled job
 */
router.post('/jobs/schedules/:scheduleId/resume', async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;

    const result = await pool.query(
      `UPDATE scheduled_jobs SET is_active = true WHERE schedule_id = $1 RETURNING *`,
      [scheduleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled job not found' });
    }

    await jobScheduler.scheduleJob(result.rows[0]);

    return res.status(200).json({
      schedule: result.rows[0],
      message: 'Scheduled job resumed',
    });
  } catch (error) {
    console.error('Error resuming scheduled job:', error);
    return res.status(500).json({
      error: 'Failed to resume scheduled job',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/jobs/schedules/:scheduleId/executions
 * Get execution history for a scheduled job
 */
router.get('/jobs/schedules/:scheduleId/executions', async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;
    const { limit = 20 } = req.query;

    // Get schedule info
    const schedule = await pool.query(
      'SELECT job_name FROM scheduled_jobs WHERE schedule_id = $1',
      [scheduleId]
    );

    if (schedule.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled job not found' });
    }

    // Get job executions created by this schedule
    const result = await pool.query(
      `SELECT * FROM job_executions 
       WHERE job_name = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [schedule.rows[0].job_name, parseInt(limit as string)]
    );

    return res.status(200).json({
      scheduleId,
      executions: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching schedule executions:', error);
    return res.status(500).json({
      error: 'Failed to fetch schedule executions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/jobs/scheduler/status
 * Get job scheduler service status
 */
router.get('/jobs/scheduler/status', async (req: Request, res: Response) => {
  try {
    const status = jobScheduler.getStatus();
    return res.status(200).json(status);
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    return res.status(500).json({
      error: 'Failed to get scheduler status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
