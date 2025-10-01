/**
 * SIMPLE CONTAINER MANAGER - USAGE EXAMPLE
 * =========================================
 * 
 * This demonstrates the simplified container manager WITHOUT commit logic.
 * Just current state vs target state.
 */

import ContainerManager from '../src/container-manager';
import type { SimpleState } from '../src/container-manager';

async function main() {
	console.log('🚀 Simple Container Manager Demo');
	console.log('='.repeat(80));
	console.log('NO COMMIT LOGIC - Just current vs target state reconciliation');
	console.log('='.repeat(80) + '\n');

	// Create manager instance
	const manager = new ContainerManager();

	// Listen to events
	manager.on('target-state-changed', (state) => {
		console.log('📡 Event: Target state changed');
	});

	manager.on('current-state-changed', (state) => {
		console.log('📡 Event: Current state changed');
	});

	manager.on('state-applied', () => {
		console.log('📡 Event: State successfully applied');
	});

	// ========================================================================
	// SCENARIO 1: Starting from empty (no containers running)
	// ========================================================================

	console.log('📋 SCENARIO 1: Deploy first application');
	console.log('-'.repeat(80));

	const initialState: SimpleState = {
		apps: {},
	};

	manager.setCurrentState(initialState);

	// Define target: Run a web application
	const targetState1: SimpleState = {
		apps: {
			1001: {
				appId: 1001,
				appName: 'My Web App',
				services: [
					{
						serviceId: 1,
						serviceName: 'frontend',
						imageName: 'nginx:alpine',
						appId: 1001,
						appName: 'My Web App',
						config: {
							image: 'nginx:alpine',
							ports: ['80:80'],
							environment: {
								NODE_ENV: 'production',
							},
						},
					},
					{
						serviceId: 2,
						serviceName: 'backend',
						imageName: 'node:18-alpine',
						appId: 1001,
						appName: 'My Web App',
						config: {
							image: 'node:18-alpine',
							ports: ['3000:3000'],
							environment: {
								PORT: '3000',
								DB_HOST: 'database',
							},
						},
					},
				],
			},
		},
	};

	manager.setTarget(targetState1);
	manager.printState();

	console.log('▶️  Applying target state...\n');
	await manager.applyTargetState();

	manager.printState();

	// Wait a bit
	await sleep(1000);

	// ========================================================================
	// SCENARIO 2: Update one service (change image)
	// ========================================================================

	console.log('\n📋 SCENARIO 2: Update backend service');
	console.log('-'.repeat(80));

	const targetState2: SimpleState = {
		apps: {
			1001: {
				appId: 1001,
				appName: 'My Web App',
				services: [
					{
						serviceId: 1,
						serviceName: 'frontend',
						imageName: 'nginx:alpine',
						appId: 1001,
						appName: 'My Web App',
						config: {
							image: 'nginx:alpine',
							ports: ['80:80'],
							environment: {
								NODE_ENV: 'production',
							},
						},
					},
					{
						serviceId: 2,
						serviceName: 'backend',
						imageName: 'node:20-alpine', // ← Changed from node:18 to node:20
						appId: 1001,
						appName: 'My Web App',
						config: {
							image: 'node:20-alpine',
							ports: ['3000:3000'],
							environment: {
								PORT: '3000',
								DB_HOST: 'database',
							},
						},
					},
				],
			},
		},
	};

	manager.setTarget(targetState2);
	manager.printState();

	console.log('▶️  Applying target state...\n');
	await manager.applyTargetState();

	manager.printState();

	await sleep(1000);

	// ========================================================================
	// SCENARIO 3: Add new service
	// ========================================================================

	console.log('\n📋 SCENARIO 3: Add database service');
	console.log('-'.repeat(80));

	const targetState3: SimpleState = {
		apps: {
			1001: {
				appId: 1001,
				appName: 'My Web App',
				services: [
					{
						serviceId: 1,
						serviceName: 'frontend',
						imageName: 'nginx:alpine',
						appId: 1001,
						appName: 'My Web App',
						config: {
							image: 'nginx:alpine',
							ports: ['80:80'],
							environment: {
								NODE_ENV: 'production',
							},
						},
					},
					{
						serviceId: 2,
						serviceName: 'backend',
						imageName: 'node:20-alpine',
						appId: 1001,
						appName: 'My Web App',
						config: {
							image: 'node:20-alpine',
							ports: ['3000:3000'],
							environment: {
								PORT: '3000',
								DB_HOST: 'database',
							},
						},
					},
					{
						serviceId: 3,
						serviceName: 'database', // ← NEW SERVICE
						imageName: 'postgres:15',
						appId: 1001,
						appName: 'My Web App',
						config: {
							image: 'postgres:15',
							ports: ['5432:5432'],
							environment: {
								POSTGRES_PASSWORD: 'secret',
								POSTGRES_DB: 'myapp',
							},
							volumes: ['db-data:/var/lib/postgresql/data'],
						},
					},
				],
			},
		},
	};

	manager.setTarget(targetState3);
	manager.printState();

	console.log('▶️  Applying target state...\n');
	await manager.applyTargetState();

	manager.printState();

	await sleep(1000);

	// ========================================================================
	// SCENARIO 4: Remove one service
	// ========================================================================

	console.log('\n📋 SCENARIO 4: Remove frontend service');
	console.log('-'.repeat(80));

	const targetState4: SimpleState = {
		apps: {
			1001: {
				appId: 1001,
				appName: 'My Web App',
				services: [
					// Frontend removed!
					{
						serviceId: 2,
						serviceName: 'backend',
						imageName: 'node:20-alpine',
						appId: 1001,
						appName: 'My Web App',
						config: {
							image: 'node:20-alpine',
							ports: ['3000:3000'],
							environment: {
								PORT: '3000',
								DB_HOST: 'database',
							},
						},
					},
					{
						serviceId: 3,
						serviceName: 'database',
						imageName: 'postgres:15',
						appId: 1001,
						appName: 'My Web App',
						config: {
							image: 'postgres:15',
							ports: ['5432:5432'],
							environment: {
								POSTGRES_PASSWORD: 'secret',
								POSTGRES_DB: 'myapp',
							},
							volumes: ['db-data:/var/lib/postgresql/data'],
						},
					},
				],
			},
		},
	};

	manager.setTarget(targetState4);
	manager.printState();

	console.log('▶️  Applying target state...\n');
	await manager.applyTargetState();

	manager.printState();

	await sleep(1000);

	// ========================================================================
	// SCENARIO 5: Remove entire app
	// ========================================================================

	console.log('\n📋 SCENARIO 5: Remove entire application');
	console.log('-'.repeat(80));

	const targetState5: SimpleState = {
		apps: {}, // Empty - remove everything!
	};

	manager.setTarget(targetState5);
	manager.printState();

	console.log('▶️  Applying target state...\n');
	await manager.applyTargetState();

	manager.printState();

	// ========================================================================
	// SUMMARY
	// ========================================================================

	console.log('\n' + '='.repeat(80));
	console.log('✅ DEMO COMPLETE');
	console.log('='.repeat(80));
	console.log('\nWhat we did:');
	console.log('  1. Deployed app with 2 services (frontend, backend)');
	console.log('  2. Updated backend image (node:18 → node:20)');
	console.log('  3. Added database service');
	console.log('  4. Removed frontend service');
	console.log('  5. Removed entire app');
	console.log();
	console.log('Key features:');
	console.log('  ✓ No commit logic - just compare states');
	console.log('  ✓ Automatic step generation');
	console.log('  ✓ Sequential execution');
	console.log('  ✓ State tracking');
	console.log('  ✓ Event emission');
	console.log('='.repeat(80));
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the demo
main().catch(console.error);
