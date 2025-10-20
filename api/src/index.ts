/**
 * Unified Iotistic API Server
 */

import express from 'express';
import cors from 'cors';

// Import route modules
import deviceStateRoutes from './routes/device-state';
import provisioningRoutes from './routes/provisioning';
import devicesRoutes from './routes/devices';
import adminRoutes from './routes/admin';
import appsRoutes from './routes/apps';
import webhookRoutes from './routes/webhooks';
import rolloutRoutes from './routes/rollouts';
import imageRegistryRoutes from './routes/image-registry';
import deviceJobsRoutes from './routes/device-jobs';
import scheduledJobsRoutes from './routes/scheduled-jobs';
import rotationRoutes from './routes/rotation';
import digitalTwinRoutes from './routes/digital-twin';
import mqttMonitorRoutes from './routes/mqtt-monitor';
import eventsRoutes from './routes/events';

// Import entity/graph routes
import { createEntitiesRouter } from './routes/entities';
import { createRelationshipsRouter } from './routes/relationships';
import { createGraphRouter } from './routes/graph';

// Import jobs
import { getRolloutMonitor } from './jobs/rollout-monitor';
import { jobScheduler } from './services/job-scheduler';
import poolWrapper from './db/connection';
import { initializeMqtt, shutdownMqtt } from './mqtt';
import { initializeSchedulers, shutdownSchedulers } from './services/rotation-scheduler';
import { startRetentionScheduler, stopRetentionScheduler } from './services/shadow-retention';

// API Version Configuration - Change here to update all routes
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging
app.use((req, res, next) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  console.log(`\n[${timestamp}] ➡️  ${req.method} ${req.path}`);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const responseTimestamp = new Date().toISOString();
    console.log(`[${responseTimestamp}] ⬅️  ${res.statusCode} ${req.method} ${req.path} - ${duration}ms`);
  });
  
  next();
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Iotistic Unified API',
    version: '2.0.0',
    apiVersion: API_VERSION,
    apiBase: API_BASE
  });
});


// Mount route modules - All routes now use centralized versioning via API_BASE
app.use(API_BASE, provisioningRoutes);
app.use(API_BASE, devicesRoutes);
app.use(API_BASE, adminRoutes);
app.use(API_BASE, appsRoutes);
app.use(API_BASE, deviceStateRoutes);
app.use(`${API_BASE}/webhooks`, webhookRoutes);
app.use(API_BASE, rolloutRoutes);
app.use(API_BASE, imageRegistryRoutes);
app.use(API_BASE, deviceJobsRoutes);
app.use(API_BASE, scheduledJobsRoutes);
app.use(API_BASE, rotationRoutes);
app.use(API_BASE, digitalTwinRoutes);
app.use(`${API_BASE}/mqtt-monitor`, mqttMonitorRoutes);
app.use(API_BASE, eventsRoutes);

// Mount entity/graph routes
app.use(`${API_BASE}/entities`, createEntitiesRouter(poolWrapper.pool));
app.use(`${API_BASE}/relationships`, createRelationshipsRouter(poolWrapper.pool));
app.use(`${API_BASE}/graph`, createGraphRouter(poolWrapper.pool));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
    hint: 'See /api/docs for available endpoints'
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
async function startServer() {
  console.log('🚀 Initializing Iotistic Unified API...\n');

  // Initialize PostgreSQL database
  try {
    const db = await import('./db/connection');
    const connected = await db.testConnection();
    
    if (!connected) {
      console.error('❌ Failed to connect to PostgreSQL database');
      process.exit(1);
    }
    
    // Initialize schema
    await db.initializeSchema();
    console.log('✅ PostgreSQL database initialized successfully\n');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    process.exit(1);
  }

  // Start heartbeat monitor for device connectivity
  try {
    const heartbeatMonitor = await import('./services/heartbeat-monitor');
    heartbeatMonitor.default.start();
  } catch (error) {
    console.error('⚠️  Failed to start heartbeat monitor:', error);
    // Don't exit - this is not critical for API operation
  }

  // Start rollout monitor for image updates
  try {
    const rolloutMonitor = getRolloutMonitor(poolWrapper.pool);
    rolloutMonitor.start();
    console.log('✅ Rollout Monitor started');
  } catch (error) {
    console.error('⚠️  Failed to start rollout monitor:', error);
    // Don't exit - this is not critical for API operation
  }

  // Start image monitor for Docker Hub polling
  try {
    const { imageMonitor } = await import('./services/image-monitor');
    imageMonitor.start();
    console.log('✅ Image Monitor started');
  } catch (error) {
    console.error('⚠️  Failed to start image monitor:', error);
    // Don't exit - this is not critical for API operation
  }

  // Start job scheduler for scheduled/recurring jobs
  try {
    await jobScheduler.start();
    console.log('✅ Job Scheduler started');
  } catch (error) {
    console.error('⚠️  Failed to start job scheduler:', error);
    // Don't exit - this is not critical for API operation
  }

  // Initialize MQTT manager for device messages
  try {
    await initializeMqtt();
    // MQTT manager will log its own initialization status
  } catch (error) {
    console.error('⚠️  Failed to initialize MQTT:', error);
    // Don't exit - this is not critical for API operation
  }

  // Initialize API key rotation schedulers
  try {
    initializeSchedulers();
    console.log('✅ API key rotation schedulers started');
  } catch (error) {
    console.error('⚠️  Failed to start rotation schedulers:', error);
    // Don't exit - this is not critical for API operation
  }

  // Initialize shadow history retention scheduler
  try {
    startRetentionScheduler();
    console.log('✅ Shadow history retention scheduler started');
  } catch (error) {
    console.error('⚠️  Failed to start retention scheduler:', error);
    // Don't exit - this is not critical for API operation
  }

  const server = app.listen(PORT, () => {
    console.log('='.repeat(80));
    console.log('☁️  Iotistic Unified API Server');
    console.log('='.repeat(80));
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('='.repeat(80) + '\n');
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('\nSIGTERM received, shutting down gracefully...');
    
    // Shutdown MQTT
    try {
      await shutdownMqtt();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown rotation schedulers
    try {
      shutdownSchedulers();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown shadow retention scheduler
    try {
      stopRetentionScheduler();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop heartbeat monitor
    try {
      const heartbeatMonitor = await import('./services/heartbeat-monitor');
      heartbeatMonitor.default.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop image monitor
    try {
      const { imageMonitor } = await import('./services/image-monitor');
      imageMonitor.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop job scheduler
    try {
      jobScheduler.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    console.log('\nSIGINT received, shutting down gracefully...');
    
    // Shutdown MQTT
    try {
      await shutdownMqtt();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown rotation schedulers
    try {
      shutdownSchedulers();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown shadow retention scheduler
    try {
      stopRetentionScheduler();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop heartbeat monitor
    try {
      const heartbeatMonitor = await import('./services/heartbeat-monitor');
      heartbeatMonitor.default.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop image monitor
    try {
      const { imageMonitor } = await import('./services/image-monitor');
      imageMonitor.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop job scheduler
    try {
      jobScheduler.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
