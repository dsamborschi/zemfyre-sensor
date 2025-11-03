# Housekeeping Tasks - Overview

The API includes an automated **Housekeeper** service that runs scheduled maintenance tasks to keep the system healthy and performant.

## 📋 Active Tasks

### 1. Events Partition Maintenance
**File**: `events-partition-maintenance.ts`  
**Schedule**: Daily at 2am + on startup  
**Purpose**: Ensures events table partitions exist and cleans up old data

**What it does**:
- Creates partitions for the next 30 days
- Drops partitions older than retention period (default: 90 days)
- Reports statistics on event distribution and partition status

**Configuration**:
```bash
EVENTS_RETENTION_DAYS=90  # How long to keep events (default: 90 days)
```

**Documentation**: [EVENT-PARTITION-MAINTENANCE.md](./EVENT-PARTITION-MAINTENANCE.md)

---

### 2. Device Logs Partition Maintenance
**File**: `device-logs-partition-maintenance.ts`  
**Schedule**: Monthly (1st of month at 1am) + on startup  
**Purpose**: Maintains device_logs table partitions

**What it does**:
- Creates next 3 months of partitions
- Shows partition statistics

---

### 3. Device Logs Retention
**File**: `device-logs-retention.ts`  
**Schedule**: Weekly (Sunday at 3am)  
**Purpose**: Cleans up old device logs according to retention policy

---

### 4. Database Vacuum
**File**: `database-vacuum.ts`  
**Schedule**: Weekly (Sunday at 4am)  
**Purpose**: Reclaims storage and updates statistics

**What it does**:
- Runs VACUUM ANALYZE on all tables
- Reports space reclaimed and performance improvements

---

### 5. Cleanup Old Logs
**File**: `cleanup-old-logs.ts`  
**Schedule**: Daily at 5am  
**Purpose**: Removes old application log files

---

## 🎯 Task Execution

### Automatic (Scheduled)
Tasks run automatically based on their cron schedules. All executions are logged to the `housekeeper_runs` table.

### Manual Execution
You can trigger any task manually:

```bash
# Via API
curl -X POST http://localhost:3002/api/admin/housekeeper/tasks/<task-name>/run

# Examples:
curl -X POST http://localhost:3002/api/admin/housekeeper/tasks/events-partition-maintenance/run
curl -X POST http://localhost:3002/api/admin/housekeeper/tasks/database-vacuum/run
```

### Startup Behavior
Some tasks run on API startup to ensure critical maintenance is performed immediately:
- `events-partition-maintenance` - Ensures event partitions exist
- `device-logs-partition-maintenance` - Ensures device log partitions exist

---

## 📊 Monitoring

### View Task Status
```bash
# List all tasks
curl http://localhost:3002/api/admin/housekeeper/tasks

# Get specific task status
curl http://localhost:3002/api/admin/housekeeper/tasks/events-partition-maintenance
```

### View Execution History
```sql
-- All task executions (last 50)
SELECT 
  task_name,
  started_at,
  completed_at,
  duration_ms,
  status,
  triggered_by
FROM housekeeper_runs
ORDER BY started_at DESC
LIMIT 50;

-- Failed executions
SELECT * FROM housekeeper_runs
WHERE status = 'error'
ORDER BY started_at DESC;

-- Average duration per task
SELECT 
  task_name,
  COUNT(*) as runs,
  AVG(duration_ms) as avg_duration_ms,
  MAX(duration_ms) as max_duration_ms,
  COUNT(*) FILTER (WHERE status = 'error') as errors
FROM housekeeper_runs
GROUP BY task_name
ORDER BY task_name;
```

### Logs
Task output is captured and stored in the `output` field of `housekeeper_runs` table:

```sql
-- View output of last execution
SELECT task_name, started_at, status, output
FROM housekeeper_runs
WHERE task_name = 'events-partition-maintenance'
ORDER BY started_at DESC
LIMIT 1;
```

---

## 🔧 Configuration

### Environment Variables

```bash
# Housekeeper
HOUSEKEEPER_ENABLED=true          # Enable/disable all tasks (default: true)
HOUSEKEEPER_TIMEZONE=Etc/UTC      # Timezone for cron schedules (default: UTC)

# Events Partition Maintenance
EVENTS_RETENTION_DAYS=90          # Event retention period in days (default: 90)
```

### Enable/Disable Tasks

Tasks can be enabled/disabled individually:

```bash
# Disable a task
curl -X POST http://localhost:3002/api/admin/housekeeper/tasks/events-partition-maintenance/disable

# Enable a task
curl -X POST http://localhost:3002/api/admin/housekeeper/tasks/events-partition-maintenance/enable
```

---

## 🏗️ Adding New Tasks

To add a new housekeeping task:

1. **Create task file** in `api/src/housekeeper/tasks/`:

```typescript
import { HousekeeperTask } from '../index';
import { pool } from '../../db/connection';

const task: HousekeeperTask = {
  name: 'my-new-task',
  schedule: '0 3 * * *',  // Daily at 3am
  startup: false,          // Don't run on startup
  
  run: async () => {
    console.log('🧹 Running my new task...');
    
    // Your maintenance logic here
    
    console.log('✅ Task completed');
  }
};

export default task;
```

2. **Register task** in `api/src/housekeeper/index.ts`:

```typescript
const tasksToRegister = [
  await import('./tasks/cleanup-old-logs'),
  await import('./tasks/database-vacuum'),
  await import('./tasks/device-logs-retention'),
  await import('./tasks/device-logs-partition-maintenance'),
  await import('./tasks/events-partition-maintenance'),
  await import('./tasks/my-new-task'),  // Add here
];
```

3. **Test task**:

```bash
# Restart API to load new task
npm run dev

# Run manually to test
curl -X POST http://localhost:3002/api/admin/housekeeper/tasks/my-new-task/run
```

---

## 📅 Cron Schedule Examples

```bash
# Every minute
'* * * * *'

# Every hour at minute 0
'0 * * * *'

# Daily at 2am
'0 2 * * *'

# Weekly on Sunday at 3am
'0 3 * * 0'

# Monthly on 1st at 1am
'0 1 1 * *'

# Every 6 hours
'0 */6 * * *'

# Weekdays at 9am
'0 9 * * 1-5'
```

---

## 🚨 Troubleshooting

### Task Not Running

1. **Check if housekeeper is enabled**:
```bash
# Should show enabled: true
curl http://localhost:3002/api/admin/housekeeper/status
```

2. **Check task registration**:
```bash
# Task should appear in list
curl http://localhost:3002/api/admin/housekeeper/tasks
```

3. **Check execution history**:
```sql
SELECT * FROM housekeeper_runs 
WHERE task_name = 'events-partition-maintenance'
ORDER BY started_at DESC 
LIMIT 5;
```

### Task Failing

1. **View error details**:
```sql
SELECT task_name, started_at, error, output
FROM housekeeper_runs
WHERE status = 'error'
ORDER BY started_at DESC;
```

2. **Run manually with logs**:
```bash
# Watch API logs while running
curl -X POST http://localhost:3002/api/admin/housekeeper/tasks/events-partition-maintenance/run
```

### Task Running Too Long

1. **Check for concurrent runs**:
```sql
SELECT task_name, started_at, status
FROM housekeeper_runs
WHERE status = 'running'
AND started_at < NOW() - INTERVAL '1 hour';
```

2. **Tasks are prevented from running concurrently** - if a task is already running, subsequent attempts will be skipped.

---

## 📚 Related Documentation

- [Event Partition Maintenance](./EVENT-PARTITION-MAINTENANCE.md) - Detailed guide for events partitioning
- [Housekeeper Index](../../api/src/housekeeper/index.ts) - Main housekeeper implementation
- [Task Examples](../../api/src/housekeeper/tasks/) - All task implementations

---

## 🎓 Best Practices

1. **Idempotent Operations**: Tasks should be safe to run multiple times
2. **Error Handling**: Always catch and log errors properly
3. **Progress Logging**: Use console.log to track progress (captured in `output`)
4. **Time Limits**: Keep tasks under 5 minutes when possible
5. **Resource Usage**: Be mindful of database load during peak hours
6. **Testing**: Always test manually before relying on schedule
7. **Monitoring**: Check `housekeeper_runs` table regularly for failures

---

**Last Updated**: 2025-11-02  
**Maintainer**: DevOps Team
