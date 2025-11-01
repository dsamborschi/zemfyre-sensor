/**
 * Device Logs Retention Task
 * 
 * Drops old device_logs partitions based on retention policy
 * Uses PostgreSQL partition dropping for efficient cleanup
 */

import { HousekeeperTask } from '../index';
import { pool } from '../../db/connection';

const task: HousekeeperTask = {
  name: 'device-logs-retention',
  // Run daily at 2am
  schedule: '0 2 * * *',
  
  run: async () => {
    console.log('🗑️  Starting device logs retention cleanup...');

    const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '30', 10);
    const enabled = process.env.LOG_RETENTION_ENABLED !== 'false';

    if (!enabled) {
      console.log('⏭️  Log retention is disabled (LOG_RETENTION_ENABLED=false)');
      return;
    }

    console.log(`📅 Retention policy: ${retentionDays} days`);

    try {
      // Call PostgreSQL function to drop old partitions
      const result = await pool.query(
        'SELECT * FROM drop_old_device_logs_partitions($1)',
        [retentionDays]
      );

      // Log results
      if (result.rows.length > 0) {
        console.log('🗑️  Partition cleanup results:');
        for (const row of result.rows) {
          console.log(`   ${row.result}`);
        }
      }

      // Get current partition statistics
      const stats = await pool.query('SELECT * FROM get_device_logs_partition_stats()');

      if (stats.rows.length > 0) {
        console.log('\n📊 Current partition statistics:');
        for (const stat of stats.rows) {
          console.log(
            `   ${stat.partition_name}: ${stat.row_count} rows, ${stat.size}, ${stat.age_days} days old`
          );
        }
      }

      console.log('\n✅ Device logs retention cleanup completed successfully');
    } catch (error: any) {
      console.error('❌ Device logs retention cleanup failed:', error.message);
      throw error;
    }
  }
};

export default task;
