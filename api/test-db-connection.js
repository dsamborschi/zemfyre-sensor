/**
 * Quick PostgreSQL connection test
 * Run: node test-db-connection.js
 */

const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'iotistic',
  user: 'postgres',
  password: 'postgres',
});

async function testConnection() {
  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully!\n');
    
    // Test query
    const result = await client.query('SELECT version();');
    console.log('📊 PostgreSQL version:');
    console.log(result.rows[0].version);
    
    // List tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n📋 Tables in database:');
    tables.rows.forEach(row => console.log('  -', row.table_name));
    
    // Count devices
    const devices = await client.query('SELECT COUNT(*) as count FROM devices');
    console.log(`\n🔢 Total devices: ${devices.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Connection failed:');
    console.error(error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n👋 Connection closed');
  }
}

testConnection();
