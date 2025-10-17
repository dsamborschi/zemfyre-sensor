# Device Metrics Partitioning - Implementation Complete ✅

## Summary

The `device_metrics` table has been successfully converted to use **PostgreSQL table partitioning** with automatic retention management. This provides production-grade time-series data management with minimal overhead and instant cleanup.

## What Was Implemented

### 1. Partitioned Table Structure
- **Partitioning Strategy**: RANGE partitioning by `recorded_at` (date)
- **Partition Size**: One partition per day
- **Naming**: `device_metrics_YYYY_MM_DD` (e.g., `device_metrics_2025_10_17`)
- **Current Partitions**: 38 (30 days historical + 7 days future + today)

### 2. Management Functions
Created 4 PostgreSQL functions for partition lifecycle:

- `create_device_metrics_partition(date)` - Create partition for specific date
- `create_device_metrics_partitions_range(start, end)` - Create partition range
- `drop_old_device_metrics_partitions(retention_days)` - Remove old partitions
- `get_device_metrics_partition_stats()` - Query partition info

### 3. Maintenance Script
**Location**: `scripts/maintain-metrics-partitions.ts`

**Features**:
- ✅ Create future partitions automatically
- ✅ Drop old partitions based on retention policy
- ✅ View partition statistics and health
- ✅ Dry-run mode for safe testing
- ✅ Comprehensive error handling and logging

## Current State

**Migration Status**: ✅ Complete

**Data Verification**:
```
📊 Total rows: 253
📅 Date range: Oct 14-17, 2025 (4 days)
📦 Partitions: 38 total, 4 with data
🔢 Sequence: public.device_metrics_id_seq1 (last value: 260)
```

**Partitions with Data**:
| Partition | Date | Rows | Size |
|-----------|------|------|------|
| device_metrics_2025_10_17 | 2025-10-17 | 23 | 48 kB |
| device_metrics_2025_10_16 | 2025-10-16 | 111 | 80 kB |
| device_metrics_2025_10_15 | 2025-10-15 | 100 | 80 kB |
| device_metrics_2025_10_14 | 2025-10-14 | 19 | 48 kB |

## Usage

### View Partition Statistics
```bash
npx ts-node scripts/maintain-metrics-partitions.ts --stats
```

Shows all partitions with row counts and sizes.

### Check Partition Health
```bash
npx ts-node scripts/maintain-metrics-partitions.ts --health
```

Checks for:
- ✅ Partition gaps (missing days)
- 📅 Future partition coverage
- 📊 Overall statistics

### Test Cleanup (Dry Run)
```bash
npx ts-node scripts/maintain-metrics-partitions.ts --retention=30 --dry-run
```

Shows what would be deleted without actually deleting.

### Run Full Maintenance
```bash
npx ts-node scripts/maintain-metrics-partitions.ts --retention=30 --create-future=7
```

Performs:
1. Creates partitions for next 7 days
2. Drops partitions older than 30 days
3. Displays statistics

### Custom Retention
```bash
# Keep only 7 days
npx ts-node scripts/maintain-metrics-partitions.ts --retention=7

# Keep 90 days
npx ts-node scripts/maintain-metrics-partitions.ts --retention=90
```

## Automated Maintenance

### Option 1: Cron Job (Linux)
Add to crontab to run daily at 2 AM:

```bash
crontab -e
```

Add line:
```
0 2 * * * cd /path/to/api && npx ts-node scripts/maintain-metrics-partitions.ts --retention=30 >> /var/log/metrics-maintenance.log 2>&1
```

### Option 2: Task Scheduler (Windows)
1. Open Task Scheduler
2. Create Basic Task
3. Trigger: Daily at 2:00 AM
4. Action: Start a program
   - Program: `npx`
   - Arguments: `ts-node scripts/maintain-metrics-partitions.ts --retention=30`
   - Start in: `C:\Users\Dan\zemfyre-sensor\api`

### Option 3: Docker Container Health Check
Add to docker-compose.yml:

```yaml
api:
  healthcheck:
    test: ["CMD", "npx", "ts-node", "scripts/maintain-metrics-partitions.ts", "--retention=30"]
    interval: 24h
    timeout: 30s
    retries: 3
```

## How Partitioning Works

### Data Insertion
When you insert a row:
```sql
INSERT INTO device_metrics (device_uuid, cpu_usage, recorded_at)
VALUES ('uuid', 45.2, '2025-10-17 10:30:00');
```

PostgreSQL automatically routes it to the correct partition (`device_metrics_2025_10_17`).

### Data Querying
Query the parent table normally:
```sql
SELECT * FROM device_metrics WHERE recorded_at > NOW() - INTERVAL '7 days';
```

PostgreSQL automatically:
1. **Partition pruning**: Only scans relevant partitions (not all 38)
2. **Parallel queries**: Can read multiple partitions simultaneously
3. **Optimized indexes**: Each partition has its own indexes

### Data Deletion
Drop entire partition in milliseconds:
```sql
DROP TABLE device_metrics_2024_09_01;  -- Instant, no VACUUM needed
```

vs. traditional DELETE:
```sql
DELETE FROM device_metrics WHERE recorded_at < '2024-09-01';  -- Slow, requires VACUUM
```

## Performance Benefits

### Space Management
- ❌ **DELETE**: Marks rows deleted, leaves "dead tuples", requires VACUUM
- ✅ **Partitioning**: DROP TABLE instantly reclaims disk space

### Query Performance
- **Partition Pruning**: Only scans relevant partitions
  - Query for today → 1 partition scanned (not 38)
  - Query for last 7 days → 7 partitions scanned
- **Parallel Processing**: Multiple partitions = parallel execution
- **Smaller Indexes**: Each partition has smaller, more efficient indexes

### Maintenance
- ❌ **Traditional**: VACUUM, REINDEX on large table (locks, slow)
- ✅ **Partitioning**: Each partition maintained independently

## Troubleshooting

### Check Current Partitions
```sql
SELECT * FROM get_device_metrics_partition_stats()
ORDER BY partition_date DESC;
```

### Find Missing Partitions (Gaps)
```bash
npx ts-node scripts/maintain-metrics-partitions.ts --health
```

### Manually Create Partition
```sql
SELECT create_device_metrics_partition('2025-11-01');
```

### Manually Drop Old Partition
```sql
DROP TABLE IF EXISTS device_metrics_2024_08_01 CASCADE;
```

### Check Partition for Specific Date
```sql
SELECT tableoid::regclass as partition_name, *
FROM device_metrics
WHERE recorded_at::date = '2025-10-17';
```

## Migration Details

**File**: `database/migrations/005_add_device_metrics_partitioning.sql`

**Steps Performed**:
1. Renamed `device_metrics` → `device_metrics_old`
2. Created partitioned table with `PARTITION BY RANGE (recorded_at)`
3. Created indexes on partitioned table
4. Created 4 management functions
5. Created 38 initial partitions (-30 to +7 days)
6. Migrated 253 rows from old table
7. Dropped old table
8. Reset sequence to continue from max ID

**Rollback** (if needed):
```sql
-- Rename partitioned table
ALTER TABLE device_metrics RENAME TO device_metrics_partitioned;

-- Restore from backup (if you kept device_metrics_old)
ALTER TABLE device_metrics_old RENAME TO device_metrics;
```

## Comparison: Simple Cleanup vs Partitioning

| Feature | Simple DELETE | Partitioning |
|---------|---------------|--------------|
| **Setup** | ✅ Simple script | ⚠️ Migration required |
| **Cleanup Speed** | ❌ Slow (scans all rows) | ✅ Instant (DROP TABLE) |
| **Disk Space** | ❌ Requires VACUUM | ✅ Immediate reclaim |
| **Query Performance** | ❌ Degrades over time | ✅ Consistent |
| **Production-Ready** | ⚠️ OK for small data | ✅ Scales to billions |
| **Maintenance** | ❌ Manual VACUUM | ✅ Automatic |

## Next Steps

### Recommended: Set Up Automation
Choose one of the automation methods above to run maintenance daily.

### Optional: Monitor Partition Growth
Add monitoring to track:
- Number of partitions
- Total table size
- Rows per partition
- Query performance

```bash
# Quick stats
npx ts-node scripts/maintain-metrics-partitions.ts --stats
```

### Optional: Adjust Retention
Modify retention period based on your needs:
- **7 days**: Minimal storage, recent data only
- **30 days**: Good balance (current setting)
- **90 days**: Long-term trending
- **365 days**: Full yearly history

## Resources

- **PostgreSQL Partitioning Docs**: https://www.postgresql.org/docs/current/ddl-partitioning.html
- **Simple Cleanup Guide**: `docs/METRICS-RETENTION-READY.md`
- **Full Analysis**: `docs/METRICS-RETENTION-POLICY.md`
- **Maintenance Script**: `scripts/maintain-metrics-partitions.ts`
- **Verification Script**: `scripts/verify-migration.ts`

---

## Status: ✅ Production Ready

The partitioning system is fully functional and ready for production use. All data has been migrated successfully, and the maintenance script is tested and working.

**Recommended Action**: Set up automated maintenance (cron job or Task Scheduler) to run daily.
