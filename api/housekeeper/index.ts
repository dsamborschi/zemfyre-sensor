/**
 * Housekeeper - Task Scheduler & Executor
 * 
 * Unified task scheduling system combining:
 * - Cron-based scheduling (from original housekeeper)
 * - Job engine patterns (from agent)
 * 
 * Runs regular maintenance tasks to keep things clean and tidy
 */

import { CronJob } from 'cron';

export interface HousekeeperTask {
  name: string;
  schedule?: string; // Cron expression (e.g., "0 2 * * *" = 2am daily)
  startup?: boolean | number; // true = run on startup, number = delay in ms
  run: () => Promise<void>;
}

interface RegisteredTask extends HousekeeperTask {
  job?: CronJob;
}

export interface HousekeeperConfig {
  enabled?: boolean;
  timezone?: string;
}

/**
 * Create housekeeper instance
 */
export function createHousekeeper(config: HousekeeperConfig = {}) {
  const tasks = new Map<string, RegisteredTask>();
  const delayedStartupTasks: NodeJS.Timeout[] = [];
  const runningTasks = new Set<string>();

  const {
    enabled = true,
    timezone = 'Etc/UTC'
  } = config;



  /**
   * Run a single task
   */
  async function runTask(task: RegisteredTask): Promise<void> {
    // Prevent concurrent runs of same task
    if (runningTasks.has(task.name)) {
      console.warn(`Task '${task.name}' is already running, skipping`);
      return;
    }

    runningTasks.add(task.name);
    console.log(`🧹 Running housekeeper task: '${task.name}'`);
    
    const startTime = Date.now();

    try {
      await task.run();
      
      const duration = Date.now() - startTime;
      console.log(`✅ Completed task '${task.name}' in ${duration}ms`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = `Error running task '${task.name}' after ${duration}ms: ${error.message}`;
      
      console.error(`❌ ${errorMessage}`);
      console.error(error.stack);
    } finally {
      runningTasks.delete(task.name);
    }
  }

  /**
   * Register a new task
   */
  async function registerTask(task: HousekeeperTask): Promise<void> {
    if (!enabled) {
      console.log(`Housekeeper disabled, skipping task '${task.name}'`);
      return;
    }

    if (tasks.has(task.name)) {
      console.warn(`Task '${task.name}' already registered, skipping`);
      return;
    }

    const registeredTask: RegisteredTask = { ...task };
    tasks.set(task.name, registeredTask);

    // Schedule cron job if schedule provided
    if (task.schedule) {
      try {
        registeredTask.job = new CronJob(
          task.schedule,
          () => runTask(registeredTask),
          null, // onComplete
          true, // start
          timezone
        );
        console.log(`📅 Scheduled task '${task.name}' with cron: ${task.schedule}`);
      } catch (error: any) {
        console.error(`Failed to schedule task '${task.name}':`, error.message);
      }
    }
  }

  /**
   * Unregister a task
   */
  function unregisterTask(name: string): void {
    const task = tasks.get(name);
    if (!task) return;

    if (task.job) {
      task.job.stop();
      delete task.job;
    }

    tasks.delete(name);
    console.log(`Unregistered task '${name}'`);
  }

  /**
   * Run a task manually (on-demand)
   */
  async function runTaskManually(name: string): Promise<void> {
    const task = tasks.get(name);
    if (!task) {
      throw new Error(`Task '${name}' not found`);
    }

    await runTask(task);
  }

  /**
   * Get task status
   */
  function getTaskStatus(name: string): {
    registered: boolean;
    running: boolean;
    scheduled: boolean;
  } {
    const task = tasks.get(name);
    return {
      registered: !!task,
      running: runningTasks.has(name),
      scheduled: !!task?.job
    };
  }

  /**
   * List all registered tasks
   */
  function listTasks(): Array<{
    name: string;
    schedule?: string;
    running: boolean;
    scheduled: boolean;
  }> {
    return Array.from(tasks.values()).map(task => ({
      name: task.name,
      schedule: task.schedule,
      running: runningTasks.has(task.name),
      scheduled: !!task.job
    }));
  }

  /**
   * Initialize housekeeper - load and run startup tasks
   */
  async function initialize(): Promise<void> {
    if (!enabled) {
      console.log('Housekeeper is disabled');
      return;
    }

    console.log('🧹 Initializing housekeeper...');

    // Register built-in tasks
    const tasksToRegister = [
      await import('./tasks/cleanup-old-logs'),
      await import('./tasks/database-vacuum'),
      await import('./tasks/device-logs-retention'),
      await import('./tasks/device-logs-partition-maintenance'),
      // Add more tasks here
    ];

    for (const taskModule of tasksToRegister) {
      try {
        await registerTask(taskModule.default);
      } catch (error: any) {
        console.error(`Failed to register task:`, error.message);
      }
    }

    // Run startup tasks
    for (const task of tasks.values()) {
      if (task.startup === true) {
        // Run immediately on startup
        runTask(task).catch(err => {
          console.error(`Startup task '${task.name}' failed:`, err);
        });
      } else if (typeof task.startup === 'number') {
        // Run after delay
        const timeout = setTimeout(
          () => runTask(task).catch(err => {
            console.error(`Delayed startup task '${task.name}' failed:`, err);
          }),
          task.startup
        );
        delayedStartupTasks.push(timeout);
      }
    }

    console.log(`✅ Housekeeper initialized with ${tasks.size} tasks`);
  }

  /**
   * Shutdown housekeeper - stop all scheduled tasks
   */
  async function shutdown(): Promise<void> {
    console.log('🧹 Shutting down housekeeper...');

    // Stop all scheduled jobs
    for (const task of tasks.values()) {
      if (task.job) {
        task.job.stop();
        delete task.job;
      }
    }

    // Clear delayed startup tasks
    for (const timeout of delayedStartupTasks) {
      clearTimeout(timeout);
    }
    delayedStartupTasks.length = 0;

    // Wait for running tasks to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (runningTasks.size > 0 && Date.now() - startTime < timeout) {
      console.log(`Waiting for ${runningTasks.size} tasks to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (runningTasks.size > 0) {
      console.warn(`Shutdown timeout: ${runningTasks.size} tasks still running`);
    }

    tasks.clear();
    console.log('✅ Housekeeper shutdown complete');
  }

  return {
    initialize,
    shutdown,
    registerTask,
    unregisterTask,
    runTaskManually,
    getTaskStatus,
    listTasks
  };
}

export type Housekeeper = ReturnType<typeof createHousekeeper>;
