import pool from '../src/db/connection';

(async () => {
  const r = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name='devices' 
    ORDER BY ordinal_position
  `);
  
  console.log('Columns in devices table:');
  r.rows.forEach(row => console.log(`  - ${row.column_name}`));
  
  await pool.close();
})();
