/**
 * Test MQTT Broker API Endpoints
 */

const BASE_URL = 'http://localhost:4002/api/v1/mqtt';

async function testEndpoint(name: string, method: string, url: string, body?: any) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   ${method} ${url}`);
  
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
      console.log(`   Body:`, JSON.stringify(body, null, 2));
    }
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Response:`, JSON.stringify(data, null, 2));
    
    return { status: response.status, data };
  } catch (error: any) {
    console.error(`   ❌ Error:`, error.message);
    return { status: 0, data: null, error: error.message };
  }
}

async function runTests() {
  console.log('=' .repeat(80));
  console.log('MQTT Broker API Tests');
  console.log('='.repeat(80));
  
  // Test 1: List all brokers
  await testEndpoint(
    'List all brokers',
    'GET',
    `${BASE_URL}/brokers`
  );
  
  // Test 2: Get broker summary
  await testEndpoint(
    'Get broker summary',
    'GET',
    `${BASE_URL}/brokers/summary`
  );
  
  // Test 3: Get specific broker
  await testEndpoint(
    'Get broker by ID',
    'GET',
    `${BASE_URL}/brokers/1`
  );
  
  // Test 4: Create new broker
  const newBroker = await testEndpoint(
    'Create new broker',
    'POST',
    `${BASE_URL}/brokers`,
    {
      name: 'Test Cloud Broker',
      description: 'Cloud MQTT broker for testing',
      protocol: 'mqtts',
      host: 'mqtt.example.com',
      port: 8883,
      username: 'test_user',
      password: 'test_password',
      use_tls: true,
      broker_type: 'cloud',
      is_active: true,
      is_default: false
    }
  );
  
  // Test 5: Update broker (if creation succeeded)
  if (newBroker.data?.data?.id) {
    await testEndpoint(
      'Update broker',
      'PUT',
      `${BASE_URL}/brokers/${newBroker.data.data.id}`,
      {
        description: 'Updated description for cloud broker',
        port: 8884
      }
    );
    
    // Test 6: Test connection
    await testEndpoint(
      'Test broker connection',
      'POST',
      `${BASE_URL}/brokers/${newBroker.data.data.id}/test`
    );
    
    // Test 7: Delete broker
    await testEndpoint(
      'Delete broker',
      'DELETE',
      `${BASE_URL}/brokers/${newBroker.data.data.id}`
    );
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Tests completed');
  console.log('='.repeat(80) + '\n');
}

runTests().catch(console.error);
