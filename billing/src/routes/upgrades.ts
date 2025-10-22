import { Router } from 'express';
import { upgradeService } from '../services/upgrade-service';
import { deploymentQueue } from '../services/deployment-queue';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/upgrades/deploy
 * Start a system-wide upgrade
 */
router.post('/deploy', async (req, res) => {
  try {
    const { component, version, strategy = 'batch', batchSize = 10, canaryPercent = 10 } = req.body;

    if (!component || !version) {
      return res.status(400).json({ 
        error: 'Missing required fields: component, version' 
      });
    }

    if (!['api', 'dashboard', 'exporter', 'mosquitto'].includes(component)) {
      return res.status(400).json({ 
        error: 'Invalid component. Must be: api, dashboard, exporter, or mosquitto' 
      });
    }

    if (!['all', 'canary', 'batch'].includes(strategy)) {
      return res.status(400).json({ 
        error: 'Invalid strategy. Must be: all, canary, or batch' 
      });
    }

    // Create upgrade record
    const upgradeId = await upgradeService.startUpgrade({
      component,
      version,
      strategy,
      batchSize,
      canaryPercent,
    });

    // Queue the upgrade job
    let customerIds: string[] | undefined;

    if (strategy === 'canary') {
      customerIds = await upgradeService.getCanaryCustomers(canaryPercent);
      logger.info('Starting canary upgrade', { 
        upgradeId, 
        canaryPercent, 
        customerCount: customerIds.length 
      });
    }

    const job = await deploymentQueue.add(
      'system-upgrade',
      {
        upgradeId,
        customerIds, // undefined for 'all' strategy
      },
      {
        attempts: 1, // Don't retry entire upgrade automatically
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    res.json({
      upgradeId,
      jobId: job.id,
      strategy,
      message: strategy === 'canary' 
        ? `Canary upgrade started for ${customerIds?.length} customers`
        : 'Upgrade queued for all customers',
    });

  } catch (error) {
    logger.error('Failed to start upgrade', { error });
    res.status(500).json({ 
      error: 'Failed to start upgrade',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/upgrades/:upgradeId/status
 * Get upgrade progress
 */
router.get('/:upgradeId/status', async (req, res) => {
  try {
    const { upgradeId } = req.params;
    
    const progress = await upgradeService.getUpgradeProgress(upgradeId);

    if (!progress) {
      return res.status(404).json({ error: 'Upgrade not found' });
    }

    res.json(progress);

  } catch (error) {
    logger.error('Failed to get upgrade status', { error });
    res.status(500).json({ 
      error: 'Failed to get upgrade status',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/upgrades/:upgradeId/logs
 * Get upgrade logs for specific upgrade
 */
router.get('/:upgradeId/logs', async (req, res) => {
  try {
    const { upgradeId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    
    const logs = await upgradeService.getUpgradeLogs(upgradeId, limit);

    res.json({
      upgradeId,
      count: logs.length,
      logs,
    });

  } catch (error) {
    logger.error('Failed to get upgrade logs', { error });
    res.status(500).json({ 
      error: 'Failed to get upgrade logs',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/upgrades
 * List all upgrades
 */
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    
    const upgrades = await upgradeService.listUpgrades(limit);

    res.json({
      count: upgrades.length,
      upgrades,
    });

  } catch (error) {
    logger.error('Failed to list upgrades', { error });
    res.status(500).json({ 
      error: 'Failed to list upgrades',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/upgrades/:upgradeId/rollback
 * Rollback a specific customer
 */
router.post('/:upgradeId/rollback/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // Get customer namespace
    const { db } = require('../config/database');
    const customer = await db('customers')
      .where('customer_id', customerId)
      .first();

    if (!customer || !customer.instance_namespace) {
      return res.status(404).json({ error: 'Customer not found or not deployed' });
    }

    await upgradeService.rollbackCustomer(customerId, customer.instance_namespace);

    res.json({
      message: 'Rollback completed',
      customerId,
      namespace: customer.instance_namespace,
    });

  } catch (error) {
    logger.error('Failed to rollback customer', { error });
    res.status(500).json({ 
      error: 'Failed to rollback customer',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/upgrades/:upgradeId/continue
 * Continue canary upgrade to all remaining customers
 */
router.post('/:upgradeId/continue', async (req, res) => {
  try {
    const { upgradeId } = req.params;

    // Queue upgrade job for all remaining customers
    const job = await deploymentQueue.add(
      'system-upgrade',
      {
        upgradeId,
        // customerIds undefined = all customers
      },
      {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    res.json({
      message: 'Upgrade continuation queued',
      upgradeId,
      jobId: job.id,
    });

  } catch (error) {
    logger.error('Failed to continue upgrade', { error });
    res.status(500).json({ 
      error: 'Failed to continue upgrade',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
