import { query } from '../src/db/connection';
import * as fs from 'fs';
import * as path from 'path';

async function applyPartitioningManually() {
  console.log('🔧 Manually applying partitioning migration...\n');
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database/migrations/005_add_device_metrics_partitioning.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Executing migration SQL...');
    await query(sql);
    
    console.log('\n✅ Partitioning migration complete!');
    console.log('\n📊 Checking partition stats...\n');
    
    // Check stats
    const stats = await query('SELECT * FROM get_device_metrics_partition_stats()');
    
    if (stats.rows.length > 0) {
      console.log('Partitions created:');
      stats.rows.forEach((row: any) => {
        console.log(`  ${row.partition_name}: ${row.row_count} rows, ${row.size}, ${row.age_days} days old`);
      });
    }
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

applyPartitioningManually();
