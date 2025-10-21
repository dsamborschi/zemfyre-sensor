/**
 * Housekeeper Integration Example
 * 
 * Shows how to integrate housekeeper into your Express/Node.js application
 */

import express from 'express';
import { createHousekeeper, Housekeeper } from './housekeeper';

// Your app instance
const app = express();
let housekeeper: Housekeeper;

/**
 * Initialize housekeeper on application startup
 */
async function startHousekeeper() {
  console.log('Starting housekeeper...');

  housekeeper = createHousekeeper({
    enabled: process.env.NODE_ENV === 'production' || process.env.ENABLE_HOUSEKEEPER === 'true',
    sentryEnabled: process.env.SENTRY_DSN !== undefined,
    timezone: process.env.TZ || 'America/New_York'
  });

  await housekeeper.initialize();
  console.log('Housekeeper started');
}

/**
 * Shutdown housekeeper gracefully
 */
async function stopHousekeeper() {
  if (!housekeeper) return;
  
  console.log('Stopping housekeeper...');
  await housekeeper.shutdown();
  console.log('Housekeeper stopped');
}

/**
 * Optional: Add REST API endpoints for housekeeper control
 */
function addHousekeeperRoutes(app: express.Application) {
  // List all tasks
  app.get('/api/admin/housekeeper/tasks', (req, res) => {
    try {
      const tasks = housekeeper.listTasks();
      res.json({ tasks });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get task status
  app.get('/api/admin/housekeeper/tasks/:name/status', (req, res) => {
    try {
      const status = housekeeper.getTaskStatus(req.params.name);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Run task manually
  app.post('/api/admin/housekeeper/tasks/:name/run', async (req, res) => {
    try {
      await housekeeper.runTaskManually(req.params.name);
      res.json({ success: true, message: `Task '${req.params.name}' executed` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Register a new task dynamically
  app.post('/api/admin/housekeeper/tasks', async (req, res) => {
    try {
      const { name, schedule, startup, runCode } = req.body;

      // WARNING: Only allow trusted code execution!
      // This is for demonstration only - implement proper security
      await housekeeper.registerTask({
        name,
        schedule,
        startup,
        run: eval(runCode) // DANGEROUS - sanitize in production!
      });

      res.json({ success: true, message: `Task '${name}' registered` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Unregister a task
  app.delete('/api/admin/housekeeper/tasks/:name', (req, res) => {
    try {
      housekeeper.unregisterTask(req.params.name);
      res.json({ success: true, message: `Task '${req.params.name}' unregistered` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

/**
 * Main application startup
 */
async function main() {
  // Start Express server
  app.listen(3000, () => {
    console.log('Server listening on port 3000');
  });

  // Add housekeeper API routes (optional)
  addHousekeeperRoutes(app);

  // Start housekeeper
  await startHousekeeper();

  // Graceful shutdown handlers
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await stopHousekeeper();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await stopHousekeeper();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

// Start application
main().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

/**
 * Example: Register a custom task at runtime
 */
async function registerCustomTask() {
  await housekeeper.registerTask({
    name: 'send-daily-report',
    schedule: '0 9 * * *', // 9am daily
    startup: false,
    run: async () => {
      console.log('Sending daily report...');
      // Send email, generate report, etc.
      // Access database via import: import { query } from '../src/db/connection';
    }
  });
}

/**
 * Example: Trigger task manually from code
 */
async function runTaskNow() {
  await housekeeper.runTaskManually('cleanup-expired-tokens');
  console.log('Task completed');
}

/**
 * Example: Check if task is running
 */
function checkTaskStatus() {
  const status = housekeeper.getTaskStatus('database-vacuum');
  if (status.running) {
    console.log('Database vacuum is currently running');
  }
}

export {
  startHousekeeper,
  stopHousekeeper,
  addHousekeeperRoutes,
  registerCustomTask,
  runTaskNow,
  checkTaskStatus
};
