#!/usr/bin/env node

/**
 * Show Sensors in Database
 * =========================
 * 
 * Displays all sensors currently in the SQLite database.
 */

const knex = require('knex');
const path = require('path');

async function showSensors() {
  const db = knex({
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, '../data/device.sqlite'),
    },
    useNullAsDefault: true,
  });

  try {
    const sensors = await db('sensors').select('*');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SENSORS DATABASE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n✅ Total sensors: ${sensors.length}\n`);
    
    if (sensors.length === 0) {
      console.log('❌ No sensors found in database!\n');
      console.log('Possible reasons:');
      console.log('  1. Agent hasn\'t completed reconciliation yet');
      console.log('  2. Agent encountered errors during sensor creation');
      console.log('  3. Target state doesn\'t contain sensors\n');
    } else {
      sensors.forEach((sensor, idx) => {
        console.log(`\n${idx + 1}. ${sensor.name}`);
        console.log('   ├─ Protocol: ' + sensor.protocol);
        console.log('   ├─ Enabled: ' + (sensor.enabled ? '✅' : '❌'));
        console.log('   ├─ Poll Interval: ' + sensor.poll_interval + 'ms');
        
        // Parse JSON fields
        let connection = sensor.connection;
        if (typeof connection === 'string') {
          try {
            connection = JSON.parse(connection);
          } catch {}
        }
        
        let dataPoints = sensor.data_points;
        if (typeof dataPoints === 'string') {
          try {
            dataPoints = JSON.parse(dataPoints);
          } catch {}
        }
        
        console.log('   ├─ Connection: ' + JSON.stringify(connection));
        console.log('   └─ Data Points: ' + (Array.isArray(dataPoints) ? dataPoints.length : 0) + ' points');
        
        if (Array.isArray(dataPoints) && dataPoints.length > 0) {
          dataPoints.slice(0, 3).forEach((dp, i) => {
            console.log(`      ${i + 1}. ${dp.name || 'unnamed'} (${dp.dataType || 'unknown type'})`);
          });
          if (dataPoints.length > 3) {
            console.log(`      ... and ${dataPoints.length - 3} more`);
          }
        }
      });
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✨ Sensors successfully synced to SQLite!\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

showSensors();
