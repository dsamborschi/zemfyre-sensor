/**
 * Device Logs Partition Maintenance Task
 * 
 * Creates future device_logs partitions to ensure logs are never rejected
 * Runs monthly and on startup to maintain partition coverage
 */

import { HousekeeperTask } from '../index';
import { pool } from '../../db/connection';

const task: HousekeeperTask = {
  name: 'device-logs-partition-maintenance',
  // Run on 1st of month at 1am
  schedule: '0 1 1 * *',
  // Also run on startup
  startup: true,
  
  run: async () => {
    console.log('📅 Ensuring future device logs partitions exist...');

    try {
      // Create next 3 months of partitions
      const result = await pool.query(`SELECT ensure_device_logs_partitions()`);
      console.log('✅ Device logs partitions ensured');

      // Show partition statistics
      const stats = await pool.query(`SELECT * FROM get_device_logs_partition_stats()`);
      
      if (stats.rows.length > 0) {
        console.log('\n📊 Current partition statistics:');
        const totals = {
          totalPartitions: 0,
          totalRows: 0,
          totalSize: '0 bytes'
        };
        
        stats.rows.forEach((row: any) => {
          console.log(`  ${row.partition_name}: ${row.row_count} rows, ${row.size}`);
          totals.totalPartitions++;
          totals.totalRows += parseInt(row.row_count);
        });
        
        console.log(`\n  Total: ${totals.totalPartitions} partitions, ${totals.totalRows} rows\n`);
      }

    } catch (error: any) {
      console.error('❌ Failed to maintain device logs partitions:', error.message);
      throw error;
    }
  }
};

export default task;
