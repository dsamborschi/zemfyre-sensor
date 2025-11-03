#!/usr/bin/env ts-node

/**
 * Check Event Partitions Status
 * 
 * Quick diagnostic tool to check if event partitions exist for today
 * and show the current partition status.
 * 
 * Usage:
 *   npm run check-partitions
 *   OR: ts-node scripts/check-event-partitions.ts
 */

import db from '../src/db/connection';

async function checkPartitions() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const todayPartitionName = `events_${today.replace(/-/g, '_')}`;

    console.log('🔍 Event Partitions Status\n');
    console.log(`📅 Today: ${today}`);
    console.log(`📦 Expected partition: ${todayPartitionName}`);

    // Check if today's partition exists
    const partitionExists = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = $1
      ) as exists
    `, [todayPartitionName]);

    if (partitionExists.rows[0].exists) {
      console.log(`✅ Today's partition EXISTS`);
    } else {
      console.log(`❌ Today's partition MISSING - Run create-missing-event-partitions.ts`);
    }

    // Show all partitions
    const partitions = await db.query<{ tablename: string, partition_date: Date }>(`
      SELECT 
        tablename,
        TO_DATE(SUBSTRING(tablename FROM 'events_(.*)'), 'YYYY_MM_DD') as partition_date
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'events_%'
      AND tablename ~ '^events_[0-9]{4}_[0-9]{2}_[0-9]{2}$'
      ORDER BY tablename DESC
      LIMIT 10
    `);

    const totalResult = await db.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'events_%'
    `);
    
    console.log(`\n📊 Total partitions: ${totalResult.rows[0].count}`);

    if (partitions.rows.length > 0) {
      console.log(`\n🗓️  Most recent partitions:`);
      partitions.rows.forEach((row: any) => {
        const isToday = row.tablename === todayPartitionName;
        const marker = isToday ? ' 👈 TODAY' : '';
        console.log(`  ${row.tablename} (${row.partition_date})${marker}`);
      });
    }

    // Check date range
    const range = await db.query<{ oldest: Date, newest: Date }>(`
      SELECT 
        MIN(TO_DATE(SUBSTRING(tablename FROM 'events_(.*)'), 'YYYY_MM_DD')) as oldest,
        MAX(TO_DATE(SUBSTRING(tablename FROM 'events_(.*)'), 'YYYY_MM_DD')) as newest
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'events_%'
      AND tablename ~ '^events_[0-9]{4}_[0-9]{2}_[0-9]{2}$'
    `);

    console.log(`\n📅 Partition date range: ${range.rows[0].oldest} to ${range.rows[0].newest}`);

    // Check if we need partitions
    const newestDate = new Date(range.rows[0].newest);
    const todayDate = new Date();
    const daysUntilNewest = Math.floor((newestDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilNewest < 7) {
      console.log(`\n⚠️  WARNING: Only ${daysUntilNewest} days of future partitions remaining`);
      console.log(`   Recommendation: Run maintain-event-partitions.ts to create more partitions`);
    } else {
      console.log(`\n✅ ${daysUntilNewest} days of future partitions available`);
    }

    // Try to count recent events
    const recentEvents = await db.query<{ count: string, oldest: Date, newest: Date }>(`
      SELECT 
        COUNT(*) as count,
        MIN(timestamp) as oldest,
        MAX(timestamp) as newest
      FROM events
      WHERE timestamp > NOW() - INTERVAL '1 day'
    `);

    const eventCount = parseInt(recentEvents.rows[0].count);
    if (eventCount > 0) {
      console.log(`\n📈 Recent Events (last 24 hours): ${eventCount}`);
    } else {
      console.log(`\nℹ️  No events in the last 24 hours`);
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error?.message || error);
    if (error?.message?.includes('no partition of relation')) {
      console.error('\n💡 Solution: Run create-missing-event-partitions.ts to fix this');
    }
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run
checkPartitions();
