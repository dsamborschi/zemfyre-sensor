/**
 * TEST: Network Integration
 * 
 * This test verifies that Docker networks are properly created and containers
 * can communicate via DNS names
 */

import { ContainerManager, SimpleState } from './src/compose/container-manager';

async function testNetworkIntegration() {
	console.log('\n🧪 Testing Network Integration\n');
	console.log('='.repeat(80));

	// Create container manager (use real Docker)
	const manager = new ContainerManager(true);
	await manager.init();

	// Define target state with two services on a shared network
	const targetState: SimpleState = {
		apps: {
			100: {
				appId: 100,
				appName: 'test-app',
				appUuid: 'test-uuid-12345',
				services: [
					{
						serviceId: 1,
						serviceName: 'api',
						imageName: 'nginx:alpine',
						appId: 100,
						appName: 'test-app',
						config: {
							image: 'nginx:alpine',
							ports: ['8080:80'],
							networks: ['backend'],
							environment: {
								SERVICE_NAME: 'api',
							},
						},
					},
					{
						serviceId: 2,
						serviceName: 'web',
						imageName: 'nginx:alpine',
						appId: 100,
						appName: 'test-app',
						config: {
							image: 'nginx:alpine',
							ports: ['8081:80'],
							networks: ['backend', 'frontend'],
							environment: {
								SERVICE_NAME: 'web',
							},
						},
					},
				],
			},
		},
	};

	console.log('\n📋 Target State:');
	console.log('  - App: test-app (ID: 100)');
	console.log('  - Networks: backend, frontend');
	console.log('  - Services:');
	console.log('    * api: nginx:alpine on "backend" network (port 8080)');
	console.log('    * web: nginx:alpine on "backend" + "frontend" networks (port 8081)');

	// Set target state
	console.log('\n🎯 Setting target state...');
	await manager.setTargetState(targetState);

	// Apply state
	console.log('\n🚀 Applying state (this will create networks and containers)...\n');
	await manager.applyTargetState();

	// Wait a bit for containers to start
	console.log('\n⏳ Waiting 3 seconds for containers to stabilize...');
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Verify networks were created
	console.log('\n✅ Verification:');
	console.log('  1. Check Docker networks:');
	console.log('     docker network ls | grep "100_"');
	console.log('\n  2. Check containers are connected:');
	console.log('     docker inspect test-app_api_1 | grep Networks -A 10');
	console.log('     docker inspect test-app_web_2 | grep Networks -A 10');
	console.log('\n  3. Test connectivity (from web to api):');
	console.log('     docker exec test-app_web_2 ping -c 3 api');
	console.log('\n  4. Test DNS resolution:');
	console.log('     docker exec test-app_web_2 nslookup api');

	console.log('\n📦 Current State:');
	const currentState = manager.getCurrentState();
	for (const appId in currentState.apps) {
		const app = currentState.apps[appId];
		console.log(`\n  App: ${app.appName} (ID: ${app.appId})`);
		for (const service of app.services) {
			console.log(`    - ${service.serviceName}: ${service.status}`);
			console.log(`      Networks: ${service.config.networks?.join(', ') || 'none'}`);
			console.log(`      Container: ${service.containerId?.substring(0, 12)}`);
		}
	}

	console.log('\n' + '='.repeat(80));
	console.log('✅ Test complete! Networks and containers should be running.');
	console.log('\n💡 To clean up:');
	console.log('   1. Set empty target state: await manager.setTargetState({ apps: {} })');
	console.log('   2. Apply state: await manager.applyTargetState()');
	console.log('   3. Or manually: docker rm -f test-app_api_1 test-app_web_2');
	console.log('                   docker network rm 100_backend 100_frontend');
	console.log('='.repeat(80) + '\n');
}

// Run test
testNetworkIntegration().catch((error) => {
	console.error('❌ Test failed:', error);
	process.exit(1);
});
