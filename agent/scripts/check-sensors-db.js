#!/usr/bin/env node

/**
 * Check Sensors Database
 * ======================
 * 
 * This script shows what's actually in the sensors table.
 */

const knex = require('knex');
const path = require('path');

async function checkSensors() {
  console.log('🔍 Checking sensors database...\n');

  const db = knex({
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, '../data/device.sqlite'),
    },
    useNullAsDefault: true,
  });

  try {
    // Check sensors table
    const sensors = await db('sensors').select('*');
    
    console.log(`📋 Sensors table: ${sensors.length} records\n`);
    
    if (sensors.length > 0) {
      console.log('Sensors:');
      sensors.forEach((s, idx) => {
        console.log(`\n${idx + 1}. ${s.name}`);
        console.log(`   - Protocol: ${s.protocol}`);
        console.log(`   - Enabled: ${s.enabled}`);
        console.log(`   - Poll Interval: ${s.poll_interval}ms`);
        console.log(`   - Connection: ${typeof s.connection === 'string' ? s.connection.substring(0, 100) : JSON.stringify(s.connection)}`);
        console.log(`   - Data Points: ${typeof s.data_points === 'string' ? JSON.parse(s.data_points).length : s.data_points.length} points`);
      });
    } else {
      console.log('❌ No sensors found in database!');
      console.log('\n💡 This means sensors are NOT being saved to SQLite.');
    }

    // Check stateSnapshot for comparison
    console.log('\n\n📸 Checking stateSnapshot (config type)...\n');
    const snapshots = await db('stateSnapshot')
      .where({ type: 'config' })
      .orderBy('createdAt', 'desc')
      .limit(1);

    if (snapshots.length > 0) {
      const config = JSON.parse(snapshots[0].state);
      console.log(`Config snapshot has ${config.sensors?.length || 0} sensors:`);
      
      if (config.sensors) {
        config.sensors.forEach((s, idx) => {
          console.log(`  ${idx + 1}. ${s.name} (ID: ${s.id || 'NULL'})`);
        });
      }
    } else {
      console.log('No config snapshot found.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

checkSensors();
