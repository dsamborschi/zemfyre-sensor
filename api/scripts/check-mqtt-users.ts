import pg from 'pg';

async function checkUsers() {
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

    const result = await client.query(`
      SELECT username, password_hash, is_superuser, is_active, created_at 
      FROM mqtt_users 
      ORDER BY created_at DESC
    `);

    console.log('📋 MQTT Users in Database:');
    console.log('='.repeat(80));
    
    for (const row of result.rows) {
      console.log(`\nUsername: ${row.username}`);
      console.log(`Superuser: ${row.is_superuser}`);
      console.log(`Active: ${row.is_active}`);
      console.log(`Hash Type: ${row.password_hash.startsWith('$2b$') ? 'bcrypt' : row.password_hash.startsWith('PBKDF2') ? 'PBKDF2' : 'unknown'}`);
      console.log(`Hash: ${row.password_hash.substring(0, 50)}...`);
      console.log(`Created: ${row.created_at}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log(`Total users: ${result.rows.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

checkUsers();
