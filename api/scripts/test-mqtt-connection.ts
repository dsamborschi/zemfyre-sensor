/**
 * Test MQTT Connection
 * 
 * Simple script to test MQTT broker connection with admin credentials
 */

import mqtt from 'mqtt';

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:5883';
const USERNAME = process.env.MQTT_USERNAME || 'admin';
const PASSWORD = process.env.MQTT_PASSWORD || 'iotistic42!';
const CLIENT_ID = `test-client-${Date.now()}`;

console.log('🧪 Testing MQTT Connection');
console.log('========================\n');
console.log('📋 Connection Details:');
console.log(`   Broker: ${BROKER_URL}`);
console.log(`   Username: ${USERNAME}`);
console.log(`   Password: ${PASSWORD}`);
console.log(`   Client ID: ${CLIENT_ID}`);
console.log('\n🔌 Connecting...\n');

const client = mqtt.connect(BROKER_URL, {
  clientId: CLIENT_ID,
  username: USERNAME,
  password: PASSWORD,
  clean: true,
  reconnectPeriod: 0, // Disable auto-reconnect for testing
  connectTimeout: 10000,
});

client.on('connect', () => {
  console.log('✅ Connected successfully!');
  console.log('\n📡 Testing publish...');
  
  client.publish('test/connection', 'Hello from test script', { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Publish failed:', err.message);
    } else {
      console.log('✅ Message published successfully');
    }
    
    console.log('\n🎉 Test completed successfully!');
    client.end();
    process.exit(0);
  });
});

client.on('error', (error) => {
  console.error('❌ Connection error:', error.message);
  console.error('   Error code:', (error as any).code);
  console.error('   Reason code:', (error as any).reasonCode);
  console.error('\n💡 Troubleshooting:');
  console.error('   1. Check if Mosquitto is running');
  console.error('   2. Verify username/password in database');
  console.error('   3. Check mosquitto logs for details');
  console.error('   4. Verify mosquitto.conf auth settings');
  client.end();
  process.exit(1);
});

client.on('close', () => {
  console.log('\n🔌 Connection closed');
});

client.on('offline', () => {
  console.log('📴 Client offline');
});

// Timeout after 15 seconds
setTimeout(() => {
  console.error('\n⏱️  Connection timeout after 15 seconds');
  client.end();
  process.exit(1);
}, 15000);
