import { readFileSync } from 'fs';
import pg from 'pg';

async function runMigration() {
  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    database: 'iotistic',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    const sql = readFileSync('database/migrations/018_fix_mqtt_acl_constraint.sql', 'utf-8');
    
    console.log('📋 Executing migration...');
    console.log('='.repeat(80));
    console.log(sql);
    console.log('='.repeat(80));
    console.log('');
    
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
