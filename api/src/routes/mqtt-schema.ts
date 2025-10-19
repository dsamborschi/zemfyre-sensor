/**
 * MQTT Schema Agent API Routes
 * Provides endpoints to control and query the MQTT schema monitoring service
 */

import { Router, Request, Response } from 'express';
import { MQTTSchemaAgent } from '../services/mqtt-schema-agent';

const router = Router();

// Singleton instance
let agent: MQTTSchemaAgent | null = null;

/**
 * Initialize the MQTT schema agent
 */
function initializeAgent(): MQTTSchemaAgent {
  if (!agent) {
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    const username = process.env.MQTT_USERNAME;
    const password = process.env.MQTT_PASSWORD;
    const topics = process.env.MQTT_TOPICS ? process.env.MQTT_TOPICS.split(',') : ['#'];

    agent = new MQTTSchemaAgent({
      brokerUrl,
      username,
      password,
      topics,
      reportInterval: 120000 // 2 minutes
    });

    // Log events
    agent.on('connected', () => {
      console.log('[MQTT Schema API] Agent connected to broker');
    });

    agent.on('error', (error) => {
      console.error('[MQTT Schema API] Agent error:', error);
    });

    agent.on('schema', ({ topic, schema }) => {
      console.log(`[MQTT Schema API] New schema for topic: ${topic}`, schema);
    });

    agent.on('report', ({ schemas, stats }) => {
      console.log(`[MQTT Schema API] Report: ${schemas.length} schemas, ${stats.userMessages} user messages`);
    });

    // Auto-start by default
    agent.start().catch(err => {
      console.error('[MQTT Schema API] Failed to start agent:', err);
    });
  }

  return agent;
}

/**
 * GET /api/v1/mqtt-schema/status
 * Get agent connection status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    if (!agent) {
      return res.json({
        connected: false,
        message: 'Agent not initialized'
      });
    }

    const status = agent.getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/mqtt-schema/start
 * Start the MQTT schema agent
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const agentInstance = initializeAgent();
    await agentInstance.start();
    
    res.json({
      success: true,
      message: 'MQTT schema agent started'
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * POST /api/v1/mqtt-schema/stop
 * Stop the MQTT schema agent
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    if (!agent) {
      return res.status(400).json({
        success: false,
        error: 'Agent not running'
      });
    }

    await agent.stop();
    agent = null;

    res.json({
      success: true,
      message: 'MQTT schema agent stopped'
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-schema/topics
 * Get all discovered topics with their schemas
 */
router.get('/topics', (req: Request, res: Response) => {
  try {
    if (!agent) {
      return res.status(400).json({
        success: false,
        error: 'Agent not running'
      });
    }

    const topics = agent.getTopics();
    
    res.json({
      success: true,
      count: topics.length,
      topics
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-schema/topics/:topic
 * Get schema for a specific topic
 */
router.get('/topics/:topic(*)', (req: Request, res: Response) => {
  try {
    if (!agent) {
      return res.status(400).json({
        success: false,
        error: 'Agent not running'
      });
    }

    const topic = req.params.topic;
    const schema = agent.getTopicSchema(topic);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Topic not found'
      });
    }

    res.json({
      success: true,
      schema
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/mqtt-schema/stats
 * Get MQTT broker statistics
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    if (!agent) {
      return res.status(400).json({
        success: false,
        error: 'Agent not running'
      });
    }

    const stats = agent.getStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Initialize agent on module load if auto-start is enabled
if (process.env.MQTT_SCHEMA_AUTO_START !== 'false') {
  initializeAgent();
}

export default router;
