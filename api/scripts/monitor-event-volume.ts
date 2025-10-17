/**
 * Monitor Event Volume
 * 
 * Quick script to check current event publishing rates and storage usage
 */

import pool from '../src/db/connection';

interface EventStats {
  event_type: string;
  count: string;
  first_event: Date;
  last_event: Date;
}

interface PartitionSize {
  partition_name: string;
  size: string;
  row_count: string;
}

interface DeviceStats {
  aggregate_id: string;
  total_events: string;
  avg_per_day: string;
}

async function main() {
  console.log('📊 Event Volume Monitor\n');
  console.log('═'.repeat(70));
  
  // 1. Events in last 24 hours by type
  console.log('\n1️⃣ Events in Last 24 Hours (by type):\n');
  
  const last24h = await pool.query<EventStats>(
    `SELECT 
      event_type,
      COUNT(*) as count,
      MIN(timestamp) as first_event,
      MAX(timestamp) as last_event
    FROM events
    WHERE timestamp > NOW() - INTERVAL '24 hours'
    GROUP BY event_type
    ORDER BY count DESC`
  );
  
  if (last24h.rows.length === 0) {
    console.log('  No events in last 24 hours');
  } else {
    let totalEvents = 0;
    last24h.rows.forEach(row => {
      const count = parseInt(row.count);
      totalEvents += count;
      const perDevice = count / Math.max(1, parseInt(row.count) / 100); // rough estimate
      console.log(`  ${row.event_type.padEnd(35)} ${count.toString().padStart(6)} events`);
    });
    console.log(`  ${'─'.repeat(35)} ${'─'.repeat(6)}`);
    console.log(`  ${'TOTAL'.padEnd(35)} ${totalEvents.toString().padStart(6)} events`);
  }
  
  // 2. Partition sizes
  console.log('\n2️⃣ Partition Storage Usage (Top 10):\n');
  
  const partitions = await pool.query<PartitionSize>(
    `SELECT 
      schemaname || '.' || tablename as partition_name,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
      '0' as row_count
    FROM pg_tables
    WHERE tablename LIKE 'events_y%'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    LIMIT 10`
  );
  
  partitions.rows.forEach(row => {
    console.log(`  ${row.partition_name.padEnd(40)} ${row.size.padStart(10)}`);
  });
  
  // 3. Events per device (last 7 days)
  console.log('\n3️⃣ Busiest Devices (Last 7 Days):\n');
  
  const deviceStats = await pool.query<DeviceStats>(
    `SELECT 
      aggregate_id,
      COUNT(*) as total_events,
      ROUND(COUNT(*) / 7.0, 1) as avg_per_day
    FROM events
    WHERE aggregate_type = 'device'
    AND timestamp > NOW() - INTERVAL '7 days'
    GROUP BY aggregate_id
    ORDER BY total_events DESC
    LIMIT 10`
  );
  
  if (deviceStats.rows.length === 0) {
    console.log('  No device events in last 7 days');
  } else {
    console.log(`  ${'Device UUID'.padEnd(40)} ${'Total'.padStart(8)} ${'Avg/Day'.padStart(10)}`);
    console.log(`  ${'─'.repeat(40)} ${'─'.repeat(8)} ${'─'.repeat(10)}`);
    deviceStats.rows.forEach(row => {
      const shortUuid = row.aggregate_id.substring(0, 8) + '...' + row.aggregate_id.substring(row.aggregate_id.length - 4);
      console.log(`  ${shortUuid.padEnd(40)} ${row.total_events.padStart(8)} ${row.avg_per_day.padStart(10)}`);
    });
  }
  
  // 4. Event type distribution (all time)
  console.log('\n4️⃣ Event Type Distribution (All Time):\n');
  
  const distribution = await pool.query<EventStats>(
    `SELECT 
      event_type,
      COUNT(*) as count
    FROM events
    GROUP BY event_type
    ORDER BY count DESC
    LIMIT 15`
  );
  
  if (distribution.rows.length === 0) {
    console.log('  No events found');
  } else {
    const totalAllTime = distribution.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    
    distribution.rows.forEach(row => {
      const count = parseInt(row.count);
      const percentage = ((count / totalAllTime) * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(parseFloat(percentage) / 2));
      console.log(`  ${row.event_type.padEnd(35)} ${count.toString().padStart(8)} (${percentage.padStart(5)}%) ${bar}`);
    });
  }
  
  // 5. Noise indicators
  console.log('\n5️⃣ Noise Indicators:\n');
  
  const noiseCheck = await pool.query(
    `SELECT 
      COUNT(CASE WHEN event_type = 'device.heartbeat' THEN 1 END) as heartbeat_count,
      COUNT(CASE WHEN event_type = 'current_state.updated' THEN 1 END) as state_update_count,
      COUNT(*) as total_count
    FROM events
    WHERE timestamp > NOW() - INTERVAL '24 hours'`
  );
  
  const noise = noiseCheck.rows[0];
  const heartbeatPct = ((parseInt(noise.heartbeat_count) / parseInt(noise.total_count)) * 100).toFixed(1);
  const statePct = ((parseInt(noise.state_update_count) / parseInt(noise.total_count)) * 100).toFixed(1);
  
  console.log(`  device.heartbeat events:       ${noise.heartbeat_count.padStart(6)} (${heartbeatPct.padStart(5)}% of total)`);
  console.log(`  current_state.updated events:  ${noise.state_update_count.padStart(6)} (${statePct.padStart(5)}% of total)`);
  
  if (parseInt(noise.heartbeat_count) > 100) {
    console.log('\n  ⚠️  WARNING: High heartbeat event volume detected!');
    console.log('      Consider setting PUBLISH_HEARTBEAT_EVENTS=false in EventSourcingConfig');
  } else {
    console.log('\n  ✅ Heartbeat events under control');
  }
  
  if (parseInt(noise.state_update_count) > parseInt(noise.total_count) * 0.5) {
    console.log('  ⚠️  WARNING: state_update events are >50% of total!');
    console.log('      Consider setting PUBLISH_STATE_UPDATES=changes in EventSourcingConfig');
  } else {
    console.log('  ✅ State update events reasonable');
  }
  
  // 6. Recommendations
  console.log('\n6️⃣ Recommendations:\n');
  
  const totalLast7Days = deviceStats.rows.reduce((sum, row) => 
    sum + parseInt(row.total_events), 0
  );
  const avgPerDevicePerDay = deviceStats.rows.length > 0 
    ? totalLast7Days / deviceStats.rows.length / 7 
    : 0;
  
  if (avgPerDevicePerDay > 100) {
    console.log('  ⚠️  High event volume: avg ' + avgPerDevicePerDay.toFixed(1) + ' events/device/day');
    console.log('      Recommendations:');
    console.log('      - Set PUBLISH_STATE_UPDATES=changes (only publish when state changes)');
    console.log('      - Disable PUBLISH_HEARTBEAT_EVENTS (use device.online/offline instead)');
    console.log('      - Consider sampling: EVENT_SAMPLE_RATE=10 (1 in 10 events)');
  } else if (avgPerDevicePerDay > 50) {
    console.log('  ✅ Moderate event volume: avg ' + avgPerDevicePerDay.toFixed(1) + ' events/device/day');
    console.log('      Current settings seem reasonable');
  } else {
    console.log('  ✅ Low event volume: avg ' + avgPerDevicePerDay.toFixed(1) + ' events/device/day');
    console.log('      No action needed - event volume under control');
  }
  
  console.log('\n  💡 To adjust settings, edit src/config/event-sourcing.ts or set environment variables:');
  console.log('      - PUBLISH_HEARTBEAT_EVENTS=false');
  console.log('      - PUBLISH_STATE_UPDATES=changes');
  console.log('      - EVENT_SAMPLE_RATE=10');
  
  console.log('\n═'.repeat(70));
  console.log('Done! Run this script regularly to monitor event volume.\n');
  
  await pool.close();
}

main().catch(console.error);
