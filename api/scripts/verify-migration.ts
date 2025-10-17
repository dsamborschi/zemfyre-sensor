/**
 * Verify device_metrics partitioning migration
 */

import pool from '../src/db/connection';

async function verifyMigration() {
  try {
    console.log('🔍 Verifying device_metrics partitioning migration...\n');

    // Check total rows
    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM device_metrics
    `);
    console.log(`📊 Total rows: ${countResult.rows[0].total}`);

    // Check date range
    const rangeResult = await pool.query(`
      SELECT 
        MIN(recorded_at) as oldest,
        MAX(recorded_at) as newest,
        MAX(recorded_at)::date - MIN(recorded_at)::date + 1 as days_span
      FROM device_metrics
    `);
    
    if (rangeResult.rows[0].oldest) {
      console.log(`📅 Date range:`);
      console.log(`   Oldest: ${rangeResult.rows[0].oldest}`);
      console.log(`   Newest: ${rangeResult.rows[0].newest}`);
      console.log(`   Span: ${rangeResult.rows[0].days_span} days\n`);
    } else {
      console.log('📅 No data in table\n');
    }

    // Check partitions
    const partitionsResult = await pool.query(`
      SELECT * FROM get_device_metrics_partition_stats()
      ORDER BY partition_date DESC
    `);
    
    const totalRows = partitionsResult.rows.reduce((sum, p) => sum + parseInt(p.row_count), 0);
    const withData = partitionsResult.rows.filter(p => parseInt(p.row_count) > 0);
    
    console.log(`📦 Partitions:`);
    console.log(`   Total partitions: ${partitionsResult.rows.length}`);
    console.log(`   Partitions with data: ${withData.length}`);
    console.log(`   Total rows across partitions: ${totalRows}\n`);

    // Show partitions with data
    console.log('📊 Partitions containing data:');
    console.log('   Name                           Date         Rows    Size');
    console.log('   ───────────────────────────────────────────────────────────');
    
    for (const partition of withData) {
      console.log(
        `   ${partition.partition_name.padEnd(30)} ${partition.partition_date.toISOString().split('T')[0]}  ${String(partition.row_count).padStart(6)}  ${partition.size.padStart(7)}`
      );
    }

    // Check sequence
    console.log('\n🔢 Sequence check:');
    const seqNameResult = await pool.query(`
      SELECT pg_get_serial_sequence('device_metrics', 'id') as seq_name
    `);
    
    const seqName = seqNameResult.rows[0]?.seq_name;
    if (seqName) {
      const seqResult = await pool.query(`
        SELECT last_value, is_called
        FROM ${seqName}
      `);
      
      console.log(`   Sequence: ${seqName}`);
      console.log(`   Last value: ${seqResult.rows[0].last_value}`);
      console.log(`   Is called: ${seqResult.rows[0].is_called}`);
    } else {
      console.log('   ⚠️  No sequence found (not BIGSERIAL?)');
    }

    console.log('\n✅ Migration verification complete!');

  } catch (error) {
    console.error('❌ Error verifying migration:', error);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

verifyMigration();
