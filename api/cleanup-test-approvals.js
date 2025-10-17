// Cleanup test approval requests created by image monitor
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'iotistic',
  user: 'postgres',
  password: 'postgres'
});

async function cleanup() {
  try {
    console.log('\n🧹 Cleaning up test approval requests...\n');
    
    // Count before - approval requests created by monitor have image_id set
    const beforeCount = await pool.query(
      "SELECT COUNT(*) as count FROM image_approval_requests WHERE image_id IS NOT NULL AND status = 'pending'"
    );
    console.log(`   Found ${beforeCount.rows[0].count} pending approval requests from monitor`);
    
    // Delete - only delete tag-level approvals (those with image_id and tag_name)
    const result = await pool.query(
      "DELETE FROM image_approval_requests WHERE image_id IS NOT NULL AND tag_name IS NOT NULL AND status = 'pending'"
    );
    console.log(`   ✅ Deleted ${result.rowCount} approval requests\n`);
    
    // Show monitoring status
    console.log('📊 Monitored images:');
    const images = await pool.query(
      `SELECT id, image_name, watch_for_updates, last_checked_at 
       FROM images 
       WHERE watch_for_updates = true 
       ORDER BY image_name`
    );
    
    images.rows.forEach(img => {
      console.log(`   - ${img.image_name} (last checked: ${img.last_checked_at || 'never'})`);
    });
    
    console.log(`\n✅ Cleanup complete! Ready to test with "most recent tag only" logic\n`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

cleanup();
