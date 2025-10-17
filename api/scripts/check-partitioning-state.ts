import pool from '../src/db/connection';

async function checkPartitioning() {
  try {
    // Check if old table exists
    const oldTable = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'device_metrics_old'
      ) as exists
    `);
    
    console.log('device_metrics_old exists:', oldTable.rows[0].exists);
    
    // Check partitions
    const partitions = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE tablename LIKE 'device_metrics_%'
      ORDER BY tablename
    `);
    
    console.log('Partitions found:', partitions.rows.length);
    if (partitions.rows.length > 0) {
      console.log('First 5:', partitions.rows.slice(0, 5).map(r => r.tablename));
    }
    
    // Check if main table is partitioned
    const isPartitioned = await pool.query(`
      SELECT 
        relkind,
        relispartition
      FROM pg_class
      WHERE relname = 'device_metrics'
    `);
    
    console.log('device_metrics type:', isPartitioned.rows[0]);
    
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await pool.close();
  }
}

checkPartitioning();
