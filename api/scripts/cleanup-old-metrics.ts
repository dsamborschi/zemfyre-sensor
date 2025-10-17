/**
 * Simple Device Metrics Cleanup
 * 
 * Deletes metrics older than retention period.
 * Run via cron or manually.
 * 
 * Usage:
 *   npx ts-node scripts/cleanup-old-metrics.ts
 *   npx ts-node scripts/cleanup-old-metrics.ts --retention=30
 *   npx ts-node scripts/cleanup-old-metrics.ts --retention=7 --dry-run
 */

import { query } from '../src/db/connection';

interface CleanupResult {
  deletedCount: number;
  beforeSize: string;
  afterSize: string;
  reclaimedSpace: string;
}

/**
 * Get table size
 */
async function getTableSize(): Promise<{ size: string; rows: number }> {
  const result = await query(`
    SELECT 
      pg_size_pretty(pg_total_relation_size('device_metrics')) as size,
      (SELECT COUNT(*) FROM device_metrics) as rows
  `);
  
  return {
    size: result.rows[0].size,
    rows: parseInt(result.rows[0].rows)
  };
}

/**
 * Get metrics age distribution
 */
async function getAgeDistribution(): Promise<void> {
  console.log('\n📊 Metrics Age Distribution:');
  
  const result = await query(`
    WITH age_buckets AS (
      SELECT 
        CASE 
          WHEN recorded_at > NOW() - INTERVAL '1 day' THEN '< 1 day'
          WHEN recorded_at > NOW() - INTERVAL '7 days' THEN '1-7 days'
          WHEN recorded_at > NOW() - INTERVAL '30 days' THEN '7-30 days'
          WHEN recorded_at > NOW() - INTERVAL '90 days' THEN '30-90 days'
          ELSE '> 90 days'
        END as age_range,
        CASE 
          WHEN recorded_at > NOW() - INTERVAL '1 day' THEN 1
          WHEN recorded_at > NOW() - INTERVAL '7 days' THEN 2
          WHEN recorded_at > NOW() - INTERVAL '30 days' THEN 3
          WHEN recorded_at > NOW() - INTERVAL '90 days' THEN 4
          ELSE 5
        END as sort_order
      FROM device_metrics
    )
    SELECT 
      age_range,
      COUNT(*) as count
    FROM age_buckets
    GROUP BY age_range, sort_order
    ORDER BY sort_order
  `);
  
  if (result.rows.length === 0) {
    console.log('   No metrics found');
    return;
  }
  
  result.rows.forEach((row: any) => {
    console.log(`   ${row.age_range.padEnd(15)} ${row.count.toString().padStart(10)} records`);
  });
}

/**
 * Cleanup old metrics
 */
async function cleanupOldMetrics(
  retentionDays: number,
  dryRun: boolean = false
): Promise<CleanupResult> {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('   Device Metrics Cleanup');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   Retention: ${retentionDays} days`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  
  // Get before state
  const before = await getTableSize();
  console.log(`\n   Current state:`);
  console.log(`   - Total size: ${before.size}`);
  console.log(`   - Total rows: ${before.rows.toLocaleString()}`);
  
  // Show what will be deleted
  const countResult = await query(
    'SELECT COUNT(*) as count FROM device_metrics WHERE recorded_at < NOW() - $1::interval',
    [`${retentionDays} days`]
  );
  const toDelete = parseInt(countResult.rows[0].count);
  
  console.log(`\n   📍 Cutoff date: ${new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()}`);
  console.log(`   🗑️  Records to delete: ${toDelete.toLocaleString()}`);
  
  if (toDelete === 0) {
    console.log('\n   ✅ No old records to delete!');
    return {
      deletedCount: 0,
      beforeSize: before.size,
      afterSize: before.size,
      reclaimedSpace: '0 bytes'
    };
  }
  
  if (dryRun) {
    console.log('\n   ℹ️  DRY RUN - No changes made');
    console.log('   Run without --dry-run to actually delete records');
    return {
      deletedCount: 0,
      beforeSize: before.size,
      afterSize: before.size,
      reclaimedSpace: '0 bytes (dry run)'
    };
  }
  
  // Perform deletion
  console.log('\n   🗑️  Deleting old records...');
  const startTime = Date.now();
  
  const deleteResult = await query(
    'DELETE FROM device_metrics WHERE recorded_at < NOW() - $1::interval',
    [`${retentionDays} days`]
  );
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`   ✅ Deleted ${toDelete.toLocaleString()} records in ${duration}s`);
  
  // Run VACUUM to reclaim space
  console.log('\n   🧹 Running VACUUM ANALYZE to reclaim space...');
  const vacuumStart = Date.now();
  
  await query('VACUUM ANALYZE device_metrics');
  
  const vacuumDuration = ((Date.now() - vacuumStart) / 1000).toFixed(2);
  console.log(`   ✅ VACUUM complete in ${vacuumDuration}s`);
  
  // Get after state
  const after = await getTableSize();
  console.log(`\n   New state:`);
  console.log(`   - Total size: ${after.size}`);
  console.log(`   - Total rows: ${after.rows.toLocaleString()}`);
  
  return {
    deletedCount: toDelete,
    beforeSize: before.size,
    afterSize: after.size,
    reclaimedSpace: 'N/A' // PostgreSQL doesn't easily report reclaimed space
  };
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const retention = args.find(arg => arg.startsWith('--retention='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');
  const statsOnly = args.includes('--stats');
  const help = args.includes('--help') || args.includes('-h');
  
  if (help) {
    console.log('Device Metrics Cleanup Tool');
    console.log('\nUsage:');
    console.log('  npx ts-node scripts/cleanup-old-metrics.ts [options]');
    console.log('\nOptions:');
    console.log('  --retention=<days>  Days to keep (default: 30)');
    console.log('  --dry-run           Show what would be deleted without deleting');
    console.log('  --stats             Show metrics age distribution only');
    console.log('  --help, -h          Show this help');
    console.log('\nExamples:');
    console.log('  npx ts-node scripts/cleanup-old-metrics.ts');
    console.log('  npx ts-node scripts/cleanup-old-metrics.ts --retention=7');
    console.log('  npx ts-node scripts/cleanup-old-metrics.ts --retention=30 --dry-run');
    console.log('  npx ts-node scripts/cleanup-old-metrics.ts --stats');
    return;
  }
  
  try {
    if (statsOnly) {
      const stats = await getTableSize();
      console.log('\n📊 Device Metrics Statistics:');
      console.log(`   Total size: ${stats.size}`);
      console.log(`   Total rows: ${stats.rows.toLocaleString()}`);
      await getAgeDistribution();
    } else {
      const retentionDays = retention ? parseInt(retention) : 30;
      
      if (isNaN(retentionDays) || retentionDays < 1) {
        console.error('❌ Error: Retention must be a positive number');
        process.exit(1);
      }
      
      await getAgeDistribution();
      const result = await cleanupOldMetrics(retentionDays, dryRun);
      
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('   Summary');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`   Records deleted: ${result.deletedCount.toLocaleString()}`);
      console.log(`   Size before: ${result.beforeSize}`);
      console.log(`   Size after: ${result.afterSize}`);
      
      if (!dryRun && result.deletedCount > 0) {
        console.log('\n   ✅ Cleanup complete!');
        console.log(`   📅 Next cleanup: Add to cron to run daily`);
        console.log(`   📝 Crontab: 0 2 * * * cd /path/to/api && npx ts-node scripts/cleanup-old-metrics.ts`);
      }
    }
    
    console.log('\n');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { cleanupOldMetrics, getTableSize, getAgeDistribution };
