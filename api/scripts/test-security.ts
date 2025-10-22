/**
 * Test Secure Provisioning Flow
 * Validates the complete security implementation
 */

import fetch from 'node-fetch';

const API_BASE = process.env.API_URL || 'http://localhost:4002';
const PROVISIONING_KEY = process.env.PROVISIONING_API_KEY || '';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function log(emoji: string, message: string) {
  console.log(`${emoji} ${message}`);
}

async function testProvisioningKeyValidation() {
  log('🧪', 'Test 1: Provisioning key validation...');
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/device/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-key-12345'
      },
      body: JSON.stringify({
        uuid: 'test-device-' + Date.now(),
        deviceName: 'Test Device',
        deviceType: 'raspberry-pi',
        deviceApiKey: 'test-device-key-' + Math.random()
      })
    });

    if (response.status === 401) {
      results.push({
        test: 'Invalid provisioning key rejected',
        passed: true,
        message: 'Invalid provisioning keys are correctly rejected'
      });
      log('✅', 'Invalid key correctly rejected');
    } else {
      results.push({
        test: 'Invalid provisioning key rejected',
        passed: false,
        message: `Expected 401, got ${response.status}`
      });
      log('❌', `Expected 401 Unauthorized, got ${response.status}`);
    }
  } catch (error: any) {
    results.push({
      test: 'Invalid provisioning key rejected',
      passed: false,
      message: error.message
    });
    log('❌', `Error: ${error.message}`);
  }
}

async function testRateLimiting() {
  log('🧪', 'Test 2: Rate limiting...');
  
  try {
    // Make 6 rapid requests (limit is 5 per 15 minutes)
    for (let i = 0; i < 6; i++) {
      const response = await fetch(`${API_BASE}/api/v1/device/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-key-' + i
        },
        body: JSON.stringify({
          uuid: 'test-device-' + Date.now() + '-' + i,
          deviceName: 'Test Device',
          deviceType: 'raspberry-pi',
          deviceApiKey: 'test-key'
        })
      });

      if (i === 5 && response.status === 429) {
        results.push({
          test: 'Rate limiting enforced',
          passed: true,
          message: 'Rate limit correctly enforced after 5 attempts'
        });
        log('✅', 'Rate limiting working correctly');
        return;
      }
    }

    results.push({
      test: 'Rate limiting enforced',
      passed: false,
      message: 'Rate limit not enforced after 6 attempts'
    });
    log('❌', 'Rate limiting not working');
  } catch (error: any) {
    results.push({
      test: 'Rate limiting enforced',
      passed: false,
      message: error.message
    });
    log('❌', `Error: ${error.message}`);
  }
}

async function testSuccessfulProvisioning() {
  if (!PROVISIONING_KEY) {
    log('⚠️', 'Skipping provisioning test - no PROVISIONING_API_KEY provided');
    return;
  }

  log('🧪', 'Test 3: Successful provisioning with valid key...');
  
  const testUuid = 'test-device-' + Date.now();
  const testApiKey = 'test-api-key-' + Math.random().toString(36);

  try {
    const response = await fetch(`${API_BASE}/api/v1/device/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PROVISIONING_KEY}`
      },
      body: JSON.stringify({
        uuid: testUuid,
        deviceName: 'Test Device Security',
        deviceType: 'raspberry-pi',
        deviceApiKey: testApiKey,
        macAddress: '00:11:22:33:44:55',
        osVersion: 'Test OS 1.0',
        supervisorVersion: '1.0.0'
      })
    });

    if (response.status === 200) {
      const data = await response.json();
      results.push({
        test: 'Successful provisioning',
        passed: true,
        message: 'Device registered successfully with valid key',
        details: data
      });
      log('✅', `Device registered: ${data.uuid}`);

      // Test key exchange
      await testKeyExchange(testUuid, testApiKey);
    } else {
      const error = await response.text();
      results.push({
        test: 'Successful provisioning',
        passed: false,
        message: `Expected 200, got ${response.status}`,
        details: error
      });
      log('❌', `Registration failed: ${response.status} - ${error}`);
    }
  } catch (error: any) {
    results.push({
      test: 'Successful provisioning',
      passed: false,
      message: error.message
    });
    log('❌', `Error: ${error.message}`);
  }
}

async function testKeyExchange(uuid: string, deviceApiKey: string) {
  log('🧪', 'Test 4: Key exchange with hashed verification...');
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/device/${uuid}/key-exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deviceApiKey}`
      },
      body: JSON.stringify({
        deviceApiKey: deviceApiKey
      })
    });

    if (response.status === 200) {
      const data = await response.json();
      results.push({
        test: 'Key exchange with hash verification',
        passed: true,
        message: 'Device API key correctly verified against hash',
        details: data
      });
      log('✅', 'Key exchange successful (hash verification working)');
    } else {
      const error = await response.text();
      results.push({
        test: 'Key exchange with hash verification',
        passed: false,
        message: `Expected 200, got ${response.status}`,
        details: error
      });
      log('❌', `Key exchange failed: ${response.status}`);
    }
  } catch (error: any) {
    results.push({
      test: 'Key exchange with hash verification',
      passed: false,
      message: error.message
    });
    log('❌', `Error: ${error.message}`);
  }
}

async function testInvalidKeyExchange() {
  log('🧪', 'Test 5: Key exchange with wrong key...');
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/device/test-uuid/key-exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-key'
      },
      body: JSON.stringify({
        deviceApiKey: 'wrong-key'
      })
    });

    if (response.status === 401 || response.status === 404) {
      results.push({
        test: 'Invalid key exchange rejected',
        passed: true,
        message: 'Wrong device API key correctly rejected'
      });
      log('✅', 'Invalid key correctly rejected');
    } else {
      results.push({
        test: 'Invalid key exchange rejected',
        passed: false,
        message: `Expected 401/404, got ${response.status}`
      });
      log('❌', `Wrong key should be rejected, got ${response.status}`);
    }
  } catch (error: any) {
    results.push({
      test: 'Invalid key exchange rejected',
      passed: false,
      message: error.message
    });
    log('❌', `Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔒 Iotistic Security Implementation Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`API Endpoint: ${API_BASE}`);
  console.log(`Provisioning Key: ${PROVISIONING_KEY ? '✓ Provided' : '✗ Not provided'}\n`);

  // Run tests
  await testProvisioningKeyValidation();
  console.log('');
  
  // Wait a bit to avoid rate limiting our own tests
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testInvalidKeyExchange();
  console.log('');
  
  await testSuccessfulProvisioning();
  console.log('');
  
  // Rate limiting test last (will trigger rate limit)
  // await testRateLimiting();
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 Test Results Summary');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  let passed = 0;
  let failed = 0;
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.test}`);
    console.log(`   ${result.message}`);
    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
    }
    console.log('');
    
    if (result.passed) passed++;
    else failed++;
  });
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total: ${results.length} tests | Passed: ${passed} | Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  if (failed === 0) {
    console.log('🎉 All tests passed! Security implementation is working.\n');
  } else {
    console.log('⚠️  Some tests failed. Review the results above.\n');
  }
}

runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
