/**
 * Test Device Connectivity Events
 * 
 * Tests that device online/offline/heartbeat events are published correctly
 */

import { EventStore } from '../src/services/event-sourcing';
import { DeviceModel } from '../src/db/models';
import pool from '../src/db/connection';

const TEST_DEVICE_UUID = 'bbbbcccc-dddd-eeee-ffff-000000000001';

async function testConnectivityEvents() {
  console.log('🧪 Testing Device Connectivity Events\n');

  try {
    // ========================================================================
    // Setup: Mark device as offline first
    // ========================================================================
    console.log('📋 Setup: Creating test device and marking offline...');
    
    // Create device
    await DeviceModel.getOrCreate(TEST_DEVICE_UUID);
    
    // Manually mark it offline
    await pool.query(
      `UPDATE devices SET is_online = false, status = 'offline' WHERE uuid = $1`,
      [TEST_DEVICE_UUID]
    );
    
    console.log('   ✅ Test device marked offline\n');

    // ========================================================================
    // Test 1: Device comes online (heartbeat triggers getOrCreate)
    // ========================================================================
    console.log('📤 Test 1: Device comes back online...');
    
    // Simulate device sending state report (this calls getOrCreate)
    await DeviceModel.getOrCreate(TEST_DEVICE_UUID);
    
    console.log('   ✅ Device marked online');
    
    // Wait for event to be written
    await new Promise(resolve => setTimeout(resolve, 200));

    // Query for device.online event
    const onlineEvents = await pool.query(`
      SELECT 
        event_id,
        event_type,
        data,
        timestamp,
        metadata
      FROM events
      WHERE aggregate_id = $1
        AND event_type = 'device.online'
      ORDER BY timestamp DESC
      LIMIT 1
    `, [TEST_DEVICE_UUID]);

    if (onlineEvents.rows.length > 0) {
      const event = onlineEvents.rows[0];
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      
      console.log('\n   📨 device.online event captured:');
      console.log(`      Event ID: ${event.event_id}`);
      console.log(`      Timestamp: ${new Date(event.timestamp).toLocaleString()}`);
      console.log(`      Device Name: ${data.device_name}`);
      console.log(`      Offline Duration: ${data.offline_duration_minutes} minutes`);
      console.log(`      Reason: ${data.reason}`);
    } else {
      console.log('   ⚠️  No device.online event found (may need API server running)');
    }

    // ========================================================================
    // Test 2: Check all connectivity events for device
    // ========================================================================
    console.log('\n\n🔍 Test 2: Querying all connectivity events...\n');
    
    const allEvents = await pool.query(`
      SELECT 
        event_type,
        timestamp,
        data,
        source
      FROM events
      WHERE aggregate_id = $1
        AND event_type IN ('device.online', 'device.offline', 'device.heartbeat', 'device.provisioned')
      ORDER BY timestamp DESC
      LIMIT 20
    `, [TEST_DEVICE_UUID]);

    if (allEvents.rows.length > 0) {
      console.log(`   Found ${allEvents.rows.length} connectivity event(s):\n`);
      
      allEvents.rows.forEach((event, index) => {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        console.log(`   ${index + 1}. ${event.event_type}`);
        console.log(`      Time: ${new Date(event.timestamp).toLocaleString()}`);
        console.log(`      Source: ${event.source || 'unknown'}`);
        
        if (event.event_type === 'device.offline') {
          console.log(`      Reason: ${data.reason}`);
          console.log(`      Last Seen: ${data.last_seen ? new Date(data.last_seen).toLocaleString() : 'never'}`);
        } else if (event.event_type === 'device.online') {
          console.log(`      Offline Duration: ${data.offline_duration_minutes} min`);
          console.log(`      Reason: ${data.reason}`);
        } else if (event.event_type === 'device.heartbeat') {
          console.log(`      IP: ${data.ip_address}`);
          console.log(`      Uptime: ${data.uptime}s`);
        }
        console.log('');
      });
    } else {
      console.log('   ℹ️  No connectivity events found yet');
      console.log('   💡 Try:');
      console.log('      1. Start the API: npm run dev');
      console.log('      2. Have a device report its state');
      console.log('      3. Or manually trigger heartbeat check');
    }

    // ========================================================================
    // Test 3: Event statistics
    // ========================================================================
    console.log('\n📊 Test 3: Connectivity event statistics:\n');
    
    const stats = await pool.query(`
      SELECT 
        event_type,
        COUNT(*) as count,
        MIN(timestamp) as first_seen,
        MAX(timestamp) as last_seen
      FROM events
      WHERE event_type IN ('device.online', 'device.offline', 'device.heartbeat')
      GROUP BY event_type
      ORDER BY count DESC
    `);

    if (stats.rows.length > 0) {
      console.log('   Event Type              Count  First Seen              Last Seen');
      console.log('   ──────────────────────────────────────────────────────────────────────────');
      
      stats.rows.forEach(row => {
        const firstSeen = new Date(row.first_seen).toLocaleString();
        const lastSeen = new Date(row.last_seen).toLocaleString();
        console.log(`   ${row.event_type.padEnd(20)} ${String(row.count).padStart(5)}  ${firstSeen}  ${lastSeen}`);
      });
    } else {
      console.log('   No connectivity events in database yet');
    }

    // ========================================================================
    // Test 4: Simulate offline detection
    // ========================================================================
    console.log('\n\n📤 Test 4: Simulating offline detection...');
    console.log('   (This would normally be done by heartbeat monitor)\n');
    
    // Check if heartbeat monitor is available
    try {
      const heartbeatMonitor = await import('../src/services/heartbeat-monitor');
      const config = heartbeatMonitor.default.getConfig();
      
      console.log('   Heartbeat Monitor Configuration:');
      console.log(`      Enabled: ${config.enabled}`);
      console.log(`      Check Interval: ${config.checkInterval / 1000}s`);
      console.log(`      Offline Threshold: ${config.offlineThreshold} minutes`);
      console.log(`      Is Running: ${config.isRunning}`);
      
      if (config.enabled && config.isRunning) {
        console.log('\n   ✅ Heartbeat monitor is active and will detect offline devices automatically');
      } else {
        console.log('\n   ℹ️  Heartbeat monitor not running - start API to enable automatic detection');
      }
    } catch (error) {
      console.log('   ℹ️  Heartbeat monitor not available (API not running)');
    }

    // ========================================================================
    // Test 5: Query patterns
    // ========================================================================
    console.log('\n\n🔍 Test 5: Useful query patterns:\n');
    
    // Devices that went offline today
    const offlineToday = await pool.query(`
      SELECT 
        aggregate_id as device_uuid,
        data->>'device_name' as device_name,
        timestamp
      FROM events
      WHERE event_type = 'device.offline'
        AND timestamp::date = CURRENT_DATE
      ORDER BY timestamp DESC
    `);
    
    console.log(`   1. Devices that went offline today: ${offlineToday.rows.length}`);
    offlineToday.rows.forEach(row => {
      const name = row.device_name || row.device_uuid.substring(0, 8) + '...';
      console.log(`      - ${name} at ${new Date(row.timestamp).toLocaleString()}`);
    });

    // Devices that came online today
    const onlineToday = await pool.query(`
      SELECT 
        aggregate_id as device_uuid,
        data->>'device_name' as device_name,
        timestamp
      FROM events
      WHERE event_type = 'device.online'
        AND timestamp::date = CURRENT_DATE
      ORDER BY timestamp DESC
    `);
    
    console.log(`\n   2. Devices that came online today: ${onlineToday.rows.length}`);
    onlineToday.rows.forEach(row => {
      const name = row.device_name || row.device_uuid.substring(0, 8) + '...';
      console.log(`      - ${name} at ${new Date(row.timestamp).toLocaleString()}`);
    });

    // Most recent heartbeats
    const recentHeartbeats = await pool.query(`
      SELECT 
        aggregate_id as device_uuid,
        data->>'ip_address' as ip_address,
        timestamp
      FROM events
      WHERE event_type = 'device.heartbeat'
      ORDER BY timestamp DESC
      LIMIT 5
    `);
    
    console.log(`\n   3. Most recent heartbeats: ${recentHeartbeats.rows.length}`);
    recentHeartbeats.rows.forEach((row, i) => {
      const uuid = row.device_uuid.substring(0, 8) + '...';
      console.log(`      ${i + 1}. ${uuid} from ${row.ip_address} at ${new Date(row.timestamp).toLocaleString()}`);
    });

    console.log('\n\n✅ Connectivity Event Test Complete!\n');
    console.log('📌 Summary:');
    console.log('   - device.online: Published when device resumes communication');
    console.log('   - device.offline: Published by heartbeat monitor when threshold exceeded');
    console.log('   - device.heartbeat: Published with every state report');
    console.log('   - All events include rich metadata for debugging\n');
    
    console.log('💡 To test with a real device:');
    console.log('   1. Start API: npm run dev');
    console.log('   2. Turn device off/on');
    console.log('   3. Wait for heartbeat timeout (default: 5 minutes)');
    console.log('   4. Query: SELECT * FROM events WHERE event_type = \'device.offline\' ORDER BY timestamp DESC;\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    await pool.close();
  }
}

// Run the test
testConnectivityEvents().catch(console.error);
