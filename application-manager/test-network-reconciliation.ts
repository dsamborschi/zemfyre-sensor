/**
 * Test Network Reconciliation Fix
 * 
 * This test verifies that changes to the networks configuration
 * trigger container recreation during reconciliation.
 */

import { ContainerManager } from './src/compose/container-manager';

async function testNetworkReconciliation() {
	console.log('=== Testing Network Reconciliation Fix ===\n');

	const manager = new ContainerManager(false); // Use simulated mode

	// Initial state: Service without networks
	const initialState = {
		apps: {
			'1': {
				appId: 1,
				appName: 'test-app',
				services: [
					{
						serviceId: 1,
						serviceName: 'nginx',
						imageName: 'nginx:alpine',
						appId: 1,
						appName: 'test-app',
						containerId: 'abc123',
						status: 'running',
						config: {
							image: 'nginx:alpine',
							ports: ['80:80'],
						},
					},
				],
			},
		},
	};

	// Target state: Same service WITH networks
	const targetState = {
		apps: {
			'1': {
				appId: 1,
				appName: 'test-app',
				services: [
					{
						serviceId: 1,
						serviceName: 'nginx',
						imageName: 'nginx:alpine',
						appId: 1,
						appName: 'test-app',
						config: {
							image: 'nginx:alpine',
							ports: ['80:80'],
							networks: ['backend'], // <-- Network added!
						},
					},
				],
			},
		},
	};

	console.log('Step 1: Set current state (service WITHOUT networks)');
	// Manually set current state (simulating Docker state)
	(manager as any).currentState = initialState;

	console.log('Step 2: Set target state (service WITH networks)\n');
	await manager.setTarget(targetState);

	console.log('Step 3: Run reconciliation...\n');
	await manager.applyTargetState();
	
	// Get the applied steps from the manager
	const result = { success: true, steps: (manager as any).lastReconciliationSteps || [] };

	console.log('\n=== Reconciliation Result ===');
	console.log(`Success: ${result.success}`);
	console.log(`Steps executed: ${result.steps.length}`);
	console.log('\nSteps:');
	result.steps.forEach((step, i) => {
		console.log(`  ${i + 1}. ${step.action}${step.networkName ? ` (network: ${step.networkName})` : ''}${step.serviceId ? ` (service: ${step.serviceId})` : ''}`);
	});

	// Verify expected steps
	console.log('\n=== Verification ===');
	
	const hasCreateNetwork = result.steps.some(s => s.action === 'createNetwork' && s.networkName === 'backend');
	const hasStopContainer = result.steps.some(s => s.action === 'stopContainer');
	const hasRemoveContainer = result.steps.some(s => s.action === 'removeContainer');
	const hasStartContainer = result.steps.some(s => s.action === 'startContainer');

	console.log(`✓ Create network 'backend': ${hasCreateNetwork ? '✅ YES' : '❌ NO'}`);
	console.log(`✓ Stop old container: ${hasStopContainer ? '✅ YES' : '❌ NO'}`);
	console.log(`✓ Remove old container: ${hasRemoveContainer ? '✅ YES' : '❌ NO'}`);
	console.log(`✓ Start new container: ${hasStartContainer ? '✅ YES' : '❌ NO'}`);

	const allPassed = hasCreateNetwork && hasStopContainer && hasRemoveContainer && hasStartContainer;

	console.log(`\n${allPassed ? '✅ TEST PASSED' : '❌ TEST FAILED'}`);
	
	if (!allPassed) {
		console.log('\n❌ Network change did NOT trigger reconciliation!');
		console.log('The container should be recreated when networks are added/removed.');
		process.exit(1);
	} else {
		console.log('\n✅ Network change correctly triggered container recreation!');
		process.exit(0);
	}
}

// Run test
testNetworkReconciliation().catch((error) => {
	console.error('Test failed with error:', error);
	process.exit(1);
});
