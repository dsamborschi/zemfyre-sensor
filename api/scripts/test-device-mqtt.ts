import mqtt from 'mqtt';

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:5883';
const USERNAME = 'device_fad1444c-9a0e-4b7e-8c55-7ffcd478e319';
const PASSWORD = process.env.DEVICE_PASSWORD || 'test'; // You'll need to get this from DB

console.log('🧪 Testing Device MQTT Connection & ACL');
console.log('=' .repeat(50));
console.log(`Broker: ${BROKER_URL}`);
console.log(`Username: ${USERNAME}`);
console.log('');

const client = mqtt.connect(BROKER_URL, {
  clientId: USERNAME,
  username: USERNAME,
  password: PASSWORD,
  clean: true,
  reconnectPeriod: 0,
  connectTimeout: 10000,
});

let testTimeout: NodeJS.Timeout;

client.on('connect', () => {
  console.log('✅ Connected successfully!');
  console.log('');
  console.log('📡 Testing shadow topic subscription...');
  
  const shadowTopic = `iot/device/fad1444c-9a0e-4b7e-8c55-7ffcd478e319/shadow/name/device-state/update/accepted`;
  
  client.subscribe(shadowTopic, { qos: 1 }, (err, granted) => {
    if (err) {
      console.error('❌ Subscribe error:', err.message);
      client.end();
      process.exit(1);
    } else {
      console.log('✅ Subscription granted!');
      console.log('   Topics:', granted);
      console.log('');
      console.log('🎉 ACL check passed!');
      
      clearTimeout(testTimeout);
      client.end();
      process.exit(0);
    }
  });
});

client.on('error', (err) => {
  console.error('❌ Connection error:', err.message);
  console.error('   Error code:', (err as any).code);
  console.error('   Reason code:', (err as any).reasonCode);
  clearTimeout(testTimeout);
  client.end();
  process.exit(1);
});

client.on('close', () => {
  console.log('🔌 Connection closed');
});

// Safety timeout
testTimeout = setTimeout(() => {
  console.error('❌ Test timeout after 15 seconds');
  client.end();
  process.exit(1);
}, 15000);
