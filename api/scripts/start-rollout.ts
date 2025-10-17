// Script to manually start a pending rollout
import poolWrapper from '../src/db/connection';
import { ImageUpdateManager } from '../src/services/image-update-manager';
import { EventPublisher } from '../src/services/event-sourcing';

const pool = poolWrapper.pool;

async function startPendingRollout() {
  try {
    // Get first pending rollout
    const rolloutQuery = await pool.query(`
      SELECT rollout_id, image_name, new_tag 
      FROM image_rollouts 
      WHERE status = 'in_progress' 
        AND current_batch = 1
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (rolloutQuery.rows.length === 0) {
      console.log('❌ No pending rollouts found');
      process.exit(0);
    }

    const rollout = rolloutQuery.rows[0];
    console.log(`\n🚀 Starting rollout: ${rollout.rollout_id}`);
    console.log(`   Image: ${rollout.image_name}:${rollout.new_tag}\n`);

    const eventPublisher = new EventPublisher('manual-start-script');
    const imageUpdateManager = new ImageUpdateManager(pool, eventPublisher);

    await imageUpdateManager.startRollout(rollout.rollout_id);

    console.log('✅ Rollout started successfully!');
    console.log('   Batch 1 devices have been scheduled.');
    console.log('   Devices will receive new target state on next poll.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error starting rollout:', error);
    process.exit(1);
  }
}

startPendingRollout();
