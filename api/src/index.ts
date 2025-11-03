/**
 * Unified Iotistic API Server
 */

import express from 'express';
import cors from 'cors';

// Import route modules
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
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
import mqttBrokerRoutes from './routes/mqtt-broker';
import sensorsRoutes from './routes/sensors';
import { router as protocolDevicesRoutes } from './routes/device-sensors';
import { router as trafficRoutes } from './routes/traffic';
import housekeeperRoutes, { setHousekeeperInstance } from './routes/housekeeper';
import { trafficLogger} from "./middleware/traffic-logger";
import { startTrafficFlushService, stopTrafficFlushService } from './services/traffic-flush-service';
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
import { createHousekeeper } from './housekeeper';
import { setMonitorInstance } from './routes/mqtt-monitor';
import { MQTTMonitorService } from './services/mqtt-monitor';
import { MQTTDatabaseService } from './services/mqtt-database-service';
import { LicenseValidator } from './services/license-validator';
import licenseRoutes from './routes/license';
import billingRoutes from './routes/billing';
import { websocketManager } from './services/websocket-manager';

// API Version Configuration - Change here to update all routesggg
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;

const app = express();
const PORT = process.env.PORT || 3002;
const housekeeper = createHousekeeper();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3001', 'http://localhost:3000', 'http://localhost:4002'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-API-Key']
}));

app.options('*', cors());

// Support compressed (gzip) request bodies
app.use(express.json({ 
  limit: '10mb',
  inflate: true  // Automatically decompress gzip/deflate
}));
app.use(express.urlencoded({ 
  limit: '10mb', 
  extended: true,
  inflate: true  // Automatically decompress gzip/deflate
}));

app.use(trafficLogger);

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
    apiBase: API_BASE,
    documentation: '/api/docs'
  });
});



// Health check endpoint (for Kubernetes probes)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Setup API documentation
import { setupApiDocs } from './docs';
setupApiDocs(app, API_BASE);

// Mount route modules - All routes now use centralized versioning via API_BASE
app.use(`${API_BASE}/auth`, authRoutes);
app.use(`${API_BASE}/users`, usersRoutes);
app.use(API_BASE, licenseRoutes);
app.use(`${API_BASE}/billing`, billingRoutes);
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
app.use(`${API_BASE}/mqtt`, mqttBrokerRoutes);
app.use(API_BASE, sensorsRoutes);
app.use(API_BASE, protocolDevicesRoutes);
app.use(API_BASE, trafficRoutes);
app.use(`${API_BASE}/housekeeper`, housekeeperRoutes);

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

  // MQTT Monitor instance (needs to be accessible in shutdown handlers)
  let mqttMonitor: MQTTMonitorService | null = null;

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
    
    // Initialize MQTT admin user (replaces K8s postgres-init-job)
    const { initializeMqttAdmin } = await import('./services/mqtt-bootstrap');
    await initializeMqttAdmin();
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    process.exit(1);
  }

  // Initialize license validator
  try {
    console.log('🔐 Initializing license validator...');
    const licenseValidator = LicenseValidator.getInstance();
    await licenseValidator.init();
  } catch (error) {
    console.error('⚠️  License validator initialization failed:', error);
    // Don't exit - will run in unlicensed mode with limited features
  }

  // Start heartbeat monitor for device connectivity
  try {
    const heartbeatMonitor = await import('./services/heartbeat-monitor');
    heartbeatMonitor.default.start();
  } catch (error) {
    console.error(' Failed to start heartbeat monitor:', error);
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
  // try {
  //   const { imageMonitor } = await import('./services/image-monitor');
  //   imageMonitor.start();
  //   console.log('✅ Image Monitor started');
  // } catch (error) {
  //   console.error('⚠️  Failed to start image monitor:', error);
  //   // Don't exit - this is not critical for API operation
  // }

  // Start job scheduler for scheduled/recurring jobs
  try {
    await jobScheduler.start();
    console.log('✅ Job Scheduler started');
  } catch (error) {
    console.error('⚠️  Failed to start job scheduler:', error);
    // Don't exit - this is not critical for API operation
  }

  // Start housekeeper for maintenance tasks
  try {
    await housekeeper.initialize();
    setHousekeeperInstance(housekeeper);
  } catch (error) {
    console.error('⚠️  Failed to start housekeeper:', error);
    // Don't exit - this is not critical for API operation
  }

  // Start traffic flush service (persists device traffic metrics to database)
  try {
    startTrafficFlushService();
    console.log('✅ Traffic flush service started');
  } catch (error) {
    console.error('⚠️  Failed to start traffic flush service:', error);
    // Don't exit - this is not critical for API operation
  }

  // Initialize MQTT Jobs Subscriber (listens for job status updates from devices)
  try {
    const { getMqttJobsSubscriber } = await import('./services/mqtt-jobs-subscriber');
    const subscriber = getMqttJobsSubscriber();
    await subscriber.initialize();
    console.log('✅ MQTT Jobs Subscriber started (listening for device job updates)');
  } catch (error) {
    console.error('⚠️  Failed to start MQTT Jobs Subscriber:', error);
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
  // try {
  //   startRetentionScheduler();
  //   console.log('✅ Shadow history retention scheduler started');
  // } catch (error) {
  //   console.error('⚠️  Failed to start retention scheduler:', error);
  //   // Don't exit - this is not critical for API operation
  // }

  // Initialize MQTT Monitor Service
  let mqttDbService: MQTTDatabaseService | null = null;
  
  if (process.env.MQTT_MONITOR_ENABLED !== 'false') {
    try {
      const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
      const username = process.env.MQTT_USERNAME;
      const password = process.env.MQTT_PASSWORD;
      const persistToDatabase = true;

      // Initialize database service if persistence is enabled
      if (persistToDatabase) {
        mqttDbService = new MQTTDatabaseService(poolWrapper.pool);
        console.log('✅ MQTT Monitor database persistence enabled');
      }

      mqttMonitor = new MQTTMonitorService({
        brokerUrl,
        username,
        password,
        topicTreeEnabled: true,
        metricsEnabled: true,
        schemaGenerationEnabled: true,
        persistToDatabase,
        dbSyncInterval: parseInt(process.env.MQTT_DB_SYNC_INTERVAL || '30000')
      }, mqttDbService);

      // Log events
      mqttMonitor.on('connected', () => {
        console.log('✅ MQTT Monitor connected to broker at', brokerUrl);
      });

      mqttMonitor.on('error', (error) => {
        console.error('⚠️  MQTT Monitor error:', error);
      });

      // Start the monitor
      await mqttMonitor.start();
      
      // Set monitor instance for routes
      setMonitorInstance(mqttMonitor, mqttDbService);
      
      // Set monitor instance for WebSocket
      websocketManager.setMqttMonitor(mqttMonitor);
      
      console.log('✅ MQTT Monitor Service started');
    } catch (error) {
      console.error('⚠️  Failed to start MQTT Monitor:', error);
      // Don't exit - this is not critical for API operation
    }
  } else {
    console.log('ℹ️  MQTT Monitor disabled via MQTT_MONITOR_ENABLED=false');
  }

  const server = app.listen(PORT, () => {
    console.log('='.repeat(80));
    console.log('☁️  Iotistic Unified API Server');
    console.log('='.repeat(80));
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('='.repeat(80) + '\n');
  });

  // Initialize WebSocket server
  try {
    websocketManager.initialize(server);
    console.log('✅ WebSocket Server initialized (available at ws://localhost:' + PORT + '/ws)');
  } catch (error) {
    console.error('⚠️  Failed to initialize WebSocket server:', error);
    // Don't exit - this is not critical for API operation
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('\nSIGTERM received, shutting down gracefully...');
    
    // Shutdown WebSocket Server
    try {
      websocketManager.shutdown();
      console.log('✅ WebSocket Server stopped');
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown MQTT Monitor
    try {
      if (mqttMonitor) {
        await mqttMonitor.stop();
        console.log('✅ MQTT Monitor stopped');
      }
    } catch (error) {
      // Ignore errors during shutdown
    }
    
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
    
    // Shutdown housekeeper
    try {
      await housekeeper.shutdown();
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
    
    // Stop MQTT Jobs Subscriber
    try {
      const { getMqttJobsSubscriber } = await import('./services/mqtt-jobs-subscriber');
      const subscriber = getMqttJobsSubscriber();
      await subscriber.stop();
      console.log('✅ MQTT Jobs Subscriber stopped');
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop traffic flush service (final flush to database)
    try {
      await stopTrafficFlushService();
      console.log('✅ Traffic flush service stopped');
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
    
    // Shutdown WebSocket Server
    try {
      websocketManager.shutdown();
      console.log('✅ WebSocket Server stopped');
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown MQTT Monitor
    try {
      if (mqttMonitor) {
        await mqttMonitor.stop();
        console.log('✅ MQTT Monitor stopped');
      }
    } catch (error) {
      // Ignore errors during shutdown
    }
    
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
    
    // Shutdown housekeeper
    try {
      await housekeeper.shutdown();
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
    
    // Stop MQTT Jobs Subscriber
    try {
      const { getMqttJobsSubscriber } = await import('./services/mqtt-jobs-subscriber');
      const subscriber = getMqttJobsSubscriber();
      await subscriber.stop();
      console.log('✅ MQTT Jobs Subscriber stopped');
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop traffic flush service (final flush to database)
    try {
      await stopTrafficFlushService();
      console.log('✅ Traffic flush service stopped');
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
