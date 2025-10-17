/**
 * Rollout Management API Routes
 * 
 * Admin endpoints for managing Docker image rollouts:
 * - List rollouts
 * - Get rollout details
 * - Pause/resume/cancel rollouts
 * - Rollback devices
 * - View rollout events
 */

import express, { Request, Response } from 'express';
import poolWrapper from '../db/connection';
import { ImageUpdateManager } from '../services/image-update-manager';
import { EventPublisher } from '../services/event-sourcing';

const router = express.Router();
const pool = poolWrapper.pool;

/**
 * GET /api/v1/rollouts
 * List all rollouts with optional filters
 */
router.get('/rollouts', async (req: Request, res: Response) => {
  try {
    const { status, image_name, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        ir.*,
        iup.image_pattern,
        iup.update_strategy as policy_strategy
      FROM image_rollouts ir
      LEFT JOIN image_update_policies iup ON ir.policy_id = iup.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND ir.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (image_name) {
      query += ` AND ir.image_name LIKE $${paramIndex}`;
      params.push(`%${image_name}%`);
      paramIndex++;
    }

    query += ` ORDER BY ir.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countQuery = await pool.query(
      'SELECT COUNT(*) as total FROM image_rollouts'
    );

    res.json({
      rollouts: result.rows,
      pagination: {
        total: parseInt(countQuery.rows[0].total),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });

  } catch (error) {
    console.error('[Rollouts API] Error listing rollouts:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/rollouts/active
 * Get all active rollouts (using the active_rollouts view)
 */
router.get('/rollouts/active', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT * FROM active_rollouts
      ORDER BY created_at DESC
    `);

    res.json({
      rollouts: result.rows,
      count: result.rows.length,
    });

  } catch (error) {
    console.error('[Rollouts API] Error fetching active rollouts:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/rollouts/:rolloutId
 * Get detailed information about a specific rollout
 */
router.get('/rollouts/:rolloutId', async (req: Request, res: Response) => {
  try {
    const { rolloutId } = req.params;

    const eventPublisher = new EventPublisher('api');
    const imageUpdateManager = new ImageUpdateManager(pool, eventPublisher);

    const rollout = await imageUpdateManager.getRollout(rolloutId);

    if (!rollout) {
      return res.status(404).json({
        error: 'Not found',
        message: `Rollout ${rolloutId} not found`,
      });
    }

    // Get device statuses
    const devices = await imageUpdateManager.getRolloutDevices(rolloutId);

    // Get recent events
    const eventsQuery = await pool.query(
      `SELECT * FROM rollout_events
       WHERE rollout_id = $1
       ORDER BY timestamp DESC
       LIMIT 50`,
      [rolloutId]
    );

    res.json({
      rollout,
      devices,
      events: eventsQuery.rows,
      statistics: {
        total_devices: rollout.total_devices,
        updated_devices: rollout.updated_devices,
        failed_devices: rollout.failed_devices,
        healthy_devices: rollout.healthy_devices,
        rolled_back_devices: rollout.rolled_back_devices,
        progress_percentage: rollout.total_devices > 0
          ? Math.round((rollout.updated_devices / rollout.total_devices) * 100)
          : 0,
        failure_rate: rollout.failure_rate,
      },
    });

  } catch (error) {
    console.error('[Rollouts API] Error fetching rollout:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/rollouts/:rolloutId/pause
 * Pause a rollout
 */
router.post('/rollouts/:rolloutId/pause', async (req: Request, res: Response) => {
  try {
    const { rolloutId } = req.params;
    const { reason = 'Manual pause' } = req.body;

    const eventPublisher = new EventPublisher('api');
    const imageUpdateManager = new ImageUpdateManager(pool, eventPublisher);

    await imageUpdateManager.pauseRollout(rolloutId, reason);

    res.json({
      message: 'Rollout paused successfully',
      rollout_id: rolloutId,
      reason,
    });

  } catch (error) {
    console.error('[Rollouts API] Error pausing rollout:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/rollouts/:rolloutId/resume
 * Resume a paused rollout
 */
router.post('/rollouts/:rolloutId/resume', async (req: Request, res: Response) => {
  try {
    const { rolloutId } = req.params;

    const eventPublisher = new EventPublisher('api');
    const imageUpdateManager = new ImageUpdateManager(pool, eventPublisher);

    await imageUpdateManager.resumeRollout(rolloutId);

    res.json({
      message: 'Rollout resumed successfully',
      rollout_id: rolloutId,
    });

  } catch (error) {
    console.error('[Rollouts API] Error resuming rollout:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/rollouts/:rolloutId/cancel
 * Cancel a rollout
 */
router.post('/rollouts/:rolloutId/cancel', async (req: Request, res: Response) => {
  try {
    const { rolloutId } = req.params;
    const { reason = 'Manual cancellation' } = req.body;

    const eventPublisher = new EventPublisher('api');
    const imageUpdateManager = new ImageUpdateManager(pool, eventPublisher);

    await imageUpdateManager.cancelRollout(rolloutId, reason);

    res.json({
      message: 'Rollout cancelled successfully',
      rollout_id: rolloutId,
      reason,
    });

  } catch (error) {
    console.error('[Rollouts API] Error cancelling rollout:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/rollouts/:rolloutId/rollback-all
 * Rollback all devices in a rollout
 */
router.post('/rollouts/:rolloutId/rollback-all', async (req: Request, res: Response) => {
  try {
    const { rolloutId } = req.params;
    const { reason = 'Manual rollback' } = req.body;

    const eventPublisher = new EventPublisher('api');
    const imageUpdateManager = new ImageUpdateManager(pool, eventPublisher);
    const rollbackManager = imageUpdateManager.getRollbackManager();

    const result = await rollbackManager.rollbackAll(rolloutId, reason);

    if (result.success) {
      res.json({
        message: 'Rollback completed successfully',
        rollout_id: rolloutId,
        devices_rolled_back: result.devicesRolledBack,
        devices_failed: result.devicesFailed,
      });
    } else {
      res.status(500).json({
        error: 'Rollback partially failed',
        rollout_id: rolloutId,
        devices_rolled_back: result.devicesRolledBack,
        devices_failed: result.devicesFailed,
        message: result.message,
      });
    }

  } catch (error) {
    console.error('[Rollouts API] Error rolling back rollout:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/rollouts/:rolloutId/devices/:deviceUuid/rollback
 * Rollback a specific device
 */
router.post('/rollouts/:rolloutId/devices/:deviceUuid/rollback', async (req: Request, res: Response) => {
  try {
    const { rolloutId, deviceUuid } = req.params;
    const { reason = 'Manual device rollback' } = req.body;

    const eventPublisher = new EventPublisher('api');
    const imageUpdateManager = new ImageUpdateManager(pool, eventPublisher);
    const rollbackManager = imageUpdateManager.getRollbackManager();

    const success = await rollbackManager.rollbackDevice(deviceUuid, rolloutId, reason);

    if (success) {
      res.json({
        message: 'Device rolled back successfully',
        rollout_id: rolloutId,
        device_uuid: deviceUuid,
      });
    } else {
      res.status(500).json({
        error: 'Rollback failed',
        rollout_id: rolloutId,
        device_uuid: deviceUuid,
      });
    }

  } catch (error) {
    console.error('[Rollouts API] Error rolling back device:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/rollouts/:rolloutId/devices
 * Get all devices in a rollout with their statuses
 */
router.get('/rollouts/:rolloutId/devices', async (req: Request, res: Response) => {
  try {
    const { rolloutId } = req.params;

    const eventPublisher = new EventPublisher('api');
    const imageUpdateManager = new ImageUpdateManager(pool, eventPublisher);

    const devices = await imageUpdateManager.getRolloutDevices(rolloutId);

    // Group by batch
    const batches: any = {};
    devices.forEach(device => {
      const batchNum = device.batch_number;
      if (!batches[batchNum]) {
        batches[batchNum] = [];
      }
      batches[batchNum].push(device);
    });

    res.json({
      rollout_id: rolloutId,
      total_devices: devices.length,
      devices,
      batches,
    });

  } catch (error) {
    console.error('[Rollouts API] Error fetching rollout devices:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/rollouts/:rolloutId/events
 * Get all events for a rollout
 */
router.get('/rollouts/:rolloutId/events', async (req: Request, res: Response) => {
  try {
    const { rolloutId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT * FROM rollout_events
       WHERE rollout_id = $1
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3`,
      [rolloutId, limit, offset]
    );

    res.json({
      rollout_id: rolloutId,
      events: result.rows,
      count: result.rows.length,
    });

  } catch (error) {
    console.error('[Rollouts API] Error fetching rollout events:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
