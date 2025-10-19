/**
 * Shadow History Retention Scheduler
 * 
 * Periodically deletes old shadow history records to prevent unbounded database growth.
 * Default retention: 90 days
 */

import { query } from '../db/connection';
import { auditLogger } from '../utils/audit-logger';

let retentionInterval: NodeJS.Timeout | null = null;

const RETENTION_CHECK_INTERVAL = parseInt(process.env.SHADOW_RETENTION_CHECK_HOURS || '24') * 60 * 60 * 1000; // Default: 24 hours
const RETENTION_DAYS = parseInt(process.env.SHADOW_RETENTION_DAYS || '90'); // Default: 90 days

/**
 * Start the retention scheduler
 */
export function startRetentionScheduler(): void {
  if (retentionInterval) {
    console.log('⚠️  Shadow retention scheduler already running');
    return;
  }

  console.log(`🗑️  Starting shadow history retention scheduler`);
  console.log(`    Check interval: ${RETENTION_CHECK_INTERVAL / 3600000} hours`);
  console.log(`    Retention period: ${RETENTION_DAYS} days`);

  // Run immediately on startup (optional - you can comment this out)
  // runRetentionCheck();

  // Schedule periodic checks
  retentionInterval = setInterval(runRetentionCheck, RETENTION_CHECK_INTERVAL);
}

/**
 * Stop the retention scheduler
 */
export function stopRetentionScheduler(): void {
  if (retentionInterval) {
    clearInterval(retentionInterval);
    retentionInterval = null;
    console.log('✅ Shadow retention scheduler stopped');
  }
}

/**
 * Run retention check (deletes old shadow history records)
 */
async function runRetentionCheck(): Promise<void> {
  try {
    console.log(`\n🗑️  Running shadow history retention check (deleting records older than ${RETENTION_DAYS} days)...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    // Delete old shadow history records
    const result = await query(
      `DELETE FROM device_shadow_history 
       WHERE timestamp < $1
       RETURNING id`,
      [cutoffDate]
    );

    const deletedCount = result.rows.length;

    if (deletedCount > 0) {
      console.log(`✅ Deleted ${deletedCount} old shadow history records (older than ${cutoffDate.toISOString()})`);
      
      // Log to audit trail
      auditLogger.info('Shadow history retention completed', {
        deletedCount,
        cutoffDate: cutoffDate.toISOString(),
        retentionDays: RETENTION_DAYS
      });
    } else {
      console.log(`✅ No old shadow history records to delete`);
    }

    // Get current database statistics
    const statsResult = await query(
      `SELECT 
        COUNT(*) as total_records,
        MIN(timestamp) as oldest_record,
        MAX(timestamp) as newest_record,
        pg_size_pretty(pg_total_relation_size('device_shadow_history')) as table_size
       FROM device_shadow_history`,
      []
    );

    if (statsResult.rows.length > 0) {
      const stats = statsResult.rows[0];
      console.log(`📊 Shadow history statistics:`);
      console.log(`    Total records: ${stats.total_records}`);
      console.log(`    Oldest record: ${stats.oldest_record}`);
      console.log(`    Newest record: ${stats.newest_record}`);
      console.log(`    Table size: ${stats.table_size}`);
    }

  } catch (error) {
    console.error('❌ Failed to run retention check:', error);
    auditLogger.error('Shadow history retention failed', { error });
  }
}

/**
 * Manually trigger retention check (useful for testing)
 */
export async function triggerRetentionCheck(): Promise<void> {
  await runRetentionCheck();
}
