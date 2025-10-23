/**
 * Billing Server
 * Global billing system with Stripe integration and JWT license generation
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection } from './db/connection';
import { LicenseGenerator } from './services/license-generator';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

// Routes
import customersRouter from './routes/customers';
import subscriptionsRouter from './routes/subscriptions';
import licensesRouter from './routes/licenses';
import usageRouter from './routes/usage';
import webhooksRouter from './routes/webhooks';
import queueRouter from './routes/queue';
// TODO: Fix missing upgrade-service module
// import upgradesRouter from './routes/upgrades';

// Workers
import { deploymentWorker } from './workers/deployment-worker';
import { deploymentQueue } from './services/deployment-queue';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3100;

// Middleware
app.use(cors());

// IMPORTANT: Stripe webhooks need raw body, other routes need JSON
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json());

// Bull Board UI - Queue monitoring dashboard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullAdapter(deploymentQueue.getQueue())
  ],
  serverAdapter: serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'billing',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/customers', customersRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/licenses', licensesRouter);
app.use('/api/usage', usageRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/queue', queueRouter);
// app.use('/api/upgrades', upgradesRouter); // Disabled - missing upgrade-service

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize and start server
async function start() {
  try {
    console.log('🚀 Starting Billing...');

    // Test database connection
    await testConnection();
    console.log('✅ Database connected');

    // Initialize license generator (load RSA keys)
    LicenseGenerator.init();
    console.log('✅ License generator initialized');

    // Start server
    app.listen(PORT, async () => {
      console.log(`✅ Billing listening on port ${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log(`   API: http://localhost:${PORT}/api`);
      
      // Start deployment worker
      try {
        await deploymentWorker.start();
        console.log(`✅ Deployment worker started`);
      } catch (error) {
        console.error('⚠️  Failed to start deployment worker:', error);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📴 SIGTERM received, shutting down gracefully...');
  await deploymentWorker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 SIGINT received, shutting down gracefully...');
  await deploymentWorker.stop();
  process.exit(0);
});

start();
