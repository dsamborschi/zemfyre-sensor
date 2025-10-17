# Device Metrics Retention Policy Implementation

## Problem

The `device_metrics` table grows rapidly with time-series data and needs automatic cleanup to prevent unbounded growth.

---

## Solution Options

### Option 1: PostgreSQL Partitioning + Automatic Drop (RECOMMENDED ⭐)

**Best for:** Production, high-volume metrics, automatic cleanup

**How it works:**
- Partition table by time range (daily/weekly)
- Old partitions automatically dropped
- No manual cleanup needed
- Excellent query performance

### Option 2: Background Cleanup Job

**Best for:** Simple setup, flexible retention rules

**How it works:**
- Periodic DELETE query removes old records
- Runs via cron job or application scheduler
- Simple but can be slow on large tables

### Option 3: TimescaleDB Extension

**Best for:** Dedicated time-series database needs

**How it works:**
- PostgreSQL extension for time-series data
- Built-in retention policies
- Automatic compression
- Best performance for time-series queries

---

## Recommended Implementation: PostgreSQL Partitioning

### Step 1: Create Migration for Partitioned Table

```sql
-- Migration: 005_add_device_metrics_partitioning.sql

-- 1. Rename existing table (backup)
ALTER TABLE device_metrics RENAME TO device_metrics_old;

-- 2. Create partitioned table
CREATE TABLE device_metrics (
    id BIGSERIAL,
    device_uuid UUID NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value JSONB NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- 3. Create indexes
CREATE INDEX idx_device_metrics_device_timestamp 
    ON device_metrics(device_uuid, timestamp DESC);
CREATE INDEX idx_device_metrics_metric_name 
    ON device_metrics(metric_name, timestamp DESC);
CREATE INDEX idx_device_metrics_timestamp 
    ON device_metrics(timestamp DESC);

-- 4. Create initial partitions (last 30 days + next 7 days)
-- This function will be called by maintenance script
CREATE OR REPLACE FUNCTION create_device_metrics_partition(
    partition_date DATE
) RETURNS void AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    partition_name := 'device_metrics_' || TO_CHAR(partition_date, 'YYYY_MM_DD');
    start_date := partition_date;
    end_date := partition_date + INTERVAL '1 day';
    
    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF device_metrics 
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );
        
        RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Create function to drop old partitions
CREATE OR REPLACE FUNCTION drop_old_device_metrics_partitions(
    retention_days INTEGER DEFAULT 30
) RETURNS void AS $$
DECLARE
    partition_record RECORD;
    cutoff_date DATE;
BEGIN
    cutoff_date := CURRENT_DATE - retention_days;
    
    FOR partition_record IN
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'device_metrics_%'
        AND tablename ~ '^device_metrics_[0-9]{4}_[0-9]{2}_[0-9]{2}$'
    LOOP
        -- Extract date from partition name
        DECLARE
            partition_date DATE;
        BEGIN
            partition_date := TO_DATE(
                SUBSTRING(partition_record.tablename FROM 'device_metrics_(.*)'),
                'YYYY_MM_DD'
            );
            
            IF partition_date < cutoff_date THEN
                EXECUTE format('DROP TABLE IF EXISTS %I', partition_record.tablename);
                RAISE NOTICE 'Dropped old partition: %', partition_record.tablename;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Could not process partition: %', partition_record.tablename;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6. Migrate existing data (if any)
INSERT INTO device_metrics (id, device_uuid, metric_name, metric_value, timestamp, created_at)
SELECT id, device_uuid, metric_name, metric_value, timestamp, created_at
FROM device_metrics_old;

-- 7. Drop old table
DROP TABLE device_metrics_old;

-- 8. Create initial partitions for current and future dates
DO $$
DECLARE
    i INTEGER;
BEGIN
    -- Create partitions for last 30 days
    FOR i IN -30..7 LOOP
        PERFORM create_device_metrics_partition(CURRENT_DATE + i);
    END LOOP;
END $$;
```

### Step 2: Create Maintenance Script

```typescript
// scripts/maintain-metrics-partitions.ts

import { query } from '../src/db/connection';

interface MaintenanceConfig {
  retentionDays: number;
  futurePartitionDays: number;
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  retentionDays: 30,        // Keep 30 days of metrics
  futurePartitionDays: 7    // Create partitions 7 days ahead
};

/**
 * Create partitions for future dates
 */
async function createFuturePartitions(daysAhead: number): Promise<void> {
  console.log(`\n📅 Creating partitions for next ${daysAhead} days...`);
  
  const today = new Date();
  let created = 0;
  
  for (let i = 0; i <= daysAhead; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    try {
      await query(
        'SELECT create_device_metrics_partition($1::date)',
        [dateStr]
      );
      created++;
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        // Partition already exists, skip
        continue;
      }
      throw error;
    }
  }
  
  console.log(`   ✅ Created ${created} new partition(s)`);
}

/**
 * Drop old partitions based on retention policy
 */
async function dropOldPartitions(retentionDays: number): Promise<void> {
  console.log(`\n🗑️  Dropping partitions older than ${retentionDays} days...`);
  
  const result = await query(
    'SELECT drop_old_device_metrics_partitions($1)',
    [retentionDays]
  );
  
  console.log(`   ✅ Old partitions dropped`);
}

/**
 * Get partition statistics
 */
async function getPartitionStats(): Promise<void> {
  console.log('\n📊 Partition Statistics:');
  
  const result = await query(`
    SELECT 
      schemaname,
      tablename,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
      (SELECT COUNT(*) FROM device_metrics WHERE tableoid = (schemaname||'.'||tablename)::regclass) as row_count
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename LIKE 'device_metrics_%'
    ORDER BY tablename DESC
    LIMIT 10
  `);
  
  if (result.rows.length === 0) {
    console.log('   No partitions found');
    return;
  }
  
  console.log('\n   Recent Partitions:');
  result.rows.forEach((row: any) => {
    console.log(`   ${row.tablename}: ${row.size} (${row.row_count} rows)`);
  });
  
  // Total size
  const totalResult = await query(`
    SELECT pg_size_pretty(pg_total_relation_size('device_metrics')) as total_size
  `);
  console.log(`\n   Total size: ${totalResult.rows[0].total_size}`);
}

/**
 * Main maintenance function
 */
async function maintainPartitions(config: MaintenanceConfig = DEFAULT_CONFIG): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   Device Metrics Partition Maintenance');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   Retention: ${config.retentionDays} days`);
  console.log(`   Future partitions: ${config.futurePartitionDays} days`);
  
  try {
    // 1. Create future partitions
    await createFuturePartitions(config.futurePartitionDays);
    
    // 2. Drop old partitions
    await dropOldPartitions(config.retentionDays);
    
    // 3. Show statistics
    await getPartitionStats();
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   ✅ Maintenance Complete');
    console.log('═══════════════════════════════════════════════════════════\n');
    
  } catch (error: any) {
    console.error('\n❌ Error during maintenance:', error.message);
    console.error(error);
    throw error;
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const retention = args.find(arg => arg.startsWith('--retention='))?.split('=')[1];
  const future = args.find(arg => arg.startsWith('--future='))?.split('=')[1];
  const statsOnly = args.includes('--stats');
  
  try {
    if (statsOnly) {
      await getPartitionStats();
    } else {
      await maintainPartitions({
        retentionDays: retention ? parseInt(retention) : DEFAULT_CONFIG.retentionDays,
        futurePartitionDays: future ? parseInt(future) : DEFAULT_CONFIG.futurePartitionDays
      });
    }
  } catch (error) {
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { maintainPartitions, createFuturePartitions, dropOldPartitions, getPartitionStats };
```

### Step 3: Add Cron Job

```bash
# Add to crontab (run daily at 2 AM)
0 2 * * * cd /path/to/api && npx ts-node scripts/maintain-metrics-partitions.ts

# Or run via systemd timer (preferred for production)
```

---

## Alternative: Simple DELETE-based Cleanup

If you want something simpler without partitioning:

```sql
-- Migration: 005_add_metrics_retention_function.sql

CREATE OR REPLACE FUNCTION cleanup_old_device_metrics(
    retention_days INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM device_metrics
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create index to speed up cleanup
CREATE INDEX IF NOT EXISTS idx_device_metrics_timestamp_cleanup 
    ON device_metrics(timestamp) 
    WHERE timestamp < NOW() - INTERVAL '30 days';
```

```typescript
// scripts/cleanup-old-metrics.ts

import { query } from '../src/db/connection';

async function cleanupOldMetrics(retentionDays: number = 30): Promise<void> {
  console.log(`🗑️  Cleaning up metrics older than ${retentionDays} days...`);
  
  const result = await query(
    'SELECT cleanup_old_device_metrics($1)',
    [retentionDays]
  );
  
  const deletedCount = result.rows[0].cleanup_old_device_metrics;
  console.log(`   ✅ Deleted ${deletedCount} old metric records`);
  
  // Run VACUUM to reclaim space
  console.log('🧹 Running VACUUM to reclaim space...');
  await query('VACUUM ANALYZE device_metrics');
  console.log('   ✅ VACUUM complete');
}

async function main() {
  const args = process.argv.slice(2);
  const retention = args.find(arg => arg.startsWith('--retention='))?.split('=')[1];
  
  try {
    await cleanupOldMetrics(retention ? parseInt(retention) : 30);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
```

---

## Comparison

| Feature | Partitioning | Simple DELETE | TimescaleDB |
|---------|-------------|---------------|-------------|
| Setup Complexity | Medium | Low | Medium |
| Performance | Excellent | Poor (large tables) | Excellent |
| Automatic Cleanup | Yes (DROP) | No (DELETE + VACUUM) | Yes |
| Disk Space Recovery | Immediate | Delayed | Immediate |
| Query Performance | Fast | Degrades over time | Fast |
| Maintenance | Minimal | Regular VACUUM needed | Minimal |
| Best For | Production | Small datasets | Time-series focus |

---

## Recommendation

**For your use case (growing time-series metrics):**

1. **Start with partitioning** (Option 1) if:
   - You expect high volume metrics
   - You want automatic cleanup
   - You need consistent performance

2. **Use simple DELETE** (Option 2) if:
   - You have low-medium volume
   - You want quick implementation
   - You can tolerate periodic maintenance

---

## Implementation Steps

### Immediate (Simple Cleanup):

```bash
cd api

# Create the cleanup migration
npx ts-node scripts/run-migrations.ts

# Run cleanup manually
npx ts-node scripts/cleanup-old-metrics.ts --retention=30

# Add to cron
0 2 * * * cd /path/to/api && npx ts-node scripts/cleanup-old-metrics.ts
```

### Future (Partitioning):

When you're ready for production-grade setup, implement partitioning for better performance and automatic cleanup.

---

## Monitoring

Add metrics to track table growth:

```sql
-- Query to check table size
SELECT 
    pg_size_pretty(pg_total_relation_size('device_metrics')) as total_size,
    pg_size_pretty(pg_relation_size('device_metrics')) as table_size,
    pg_size_pretty(pg_total_relation_size('device_metrics') - pg_relation_size('device_metrics')) as index_size,
    (SELECT COUNT(*) FROM device_metrics) as row_count;

-- Query to see data age distribution
SELECT 
    DATE(timestamp) as date,
    COUNT(*) as metrics_count,
    pg_size_pretty(pg_column_size(timestamp)) as approx_size
FROM device_metrics
GROUP BY DATE(timestamp)
ORDER BY date DESC
LIMIT 30;
```

---

## Next Steps

**Which approach do you want to implement?**

1. **Simple cleanup** - Quick implementation, manual cron job
2. **Partitioning** - Production-ready, automatic cleanup
3. **Both** - Start simple, migrate to partitioning later

I can create the migration and scripts for your chosen approach!
