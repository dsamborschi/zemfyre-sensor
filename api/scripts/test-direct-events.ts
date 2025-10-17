/**
 * Direct Event Publisher Test
 * 
 * Tests event publishing without requiring the API server to be running.
 * Simulates what the API endpoints would do.
 */

import { EventPublisher, EventStore } from '../src/services/event-sourcing';
import pool from '../src/db/connection';

const TEST_DEVICE_UUID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';

async function testDirectEventPublishing() {
  console.log('🧪 Testing Direct Event Publishing (API Simulation)\n');

  try {
    // Create event publisher with API source
    const publisher = new EventPublisher('api');

    // ========================================================================
    // Simulate: Device Registration
    // ========================================================================
    console.log('📤 1. Simulating device.provisioned event...');
    
    const provisionedEventId = await publisher.publish(
      'device.provisioned',
      'device',
      TEST_DEVICE_UUID,
      {
        device_name: 'api-test-device',
        device_type: 'raspberry-pi-4',
        fleet_id: 'test-fleet',
        provisioned_at: new Date().toISOString(),
        ip_address: '192.168.1.50',
        mac_address: 'b8:27:eb:aa:bb:cc',
        os_version: 'Raspbian 11',
        supervisor_version: '1.0.0'
      },
      {
        metadata: {
          user_agent: 'Test Script',
          provisioning_key_id: 'test-key-123',
          endpoint: '/api/v1/device/register'
        }
      }
    );

    console.log(`   ✅ Event published: ${provisionedEventId}\n`);

    // ========================================================================
    // Simulate: Target State Update
    // ========================================================================
    console.log('📤 2. Simulating target_state.updated event...');
    
    const targetStateEventId = await publisher.publish(
      'target_state.updated',
      'device',
      TEST_DEVICE_UUID,
      {
        new_state: {
          apps: {
            1000: {
              appId: 1000,
              appName: 'nginx',
              services: [
                {
                  serviceId: 1,
                  serviceName: 'web',
                  imageName: 'nginx:latest',
                  config: { ports: ['80:80'] }
                }
              ]
            }
          },
          config: { DEVICE_HOSTNAME: 'test-device' }
        },
        old_state: { apps: {}, config: {} },
        version: 1,
        apps_added: ['1000'],
        apps_removed: [],
        apps_count: 1
      },
      {
        metadata: {
          ip_address: '127.0.0.1',
          user_agent: 'Test Script',
          endpoint: '/api/v1/devices/:uuid/target-state'
        }
      }
    );

    console.log(`   ✅ Event published: ${targetStateEventId}\n`);

    // ========================================================================
    // Simulate: Current State Report
    // ========================================================================
    console.log('📤 3. Simulating current_state.updated event...');
    
    const currentStateEventId = await publisher.publish(
      'current_state.updated',
      'device',
      TEST_DEVICE_UUID,
      {
        apps: {
          1000: {
            status: 'running',
            containerId: 'abc123def456'
          }
        },
        config: {},
        system_info: {
          ip_address: '192.168.1.50',
          mac_address: 'b8:27:eb:aa:bb:cc',
          os_version: 'Raspbian 11',
          supervisor_version: '1.0.0',
          uptime: 7200,
          cpu_usage: 18.5,
          memory_usage: 52.3,
          storage_usage: 65.0
        },
        apps_count: 1,
        reported_at: new Date().toISOString()
      },
      {
        metadata: {
          ip_address: '127.0.0.1',
          endpoint: '/api/v1/device/state'
        }
      }
    );

    console.log(`   ✅ Event published: ${currentStateEventId}\n`);

    // ========================================================================
    // Simulate: Device Offline
    // ========================================================================
    console.log('📤 4. Simulating device.offline event...');
    
    const offlineEventId = await publisher.publish(
      'device.offline',
      'device',
      TEST_DEVICE_UUID,
      {
        device_name: 'api-test-device',
        device_type: 'raspberry-pi-4',
        previous_state: true,
        new_state: false,
        reason: 'administratively disabled',
        changed_at: new Date().toISOString()
      },
      {
        metadata: {
          ip_address: '127.0.0.1',
          user_agent: 'Admin Console',
          endpoint: '/api/v1/devices/:uuid/active'
        }
      }
    );

    console.log(`   ✅ Event published: ${offlineEventId}\n`);

    // Wait for writes to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // ========================================================================
    // Query Events
    // ========================================================================
    console.log('🔍 Querying events for test device...\n');
    
    const events = await EventStore.getAggregateEvents('device', TEST_DEVICE_UUID);
    
    console.log(`   Found ${events.length} events:\n`);
    events.forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.event_type}`);
      console.log(`      Event ID: ${event.event_id}`);
      console.log(`      Timestamp: ${new Date(event.timestamp).toLocaleString()}`);
      console.log(`      Source: ${event.source}`);
      
      if (event.metadata) {
        const metadata = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;
        if (metadata.endpoint) {
          console.log(`      Endpoint: ${metadata.endpoint}`);
        }
      }
      console.log('');
    });

    // ========================================================================
    // Event Chain (Correlation)
    // ========================================================================
    console.log('🔗 Event chain (correlation):\n');
    
    const correlationId = publisher.getCorrelationId();
    console.log(`   Correlation ID: ${correlationId}\n`);
    
    const chain = await EventStore.getEventChain(correlationId);
    console.log(`   Chain contains ${chain.length} events:\n`);
    
    chain.forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.event_type} → ${event.aggregate_type}:${event.aggregate_id}`);
    });

    // ========================================================================
    // Statistics
    // ========================================================================
    console.log('\n\n📊 Event statistics:\n');
    
    const stats = await EventStore.getStats();
    
    console.log('   Top event types:');
    stats.slice(0, 10).forEach(stat => {
      console.log(`     - ${stat.event_type}: ${stat.event_count} events`);
    });

    // ========================================================================
    // Query Patterns
    // ========================================================================
    console.log('\n\n🔍 Advanced queries:\n');
    
    // All target state changes
    const targetStateEvents = await EventStore.getEventsByType('target_state.updated');
    console.log(`   1. All target_state.updated events: ${targetStateEvents.length}`);
    
    // All current state reports
    const currentStateEvents = await EventStore.getEventsByType('current_state.updated');
    console.log(`   2. All current_state.updated events: ${currentStateEvents.length}`);
    
    // Recent events across all devices
    const recentEvents = await EventStore.getRecentEvents(20);
    console.log(`   3. Recent events (last 20): ${recentEvents.length}`);
    
    console.log('\n   Recent event types:');
    const recentTypes: Record<string, number> = {};
    recentEvents.forEach(e => {
      recentTypes[e.event_type] = (recentTypes[e.event_type] || 0) + 1;
    });
    Object.entries(recentTypes).forEach(([type, count]) => {
      console.log(`     - ${type}: ${count}`);
    });

    // ========================================================================
    // Summary
    // ========================================================================
    console.log('\n\n✅ Direct Event Publishing Test Complete!\n');
    console.log('📌 Summary:');
    console.log(`   - Published 4 events for device ${TEST_DEVICE_UUID.substring(0, 8)}...`);
    console.log(`   - All events linked by correlation ID: ${correlationId}`);
    console.log(`   - Events stored in partitioned table with full audit trail`);
    console.log(`   - Ready for querying, replay, and analytics\n`);
    
    console.log('💡 Try these queries in psql:');
    console.log(`   SELECT * FROM get_aggregate_events('device', '${TEST_DEVICE_UUID}', NULL);`);
    console.log(`   SELECT * FROM get_event_chain('${correlationId}');`);
    console.log(`   SELECT * FROM events WHERE event_type = 'target_state.updated' ORDER BY timestamp DESC;\n`);

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
testDirectEventPublishing().catch(console.error);
