// Update image_tags table after approval is accepted
// This should be called from the approval workflow

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'iotistic',
  user: 'postgres',
  password: 'postgres'
});

/**
 * Process an approved tag request
 * This transfers data from image_approval_requests to image_tags
 */
async function processApprovedTag(approvalRequestId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get the approval request details
    const approvalResult = await client.query(
      `SELECT 
        image_id, 
        image_name, 
        tag_name, 
        metadata 
       FROM image_approval_requests 
       WHERE id = $1 AND status = 'approved'`,
      [approvalRequestId]
    );
    
    if (approvalResult.rows.length === 0) {
      throw new Error(`Approval request ${approvalRequestId} not found or not approved`);
    }
    
    const approval = approvalResult.rows[0];
    const meta = approval.metadata || {};
    
    console.log(`Processing approved tag: ${approval.image_name}:${approval.tag_name}`);
    
    // Insert or update the image_tags table
    await client.query(
      `INSERT INTO image_tags (
        image_id, 
        tag, 
        digest, 
        architecture, 
        pushed_at,
        last_updated,
        metadata,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (image_id, tag, architecture) DO UPDATE SET
        digest = EXCLUDED.digest,
        last_updated = EXCLUDED.last_updated,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()`,
      [
        approval.image_id,
        approval.tag_name,
        meta.digest || null,
        meta.architectures?.[0] || 'amd64',  // Primary architecture
        meta.last_updated ? new Date(meta.last_updated) : null,
        meta.last_updated ? new Date(meta.last_updated) : null,
        JSON.stringify({
          architectures: meta.architectures || [],
          auto_detected: meta.auto_detected || false,
          source: meta.source || 'manual',
          full_size: meta.full_size || null
        })
      ]
    );
    
    console.log(`✅ Added ${approval.image_name}:${approval.tag_name} to image_tags`);
    
    // If there are multiple architectures, insert them too
    if (meta.architectures && meta.architectures.length > 1) {
      for (const arch of meta.architectures.slice(1)) {
        await client.query(
          `INSERT INTO image_tags (
            image_id, 
            tag, 
            digest, 
            architecture, 
            last_updated,
            metadata,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          ON CONFLICT (image_id, tag, architecture) DO UPDATE SET
            digest = EXCLUDED.digest,
            last_updated = EXCLUDED.last_updated,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()`,
          [
            approval.image_id,
            approval.tag_name,
            meta.digest || null,
            arch,
            meta.last_updated ? new Date(meta.last_updated) : null,
            JSON.stringify({
              architectures: [arch],
              auto_detected: meta.auto_detected || false,
              source: meta.source || 'manual'
            })
          ]
        );
        console.log(`   ✅ Added architecture variant: ${arch}`);
      }
    }
    
    await client.query('COMMIT');
    console.log(`\n✅ Successfully processed approval request ${approvalRequestId}\n`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error processing approval:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Example usage
if (require.main === module) {
  const approvalId = process.argv[2];
  
  if (!approvalId) {
    console.log('Usage: node process-approved-tag.js <approval_request_id>');
    console.log('\nExample: node process-approved-tag.js 123');
    process.exit(1);
  }
  
  processApprovedTag(parseInt(approvalId))
    .then(() => pool.end())
    .catch(err => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}

module.exports = { processApprovedTag };
