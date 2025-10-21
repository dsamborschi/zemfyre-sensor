import pg from 'pg';

async function getDevicePassword() {
  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    database: 'iotistic',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT username, mqtt_password, created_at 
      FROM devices 
      WHERE device_uuid = 'fad1444c-9a0e-4b7e-8c55-7ffcd478e319'
    `);

    if (result.rows.length > 0) {
      const device = result.rows[0];
      console.log('Device MQTT Credentials:');
      console.log('Username:', device.username);
      console.log('Password:', device.mqtt_password);
      console.log('');
      console.log('To test, run:');
      console.log(`$env:DEVICE_PASSWORD="${device.mqtt_password}"; npx tsx scripts/test-device-mqtt.ts`);
    } else {
      console.log('Device not found');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

getDevicePassword();
