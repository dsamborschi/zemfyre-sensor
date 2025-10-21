import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'iotistic',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database');

    const migrationPath = path.join(__dirname, '../database/migrations/019_add_mqtt_broker_config.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n📋 Executing migration 019: Add MQTT Broker Configuration...\n');
    await client.query(sql);
    console.log('✅ Migration completed successfully!\n');

    // Verify the table was created
    console.log('🔍 Verifying mqtt_broker_config table...');
    const result = await client.query(`
      SELECT 
        id,
        name,
        protocol,
        host,
        port,
        username,
        is_active,
        is_default,
        broker_type,
        use_tls,
        created_at
      FROM mqtt_broker_config
      ORDER BY id
    `);

    console.log(`\n📊 Found ${result.rows.length} broker configuration(s):\n`);
    result.rows.forEach((row) => {
      console.log(`ID: ${row.id}`);
      console.log(`  Name: ${row.name}`);
      console.log(`  Connection: ${row.protocol}://${row.host}:${row.port}`);
      console.log(`  Username: ${row.username || '(none)'}`);
      console.log(`  Type: ${row.broker_type}`);
      console.log(`  TLS: ${row.use_tls ? 'Yes' : 'No'}`);
      console.log(`  Active: ${row.is_active ? 'Yes' : 'No'}`);
      console.log(`  Default: ${row.is_default ? 'Yes' : 'No'}`);
      console.log(`  Created: ${row.created_at}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.end();
    console.log('👋 Database connection closed');
  }
}

runMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
