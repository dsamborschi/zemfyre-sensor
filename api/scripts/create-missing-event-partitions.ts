#!/usr/bin/env ts-node

/**
 * Create Missing Event Partitions
 * 
 * The events table is partitioned by day. This script creates partitions
 * for the past 30 days and next 30 days to ensure events can be inserted.
 * 
 * Run when you get: "no partition of relation 'events' found for row"
 * 
 * Usage:
 *   npm run fix-partitions
 *   OR: ts-node api/scripts/create-missing-event-partitions.ts
 */

import db from '../src/db/connection';

async function createMissingPartitions() {
  console.log('🔧 Creating missing event partitions...\n');

  try {
    // Create partitions for -30 to +30 days
    const result = await db.query<{ result: string }>(`
      SELECT create_events_partition((CURRENT_DATE + (i || ' days')::INTERVAL)::DATE) as result
      FROM generate_series(-30, 30) AS i
    `);

    console.log('✅ Partition creation results:');
    result.rows.forEach((row: any) => {
      if (row.result.startsWith('CREATED:')) {
        console.log(`  ✓ ${row.result}`);
      } else if (row.result.startsWith('EXISTS:')) {
        // Don't spam logs with existing partitions
      } else {
        console.log(`  ℹ ${row.result}`);
      }
    });

    // Show summary
    const partitions = await db.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'events_%'
      AND tablename ~ '^events_[0-9]{4}_[0-9]{2}_[0-9]{2}$'
    `);

    console.log(`\n📊 Total event partitions: ${partitions.rows[0].count}`);

    // Show date range of partitions
    const range = await db.query<{ oldest: Date, newest: Date }>(`
      SELECT 
        MIN(TO_DATE(SUBSTRING(tablename FROM 'events_(.*)'), 'YYYY_MM_DD')) as oldest,
        MAX(TO_DATE(SUBSTRING(tablename FROM 'events_(.*)'), 'YYYY_MM_DD')) as newest
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'events_%'
      AND tablename ~ '^events_[0-9]{4}_[0-9]{2}_[0-9]{2}$'
    `);

    console.log(`📅 Partition date range: ${range.rows[0].oldest} to ${range.rows[0].newest}`);
    console.log(`📅 Today: ${new Date().toISOString().split('T')[0]}`);

    // Test insert
    console.log('\n🧪 Testing event insert...');
    const testResult = await db.query<{ event_id: string }>(`
      SELECT publish_event(
        'test.partition_fix',
        'system',
        'test',
        '{"message": "Partition creation successful"}'::jsonb,
        'script',
        gen_random_uuid(),
        NULL,
        NULL
      ) as event_id
    `);

    console.log(`✅ Test event created: ${testResult.rows[0].event_id}`);

    // Clean up test event
    await db.query(`
      DELETE FROM events 
      WHERE event_type = 'test.partition_fix' 
      AND aggregate_id = 'test'
    `);

    console.log('\n✅ All done! You can now insert events without partition errors.\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error?.message || error);
    console.error('Details:', error?.detail || error?.hint || 'No additional details');
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run
createMissingPartitions();
