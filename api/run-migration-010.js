// Run migration 010 - Enhance image_tags with metadata
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'iotistic',
  user: 'postgres',
  password: 'postgres'
});

async function runMigration() {
  try {
    console.log('\n🔄 Running Migration 010: Enhance image_tags with metadata\n');
    
    const migrationPath = path.join(__dirname, 'database', 'migrations', '010_enhance_image_tags_metadata.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully!\n');
    console.log('📋 Changes applied:');
    console.log('   - Added metadata JSONB column to image_tags');
    console.log('   - Added last_updated TIMESTAMP column');
    console.log('   - Created GIN index on metadata for efficient queries');
    console.log('   - Created index on last_updated for sorting\n');
    
    // Verify the changes
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'image_tags' 
        AND column_name IN ('metadata', 'last_updated')
      ORDER BY column_name
    `);
    
    console.log('✅ Verified new columns:');
    result.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    console.log('');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration();
