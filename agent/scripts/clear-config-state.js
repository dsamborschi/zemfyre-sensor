#!/usr/bin/env node

/**
 * Clear Config State Snapshot
 * ============================
 * 
 * This script clears the 'config' type stateSnapshot from the database.
 * Use this when you need to force re-registration of all sensors.
 * 
 * Usage:
 *   node scripts/clear-config-state.js
 */

const knex = require('knex');
const path = require('path');

async function clearConfigState() {
  console.log('🗑️  Clearing config state snapshot...\n');

  // Initialize database connection
  const db = knex({
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, '../data/device.sqlite'),
    },
    useNullAsDefault: true,
  });

  try {
    // Check current state
    const before = await db('stateSnapshot')
      .where({ type: 'config' })
      .select('*');

    if (before.length > 0) {
      console.log('📊 Current config snapshot:');
      const config = JSON.parse(before[0].state);
      console.log(`   - Sensors: ${config.sensors?.length || 0}`);
      console.log(`   - Created: ${before[0].createdAt}\n`);

      // Delete config snapshots
      const deleted = await db('stateSnapshot')
        .where({ type: 'config' })
        .delete();

      console.log(`✅ Deleted ${deleted} config snapshot(s)`);
      console.log('   Agent will now treat all sensors as new on next reconciliation.\n');
    } else {
      console.log('ℹ️  No config snapshot found (already clean)\n');
    }

    // Check sensors table
    const sensors = await db('sensors').select('*');
    console.log(`📋 Current sensors table: ${sensors.length} records`);
    if (sensors.length > 0) {
      console.log('   Sensors:');
      sensors.forEach(s => {
        console.log(`   - ${s.name} (${s.protocol}, enabled: ${s.enabled})`);
      });
      console.log();
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }

  console.log('✨ Done! Restart the agent to trigger re-registration.\n');
}

clearConfigState();
