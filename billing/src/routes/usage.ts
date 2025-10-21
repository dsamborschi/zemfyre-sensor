/**
 * Usage Routes
 * Receive and track usage from customer instances
 */

import { Router } from 'express';
import { UsageReportModel } from '../db/usage-report-model';

const router = Router();

/**
 * POST /api/usage/report
 * Report usage from customer instance
 */
router.post('/report', async (req, res) => {
  try {
    const { customer_id, instance_id, active_devices, total_devices } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    // Create usage report
    const report = await UsageReportModel.create({
      customer_id,
      instance_id: instance_id || 'default',
      active_devices: active_devices || 0,
      total_devices: total_devices || 0,
    });

    res.status(201).json({
      message: 'Usage reported successfully',
      report,
    });
  } catch (error: any) {
    console.error('Error reporting usage:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/usage/:customerId
 * Get usage history for customer
 */
router.get('/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const reports = await UsageReportModel.getByCustomerId(customerId);

    res.json({
      customer_id: customerId,
      reports,
      total: reports.length,
    });
  } catch (error: any) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/usage/:customerId/latest
 * Get latest usage report for customer
 */
router.get('/:customerId/latest', async (req, res) => {
  try {
    const { customerId } = req.params;

    const report = await UsageReportModel.getLatest(customerId);
    if (!report) {
      return res.status(404).json({ error: 'No usage reports found' });
    }

    res.json({
      customer_id: customerId,
      report,
    });
  } catch (error: any) {
    console.error('Error fetching latest usage:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/usage/cleanup
 * Clean up old usage reports (> 90 days)
 */
router.delete('/cleanup', async (req, res) => {
  try {
    await UsageReportModel.cleanup();

    res.json({
      message: 'Old usage reports cleaned up successfully',
    });
  } catch (error: any) {
    console.error('Error cleaning up usage:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
