/**
 * Device Metrics Partition Maintenance Task
 * 
 * Creates future device_metrics partitions and drops old ones to ensure:
 * 1. Metrics are never rejected due to missing partitions
 * 2. Old data is cleaned up according to retention policy
 * 
 * Runs daily at 1am to maintain partition coverage
 */

import { HousekeeperTask } from '../index';
import { pool } from '../../db/connection';

// Retention period in days (configurable via environment variable)
const RETENTION_DAYS = parseInt(process.env.METRICS_RETENTION_DAYS || '90');

const task: HousekeeperTask = {
  name: 'device-metrics-partition-maintenance',
  // Run daily at 1am
  schedule: '0 1 * * *',
  // Also run on startup to ensure partitions exist immediately
  startup: true,
  
  run: async () => {
    console.log('📅 Running device metrics partition maintenance...');
    console.log(`   Retention period: ${RETENTION_DAYS} days\n`);

    try {
      // 1. Create future partitions (next 30 days) + today
      console.log('📅 Creating future partitions...');
      const createResult = await pool.query(`
        SELECT create_device_metrics_partition((CURRENT_DATE + (i || ' days')::INTERVAL)::DATE) as result
        FROM generate_series(0, 30) AS i
      `);

      const created = createResult.rows.filter((r: any) => r.result?.startsWith('CREATED:')).length;
      const existing = createResult.rows.filter((r: any) => r.result?.startsWith('EXISTS:')).length;

      console.log(`  ✓ Created: ${created} partitions`);
      console.log(`  ℹ Already exists: ${existing} partitions`);

      // 2. Drop old partitions
      console.log(`\n🗑️  Dropping partitions older than ${RETENTION_DAYS} days...`);
      const dropResult = await pool.query(`
        SELECT drop_old_device_metrics_partitions($1) as result
      `, [RETENTION_DAYS]);

      const dropped = dropResult.rows.filter((r: any) => r.result?.startsWith('DROPPED:')).length;
      
      console.log(`  ✓ Dropped: ${dropped} old partitions`);

      if (dropped > 0) {
        dropResult.rows
          .filter((r: any) => r.result?.startsWith('DROPPED:'))
          .forEach((r: any) => console.log(`    - ${r.result}`));
      }

      // 3. Show statistics
      const stats = await pool.query(`
        SELECT * FROM get_device_metrics_partition_stats()
      `);

      if (stats.rows.length > 0) {
        console.log('\n📊 Current Partition Statistics:');
        console.log(`  Total partitions: ${stats.rows.length}`);
        
        // Show first 5 and last 5 partitions
        const showCount = Math.min(5, stats.rows.length);
        console.log(`\n  Newest ${showCount} partitions:`);
        stats.rows.slice(0, showCount).forEach((row: any) => {
          console.log(`    ${row.partition_name}: ${row.row_count} rows, ${row.size}, ${row.age_days} days old`);
        });

        if (stats.rows.length > 10) {
          console.log(`    ... (${stats.rows.length - 10} partitions omitted)`);
        }

        if (stats.rows.length > showCount) {
          const oldestPartitions = stats.rows.slice(-showCount);
          console.log(`\n  Oldest ${showCount} partitions:`);
          oldestPartitions.forEach((row: any) => {
            console.log(`    ${row.partition_name}: ${row.row_count} rows, ${row.size}, ${row.age_days} days old`);
          });
        }

        // Total metrics count
        const totalMetrics = await pool.query(`
          SELECT COUNT(*) as total_metrics FROM device_metrics
        `);
        console.log(`\n  Total metrics records: ${totalMetrics.rows[0].total_metrics}`);
      }

      console.log('\n✅ Device metrics partition maintenance completed successfully!');

    } catch (error: any) {
      console.error('❌ Failed to maintain device metrics partitions:', error.message);
      throw error;
    }
  }
};

export default task;
