/**
 * Admin Routes
 * Administrative endpoints for system monitoring
 */

import express from 'express';

export const router = express.Router();

// ============================================================================
// Admin / Monitoring Endpoints
// ============================================================================

/**
 * Get heartbeat monitor status and configuration
 * GET /api/v1/admin/heartbeat
 */
router.get('/api/v1/admin/heartbeat', async (req, res) => {
  try {
    const heartbeatMonitor = await import('../services/heartbeat-monitor');
    const config = heartbeatMonitor.default.getConfig();

    res.json({
      status: 'ok',
      heartbeat: config
    });
  } catch (error: any) {
    console.error('Error getting heartbeat config:', error);
    res.status(500).json({
      error: 'Failed to get heartbeat configuration',
      message: error.message
    });
  }
});

/**
 * Manually trigger heartbeat check
 * POST /api/v1/admin/heartbeat/check
 */
router.post('/api/v1/admin/heartbeat/check', async (req, res) => {
  try {
    console.log('🔍 Manual heartbeat check triggered');
    
    const heartbeatMonitor = await import('../services/heartbeat-monitor');
    await heartbeatMonitor.default.checkNow();

    res.json({
      status: 'ok',
      message: 'Heartbeat check completed'
    });
  } catch (error: any) {
    console.error('Error during manual heartbeat check:', error);
    res.status(500).json({
      error: 'Failed to perform heartbeat check',
      message: error.message
    });
  }
});

export default router;
