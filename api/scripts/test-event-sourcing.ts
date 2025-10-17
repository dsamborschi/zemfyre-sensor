/**
 * Test Event Sourcing Implementation
 * Demonstrates publishing, querying, and listening to events
 */

import pool from '../src/db/connection';
import { EventPublisher, EventStore, EventListener } from '../src/services/event-sourcing';
import crypto from 'crypto';

async function testEventSourcing() {
  console.log('🧪 Testing Event Sourcing Implementation\n');

  try {
    // ========================================================================
    // Step 1: Verify tables exist
    // ========================================================================
    console.log('📋 Step 1: Verify database tables...');
    
    const tablesResult = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('events', 'event_types', 'state_projections', 'event_cursors')
      ORDER BY tablename
    `);
    
    console.log('   Tables found:', tablesResult.rows.map(r => r.tablename).join(', '));
    
    // Count event types
    const eventTypesResult = await pool.query('SELECT COUNT(*) FROM event_types');
    console.log(`   Event types registered: ${eventTypesResult.rows[0].count}\n`);

    // ========================================================================
    // Step 2: Publish test events
    // ========================================================================
    console.log('📤 Step 2: Publishing test events...');
    
    const testDeviceUuid = crypto.randomUUID();
    const publisher = new EventPublisher('test_script');
    
    // Publish device provisioned event
    const event1 = await publisher.publish(
      'device.provisioned',
      'device',
      testDeviceUuid,
      {
        device_name: 'test-device-001',
        device_type: 'raspberry-pi-4',
        provisioned_at: new Date(),
      },
      {
        metadata: {
          test_run: true,
          user: 'system',
        },
      }
    );
    console.log(`   ✅ Published device.provisioned (${event1})`);

    // Publish target state updated event
    const event2 = await publisher.publish(
      'target_state.updated',
      'device',
      testDeviceUuid,
      {
        old_state: {},
        new_state: {
          apps: {
            'my-app': {
              image: 'iotistic/app:v1',
              env: { API_KEY: 'test' },
            },
          },
        },
        changed_fields: ['apps.my-app'],
      }
    );
    console.log(`   ✅ Published target_state.updated (${event2})`);

    // Publish container created event
    const event3 = await publisher.publish(
      'container.created',
      'app',
      'my-app',
      {
        container_id: 'abc123',
        image: 'iotistic/app:v1',
        created_at: new Date(),
      },
      { causationId: event2 } // Link to target state change
    );
    console.log(`   ✅ Published container.created (${event3})`);
    
    console.log(`   Correlation ID: ${publisher.getCorrelationId()}\n`);

    // ========================================================================
    // Step 3: Query events
    // ========================================================================
    console.log('🔍 Step 3: Querying events...\n');

    // Get device events
    const deviceEvents = await EventStore.getAggregateEvents('device', testDeviceUuid);
    console.log('   Device Events:');
    for (const event of deviceEvents) {
      console.log(`     - ${event.event_type} at ${event.timestamp}`);
      console.log(`       Data: ${JSON.stringify(event.data).substring(0, 80)}...`);
    }
    console.log();

    // Get event chain
    const chain = await EventStore.getEventChain(publisher.getCorrelationId());
    console.log('   Event Chain (by correlation_id):');
    for (const event of chain) {
      console.log(`     ${event.timestamp} | ${event.event_type} | ${event.aggregate_type}:${event.aggregate_id}`);
      if (event.causation_id) {
        console.log(`       ↳ Caused by: ${event.causation_id}`);
      }
    }
    console.log();

    // ========================================================================
    // Step 4: Test event statistics
    // ========================================================================
    console.log('📊 Step 4: Event statistics...\n');
    
    const stats = await EventStore.getStats(1); // Last 1 day
    console.log('   Event Type                          Count  First Seen           Last Seen');
    console.log('   ──────────────────────────────────────────────────────────────────────────────');
    for (const stat of stats.slice(0, 10)) {
      const type = stat.event_type.padEnd(35);
      const count = String(stat.count).padStart(5);
      const first = stat.first_seen.toISOString().substring(0, 19);
      const last = stat.last_seen.toISOString().substring(0, 19);
      console.log(`   ${type} ${count}  ${first}  ${last}`);
    }
    console.log();

    // ========================================================================
    // Step 5: Test real-time listener (optional)
    // ========================================================================
    console.log('👂 Step 5: Testing real-time event listener...');
    console.log('   Starting listener for 5 seconds...\n');

    const listener = new EventListener();
    await listener.start();

    let eventCount = 0;
    listener.on('event', (payload) => {
      eventCount++;
      console.log(`   📨 Received event: ${payload.event_type}`);
    });

    // Publish a test event
    setTimeout(async () => {
      const testPublisher = new EventPublisher('test_listener');
      await testPublisher.publish(
        'device.heartbeat',
        'device',
        testDeviceUuid,
        { timestamp: new Date() }
      );
      console.log('   📤 Published test heartbeat event');
    }, 1000);

    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    await listener.stop();
    console.log(`\n   Received ${eventCount} event(s) during listening period\n`);

    // ========================================================================
    // Step 6: Test partition info
    // ========================================================================
    console.log('📦 Step 6: Event partition info...\n');
    
    const partitionsResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'events_%'
      AND tablename ~ '^events_[0-9]{4}_[0-9]{2}_[0-9]{2}$'
      ORDER BY tablename DESC
      LIMIT 10
    `);
    
    console.log('   Recent partitions:');
    for (const partition of partitionsResult.rows) {
      const date = partition.tablename.replace('events_', '').replace(/_/g, '-');
      
      // Get row count
      const countResult = await pool.query(`
        SELECT COUNT(*) FROM ${partition.tablename}
      `);
      
      console.log(`     ${partition.tablename.padEnd(25)} ${date}  (${countResult.rows[0].count} events)`);
    }
    console.log();

    // ========================================================================
    // Summary
    // ========================================================================
    console.log('✅ Event Sourcing Test Complete!\n');
    console.log('📌 Summary:');
    console.log(`   - Published 3 test events`);
    console.log(`   - Queried events by aggregate and correlation`);
    console.log(`   - Tested real-time event listener`);
    console.log(`   - Verified partitioning structure`);
    console.log('\n💡 Next steps:');
    console.log('   1. Integrate EventPublisher into your state management code');
    console.log('   2. Set up EventListener for real-time processing');
    console.log('   3. Build projections using ProjectionBuilder');
    console.log('   4. Set up automated partition maintenance\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await pool.close();
  }
}

// Run test
testEventSourcing();
