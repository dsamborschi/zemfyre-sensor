/**
 * Device Metrics Partition Maintenance
 * 
 * Manages partitions for device_metrics table:
 * - Creates future partitions
 * - Drops old partitions based on retention policy
 * - Shows partition statistics
 * 
 * Usage:
 *   npx ts-node scripts/maintain-metrics-partitions.ts
 *   npx ts-node scripts/maintain-metrics-partitions.ts --retention=30
 *   npx ts-node scripts/maintain-metrics-partitions.ts --stats
 *   npx ts-node scripts/maintain-metrics-partitions.ts --create-future=14
 */

import { query } from '../src/db/connection';

interface MaintenanceConfig {
  retentionDays: number;
  futurePartitionDays: number;
  dryRun: boolean;
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  retentionDays: 30,        // Keep 30 days of metrics
  futurePartitionDays: 7,   // Create partitions 7 days ahead
  dryRun: false
};

interface PartitionStats {
  partition_name: string;
  partition_date: Date;
  row_count: number;
  size: string;
  age_days: number;
}

/**
 * Create future partitions
 */
async function createFuturePartitions(daysAhead: number): Promise<number> {
  console.log(`\n📅 Creating partitions for next ${daysAhead} days...`);
  
  const result = await query(
    'SELECT create_device_metrics_partitions_range($1, $2) as result',
    [0, daysAhead]
  );
  
  let created = 0;
  let exists = 0;
  
  result.rows.forEach((row: any) => {
    if (row.result.startsWith('CREATED:')) {
      created++;
      console.log(`   ✅ ${row.result}`);
    } else if (row.result.startsWith('EXISTS:')) {
      exists++;
    }
  });
  
  if (exists > 0) {
    console.log(`   ℹ️  ${exists} partition(s) already exist`);
  }
  
  console.log(`   📊 Created ${created} new partition(s)`);
  return created;
}

/**
 * Drop old partitions based on retention policy
 */
async function dropOldPartitions(retentionDays: number, dryRun: boolean = false): Promise<number> {
  console.log(`\n🗑️  ${dryRun ? '[DRY RUN] ' : ''}Dropping partitions older than ${retentionDays} days...`);
  
  if (dryRun) {
    // Just list what would be dropped
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const stats = await getPartitionStats();
    const oldPartitions = stats.filter(s => s.age_days > retentionDays);
    
    if (oldPartitions.length === 0) {
      console.log(`   ✅ No partitions older than ${retentionDays} days`);
      return 0;
    }
    
    console.log(`   Would drop ${oldPartitions.length} partition(s):`);
    oldPartitions.forEach(p => {
      console.log(`   - ${p.partition_name} (${p.age_days} days old, ${p.row_count} rows, ${p.size})`);
    });
    
    return oldPartitions.length;
  }
  
  // Actually drop partitions
  const result = await query(
    'SELECT drop_old_device_metrics_partitions($1) as result',
    [retentionDays]
  );
  
  let dropped = 0;
  
  result.rows.forEach((row: any) => {
    if (row.result.startsWith('DROPPED:')) {
      dropped++;
      console.log(`   ✅ ${row.result}`);
    } else if (row.result.startsWith('No old partitions')) {
      console.log(`   ℹ️  ${row.result}`);
    } else if (row.result.startsWith('ERROR:')) {
      console.log(`   ❌ ${row.result}`);
    }
  });
  
  if (dropped > 0) {
    console.log(`   📊 Dropped ${dropped} old partition(s)`);
  }
  
  return dropped;
}

/**
 * Get partition statistics
 */
async function getPartitionStats(): Promise<PartitionStats[]> {
  const result = await query('SELECT * FROM get_device_metrics_partition_stats()');
  return result.rows as PartitionStats[];
}

/**
 * Display partition statistics
 */
async function displayPartitionStats(limit?: number): Promise<void> {
  console.log('\n📊 Partition Statistics:\n');
  
  const stats = await getPartitionStats();
  
  if (stats.length === 0) {
    console.log('   No partitions found');
    return;
  }
  
  // Summary
  const totalRows = stats.reduce((sum, s) => sum + Number(s.row_count), 0);
  const oldestDays = Math.max(...stats.map(s => s.age_days));
  const newestDays = Math.min(...stats.map(s => s.age_days));
  
  console.log(`   Total partitions: ${stats.length}`);
  console.log(`   Total rows: ${totalRows.toLocaleString()}`);
  console.log(`   Age range: ${newestDays} to ${oldestDays} days old`);
  console.log('');
  
  // Detailed list
  const displayStats = limit ? stats.slice(0, limit) : stats;
  
  console.log('   Partition                    Date         Age    Rows       Size');
  console.log('   ─────────────────────────────────────────────────────────────────');
  
  displayStats.forEach((stat: PartitionStats) => {
    const name = stat.partition_name.padEnd(28);
    const date = stat.partition_date.toISOString().split('T')[0];
    const age = `${stat.age_days}d`.padStart(5);
    const rows = stat.row_count.toLocaleString().padStart(10);
    const size = stat.size.padStart(8);
    
    console.log(`   ${name} ${date}  ${age}  ${rows}  ${size}`);
  });
  
  if (limit && stats.length > limit) {
    console.log(`   ... and ${stats.length - limit} more`);
  }
  
  // Total size
  const totalResult = await query(
    "SELECT pg_size_pretty(pg_total_relation_size('device_metrics')) as total_size"
  );
  console.log(`\n   📦 Total table size: ${totalResult.rows[0].total_size}`);
}

/**
 * Check partition health
 */
async function checkPartitionHealth(): Promise<void> {
  console.log('\n🔍 Partition Health Check:\n');
  
  const stats = await getPartitionStats();
  
  // Check for gaps in partitions
  const dates = stats.map(s => s.partition_date.toISOString().split('T')[0]).sort();
  let gaps = 0;
  
  for (let i = 0; i < dates.length - 1; i++) {
    const current = new Date(dates[i]);
    const next = new Date(dates[i + 1]);
    const diffDays = Math.abs((next.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 1) {
      gaps++;
      console.log(`   ⚠️  Gap detected: ${diffDays - 1} day(s) between ${dates[i]} and ${dates[i + 1]}`);
    }
  }
  
  if (gaps === 0) {
    console.log('   ✅ No gaps in partitions');
  }
  
  // Check if we have future partitions
  const today = new Date().toISOString().split('T')[0];
  const futureDates = dates.filter(d => d > today);
  
  console.log(`   📅 Future partitions: ${futureDates.length} days ahead`);
  
  if (futureDates.length < 3) {
    console.log(`   ⚠️  Consider creating more future partitions (current: ${futureDates.length})`);
  }
  
  // Check oldest partition
  const oldestStat = stats[stats.length - 1];
  if (oldestStat && oldestStat.age_days > 40) {
    console.log(`   ⚠️  Oldest partition is ${oldestStat.age_days} days old - consider cleanup`);
  }
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
  console.log(`   Mode: ${config.dryRun ? 'DRY RUN' : 'LIVE'}`);
  
  try {
    // 1. Create future partitions
    await createFuturePartitions(config.futurePartitionDays);
    
    // 2. Drop old partitions
    await dropOldPartitions(config.retentionDays, config.dryRun);
    
    // 3. Show statistics
    await displayPartitionStats(15);
    
    // 4. Health check
    await checkPartitionHealth();
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   ✅ Maintenance Complete');
    console.log('═══════════════════════════════════════════════════════════');
    
    if (config.dryRun) {
      console.log('\n   ℹ️  This was a DRY RUN - no partitions were dropped');
      console.log('   Run without --dry-run to actually drop old partitions\n');
    }
    
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
  const future = args.find(arg => arg.startsWith('--create-future='))?.split('=')[1];
  const statsOnly = args.includes('--stats');
  const healthCheck = args.includes('--health');
  const dryRun = args.includes('--dry-run');
  const help = args.includes('--help') || args.includes('-h');
  
  if (help) {
    console.log('Device Metrics Partition Maintenance Tool');
    console.log('\nUsage:');
    console.log('  npx ts-node scripts/maintain-metrics-partitions.ts [options]');
    console.log('\nOptions:');
    console.log('  --retention=<days>      Days to keep (default: 30)');
    console.log('  --create-future=<days>  Days ahead to create (default: 7)');
    console.log('  --dry-run               Show what would be done without doing it');
    console.log('  --stats                 Show partition statistics only');
    console.log('  --health                Run health check only');
    console.log('  --help, -h              Show this help');
    console.log('\nExamples:');
    console.log('  # Full maintenance with default settings');
    console.log('  npx ts-node scripts/maintain-metrics-partitions.ts');
    console.log('');
    console.log('  # Keep only 7 days');
    console.log('  npx ts-node scripts/maintain-metrics-partitions.ts --retention=7');
    console.log('');
    console.log('  # Create partitions 14 days ahead');
    console.log('  npx ts-node scripts/maintain-metrics-partitions.ts --create-future=14');
    console.log('');
    console.log('  # Dry run to see what would be dropped');
    console.log('  npx ts-node scripts/maintain-metrics-partitions.ts --retention=30 --dry-run');
    console.log('');
    console.log('  # Just view statistics');
    console.log('  npx ts-node scripts/maintain-metrics-partitions.ts --stats');
    console.log('');
    console.log('Recommended cron job (daily at 2 AM):');
    console.log('  0 2 * * * cd /path/to/api && npx ts-node scripts/maintain-metrics-partitions.ts');
    return;
  }
  
  try {
    if (statsOnly) {
      await displayPartitionStats();
    } else if (healthCheck) {
      await displayPartitionStats(10);
      await checkPartitionHealth();
    } else {
      const config: MaintenanceConfig = {
        retentionDays: retention ? parseInt(retention) : DEFAULT_CONFIG.retentionDays,
        futurePartitionDays: future ? parseInt(future) : DEFAULT_CONFIG.futurePartitionDays,
        dryRun
      };
      
      if (isNaN(config.retentionDays) || config.retentionDays < 1) {
        console.error('❌ Error: Retention must be a positive number');
        process.exit(1);
      }
      
      if (isNaN(config.futurePartitionDays) || config.futurePartitionDays < 1) {
        console.error('❌ Error: Future days must be a positive number');
        process.exit(1);
      }
      
      await maintainPartitions(config);
    }
    
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

export { 
  maintainPartitions, 
  createFuturePartitions, 
  dropOldPartitions, 
  getPartitionStats,
  displayPartitionStats,
  checkPartitionHealth
};
