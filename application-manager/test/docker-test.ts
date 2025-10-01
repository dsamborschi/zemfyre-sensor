#!/usr/bin/env node
/**
 * DOCKER INTEGRATION TEST
 * ========================
 * 
 * Quick test to verify Docker functionality works correctly
 */

import { DockerManager } from '../src/docker-manager';
import { ContainerManager, SimpleState } from '../src/container-manager';

const colors = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
};

function log(msg: string, color: string = colors.reset) {
	console.log(`${color}${msg}${colors.reset}`);
}

function success(msg: string) {
	log(`✅ ${msg}`, colors.green);
}

function error(msg: string) {
	log(`❌ ${msg}`, colors.red);
}

function info(msg: string) {
	log(`ℹ️  ${msg}`, colors.blue);
}

function warning(msg: string) {
	log(`⚠️  ${msg}`, colors.yellow);
}

async function testDockerConnection() {
	info('Testing Docker connection...');

	const docker = new DockerManager();

	try {
		const isConnected = await docker.ping();
		if (isConnected) {
			success('Docker is running and accessible');
			return true;
		} else {
			error('Docker ping failed');
			return false;
		}
	} catch (err: any) {
		error(`Failed to connect to Docker: ${err.message}`);
		return false;
	}
}

async function testDockerVersion() {
	info('Getting Docker version...');

	const docker = new DockerManager();

	try {
		const version = await docker.getVersion();
		success(`Docker version: ${version.Version}`);
		info(`  API version: ${version.ApiVersion}`);
		info(`  Go version: ${version.GoVersion}`);
		return true;
	} catch (err: any) {
		error(`Failed to get Docker version: ${err.message}`);
		return false;
	}
}

async function testListContainers() {
	info('Listing managed containers...');

	const docker = new DockerManager();

	try {
		const containers = await docker.listManagedContainers();
		success(`Found ${containers.length} managed container(s)`);

		if (containers.length > 0) {
			containers.forEach((c) => {
				info(`  - ${c.name} (${c.state})`);
				info(`    Image: ${c.image}`);
				info(`    ID: ${c.id.substring(0, 12)}`);
			});
		}

		return true;
	} catch (err: any) {
		error(`Failed to list containers: ${err.message}`);
		return false;
	}
}

async function testSimpleDeployment() {
	info('Testing simple deployment (hello-world)...');

	const manager = new ContainerManager(true);

	try {
		// Deploy hello-world container
		const targetState: SimpleState = {
			apps: {
				999: {
					appId: 999,
					appName: 'test-app',
					services: [
						{
							serviceId: 1,
							serviceName: 'hello',
							imageName: 'hello-world',
							appId: 999,
							appName: 'test-app',
							config: {
								image: 'hello-world',
							},
						},
					],
				},
			},
		};

		info('Setting target state...');
		manager.setTarget(targetState);

		info('Applying target state (this will pull and start hello-world)...');
		await manager.applyTargetState();

		success('Deployment successful!');

		// Wait a bit for the container to finish
		await sleep(2000);

		// Get current state
		const currentState = await manager.getCurrentState();
		if (currentState.apps[999]) {
			success('Container appears in current state');
		} else {
			warning('Container not found in current state (might have exited)');
		}

		// Clean up
		info('Cleaning up...');
		manager.setTarget({ apps: {} });
		await manager.applyTargetState();

		success('Cleanup complete');

		return true;
	} catch (err: any) {
		error(`Deployment test failed: ${err.message}`);

		// Try to clean up anyway
		try {
			const manager = new ContainerManager(true);
			manager.setTarget({ apps: {} });
			await manager.applyTargetState();
		} catch (cleanupErr) {
			// Ignore cleanup errors
		}

		return false;
	}
}

async function testWebServerDeployment() {
	info('Testing web server deployment (nginx)...');

	const manager = new ContainerManager(true);

	try {
		// Deploy nginx
		const targetState: SimpleState = {
			apps: {
				1000: {
					appId: 1000,
					appName: 'test-nginx',
					services: [
						{
							serviceId: 1,
							serviceName: 'web',
							imageName: 'nginx:alpine',
							appId: 1000,
							appName: 'test-nginx',
							config: {
								image: 'nginx:alpine',
								ports: ['8888:80'],
								environment: {
									NGINX_PORT: '80',
								},
							},
						},
					],
				},
			},
		};

		info('Deploying nginx on port 8888...');
		manager.setTarget(targetState);
		await manager.applyTargetState();

		success('Nginx deployed successfully!');
		info('📝 You can test it by visiting: http://localhost:8888');

		// Wait a bit
		await sleep(2000);

		// Verify it's running
		const currentState = await manager.getCurrentState();
		const service = currentState.apps[1000]?.services[0];

		if (service && service.containerId) {
			success(`Container is running: ${service.containerId.substring(0, 12)}`);
			info('Nginx should be accessible at http://localhost:8888');
		}

		// Clean up
		info('Cleaning up in 5 seconds... (visit http://localhost:8888 now if you want)');
		await sleep(5000);

		info('Removing nginx...');
		manager.setTarget({ apps: {} });
		await manager.applyTargetState();

		success('Cleanup complete');

		return true;
	} catch (err: any) {
		error(`Web server test failed: ${err.message}`);

		// Try to clean up
		try {
			const manager = new ContainerManager(true);
			manager.setTarget({ apps: {} });
			await manager.applyTargetState();
		} catch (cleanupErr) {
			// Ignore cleanup errors
		}

		return false;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
	console.log('\n');
	log(
		'╔════════════════════════════════════════════════════════════════════════════╗',
		colors.blue,
	);
	log(
		'║                      DOCKER INTEGRATION TEST                               ║',
		colors.blue,
	);
	log(
		'╚════════════════════════════════════════════════════════════════════════════╝',
		colors.blue,
	);
	console.log('\n');

	const tests = [
		{ name: 'Docker Connection', fn: testDockerConnection, required: true },
		{ name: 'Docker Version', fn: testDockerVersion, required: true },
		{ name: 'List Containers', fn: testListContainers, required: false },
		{ name: 'Simple Deployment', fn: testSimpleDeployment, required: false },
		{ name: 'Web Server Deployment', fn: testWebServerDeployment, required: false },
	];

	let passed = 0;
	let failed = 0;
	let skipped = 0;

	for (const test of tests) {
		log(`\n${'='.repeat(80)}`, colors.blue);
		log(`TEST: ${test.name}`, colors.blue);
		log('='.repeat(80), colors.blue);
		console.log('');

		try {
			const result = await test.fn();
			if (result) {
				passed++;
			} else {
				failed++;
				if (test.required) {
					error('This is a required test. Stopping here.');
					break;
				}
			}
		} catch (err: any) {
			error(`Test threw exception: ${err.message}`);
			failed++;
			if (test.required) {
				error('This is a required test. Stopping here.');
				break;
			}
		}

		console.log('');
	}

	// Summary
	console.log('\n');
	log('='.repeat(80), colors.blue);
	log('TEST SUMMARY', colors.blue);
	log('='.repeat(80), colors.blue);
	console.log('');
	success(`Passed: ${passed}`);
	if (failed > 0) {
		error(`Failed: ${failed}`);
	}
	if (skipped > 0) {
		warning(`Skipped: ${skipped}`);
	}

	console.log('\n');

	if (failed === 0) {
		success('🎉 All tests passed!');
		success('✅ Docker integration is working correctly!');
		console.log('\n');
		info('Next steps:');
		info('1. Check out examples/docker-integration.ts for more examples');
		info('2. Read DOCKER-GUIDE.md for comprehensive documentation');
		info('3. Start the API with: cd api && USE_REAL_DOCKER=true npm run dev');
		process.exit(0);
	} else {
		error('❌ Some tests failed');
		console.log('\n');
		info('Troubleshooting:');
		info('1. Make sure Docker Desktop is running');
		info('2. Check Docker connection: docker ps');
		info('3. See DOCKER-GUIDE.md for more help');
		process.exit(1);
	}
}

// Run tests
if (require.main === module) {
	main().catch((err) => {
		error(`Fatal error: ${err.message}`);
		console.error(err);
		process.exit(1);
	});
}

export { testDockerConnection, testDockerVersion, testListContainers, testSimpleDeployment };
