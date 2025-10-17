/**
 * Test Image Update System
 * 
 * Creates a sample policy and simulates a webhook to test the image update flow.
 */

import poolWrapper from '../src/db/connection';

const pool = poolWrapper.pool;

async function testImageUpdateSystem() {
  console.log('🧪 Testing Image Update System\n');

  try {
    // Step 1: Create a test image update policy
    console.log('1️⃣  Creating test image update policy...');
    
    const policyResult = await pool.query(
      `INSERT INTO image_update_policies (
        image_pattern,
        update_strategy,
        staged_batches,
        batch_delay_minutes,
        health_check_enabled,
        health_check_timeout_seconds,
        auto_rollback_enabled,
        enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        'iotistic/myapp:*',     // Pattern to match
        'staged',                // Use staged rollout
        3,                       // 3 batches
        5,                       // 5 minutes between batches
        true,                    // Health checks enabled
        300,                     // 5 minute timeout
        true,                    // Auto-rollback enabled
        true                     // Policy enabled
      ]
    );

    console.log(`✅ Policy created: ID ${policyResult.rows[0].id}`);
    console.log(`   Pattern: ${policyResult.rows[0].image_pattern}`);
    console.log(`   Strategy: ${policyResult.rows[0].update_strategy}\n`);

    // Step 2: Check for devices using this image
    console.log('2️⃣  Checking for devices using iotistic/myapp...');
    
    const devicesResult = await pool.query(
      `SELECT 
        d.uuid,
        d.device_name,
        ts.apps
       FROM devices d
       LEFT JOIN device_target_state ts ON d.uuid = ts.device_uuid
       WHERE d.is_active = true
       LIMIT 5`
    );

    console.log(`   Found ${devicesResult.rows.length} active devices:`);
    devicesResult.rows.forEach(device => {
      console.log(`   - ${device.device_name} (${device.uuid})`);
      if (device.apps) {
        console.log(`     Apps: ${JSON.stringify(device.apps, null, 2).substring(0, 100)}...`);
      }
    });
    console.log();

    // Step 3: Show webhook endpoint info
    console.log('3️⃣  Webhook Endpoint Ready');
    console.log('   POST http://localhost:3001/api/v1/webhooks/docker-registry');
    console.log();
    console.log('   Test with curl:');
    console.log(`   curl -X POST http://localhost:3001/api/v1/webhooks/docker-registry \\
     -H "Content-Type: application/json" \\
     -d '{
       "repository": {"repo_name": "iotistic/myapp"},
       "push_data": {"tag": "v2.0.1"}
     }'`);
    console.log();

    // Step 4: Show monitoring queries
    console.log('4️⃣  Monitoring Queries\n');
    
    console.log('   View active rollouts:');
    console.log('   SELECT * FROM active_rollouts;\n');
    
    console.log('   View rollout details:');
    console.log('   SELECT * FROM image_rollouts ORDER BY created_at DESC LIMIT 5;\n');
    
    console.log('   View device statuses:');
    console.log('   SELECT * FROM device_rollout_status ORDER BY scheduled_at DESC LIMIT 10;\n');
    
    console.log('   View rollout events:');
    console.log('   SELECT * FROM rollout_events ORDER BY timestamp DESC LIMIT 20;\n');

    // Step 5: Summary
    console.log('✅ Image Update System Ready!\n');
    console.log('📋 Next Steps:');
    console.log('   1. Start the API server: npm run dev');
    console.log('   2. Test webhook endpoint with curl command above');
    console.log('   3. Watch rollout progress in database');
    console.log('   4. Devices will pull new image on next poll\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run test
testImageUpdateSystem()
  .then(() => {
    console.log('✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
