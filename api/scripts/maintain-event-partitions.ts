#!/usr/bin/env ts-node

/**
 * Event Partition Maintenance
 * 
 * This script should be run regularly (e.g., daily via cron) to:
 * 1. Create future partitions (next 30 days)
 * 2. Drop old partitions (older than retention period)
 * 
 * Usage:
 *   npm run maintain-partitions [--retention-days=90]
 *   OR: ts-node api/scripts/maintain-event-partitions.ts [--retention-days=90]
 * 
 * Cron example (daily at 2 AM):
 *   0 2 * * * cd /app && npm run maintain-partitions
 */

import db from '../src/db/connection';

// Parse command line args
const args = process.argv.slice(2);
const retentionDays = parseInt(
  args.find(arg => arg.startsWith('--retention-days='))?.split('=')[1] || '90'
);

async function maintainPartitions() {
  console.log('🔧 Event Partition Maintenance');
  console.log(`📅 Retention period: ${retentionDays} days\n`);

  try {
    // 1. Create future partitions (next 30 days)
    console.log('📅 Creating future partitions...');
    const createResult = await db.query<{ result: string }>(`
      SELECT create_events_partition((CURRENT_DATE + (i || ' days')::INTERVAL)::DATE) as result
      FROM generate_series(0, 30) AS i
    `);

    const created = createResult.rows.filter((r: any) => r.result.startsWith('CREATED:')).length;
    const existing = createResult.rows.filter((r: any) => r.result.startsWith('EXISTS:')).length;

    console.log(`  ✓ Created: ${created} partitions`);
    console.log(`  ℹ Already exists: ${existing} partitions`);

    // 2. Drop old partitions
    console.log(`\n🗑️  Dropping partitions older than ${retentionDays} days...`);
    const dropResult = await db.query<{ result: string }>(`
      SELECT drop_old_event_partitions($1)
    `, [retentionDays]);

    const dropped = dropResult.rows.filter((r: any) => r.result && r.result.startsWith('DROPPED:')).length;
    
    console.log(`  ✓ Dropped: ${dropped} old partitions`);

    if (dropped > 0) {
      dropResult.rows
        .filter((r: any) => r.result && r.result.startsWith('DROPPED:'))
        .forEach((r: any) => console.log(`    - ${r.result}`));
    }

    // 3. Show statistics
    const stats = await db.query<{ total_partitions: string, oldest_date: Date, newest_date: Date }>(`
      SELECT 
        COUNT(*) as total_partitions,
        MIN(TO_DATE(SUBSTRING(tablename FROM 'events_(.*)'), 'YYYY_MM_DD')) as oldest_date,
        MAX(TO_DATE(SUBSTRING(tablename FROM 'events_(.*)'), 'YYYY_MM_DD')) as newest_date
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'events_%'
      AND tablename ~ '^events_[0-9]{4}_[0-9]{2}_[0-9]{2}$'
    `);

    const eventCounts = await db.query<{ 
      total_events: string,
      days_with_events: string,
      oldest_event: Date,
      newest_event: Date
    }>(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT DATE(timestamp)) as days_with_events,
        MIN(timestamp) as oldest_event,
        MAX(timestamp) as newest_event
      FROM events
    `);

    console.log('\n📊 Current Status:');
    console.log(`  Partitions: ${stats.rows[0].total_partitions}`);
    console.log(`  Date range: ${stats.rows[0].oldest_date} to ${stats.rows[0].newest_date}`);
    console.log(`  Total events: ${eventCounts.rows[0].total_events}`);
    console.log(`  Days with events: ${eventCounts.rows[0].days_with_events}`);

    const totalEvents = parseInt(eventCounts.rows[0].total_events);
    if (totalEvents > 0) {
      console.log(`  Oldest event: ${eventCounts.rows[0].oldest_event}`);
      console.log(`  Newest event: ${eventCounts.rows[0].newest_event}`);
    }

    // 4. Check for event types distribution
    const typeStats = await db.query<{
      event_type: string,
      count: string,
      first_seen: Date,
      last_seen: Date
    }>(`
      SELECT 
        event_type,
        COUNT(*) as count,
        MIN(timestamp) as first_seen,
        MAX(timestamp) as last_seen
      FROM events
      WHERE timestamp > NOW() - INTERVAL '7 days'
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 10
    `);

    if (typeStats.rows.length > 0) {
      console.log('\n📈 Top 10 Event Types (last 7 days):');
      typeStats.rows.forEach((row: any) => {
        console.log(`  ${row.event_type}: ${row.count} events`);
      });
    }

    console.log('\n✅ Partition maintenance completed successfully!\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error?.message || error);
    console.error('Stack:', error?.stack);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run
maintainPartitions();
