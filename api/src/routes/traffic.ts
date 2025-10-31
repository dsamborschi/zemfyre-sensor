// Device Traffic Statistics Routes
import express from 'express';
export const router = express.Router();
import { 
  getTrafficStats, 
  getDeviceTrafficStats, 
  getAggregatedDeviceStats 
} from "../middleware/traffic-logger";

// ============================================================================
// Traffic Statistics Endpoints
// ============================================================================

/**
 * Get all device traffic statistics (detailed by endpoint)
 * GET /api/v1/traffic-stats
 */
router.get("/traffic-stats", async (req, res) => {
  res.json(getTrafficStats());
});

/**
 * Get aggregated traffic statistics per device (summary)
 * GET /api/v1/traffic-stats/devices
 */
router.get("/traffic-stats/devices", async (req, res) => {
  res.json(getAggregatedDeviceStats());
});

/**
 * Get traffic statistics for a specific device
 * GET /api/v1/traffic-stats/devices/:uuid
 */
router.get("/traffic-stats/devices/:uuid", async (req, res) => {
  const deviceUuid = req.params.uuid;
  const stats = getDeviceTrafficStats(deviceUuid);
  
  if (stats.length === 0) {
    res.status(404).json({
      error: 'Not Found',
      message: `No traffic statistics found for device ${deviceUuid}`
    });
    return;
  }

  // Calculate aggregated totals
  const totalRequests = stats.reduce((sum, s) => sum + s.count, 0);
  const totalBytes = stats.reduce((sum, s) => sum + s.totalBytes, 0);
  const totalTime = stats.reduce((sum, s) => sum + s.totalTime, 0);
  const totalSuccess = stats.reduce((sum, s) => sum + s.success, 0);
  const totalFailed = stats.reduce((sum, s) => sum + s.failed, 0);

  res.json({
    deviceId: deviceUuid,
    summary: {
      totalRequests,
      totalBytes,
      avgResponseTime: totalRequests > 0 ? totalTime / totalRequests : 0,
      successRate: totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0,
      totalSuccess,
      totalFailed,
      endpointCount: stats.length
    },
    endpoints: stats
  });
});

