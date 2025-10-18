/**
 * Check which tables exist in the database
 */

import { query } from '../src/db/connection';

async function checkTables() {
  console.log('🔍 Checking database tables...\n');
  
  try {
    // Check for MQTT tables
    const mqttTables = ['sensor_data', 'device_shadows', 'device_logs'];
    
    console.log('📋 MQTT Tables (migration 013):');
    for (const tableName of mqttTables) {
      const result = await query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [tableName]
      );
      const exists = result.rows[0].exists;
      console.log(`   ${exists ? '✅' : '❌'} ${tableName}`);
    }
    
    // Check for API key rotation tables/columns
    console.log('\n📋 API Key Rotation (migration 014):');
    
    // Check device_api_key_history table
    const historyExists = await query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'device_api_key_history'
      )`
    );
    console.log(`   ${historyExists.rows[0].exists ? '✅' : '❌'} device_api_key_history table`);
    
    // Check for new columns in devices table
    const rotationColumns = [
      'api_key_expires_at',
      'api_key_last_rotated_at',
      'api_key_rotation_enabled',
      'api_key_rotation_days'
    ];
    
    for (const columnName of rotationColumns) {
      const result = await query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'devices'
          AND column_name = $1
        )`,
        [columnName]
      );
      const exists = result.rows[0].exists;
      console.log(`   ${exists ? '✅' : '❌'} devices.${columnName}`);
    }
    
    // Check for view
    const viewExists = await query(
      `SELECT EXISTS (
        SELECT FROM information_schema.views 
        WHERE table_schema = 'public' 
        AND table_name = 'devices_needing_rotation'
      )`
    );
    console.log(`   ${viewExists.rows[0].exists ? '✅' : '❌'} devices_needing_rotation view`);
    
    console.log('\n✅ Database check complete');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error checking tables:', error);
    process.exit(1);
  }
}

checkTables();
