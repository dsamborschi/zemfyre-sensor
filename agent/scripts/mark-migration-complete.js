/**
 * Script to mark MQTT credentials migration as completed
 * (columns already exist in database)
 */

const knex = require('knex');
const path = require('path');

async function markMigrationComplete() {
  const db = knex({
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, '../data/database.sqlite')
    },
    useNullAsDefault: true
  });
  
  try {
    const migrationName = '20251020000000_add_mqtt_credentials.js';
    
    // Check if migration already recorded
    const existing = await db('knex_migrations').where('name', migrationName).first();
    
    if (existing) {
      console.log(`✅ Migration already recorded: ${migrationName}`);
    } else {
      // Insert migration record
      await db('knex_migrations').insert({
        name: migrationName,
        batch: await db('knex_migrations').max('batch as maxBatch').first().then(r => (r.maxBatch || 0) + 1),
        migration_time: new Date()
      });
      console.log(`✅ Marked migration as complete: ${migrationName}`);
    }
    
    console.log('✅ Migration state is now correct!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await db.destroy();
  }
}

markMigrationComplete();
