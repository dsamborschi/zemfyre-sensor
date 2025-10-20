/**
 * Script to fix corrupted migration state
 * 
 * Removes references to missing migration files from knex_migrations table
 */

const knex = require('knex');
const path = require('path');

async function fixMigrations() {
  const db = knex({
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, '../data/database.sqlite')
    },
    useNullAsDefault: true
  });
  
  try {
    console.log('Checking for corrupted migration records...');
    
    // Get all migration records
    const migrations = await db('knex_migrations').select('*').orderBy('id');
    console.log('Current migrations:', migrations.map(m => m.name));
    
    // Remove records for missing files
    const missingFiles = [
      '20251020_add_mqtt_broker_url.js',
      '20251020_add_mqtt_credentials_to_device.js'
    ];
    
    for (const file of missingFiles) {
      const deleted = await db('knex_migrations').where('name', file).delete();
      if (deleted > 0) {
        console.log(`✅ Removed record for missing file: ${file}`);
      }
    }
    
    console.log('✅ Migration state fixed!');
    console.log('You can now run: npx knex migrate:latest');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await db.destroy();
  }
}

fixMigrations();
