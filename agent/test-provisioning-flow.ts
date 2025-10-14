/**
 * Test two-phase authentication provisioning flow
 * 
 * Run with: npx tsx test-provisioning-flow.ts
 */

import { DeviceManager } from './src/provisioning/device-manager';
import * as db from './src/db';

async function testProvisioningFlow() {
	console.log('🧪 Testing Two-Phase Authentication Provisioning Flow\n');
	console.log('=' .repeat(60));

	try {
		// Initialize database
		console.log('\n📦 Initializing database...');
		await db.initialized();

		// Create device manager
		const deviceManager = new DeviceManager();
		await deviceManager.initialize();

		const deviceInfo = deviceManager.getDeviceInfo();
		console.log('\n📱 Device initialized:');
		console.log('   UUID:', deviceInfo.uuid);
		console.log('   Device API Key:', deviceInfo.deviceApiKey?.substring(0, 16) + '...');
		console.log('   Provisioned:', deviceInfo.provisioned);

		if (deviceInfo.provisioned) {
			console.log('\n⚠️  Device already provisioned. Resetting for test...');
			await deviceManager.reset();
		}

		// Test provisioning with two-phase auth
		console.log('\n🔐 Starting provisioning flow...\n');

		const provisioningConfig = {
			// This would normally come from your fleet/application configuration
			provisioningApiKey: 'test-provisioning-key-12345', // Fleet-level key
			
			// Optional metadata
			deviceName: 'Test Device',
			deviceType: 'raspberry-pi-4',
			apiEndpoint: 'http://localhost:3001', // Your cloud API
			applicationId: 1,
			macAddress: '00:11:22:33:44:55',
			osVersion: 'Raspbian 11',
			supervisorVersion: '1.0.0',
		};

		console.log('📋 Provisioning configuration:');
		console.log('   API Endpoint:', provisioningConfig.apiEndpoint);
		console.log('   Application ID:', provisioningConfig.applicationId);
		console.log('   Device Type:', provisioningConfig.deviceType);
		console.log('   Provisioning Key:', provisioningConfig.provisioningApiKey.substring(0, 16) + '...');

		const provisionedDevice = await deviceManager.provision(provisioningConfig);

		console.log('\n✅ Provisioning complete!\n');
		console.log('📱 Provisioned device info:');
		console.log('   UUID:', provisionedDevice.uuid);
		console.log('   Device ID:', provisionedDevice.deviceId);
		console.log('   Device Name:', provisionedDevice.deviceName);
		console.log('   Device Type:', provisionedDevice.deviceType);
		console.log('   Application ID:', provisionedDevice.applicationId);
		console.log('   Device API Key:', provisionedDevice.deviceApiKey?.substring(0, 16) + '...');
		console.log('   Provisioning Key:', provisionedDevice.provisioningApiKey || '(removed after provisioning)');
		console.log('   Provisioned:', provisionedDevice.provisioned);
		console.log('   Registered At:', new Date(provisionedDevice.registeredAt || 0).toISOString());

		console.log('\n' + '='.repeat(60));
		console.log('✅ All tests passed!');

	} catch (error: any) {
		console.error('\n❌ Test failed:', error.message);
		console.error('\nStack trace:', error.stack);
		process.exit(1);
	}
}

// Run tests
testProvisioningFlow()
	.then(() => {
		console.log('\n✨ Test completed successfully');
		process.exit(0);
	})
	.catch((error) => {
		console.error('\n💥 Fatal error:', error);
		process.exit(1);
	});
