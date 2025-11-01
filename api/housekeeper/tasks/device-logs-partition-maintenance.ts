/**
 * Device Logs Partition Maintenance Task
 * 
 * Ensures future partitions exist for device_logs table
 * Runs monthly to create partitions for upcoming months
 */

import { HousekeeperTask } from '../index';
import { pool } from '../../src/db/connection';

const task: HousekeeperTask = {
  name: 'device-logs-partition-maintenance',
  // Run monthly on the 1st at 1am
  schedule: '0 1 1 * *',
  // Also run on startup to ensure partitions exist
  startup: true,
  
  run: async () => {
    console.log('📅 Ensuring future device logs partitions exist...');

    try {
      // Call PostgreSQL function to create future partitions
      // This creates partitions for current month + next 3 months
      const result = await pool.query('SELECT * FROM ensure_device_logs_partitions()');

      // Log results
      if (result.rows.length > 0) {
        console.log('📅 Partition creation results:');
        for (const row of result.rows) {
          console.log(`   ${row.result}`);
        }
      }

      // Get current partition statistics
      const stats = await pool.query('SELECT * FROM get_device_logs_partition_stats()');

      if (stats.rows.length > 0) {
        console.log('\n📊 Partition statistics:');
        const partitionCount = stats.rows.length;
        const totalRows = stats.rows.reduce((sum, stat) => sum + parseInt(stat.row_count || '0'), 0);
        console.log(`   Total partitions: ${partitionCount}`);
        console.log(`   Total logs: ${totalRows.toLocaleString()}`);
      }

      console.log('\n✅ Device logs partition maintenance completed successfully');
    } catch (error: any) {
      console.error('❌ Device logs partition maintenance failed:', error.message);
      throw error;
    }
  }
};

export default task;
