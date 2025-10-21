# Housekeeper - Task Scheduler & Executor

Unified task scheduling system that combines cron-based scheduling with job engine patterns.

## Features

- ✅ **Cron Scheduling** - Schedule tasks with cron expressions
- ✅ **Startup Tasks** - Run tasks immediately on startup or with delay
- ✅ **Manual Execution** - Trigger tasks on-demand via API
- ✅ **Monitoring Integration** - Optional Sentry monitoring
- ✅ **Concurrent Protection** - Prevent multiple runs of same task
- ✅ **Graceful Shutdown** - Wait for running tasks before shutdown
- ✅ **TypeScript** - Full type safety and IDE support

## Installation

```bash
npm install cron
npm install --save-dev @types/cron
```

Optional (for monitoring):
```bash
npm install @sentry/node
```

## Usage

### Initialize Housekeeper

```typescript
import { createHousekeeper } from './housekeeper';

const housekeeper = createHousekeeper({
  enabled: true,
  sentryEnabled: false,
  timezone: 'America/New_York'
});

await housekeeper.initialize();
```

### Create a Task

Tasks import dependencies directly (no `app` parameter needed):

```typescript
// housekeeper/tasks/my-task.ts
import { HousekeeperTask } from '../index';
import { query } from '../../src/db/connection';

const task: HousekeeperTask = {
  name: 'my-task',
  schedule: '0 2 * * *', // 2am daily
  startup: false, // Don't run on startup
  
  run: async () => {
    console.log('Running my task...');
    
    // Access database directly
    const result = await query('SELECT * FROM my_table');
    
    // Use environment variables for config
    const myConfig = process.env.MY_CONFIG || 'default';
  }
};

export default task;
```

### Register Tasks

Tasks are auto-registered in `initialize()`. To add a new task:

1. Create task file in `tasks/`
2. Add import in `index.ts::initialize()`:

```typescript
const tasksToRegister = [
  await import('./tasks/cleanup-expired-tokens'),
  await import('./tasks/cleanup-old-logs'),
  await import('./tasks/database-vacuum'),
  await import('./tasks/my-task'), // <-- Add here
];
```

### Run Task Manually

```typescript
// Trigger task on-demand
await housekeeper.runTaskManually('cleanup-expired-tokens');
```

### Check Task Status

```typescript
const status = housekeeper.getTaskStatus('cleanup-expired-tokens');
console.log(status);
// {
//   registered: true,
//   running: false,
//   scheduled: true
// }
```

### List All Tasks

```typescript
const tasks = housekeeper.listTasks();
console.log(tasks);
// [
//   { name: 'cleanup-expired-tokens', schedule: '30 2 * * *', running: false, scheduled: true },
//   { name: 'cleanup-old-logs', schedule: '0 3 * * *', running: false, scheduled: true },
//   ...
// ]
```

## Built-in Tasks

### cleanup-expired-tokens

- **Schedule**: Random time between 2-3am daily
- **Startup**: Runs on startup
- **Purpose**: Remove expired access tokens and abandoned OAuth sessions
- **Database**: Deletes from `access_tokens` and `oauth_sessions` tables

### cleanup-old-logs

- **Schedule**: 3am daily
- **Purpose**: Delete log files older than retention period
- **Environment Variables**:
  - `LOG_DIRECTORY` - Log directory path (default: `./logs`)
  - `LOG_RETENTION_DAYS` - Days to keep logs (default: `30`)

### database-vacuum

- **Schedule**: 4am every Sunday
- **Purpose**: Run PostgreSQL VACUUM ANALYZE for database maintenance
- **Database**: PostgreSQL only

## Cron Syntax

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

Examples:
- `0 2 * * *` - 2am every day
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Midnight every Sunday
- `30 3 1 * *` - 3:30am on 1st of every month

## Configuration

```typescript
const housekeeper = createHousekeeper(app, {
  enabled: true,              // Enable/disable all tasks
  sentryEnabled: false,       // Enable Sentry monitoring
  timezone: 'America/New_York' // Timezone for cron schedules
});
```

## API Integration

Add REST endpoints to control housekeeper:

```typescript
// GET /api/housekeeper/tasks
app.get('/api/housekeeper/tasks', (req, res) => {
  res.json({ tasks: housekeeper.listTasks() });
});

// POST /api/housekeeper/tasks/:name/run
app.post('/api/housekeeper/tasks/:name/run', async (req, res) => {
  try {
    await housekeeper.runTaskManually(req.params.name);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/housekeeper/tasks/:name/status
app.get('/api/housekeeper/tasks/:name/status', (req, res) => {
  const status = housekeeper.getTaskStatus(req.params.name);
  res.json(status);
});
```

## Monitoring with Sentry

Enable Sentry monitoring to track task execution:

```typescript
const housekeeper = createHousekeeper(app, {
  sentryEnabled: true
});
```

This will:
- Report task start/completion to Sentry
- Track task duration and failures
- Create Sentry Cron Monitors automatically
- Send alerts on task failures

## Graceful Shutdown

```typescript
// On application shutdown
process.on('SIGTERM', async () => {
  await housekeeper.shutdown();
  // Waits up to 30 seconds for running tasks to complete
  process.exit(0);
});
```

## Comparison with Agent Jobs

| Feature | Housekeeper (API) | Jobs (Agent) |
|---------|-------------------|--------------|
| **Purpose** | Scheduled maintenance | Remote job execution |
| **Trigger** | Cron schedule | MQTT/Cloud |
| **Execution** | Local async functions | Shell scripts |
| **Use Case** | Database cleanup, log rotation | OTA updates, config changes |
| **Examples** | Delete expired tokens | Run system commands |

Both systems can coexist:
- **Housekeeper**: Background maintenance (this runs in API)
- **Jobs**: Remote control & updates (runs on agent/device)

## Migration from Original

If migrating from `housekeeper/index.js`:

**Old (JavaScript)**:
```javascript
module.exports = {
  name: 'myTask',
  schedule: '0 2 * * *',
  run: async function() { /* ... */ }
}
```

**New (TypeScript)**:
```typescript
import { HousekeeperTask } from '../index';

const task: HousekeeperTask = {
  name: 'myTask',
  schedule: '0 2 * * *',
  run: async (app) => { /* ... */ }
};

export default task;
```

## Advanced: Dynamic Task Registration

Register tasks at runtime:

```typescript
await housekeeper.registerTask({
  name: 'dynamic-task',
  schedule: '*/5 * * * *', // Every 5 minutes
  run: async (app) => {
    console.log('Dynamic task running');
  }
});
```

Remove tasks:

```typescript
housekeeper.unregisterTask('dynamic-task');
```

## Testing

Test task execution:

```typescript
import task from './tasks/cleanup-expired-tokens';

const mockApp = {
  models: {
    AccessToken: { deleteMany: jest.fn() },
    OAuthSession: { deleteMany: jest.fn() }
  }
};

await task.run(mockApp);

expect(mockApp.models.AccessToken.deleteMany).toHaveBeenCalledWith({
  expiresAt: expect.any(Object)
});
```

## Best Practices

1. **Idempotency**: Tasks should be safe to run multiple times
2. **Error Handling**: Always throw errors for monitoring
3. **Logging**: Use descriptive console logs for debugging
4. **Resource Limits**: Don't run heavy tasks during peak hours
5. **Random Schedules**: Use random minutes/hours to avoid clustering
6. **Timeout Protection**: Tasks should complete quickly (<5 minutes)
7. **Database Locks**: Be careful with long-running database operations

## Troubleshooting

**Task not running**:
- Check `housekeeper.listTasks()` - is it registered?
- Check cron syntax with [crontab.guru](https://crontab.guru/)
- Ensure `enabled: true` in config
- Check timezone matches your expectation

**Multiple instances**:
- Use random schedules to avoid simultaneous execution
- Consider distributed locking for critical tasks

**Long-running tasks**:
- Increase shutdown timeout in `shutdown()` method
- Split into smaller sub-tasks
- Use background workers for heavy operations
