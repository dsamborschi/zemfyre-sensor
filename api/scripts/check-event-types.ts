import pool from '../src/db/connection';

(async () => {
  const result = await pool.query(
    `SELECT event_type FROM event_types 
     WHERE event_type LIKE '%heartbeat%' 
     ORDER BY event_type`
  );
  
  console.log('Heartbeat-related event types:', result.rows);
  
  const all = await pool.query(
    `SELECT event_type FROM event_types ORDER BY event_type`
  );
  
  console.log('\nAll event types:');
  all.rows.forEach(r => console.log(`  - ${r.event_type}`));
  
  await pool.close();
})();
