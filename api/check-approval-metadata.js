// Check approval request metadata to verify digest is saved
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'iotistic',
  user: 'postgres',
  password: 'postgres'
});

async function checkMetadata() {
  try {
    console.log('\n📊 Checking Approval Request Metadata...\n');
    
    const result = await pool.query(
      `SELECT 
        id,
        image_name,
        tag_name,
        status,
        metadata,
        requested_at
       FROM image_approval_requests 
       WHERE metadata IS NOT NULL
       ORDER BY requested_at DESC
       LIMIT 5`
    );
    
    console.log(`Found ${result.rows.length} approval requests with metadata:\n`);
    
    result.rows.forEach((req, i) => {
      console.log(`${i + 1}. ${req.image_name}:${req.tag_name}`);
      console.log(`   Status: ${req.status}`);
      console.log(`   Metadata:`);
      
      const meta = req.metadata;
      if (meta.digest) {
        console.log(`     ✅ Digest: ${meta.digest.substring(0, 20)}...`);
      } else {
        console.log(`     ❌ Digest: NOT FOUND`);
      }
      
      if (meta.last_updated) {
        console.log(`     ✅ Last Updated: ${meta.last_updated}`);
      }
      
      if (meta.architectures) {
        console.log(`     ✅ Architectures: ${meta.architectures.join(', ')}`);
      }
      
      if (meta.source) {
        console.log(`     ✅ Source: ${meta.source}`);
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkMetadata();
