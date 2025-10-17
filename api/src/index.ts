/**
 * Unified Zemfyre API Server
 * Combines Grafana management, Docker control, and cloud multi-device management
 */

import express from 'express';
import cors from 'cors';

// Import route modules
import grafanaRoutes from './routes/grafana';
import notifyRoutes from './routes/notify';
import cloudRoutes from './routes/cloud';


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
    documentation: '/api/docs'
  });
});

// API Documentation
app.get('/api/docs', (req, res) => {
  res.json({
    version: '2.0.0',
    description: 'Unified API for Zemfyre Sensor system',
    endpoints: {
      general: {
        'GET /': 'Health check',
        'GET /api/docs': 'This documentation'
      },
      grafana: {
        'GET /grafana/dashboards': 'List all Grafana dashboards',
        'GET /grafana/alert-rules': 'List all alert rules',
        'POST /grafana/update-alert-threshold': 'Update alert threshold',
        'GET /grafana/dashboards/:uid/variables': 'Get dashboard variables',
        'POST /grafana/dashboards/:uid/variables/:varName': 'Update dashboard variable'
      },
      docker: {
        'GET /containers': 'List all Docker containers',
        'POST /containers/:id/restart': 'Restart a container'
      },
      notifications: {
        'POST /notify': 'Send system notification'
      },
 
      provisioningKeys: {
        'POST /api/v1/provisioning-keys': 'Create new provisioning key for fleet',
        'GET /api/v1/provisioning-keys?fleetId=xxx': 'List provisioning keys for a fleet',
        'DELETE /api/v1/provisioning-keys/:keyId': 'Revoke a provisioning key'
      },
      cloud: {
        'POST /api/v1/device/register': 'Register new device (two-phase auth - provisioning key)',
        'POST /api/v1/device/:uuid/key-exchange': 'Exchange keys (two-phase auth - device key)',
        'GET /api/v1/device/:uuid/state': 'Device polls for target state (ETag cached)',
        'POST /api/v1/device/:uuid/logs': 'Device uploads logs',
        'PATCH /api/v1/device/state': 'Device reports current state + metrics',
        'GET /api/v1/devices': 'List all registered devices',
        'GET /api/v1/devices/:uuid': 'Get specific device info',
        'GET /api/v1/devices/:uuid/target-state': 'Get device target state',
        'POST /api/v1/devices/:uuid/target-state': 'Set device target state',
        'GET /api/v1/devices/:uuid/current-state': 'Get device current state',
        'DELETE /api/v1/devices/:uuid/target-state': 'Clear device target state'
      }
    },
    notes: [
      'Grafana management requires GRAFANA_API_TOKEN environment variable',
      'Docker operations require /var/run/docker.sock volume mount',
      'Cloud endpoints support multi-device IoT fleet management',
      'Devices poll for target state using ETag caching',
      'Two-phase authentication: provisioning key (fleet) + device key (unique per device)'
    ]
  });
});

// Mount route modules
app.use(grafanaRoutes);
app.use(notifyRoutes);
app.use(cloudRoutes);

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
  console.log('🚀 Initializing Zemfyre Unified API...\n');

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

  const server = app.listen(PORT, () => {
    console.log('='.repeat(80));
    console.log('☁️  Iotistic Unified API Server');
    console.log('='.repeat(80));
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Documentation: http://localhost:${PORT}/api/docs`);
    console.log('='.repeat(80));
    console.log('\nGrafana Management:');
    console.log(`  GET    /grafana/dashboards             - List dashboards`);
    console.log(`  GET    /grafana/alert-rules            - List alerts`);
    console.log(`  POST   /grafana/update-alert-threshold - Update threshold`);
    console.log('\nDocker Management:');
    console.log(`  GET    /containers                     - List containers`);
    console.log(`  POST   /containers/:id/restart         - Restart container`);
    console.log('\nCloud Device Management:');
    console.log(`  POST   /api/v1/device/register         - Register device (provisioning)`);
    console.log(`  POST   /api/v1/device/:uuid/key-exchange - Key exchange (provisioning)`);
    console.log(`  GET    /api/v1/devices                 - List all devices`);
    console.log(`  POST   /api/v1/devices/:uuid/target-state - Set device target`);
    console.log(`  PATCH  /api/v1/device/state            - Device reports state`);
    console.log('\nSystem:');
    console.log(`  POST   /notify                         - Send notification`);
    console.log('='.repeat(80) + '\n');
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    
    // Stop heartbeat monitor
    try {
      const heartbeatMonitor = await import('./services/heartbeat-monitor');
      heartbeatMonitor.default.stop();
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
    
    // Stop heartbeat monitor
    try {
      const heartbeatMonitor = await import('./services/heartbeat-monitor');
      heartbeatMonitor.default.stop();
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
