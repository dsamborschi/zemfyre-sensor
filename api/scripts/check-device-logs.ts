/**
 * Check device_logs table structure
 */

import { query } from '../src/db/connection';

async function checkDeviceLogsStructure() {
  console.log('🔍 Checking device_logs table structure...\n');
  
  try {
    const result = await query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'device_logs'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Columns in device_logs table:');
    result.rows.forEach(row => {
      console.log(`   ${row.column_name} (${row.data_type}${row.is_nullable === 'YES' ? ', nullable' : ', NOT NULL'})`);
    });
    
    console.log('\n✅ Check complete');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDeviceLogsStructure();
