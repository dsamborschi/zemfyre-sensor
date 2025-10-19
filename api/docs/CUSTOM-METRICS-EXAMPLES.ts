// Example: Adding a custom endpoint for advanced metrics

/**
 * Get container resource usage trends
 * GET /api/v1/devices/:uuid/twin/containers/trends
 */
router.get('/devices/:uuid/twin/containers/trends', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { from, to, limit = 100 } = req.query;
    
    const result = await query(
      `SELECT timestamp, reported_state
       FROM device_shadow_history
       WHERE device_uuid = $1 AND timestamp >= $2 AND timestamp <= $3
       ORDER BY timestamp DESC
       LIMIT $4`,
      [uuid, from, to, limit]
    );
    
    // Extract container metrics
    const trends = result.rows.map(row => {
      const containers = row.reported_state.containers?.list || [];
      return {
        timestamp: row.timestamp,
        totalCpu: containers.reduce((sum, c) => sum + (c.cpu || 0), 0),
        totalMemory: containers.reduce((sum, c) => sum + (c.memory || 0), 0),
        containerCount: containers.length,
        containers: containers.map(c => ({
          name: c.name,
          cpu: c.cpu,
          memory: c.memory
        }))
      };
    });
    
    res.json({
      deviceUuid: uuid,
      count: trends.length,
      trends
    });
    
  } catch (error: any) {
    console.error('Error fetching container trends:', error);
    res.status(500).json({ error: 'Failed to fetch container trends' });
  }
});

/**
 * Get network bandwidth usage over time
 * GET /api/v1/devices/:uuid/twin/network/bandwidth
 */
router.get('/devices/:uuid/twin/network/bandwidth', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { from, to } = req.query;
    
    const result = await query(
      `SELECT timestamp, reported_state
       FROM device_shadow_history
       WHERE device_uuid = $1 AND timestamp >= $2 AND timestamp <= $3
       ORDER BY timestamp ASC`,
      [uuid, from, to]
    );
    
    // Calculate bandwidth (difference between consecutive readings)
    const bandwidth = [];
    for (let i = 1; i < result.rows.length; i++) {
      const prev = result.rows[i - 1].reported_state.network || {};
      const curr = result.rows[i].reported_state.network || {};
      
      const timeDiff = (new Date(result.rows[i].timestamp) - new Date(result.rows[i-1].timestamp)) / 1000;
      const bytesInDiff = (curr.bytesIn || 0) - (prev.bytesIn || 0);
      const bytesOutDiff = (curr.bytesOut || 0) - (prev.bytesOut || 0);
      
      bandwidth.push({
        timestamp: result.rows[i].timestamp,
        bandwidthIn: bytesInDiff / timeDiff,  // bytes per second
        bandwidthOut: bytesOutDiff / timeDiff,
        totalBandwidth: (bytesInDiff + bytesOutDiff) / timeDiff
      });
    }
    
    res.json({
      deviceUuid: uuid,
      count: bandwidth.length,
      bandwidth
    });
    
  } catch (error: any) {
    console.error('Error calculating bandwidth:', error);
    res.status(500).json({ error: 'Failed to calculate bandwidth' });
  }
});
