import pg from 'pg';

async function checkAclSchema() {
  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    database: 'iotistic',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check mqtt_acls table structure
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'mqtt_acls' 
      ORDER BY ordinal_position
    `);

    console.log('📋 mqtt_acls Table Structure:');
    console.log('='.repeat(60));
    columns.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    // Check existing data
    const data = await client.query('SELECT * FROM mqtt_acls LIMIT 10');
    console.log(`\n📊 Sample Data (${data.rows.length} rows):`);
    console.log('='.repeat(60));
    data.rows.forEach(row => {
      console.log(JSON.stringify(row, null, 2));
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

checkAclSchema();
