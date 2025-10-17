/**
 * Test API Event Publishing
 * 
 * This script tests the event publishing integration in the API endpoints.
 * It makes API calls and then queries the event store to verify events were published.
 */

import pool from '../src/db/connection';
import fetch from 'node-fetch';

const API_URL = 'http://localhost:4002';
const TEST_DEVICE_UUID = '12345678-1234-1234-1234-123456789abc';

interface ApiEvent {
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  data: any;
  timestamp: string;
  metadata: any;
  source: string;
}

async function testApiEvents() {
  console.log('🧪 Testing API Event Publishing Integration\n');

  try {
    // ========================================================================
    // Test 1: Set Target State (should publish target_state.updated event)
    // ========================================================================
    console.log('📤 Test 1: Setting target state...');
    
    const targetStateResponse = await fetch(`${API_URL}/api/v1/devices/${TEST_DEVICE_UUID}/target-state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        apps: {
          1000: {
            appId: 1000,
            appName: 'test-app',
            services: [
              {
                serviceId: 1,
                serviceName: 'web',
                imageName: 'nginx:latest',
                config: {
                  ports: ['80:80'],
                  environment: { NODE_ENV: 'production' }
                }
              }
            ]
          }
        },
        config: {
          DEVICE_HOSTNAME: 'test-device-001'
        }
      })
    });

    if (targetStateResponse.ok) {
      const result = await targetStateResponse.json();
      console.log(`   ✅ Target state updated (version ${result.version})`);
    } else {
      console.log(`   ❌ Failed: ${targetStateResponse.statusText}`);
    }

    // Wait a bit for event to be written
    await new Promise(resolve => setTimeout(resolve, 100));

    // Query events
    console.log('\n🔍 Querying events from event store...\n');
    
    const eventsResult = await pool.query<ApiEvent>(`
      SELECT 
        event_id,
        event_type,
        aggregate_type,
        aggregate_id,
        data,
        timestamp,
        metadata,
        source
      FROM events
      WHERE aggregate_id = $1
      ORDER BY timestamp DESC
      LIMIT 10
    `, [TEST_DEVICE_UUID]);

    if (eventsResult.rows.length === 0) {
      console.log('   ⚠️  No events found for this device');
    } else {
      console.log(`   📊 Found ${eventsResult.rows.length} event(s):\n`);
      
      eventsResult.rows.forEach((event, index) => {
        console.log(`   ${index + 1}. ${event.event_type}`);
        console.log(`      Event ID: ${event.event_id}`);
        console.log(`      Timestamp: ${new Date(event.timestamp).toLocaleString()}`);
        console.log(`      Source: ${event.source}`);
        
        if (event.event_type === 'target_state.updated') {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          console.log(`      Apps Count: ${data.apps_count}`);
          console.log(`      Apps Added: ${JSON.stringify(data.apps_added)}`);
          console.log(`      Version: ${data.version}`);
        }
        
        if (event.metadata) {
          const metadata = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;
          console.log(`      Metadata: ${JSON.stringify(metadata)}`);
        }
        
        console.log('');
      });
    }

    // ========================================================================
    // Test 2: Simulate Current State Report
    // ========================================================================
    console.log('\n📤 Test 2: Simulating device current state report...');
    
    const currentStateResponse = await fetch(`${API_URL}/api/v1/device/state`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        [TEST_DEVICE_UUID]: {
          apps: {
            1000: {
              status: 'running',
              containerId: 'abc123'
            }
          },
          config: {},
          ip_address: '192.168.1.100',
          local_ip: '192.168.1.100',
          mac_address: 'b8:27:eb:12:34:56',
          os_version: 'Raspbian GNU/Linux 11 (bullseye)',
          supervisor_version: '1.0.0',
          uptime: 3600,
          cpu_usage: 25.5,
          memory_usage: 45.2,
          storage_usage: 60.0
        }
      })
    });

    if (currentStateResponse.ok) {
      console.log('   ✅ Current state reported');
    } else {
      console.log(`   ❌ Failed: ${currentStateResponse.statusText}`);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // ========================================================================
    // Test 3: Toggle Device Active Status
    // ========================================================================
    console.log('\n📤 Test 3: Disabling device (should publish device.offline event)...');
    
    const disableResponse = await fetch(`${API_URL}/api/v1/devices/${TEST_DEVICE_UUID}/active`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        is_active: false
      })
    });

    if (disableResponse.ok) {
      console.log('   ✅ Device disabled');
    } else {
      console.log(`   ❌ Failed: ${disableResponse.statusText}`);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('\n📤 Test 4: Re-enabling device (should publish device.online event)...');
    
    const enableResponse = await fetch(`${API_URL}/api/v1/devices/${TEST_DEVICE_UUID}/active`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        is_active: true
      })
    });

    if (enableResponse.ok) {
      console.log('   ✅ Device enabled');
    } else {
      console.log(`   ❌ Failed: ${enableResponse.statusText}`);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // ========================================================================
    // Final Event Query
    // ========================================================================
    console.log('\n🔍 Final event summary for device:\n');
    
    const finalEventsResult = await pool.query<ApiEvent>(`
      SELECT 
        event_type,
        timestamp,
        source
      FROM events
      WHERE aggregate_id = $1
      ORDER BY timestamp DESC
      LIMIT 20
    `, [TEST_DEVICE_UUID]);

    console.log(`   Total events: ${finalEventsResult.rows.length}\n`);
    
    const eventTypeCounts: Record<string, number> = {};
    finalEventsResult.rows.forEach(event => {
      eventTypeCounts[event.event_type] = (eventTypeCounts[event.event_type] || 0) + 1;
    });

    console.log('   Event breakdown:');
    Object.entries(eventTypeCounts).forEach(([type, count]) => {
      console.log(`     - ${type}: ${count}`);
    });

    // ========================================================================
    // Query by Event Type
    // ========================================================================
    console.log('\n\n🔍 Querying all target_state.updated events across all devices:\n');
    
    const targetStateEvents = await pool.query<ApiEvent>(`
      SELECT 
        event_id,
        aggregate_id as device_uuid,
        data->>'version' as version,
        data->>'apps_count' as apps_count,
        timestamp
      FROM events
      WHERE event_type = 'target_state.updated'
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    if (targetStateEvents.rows.length > 0) {
      console.log(`   Found ${targetStateEvents.rows.length} target state changes:\n`);
      targetStateEvents.rows.forEach((event, index) => {
        const deviceId = (event as any).device_uuid;
        const version = (event as any).version;
        const appsCount = (event as any).apps_count;
        const timestamp = new Date(event.timestamp).toLocaleString();
        
        console.log(`   ${index + 1}. Device: ${deviceId.substring(0, 8)}... | Version: ${version} | Apps: ${appsCount} | ${timestamp}`);
      });
    } else {
      console.log('   No target state events found');
    }

    console.log('\n\n✅ API Event Publishing Test Complete!\n');
    console.log('💡 Next steps:');
    console.log('   1. Check events in database: SELECT * FROM events ORDER BY timestamp DESC LIMIT 10;');
    console.log('   2. Query by device: SELECT * FROM get_aggregate_events(\'device\', \'<uuid>\', NULL);');
    console.log('   3. Set up EventListener for real-time processing');
    console.log('   4. Build projections from events\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.close();
  }
}

// Run the test
testApiEvents().catch(console.error);
