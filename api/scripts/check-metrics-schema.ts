import { query } from '../src/db/connection';

async function checkSchema() {
  console.log('Checking device_metrics schema...\n');
  
  const result = await query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'device_metrics'
    ORDER BY ordinal_position
  `);
  
  console.log('Columns:');
  result.rows.forEach((row: any) => {
    console.log(`  ${row.column_name} (${row.data_type}) ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
  });
  
  process.exit(0);
}

checkSchema();
