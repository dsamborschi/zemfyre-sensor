# Event Partition Maintenance - Housekeeping Task

**Status**: ✅ IMPLEMENTED - Scheduled Task Active  
**Priority**: HIGH  
**Category**: Database Maintenance  
**Created**: 2025-11-02  
**Implementation**: Housekeeper Task (runs daily at 2am + on startup)
**Estimated Effort**: ~~30 minutes setup~~ COMPLETE + ongoing automation

---

## ✅ Implementation Status

**IMPLEMENTED** as a housekeeper scheduled task:
- **File**: `api/src/housekeeper/tasks/events-partition-maintenance.ts`
- **Schedule**: Daily at 2am (`0 2 * * *`)
- **Startup**: Also runs on API startup for immediate partition creation
- **Retention**: 90 days (configurable via `EVENTS_RETENTION_DAYS` env var)
- **Monitoring**: Tracked in `housekeeper_runs` table with execution logs

---

## Problem Statement

The PostgreSQL `events` table is partitioned by **daily ranges** for performance and data retention management. The migration (`006_add_event_sourcing.sql`) creates partitions for -30 to +7 days from migration date.

**Current Issue**: When partition for current date is missing, all event inserts fail with:
```
no partition of relation "events" found for row
```

This **blocks all dashboard configuration updates** because target state changes are logged to the events table via event sourcing.

---

## Root Cause

1. Migration creates partitions only once during initial setup
2. No automated partition creation for future dates
3. No partition maintenance/cleanup for old partitions
4. Database was migrated days/weeks ago - partitions for current date no longer exist

---

## Solution

### Immediate Fix (Today)

Run the partition creation script to restore missing partitions:

```powershell
# From api directory
cd c:\Users\Dan\zemfyre-sensor\api
ts-node scripts/create-missing-event-partitions.ts
```

This creates partitions for **-30 to +30 days** from today.

**Expected Output**:
```
✅ CREATED: events_2025_11_02
✅ CREATED: events_2025_11_03
... (up to 60 partitions)
✅ Test event created: <uuid>
```

### Verify Fix

```powershell
# Check partition status
ts-node scripts/check-event-partitions.ts
```

Should show:
- ✅ Today's partition EXISTS
- 30+ days of future partitions available

### Test Dashboard Update

After running fix:
1. Open dashboard at http://localhost:5173
2. Navigate to Sensors page
3. Edit a sensor configuration
4. Click Save
5. Should succeed without partition error

---

## Long-Term Solution (Required)

### Option 1: Cron Job (Recommended for Production)

Add to system crontab (Linux/macOS) or Task Scheduler (Windows):

```bash
# Daily at 2 AM - Create future partitions and drop old ones
0 2 * * * cd /app/api && npm run maintain-partitions
```

**Windows Task Scheduler**:
- **Trigger**: Daily at 2:00 AM
- **Action**: Start Program
  - Program: `C:\Program Files\nodejs\node.exe`
  - Arguments: `--require ts-node/register scripts/maintain-event-partitions.ts`
  - Start in: `C:\Users\Dan\zemfyre-sensor\api`

### Option 2: Application-Level Cron (Kubernetes)

Add to API deployment's cron jobs:

```yaml
# charts/customer-instance/templates/api-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ include "customer-instance.fullname" . }}-partition-maintenance
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: partition-maintenance
            image: {{ .Values.api.image.repository }}:{{ .Values.api.image.tag }}
            command:
            - node
            - --require
            - ts-node/register
            - scripts/maintain-event-partitions.ts
            env:
            - name: DB_HOST
              value: {{ include "customer-instance.fullname" . }}-postgres
            - name: DB_NAME
              value: {{ .Values.postgres.database }}
            # ... other DB env vars
          restartPolicy: OnFailure
```

### Option 3: Node-Cron in API Service

Add to `api/src/index.ts`:

```typescript
import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Run partition maintenance daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('🔧 Running partition maintenance...');
  try {
    const { stdout } = await execAsync('ts-node scripts/maintain-event-partitions.ts');
    console.log(stdout);
  } catch (error) {
    console.error('❌ Partition maintenance failed:', error);
  }
});
```

---

## Monitoring

### Check Partition Status

```powershell
# Quick status check
cd api && ts-node scripts/check-event-partitions.ts
```

**Warning Signs**:
- ⚠️ Less than 7 days of future partitions remaining
- ❌ Today's partition missing
- 📊 Partition count decreasing over time

### Partition Statistics

```sql
-- List all event partitions with date ranges
SELECT 
  tablename,
  TO_DATE(SUBSTRING(tablename FROM 'events_(.*)'), 'YYYY_MM_DD') as partition_date
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE 'events_%'
ORDER BY partition_date DESC
LIMIT 20;

-- Count events per partition
SELECT 
  tableoid::regclass AS partition,
  COUNT(*) as event_count,
  MIN(timestamp) as oldest_event,
  MAX(timestamp) as newest_event
FROM events
GROUP BY tableoid
ORDER BY partition DESC;
```

### Grafana Dashboard (Optional)

Create alerts for:
- Days until newest partition < 7
- Missing partition for today
- Event insert errors (partition not found)

---

## Scripts Reference

### Created Scripts

All scripts in `api/scripts/`:

1. **check-event-partitions.ts**
   - Quick diagnostic tool
   - Shows today's partition status
   - Lists most recent partitions
   - Warns if future partitions running low

2. **create-missing-event-partitions.ts**
   - Creates partitions for -30 to +30 days
   - One-time fix for missing partitions
   - Includes test insert to verify

3. **maintain-event-partitions.ts**
   - Creates future partitions (next 30 days)
   - Drops old partitions (retention period: 90 days default)
   - Shows statistics
   - Safe to run daily via cron

### NPM Scripts (TODO)

Add to `api/package.json`:

```json
{
  "scripts": {
    "check-partitions": "ts-node scripts/check-event-partitions.ts",
    "fix-partitions": "ts-node scripts/create-missing-event-partitions.ts",
    "maintain-partitions": "ts-node scripts/maintain-event-partitions.ts"
  }
}
```

---

## Retention Policy

**Current Default**: 90 days

**Adjusting Retention**:

```powershell
# Keep events for 180 days
ts-node scripts/maintain-event-partitions.ts --retention-days=180

# Keep events for 30 days (aggressive cleanup)
ts-node scripts/maintain-event-partitions.ts --retention-days=30
```

**Storage Considerations**:
- Each partition = ~1 day of events
- High-traffic systems: ~100MB-1GB per partition
- Low-traffic systems: ~1-10MB per partition

---

## Testing

### Test Partition Creation

```powershell
# Check current state
ts-node scripts/check-event-partitions.ts

# Create missing partitions
ts-node scripts/create-missing-event-partitions.ts

# Verify creation
ts-node scripts/check-event-partitions.ts

# Should see: "✅ Today's partition EXISTS"
```

### Test Event Insert

```powershell
# Try dashboard sensor update (should succeed)
# OR test via API:
curl -X PUT http://localhost:3002/api/v1/devices/<uuid>/target-state \
  -H "Content-Type: application/json" \
  -d '{"config": {"sensors": [...]}}'
```

### Test Maintenance Script

```powershell
# Run maintenance (safe - won't drop recent partitions)
ts-node scripts/maintain-event-partitions.ts

# Check output for:
# - Partitions created
# - Partitions dropped (if any old ones)
# - Statistics
```

---

## Rollback

If event sourcing causes issues:

### Disable Event Publishing

Edit `api/src/config/event-sourcing.ts`:

```typescript
export default {
  // Disable all event publishing
  enabledEventTypes: [],
  
  // OR disable specific types
  enabledEventTypes: [
    // 'target_state.updated',  // DISABLED
    'device.provisioned',
    'device.online',
    // ...
  ]
};
```

### Alternative: Skip Partition Check

**NOT RECOMMENDED** - but if desperate:

```typescript
// In publish_event() function (database migration)
// Add IF NOT EXISTS before partition creation
```

---

## Documentation

- **Event Sourcing Migration**: `api/database/migrations/006_add_event_sourcing.sql`
- **Event Service**: `api/src/services/event-sourcing.ts`
- **Partition Functions**: PostgreSQL stored procedures in migration
- **Scripts**: `api/scripts/check-event-partitions.ts`, etc.

---

## Action Items

- [x] **IMMEDIATE**: ~~Run `create-missing-event-partitions.ts` to restore partitions~~ **IMPLEMENTED as housekeeper task (runs on startup)**
- [x] **HIGH**: ~~Add npm scripts to `api/package.json`~~ **COMPLETE** (check-partitions, fix-partitions, maintain-partitions)
- [x] **HIGH**: ~~Set up daily cron job for `maintain-event-partitions.ts`~~ **IMPLEMENTED as housekeeper scheduled task**
- [ ] **MEDIUM**: Add partition monitoring to Grafana
- [ ] **MEDIUM**: Document in API README
- [ ] **LOW**: Add partition status to API health check endpoint
- [ ] **LOW**: Create alerts for low partition count

### ✅ Completed (Housekeeper Integration)

The partition maintenance is now fully automated via the housekeeper service:

1. **Task File**: `api/src/housekeeper/tasks/events-partition-maintenance.ts`
2. **Schedule**: Daily at 2am UTC (`0 2 * * *`)
3. **Startup Behavior**: Runs immediately on API startup to ensure partitions exist
4. **Retention**: 90 days (configurable via `EVENTS_RETENTION_DAYS` environment variable)
5. **Monitoring**: All executions logged to `housekeeper_runs` table
6. **Manual Execution**: Can be triggered via housekeeper API or dashboard

### How to Use

**Check Task Status**:
```bash
# Via API
curl http://localhost:3002/api/admin/housekeeper/tasks

# Look for "events-partition-maintenance" task
```

**Run Task Manually** (if needed):
```bash
# Via API
curl -X POST http://localhost:3002/api/admin/housekeeper/tasks/events-partition-maintenance/run

# Or via housekeeper dashboard (if available)
```

**Check Execution History**:
```sql
-- View last 10 executions
SELECT * FROM housekeeper_runs 
WHERE task_name = 'events-partition-maintenance'
ORDER BY started_at DESC 
LIMIT 10;
```

**Adjust Retention Period**:
```bash
# Set environment variable (default is 90 days)
EVENTS_RETENTION_DAYS=180  # Keep events for 180 days
```

---

## Related Issues

- Dashboard sensor updates failing with partition error ✅ FIXED
- Event sourcing implemented but no partition maintenance ⚠️ IN PROGRESS
- Need automated partition lifecycle management 🔄 SOLUTION AVAILABLE

---

## Maintenance Schedule

| Task | Frequency | Script | Retention |
|------|-----------|--------|-----------|
| Create future partitions | Daily | `maintain-event-partitions.ts` | +30 days |
| Drop old partitions | Daily | `maintain-event-partitions.ts` | 90 days |
| Check partition status | Weekly | `check-event-partitions.ts` | N/A |
| Emergency partition creation | As needed | `create-missing-event-partitions.ts` | ±30 days |

---

## Success Criteria

✅ **Immediate** (Within 1 hour):
- Today's partition exists
- Dashboard sensor updates work
- No partition errors in logs

✅ **Short-term** (Within 1 week):
- Cron job scheduled and running
- NPM scripts added to package.json
- Team trained on partition management

✅ **Long-term** (Ongoing):
- Automated partition creation (30+ days ahead)
- Automated cleanup (90 day retention)
- Monitoring/alerts in place
- Zero partition-related downtime
