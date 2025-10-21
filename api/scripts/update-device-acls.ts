import pg from 'pg';

async function updateDeviceAcls() {
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

    console.log('📋 Current Device ACLs:');
    console.log('='.repeat(80));
    let result = await client.query(`
      SELECT id, username, topic, access, priority 
      FROM mqtt_acls 
      WHERE username LIKE 'device_%'
      ORDER BY id
    `);
    
    result.rows.forEach(row => {
      const accessBits = [];
      if (row.access & 1) accessBits.push('READ');
      if (row.access & 2) accessBits.push('WRITE');
      if (row.access & 4) accessBits.push('SUBSCRIBE');
      console.log(`ID: ${row.id}`);
      console.log(`  Username: ${row.username}`);
      console.log(`  Topic: ${row.topic}`);
      console.log(`  Access: ${row.access} (${accessBits.join(' + ')})`);
      console.log(`  Priority: ${row.priority}`);
      console.log('');
    });

    console.log('\n🔧 Updating access to include SUBSCRIBE permission...');
    console.log('   Old access: 3 (READ + WRITE)');
    console.log('   New access: 7 (READ + WRITE + SUBSCRIBE)');
    console.log('');
    
    // Update to include subscribe (4): 1 (read) + 2 (write) + 4 (subscribe) = 7
    const updateResult = await client.query(`
      UPDATE mqtt_acls 
      SET access = 7 
      WHERE username LIKE 'device_%' AND access = 3
      RETURNING *
    `);
    
    console.log(`✅ Updated ${updateResult.rowCount} rows\n`);

    console.log('📋 Updated Device ACLs:');
    console.log('='.repeat(80));
    result = await client.query(`
      SELECT id, username, topic, access, priority 
      FROM mqtt_acls 
      WHERE username LIKE 'device_%'
      ORDER BY id
    `);
    
    result.rows.forEach(row => {
      const accessBits = [];
      if (row.access & 1) accessBits.push('READ');
      if (row.access & 2) accessBits.push('WRITE');
      if (row.access & 4) accessBits.push('SUBSCRIBE');
      console.log(`ID: ${row.id}`);
      console.log(`  Username: ${row.username}`);
      console.log(`  Topic: ${row.topic}`);
      console.log(`  Access: ${row.access} (${accessBits.join(' + ')})`);
      console.log(`  Priority: ${row.priority}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

updateDeviceAcls();
