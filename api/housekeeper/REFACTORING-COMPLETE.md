# Housekeeper Refactoring - Complete

## ✅ What Was Done

Refactored the `api/housekeeper` folder from JavaScript to TypeScript, combining:
- **Original housekeeper** (JavaScript cron-based scheduler)
- **Agent job engine patterns** (TypeScript, structured, testable)

---

## 📁 New File Structure

```
api/housekeeper/
├── index.ts                          # Main housekeeper (TypeScript, ~350 lines)
├── README.md                         # Complete documentation
├── tasks/
│   ├── cleanup-expired-tokens.ts     # Remove expired tokens & OAuth sessions
│   ├── cleanup-old-logs.ts           # Delete old log files
│   └── database-vacuum.ts            # PostgreSQL VACUUM / MongoDB compact
└── (old files can be deleted)
    ├── index.js                      # Old JavaScript version
    ├── utils.js                      # Old utilities
    └── tasks/expireTokens.js         # Old task format
```

---

## 🆕 New Features

### 1. **TypeScript with Full Type Safety**
```typescript
export interface HousekeeperTask {
  name: string;
  schedule?: string;           // Cron expression
  startup?: boolean | number;  // Run on startup or delayed
  run: (app: any) => Promise<void>;
}
```

### 2. **Enhanced Task Management**
- `listTasks()` - View all registered tasks
- `getTaskStatus(name)` - Check if task is running/scheduled
- `runTaskManually(name)` - Trigger tasks on-demand
- `registerTask()` - Dynamic registration
- `unregisterTask()` - Remove tasks at runtime

### 3. **Concurrent Protection**
- Prevents same task from running multiple times simultaneously
- Tracks running tasks with `Set<string>`

### 4. **Graceful Shutdown**
- Stops all scheduled jobs
- Waits for running tasks to complete (30s timeout)
- Clears delayed startup tasks

### 5. **Better Logging**
- Structured console logs with emojis (🧹 ✅ ❌)
- Task duration tracking
- Error stack traces

### 6. **Sentry Integration** (Optional)
- Reports task start/completion
- Tracks failures and duration
- Creates Cron Monitors automatically

---

## 🔄 Changes from Original

| Aspect | Old (JS) | New (TS) |
|--------|----------|----------|
| Language | JavaScript | TypeScript |
| Cron Library | `cronosjs` | `cron` |
| Task Format | `module.exports = { ... }` | `export default task: HousekeeperTask` |
| Registration | `require()` | `await import()` + `.default` |
| Type Safety | None | Full TypeScript types |
| Task Control | Start/stop only | Start/stop/manual trigger/status |
| Shutdown | Basic | Graceful with timeout |

---

## 📦 Dependencies

Add to `api/package.json`:
```json
{
  "dependencies": {
    "cron": "^3.1.6"
  },
  "devDependencies": {
    "@types/cron": "^2.0.1"
  }
}
```

Optional for Sentry:
```json
{
  "dependencies": {
    "@sentry/node": "^7.0.0"
  }
}
```

---

## 🚀 Usage

### Initialize in Application

```typescript
import { createHousekeeper } from './housekeeper';

const app = {
  config: { /* your config */ },
  db: { /* database connection */ },
  models: { /* models */ }
};

const housekeeper = createHousekeeper(app, {
  enabled: true,
  sentryEnabled: false,
  timezone: 'America/New_York'
});

await housekeeper.initialize();

// On shutdown
process.on('SIGTERM', async () => {
  await housekeeper.shutdown();
  process.exit(0);
});
```

### Add API Endpoints (Optional)

```typescript
// List all tasks
app.get('/api/housekeeper/tasks', (req, res) => {
  res.json({ tasks: housekeeper.listTasks() });
});

// Trigger task manually
app.post('/api/housekeeper/tasks/:name/run', async (req, res) => {
  await housekeeper.runTaskManually(req.params.name);
  res.json({ success: true });
});

// Check task status
app.get('/api/housekeeper/tasks/:name/status', (req, res) => {
  res.json(housekeeper.getTaskStatus(req.params.name));
});
```

---

## 📝 Built-in Tasks

### cleanup-expired-tokens
- **Schedule**: Random 2-3am daily
- **Startup**: Yes (runs on startup)
- **Purpose**: Remove expired access tokens and abandoned OAuth sessions

### cleanup-old-logs
- **Schedule**: 3am daily
- **Purpose**: Delete log files older than 30 days (configurable)

### database-vacuum
- **Schedule**: 4am every Sunday
- **Purpose**: Run database maintenance (VACUUM for PostgreSQL, compact for MongoDB)

---

## 🔧 Creating New Tasks

1. Create file in `tasks/`:

```typescript
// tasks/my-custom-task.ts
import { HousekeeperTask } from '../index';

const task: HousekeeperTask = {
  name: 'my-custom-task',
  schedule: '0 4 * * *', // 4am daily
  startup: false,
  
  run: async (app) => {
    console.log('Running my custom task...');
    // Do work here
  }
};

export default task;
```

2. Register in `index.ts::initialize()`:

```typescript
const tasksToRegister = [
  await import('./tasks/cleanup-expired-tokens'),
  await import('./tasks/cleanup-old-logs'),
  await import('./tasks/database-vacuum'),
  await import('./tasks/my-custom-task'), // <-- Add here
];
```

---

## 🔄 Migration from Old Code

### Old JavaScript Task

```javascript
// tasks/expireTokens.js
module.exports = {
  name: 'expireTokens',
  startup: true,
  schedule: `30 2 * * *`,
  run: async function() {
    // Task code
  }
}
```

### New TypeScript Task

```typescript
// tasks/cleanup-expired-tokens.ts
import { HousekeeperTask } from '../index';

const task: HousekeeperTask = {
  name: 'cleanup-expired-tokens',
  startup: true,
  schedule: '30 2 * * *',
  run: async (app) => {
    // Task code
  }
};

export default task;
```

**Key Changes**:
- Import `HousekeeperTask` type
- Change `function()` to arrow function `(app) =>`
- Use `export default` instead of `module.exports`

---

## 🎯 Benefits

1. **Type Safety**: Catch errors at compile time
2. **Better IDE Support**: Autocomplete, refactoring, inline docs
3. **Consistent with Agent**: Same patterns as `agent/src/jobs`
4. **Modern Syntax**: async/await, ES modules
5. **Testable**: Easy to mock and test tasks
6. **Maintainable**: Clear structure, documented
7. **Extensible**: Easy to add new tasks

---

## 🧪 Testing

```typescript
import task from './tasks/cleanup-expired-tokens';

const mockApp = {
  models: {
    AccessToken: {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 5 })
    },
    OAuthSession: {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 })
    }
  }
};

await task.run(mockApp);

expect(mockApp.models.AccessToken.deleteMany).toHaveBeenCalled();
expect(mockApp.models.OAuthSession.deleteMany).toHaveBeenCalled();
```

---

## 🗑️ Old Files to Remove

Once tested and deployed:

```bash
cd api/housekeeper
rm index.js utils.js
rm -rf tasks/expireTokens.js tasks/telemetryMetrics/
```

---

## 📊 Comparison: Housekeeper vs Agent Jobs

Both systems serve different purposes:

| Feature | Housekeeper (API) | Jobs (Agent) |
|---------|-------------------|--------------|
| **Location** | API server | Device/agent |
| **Purpose** | Server maintenance | Device operations |
| **Trigger** | Cron schedules | MQTT/Cloud |
| **Execution** | Async functions | Shell scripts |
| **Examples** | DB cleanup, log rotation | OTA updates, config changes |
| **Control** | Local scheduler | Remote commands |

**Both can coexist**: Housekeeper handles API maintenance, Jobs handle device operations.

---

## ✅ Next Steps

1. **Install dependencies**:
   ```bash
   cd api
   npm install cron
   npm install --save-dev @types/cron
   ```

2. **Test locally**:
   ```typescript
   const housekeeper = createHousekeeper(app);
   await housekeeper.initialize();
   await housekeeper.runTaskManually('cleanup-expired-tokens');
   ```

3. **Integrate into application**:
   - Add to `api/src/index.ts` or main entry point
   - Call `initialize()` on startup
   - Call `shutdown()` on SIGTERM

4. **Optional**: Add API endpoints for manual control

5. **Remove old files** after confirming everything works

---

## 📚 Documentation

See `api/housekeeper/README.md` for complete guide including:
- Cron syntax reference
- Advanced features
- API integration
- Troubleshooting
- Best practices
