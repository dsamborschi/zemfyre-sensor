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

    const migrationPath = path.join(__dirname, '../database/migrations/020_optimize_mqtt_indexes.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n📋 Executing migration 020: Optimize MQTT Indexes...\n');
    await client.query(sql);
    console.log('✅ Migration completed successfully!\n');

    // Show current indexes
    console.log('🔍 Verifying MQTT indexes...\n');
    
    const mqttUsersIndexes = await client.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'mqtt_users'
      ORDER BY indexname
    `);

    console.log('📊 mqtt_users indexes:');
    mqttUsersIndexes.rows.forEach((row) => {
      console.log(`  - ${row.indexname}`);
      console.log(`    ${row.indexdef.substring(0, 100)}...`);
    });

    const mqttAclsIndexes = await client.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'mqtt_acls'
      ORDER BY indexname
    `);

    console.log('\n📊 mqtt_acls indexes:');
    mqttAclsIndexes.rows.forEach((row) => {
      console.log(`  - ${row.indexname}`);
      console.log(`    ${row.indexdef.substring(0, 100)}...`);
    });

    // Show table sizes
    console.log('\n📏 Table sizes:');
    const sizes = await client.query(`
      SELECT 
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
      FROM pg_tables
      WHERE tablename IN ('mqtt_users', 'mqtt_acls')
      ORDER BY tablename
    `);
    
    sizes.rows.forEach((row) => {
      console.log(`  ${row.tablename}: ${row.size}`);
    });

    // Show row counts
    console.log('\n📈 Row counts:');
    const userCount = await client.query('SELECT COUNT(*) FROM mqtt_users');
    const aclCount = await client.query('SELECT COUNT(*) FROM mqtt_acls');
    console.log(`  mqtt_users: ${userCount.rows[0].count} rows`);
    console.log(`  mqtt_acls: ${aclCount.rows[0].count} rows`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.end();
    console.log('\n👋 Database connection closed');
  }
}

runMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
