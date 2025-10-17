/**
 * Run migration 011 - Add Device Jobs
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'iotistic',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function runMigration() {
  try {
    console.log('🔄 Running migration 011_add_device_jobs.sql...');
    
    const migrationPath = path.join(__dirname, 'database', 'migrations', '011_add_device_jobs.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully');
    
    // Verify the changes - check new tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('job_templates', 'job_executions', 'device_job_status', 'job_handlers')
      ORDER BY table_name
    `);
    
    console.log('\n✅ New tables created:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Count sample data
    const templatesCount = await pool.query('SELECT COUNT(*) FROM job_templates');
    const handlersCount = await pool.query('SELECT COUNT(*) FROM job_handlers');
    
    console.log('\n✅ Sample data loaded:');
    console.log(`   - Job templates: ${templatesCount.rows[0].count}`);
    console.log(`   - Job handlers: ${handlersCount.rows[0].count}`);
    
    // List sample templates
    const templates = await pool.query(`
      SELECT name, description 
      FROM job_templates 
      ORDER BY name
    `);
    
    console.log('\n📋 Available job templates:');
    templates.rows.forEach(row => {
      console.log(`   - ${row.name}: ${row.description}`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
