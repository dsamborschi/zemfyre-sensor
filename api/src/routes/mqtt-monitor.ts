/**
 * MQTT Monitoring Dashboard API Routes
 * Provides topic tree, metrics, and real-time broker statistics
 */

import { Router, Request, Response } from 'express';
import { MQTTMonitorService } from '../services/mqtt-monitor';
import { MQTTDatabaseService } from '../services/mqtt-database-service';

const router = Router();

// Monitor instance will be injected from index.ts
let monitor: MQTTMonitorService | null = null;
let mqttDbService: MQTTDatabaseService | null = null;

/**
 * Set the monitor instance (called from index.ts during initialization)
 */
export function setMonitorInstance(monitorInstance: MQTTMonitorService | null, dbService: MQTTDatabaseService | null = null) {
  monitor = monitorInstance;
  mqttDbService = dbService;
}

/**
 * GET /api/v1/mqtt-monitor/status
 * Get monitor connection status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    if (!monitor) {
      return res.json({
        success: true,
        data: {
          connected: false,
          message: 'Monitor not initialized'
        }
      });
    }

    const status = monitor.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * POST /api/v1/mqtt-monitor/start
 * Start the MQTT monitor
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    if (!monitor) {
      return res.status(400).json({
        success: false,
        error: 'Monitor not initialized. Service should be started via index.ts'
      });
    }
    
    await monitor.start();
    
    res.json({
      success: true,
      message: 'MQTT monitor started'
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * POST /api/v1/mqtt-monitor/stop
 * Stop the MQTT monitor
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    if (!monitor) {
      return res.status(400).json({
        success: false,
        error: 'Monitor not running'
      });
    }

    await monitor.stop();
    monitor = null;

    res.json({
      success: true,
      message: 'MQTT monitor stopped'
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/topic-tree
 * Get complete hierarchical topic tree
 */
router.get('/topic-tree', (req: Request, res: Response) => {
  try {
    if (!monitor) {
      return res.status(400).json({
        success: false,
        error: 'Monitor not running'
      });
    }

    const topicTree = monitor.getTopicTree();
    
    res.json({
      success: true,
      data: topicTree
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/topics
 * Get flattened list of topics with message counts and schemas
 * 
 * Query parameters:
 * - timeWindow: Filter topics by time window (1h, 6h, 24h, 7d, 30d, all)
 * - minutes: Alternative time filter in minutes (e.g., 60 for last hour)
 */
router.get('/topics', (req: Request, res: Response) => {
  try {
    if (!monitor) {
      return res.status(400).json({
        success: false,
        error: 'Monitor not running'
      });
    }

    // Parse time window parameters
    const timeWindow = req.query.timeWindow as string;
    const minutesParam = req.query.minutes as string;
    
    let filterTimestamp: number | null = null;
    
    if (timeWindow) {
      const now = Date.now();
      switch (timeWindow) {
        case '1h':
          filterTimestamp = now - (60 * 60 * 1000);
          break;
        case '6h':
          filterTimestamp = now - (6 * 60 * 60 * 1000);
          break;
        case '24h':
          filterTimestamp = now - (24 * 60 * 60 * 1000);
          break;
        case '7d':
          filterTimestamp = now - (7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          filterTimestamp = now - (30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
        default:
          filterTimestamp = null;
          break;
      }
    } else if (minutesParam) {
      const minutes = parseInt(minutesParam, 10);
      if (!isNaN(minutes) && minutes > 0) {
        filterTimestamp = Date.now() - (minutes * 60 * 1000);
      }
    }

    const topics = monitor.getFlattenedTopics(filterTimestamp);
    
    res.json({
      success: true,
      count: topics.length,
      data: topics,
      timeWindow: timeWindow || (minutesParam ? `${minutesParam}m` : 'all'),
      filteredFrom: filterTimestamp ? new Date(filterTimestamp).toISOString() : null
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/topics/:topic/schema
 * Get schema for a specific topic
 */
router.get('/topics/:topic(*)/schema', (req: Request, res: Response) => {
  try {
    if (!monitor) {
      return res.status(400).json({
        success: false,
        error: 'Monitor not running'
      });
    }

    const topic = req.params.topic;
    const schemaData = monitor.getTopicSchema(topic);

    if (!schemaData) {
      return res.status(404).json({
        success: false,
        error: 'Topic not found or no schema available'
      });
    }

    res.json({
      success: true,
      data: {
        topic,
        ...schemaData
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/metrics
 * Get real-time broker metrics (message rates, throughput, clients)
 */
router.get('/metrics', (req: Request, res: Response) => {
  try {
    if (!monitor) {
      return res.status(400).json({
        success: false,
        error: 'Monitor not running'
      });
    }

    const metrics = monitor.getMetrics();
    
    res.json({
      success: true,
      data: {
        messageRate: metrics.messageRate,
        throughput: metrics.throughput,
        clients: metrics.clients,
        subscriptions: metrics.subscriptions,
        retainedMessages: metrics.retainedMessages,
        totalMessages: {
          sent: metrics.totalMessagesSent,
          received: metrics.totalMessagesReceived
        },
        timestamp: metrics.timestamp
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/system-stats
 * Get raw $SYS topic statistics
 */
router.get('/system-stats', (req: Request, res: Response) => {
  try {
    if (!monitor) {
      return res.status(400).json({
        success: false,
        error: 'Monitor not running'
      });
    }

    const systemStats = monitor.getSystemStats();
    
    res.json({
      success: true,
      data: systemStats
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/stats
 * Get comprehensive statistics (combines metrics + system stats)
 * Provides compatibility with legacy mqtt-schema stats endpoint
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    if (!monitor) {
      return res.status(400).json({
        success: false,
        error: 'Monitor not running'
      });
    }

    const status = monitor.getStatus();
    const metrics = monitor.getMetrics();
    const systemStats = monitor.getSystemStats();
    const topics = monitor.getFlattenedTopics();
    
    // Calculate schema statistics
    const topicsWithSchemas = topics.filter(t => t.schema).length;
    const messageTypeBreakdown = topics.reduce((acc, t) => {
      if (t.messageType) {
        acc[t.messageType] = (acc[t.messageType] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    res.json({
      success: true,
      stats: {
        // Connection stats
        connected: status.connected,
        topicCount: status.topicCount,
        messageCount: status.messageCount,
        
        // Schema stats
        schemas: {
          total: topicsWithSchemas,
          byType: messageTypeBreakdown
        },
        
        // Message rates
        messageRate: {
          published: metrics.messageRate.current.published,
          received: metrics.messageRate.current.received
        },
        
        // Throughput
        throughput: {
          inbound: metrics.throughput.current.inbound,
          outbound: metrics.throughput.current.outbound
        },
        
        // Client info
        clients: metrics.clients,
        subscriptions: metrics.subscriptions,
        retainedMessages: metrics.retainedMessages,
        
        // Totals
        totalMessagesSent: metrics.totalMessagesSent,
        totalMessagesReceived: metrics.totalMessagesReceived,
        
        // Broker info (if available)
        broker: systemStats.$SYS?.broker || null
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/dashboard
 * Get all dashboard data in one call (topic tree + metrics + schemas)
 */
router.get('/dashboard', (req: Request, res: Response) => {
  try {
    if (!monitor) {
      return res.status(400).json({
        success: false,
        error: 'Monitor not running'
      });
    }

    const status = monitor.getStatus();
    const topicTree = monitor.getTopicTree();
    const topics = monitor.getFlattenedTopics();
    const metrics = monitor.getMetrics();
    
    // Count topics with schemas
    const topicsWithSchemas = topics.filter(t => t.schema).length;
    
    res.json({
      success: true,
      data: {
        status,
        topicTree,
        topics: {
          count: topics.length,
          withSchemas: topicsWithSchemas,
          list: topics.slice(0, 100) // Limit to first 100 for performance
        },
        metrics: {
          messageRate: metrics.messageRate,
          throughput: metrics.throughput,
          clients: metrics.clients,
          subscriptions: metrics.subscriptions,
          retainedMessages: metrics.retainedMessages,
          totalMessages: {
            sent: metrics.totalMessagesSent,
            received: metrics.totalMessagesReceived
          }
        },
        timestamp: Date.now()
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * POST /api/v1/mqtt-monitor/sync
 * Manually trigger database sync
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    if (!monitor) {
      return res.status(400).json({
        success: false,
        error: 'Monitor not running'
      });
    }

    await (monitor as any).flushToDatabase();
    
    res.json({
      success: true,
      message: 'Data synced to database'
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/database/topics
 * Get topics from database (persisted data)
 */
router.get('/database/topics', async (req: Request, res: Response) => {
  try {
    if (!mqttDbService) {
      return res.status(400).json({
        success: false,
        error: 'Database persistence not enabled'
      });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const messageType = req.query.messageType as string;
    const hasSchema = req.query.hasSchema ? req.query.hasSchema === 'true' : undefined;

    const topics = await mqttDbService.getTopics({
      limit,
      messageType,
      hasSchema
    });

    res.json({
      success: true,
      count: topics.length,
      data: topics
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/database/stats/summary
 * Get statistics summary from database
 */
router.get('/database/stats/summary', async (req: Request, res: Response) => {
  try {
    if (!mqttDbService) {
      return res.status(400).json({
        success: false,
        error: 'Database persistence not enabled'
      });
    }

    const summary = await mqttDbService.getStatsSummary();

    res.json({
      success: true,
      data: summary
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/database/schema-history/:topic
 * Get schema evolution history for a topic
 */
router.get('/database/schema-history/:topic(*)', async (req: Request, res: Response) => {
  try {
    if (!mqttDbService) {
      return res.status(400).json({
        success: false,
        error: 'Database persistence not enabled'
      });
    }

    const topic = req.params.topic;
    const history = await mqttDbService.getSchemaHistory(topic);

    res.json({
      success: true,
      topic,
      count: history.length,
      data: history
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/recent-activity
 * Get recent message counts for all topics (time-windowed)
 * Query params:
 *   - window: Time window in minutes (default: 15, options: 5, 15, 30, 60)
 */
router.get('/recent-activity', async (req: Request, res: Response) => {
  try {
    if (!mqttDbService) {
      return res.status(400).json({
        success: false,
        error: 'Database persistence not enabled'
      });
    }

    const windowMinutes = req.query.window ? parseInt(req.query.window as string) : 15;
    
    // Validate window parameter
    if (![5, 15, 30, 60].includes(windowMinutes)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid window parameter. Must be one of: 5, 15, 30, 60'
      });
    }

    const recentActivity = await mqttDbService.getRecentMessageCounts(windowMinutes);

    res.json({
      success: true,
      windowMinutes,
      count: recentActivity.length,
      data: recentActivity
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-monitor/topics/:topic/recent-activity
 * Get recent activity for a specific topic with data points
 * Query params:
 *   - window: Time window in minutes (default: 15)
 */
router.get('/topics/:topic(*)/recent-activity', async (req: Request, res: Response) => {
  try {
    if (!mqttDbService) {
      return res.status(400).json({
        success: false,
        error: 'Database persistence not enabled'
      });
    }

    const topic = req.params.topic;
    const windowMinutes = req.query.window ? parseInt(req.query.window as string) : 15;

    const activity = await mqttDbService.getTopicRecentActivity(topic, windowMinutes);

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'No recent activity found for this topic'
      });
    }

    res.json({
      success: true,
      data: activity
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;
