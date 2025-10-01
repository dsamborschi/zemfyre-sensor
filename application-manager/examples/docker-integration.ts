/**
 * DOCKER INTEGRATION EXAMPLES
 * ===========================
 * 
 * This example shows how to use ContainerManager with REAL Docker
 * to deploy and manage containerized applications just like Balena does.
 */

import { ContainerManager, SimpleState } from '../src/container-manager';
import { DockerManager } from '../src/docker-manager';

// ============================================================================
// EXAMPLE 1: Basic Docker Integration
// ============================================================================

async function example1_basicDocker() {
	console.log('\n' + '='.repeat(80));
	console.log('EXAMPLE 1: Basic Docker Integration');
	console.log('='.repeat(80) + '\n');

	// Create manager with REAL Docker enabled
	const manager = new ContainerManager(true);

	// Define target state: Run nginx web server
	const targetState: SimpleState = {
		apps: {
			1: {
				appId: 1,
				appName: 'my-web-app',
				services: [
					{
						serviceId: 1,
						serviceName: 'nginx',
						imageName: 'nginx:alpine',
						appId: 1,
						appName: 'my-web-app',
						config: {
							image: 'nginx:alpine',
							ports: ['8080:80'], // Map host:container
							environment: {
								NGINX_PORT: '80',
							},
							restart: 'unless-stopped',
						},
					},
				],
			},
		},
	};

	// Set target and apply
	manager.setTarget(targetState);
	await manager.applyTargetState();

	// Check current state
	const currentState = await manager.getCurrentState();
	console.log('\n✅ Application deployed!');
	console.log('Current state:', JSON.stringify(currentState, null, 2));
}

// ============================================================================
// EXAMPLE 2: Multi-Container Application (Like docker-compose)
// ============================================================================

async function example2_multiContainer() {
	console.log('\n' + '='.repeat(80));
	console.log('EXAMPLE 2: Multi-Container Application');
	console.log('='.repeat(80) + '\n');

	const manager = new ContainerManager(true);

	// Deploy a complete application stack:
	// - Redis (database)
	// - Node.js API (backend)
	// - Nginx (reverse proxy)
	const targetState: SimpleState = {
		apps: {
			1: {
				appId: 1,
				appName: 'full-stack-app',
				services: [
					{
						serviceId: 1,
						serviceName: 'redis',
						imageName: 'redis:alpine',
						appId: 1,
						appName: 'full-stack-app',
						config: {
							image: 'redis:alpine',
							ports: ['6379:6379'],
							volumes: ['redis-data:/data'],
							restart: 'unless-stopped',
						},
					},
					{
						serviceId: 2,
						serviceName: 'api',
						imageName: 'node:20-alpine',
						appId: 1,
						appName: 'full-stack-app',
						config: {
							image: 'node:20-alpine',
							ports: ['3000:3000'],
							environment: {
								NODE_ENV: 'production',
								REDIS_HOST: 'redis',
								PORT: '3000',
							},
							restart: 'unless-stopped',
						},
					},
					{
						serviceId: 3,
						serviceName: 'nginx',
						imageName: 'nginx:alpine',
						appId: 1,
						appName: 'full-stack-app',
						config: {
							image: 'nginx:alpine',
							ports: ['80:80'],
							volumes: ['./nginx.conf:/etc/nginx/nginx.conf:ro'],
							restart: 'unless-stopped',
						},
					},
				],
			},
		},
	};

	manager.setTarget(targetState);
	await manager.applyTargetState();

	console.log('\n✅ Full stack deployed!');
	console.log('Services:');
	console.log('  - Redis: localhost:6379');
	console.log('  - API: localhost:3000');
	console.log('  - Nginx: localhost:80');
}

// ============================================================================
// EXAMPLE 3: Update/Rollout (Like Balena Updates)
// ============================================================================

async function example3_updateRollout() {
	console.log('\n' + '='.repeat(80));
	console.log('EXAMPLE 3: Application Update (Rollout)');
	console.log('='.repeat(80) + '\n');

	const manager = new ContainerManager(true);

	// Deploy initial version
	console.log('📦 Deploying version 1.0...\n');
	const v1State: SimpleState = {
		apps: {
			1: {
				appId: 1,
				appName: 'my-app',
				services: [
					{
						serviceId: 1,
						serviceName: 'web',
						imageName: 'nginx:1.24-alpine',
						appId: 1,
						appName: 'my-app',
						config: {
							image: 'nginx:1.24-alpine',
							ports: ['8080:80'],
							environment: {
								VERSION: '1.0',
							},
						},
					},
				],
			},
		},
	};

	manager.setTarget(v1State);
	await manager.applyTargetState();

	console.log('\n✅ Version 1.0 deployed!\n');
	await sleep(2000);

	// Update to version 2.0
	console.log('📦 Updating to version 2.0...\n');
	const v2State: SimpleState = {
		apps: {
			1: {
				appId: 1,
				appName: 'my-app',
				services: [
					{
						serviceId: 1,
						serviceName: 'web',
						imageName: 'nginx:1.25-alpine', // Updated image
						appId: 1,
						appName: 'my-app',
						config: {
							image: 'nginx:1.25-alpine',
							ports: ['8080:80'],
							environment: {
								VERSION: '2.0', // Updated env
							},
						},
					},
				],
			},
		},
	};

	manager.setTarget(v2State);
	await manager.applyTargetState();

	console.log('\n✅ Updated to version 2.0!');
	console.log('Update process:');
	console.log('  1. Downloaded new image: nginx:1.25-alpine');
	console.log('  2. Stopped old container');
	console.log('  3. Removed old container');
	console.log('  4. Started new container with updated config');
}

// ============================================================================
// EXAMPLE 4: Direct Docker Manager Usage
// ============================================================================

async function example4_directDocker() {
	console.log('\n' + '='.repeat(80));
	console.log('EXAMPLE 4: Direct Docker Manager Usage');
	console.log('='.repeat(80) + '\n');

	const docker = new DockerManager();

	// Check Docker connection
	const isConnected = await docker.ping();
	console.log(`🐳 Docker connected: ${isConnected}`);

	if (!isConnected) {
		console.log('❌ Docker is not running. Please start Docker and try again.');
		return;
	}

	// Get Docker version
	const version = await docker.getVersion();
	console.log(`Docker version: ${version.Version}`);

	// List all managed containers
	const containers = await docker.listManagedContainers();
	console.log(`\n📦 Managed containers (${containers.length}):`);
	containers.forEach((c) => {
		console.log(`  - ${c.name} (${c.state})`);
		console.log(`    Image: ${c.image}`);
		console.log(`    ID: ${c.id.substring(0, 12)}`);
	});

	// Pull an image
	console.log('\n📥 Pulling hello-world image...');
	await docker.pullImage('hello-world');

	// Start a simple container
	console.log('\n▶️  Starting hello-world container...');
	const containerId = await docker.startContainer({
		serviceId: 999,
		serviceName: 'hello-world',
		imageName: 'hello-world',
		appId: 999,
		appName: 'test',
		config: {
			image: 'hello-world',
		},
	});

	console.log(`✅ Container started: ${containerId.substring(0, 12)}`);

	// Wait a bit
	await sleep(2000);

	// Get logs
	console.log('\n📋 Container logs:');
	const logs = await docker.getContainerLogs(containerId, 50);
	console.log(logs);

	// Clean up
	console.log('\n🧹 Cleaning up...');
	await docker.stopContainer(containerId);
	await docker.removeContainer(containerId);
	console.log('✅ Cleaned up!');
}

// ============================================================================
// EXAMPLE 5: Real-World Scenario - Deploy a Blog
// ============================================================================

async function example5_realWorld() {
	console.log('\n' + '='.repeat(80));
	console.log('EXAMPLE 5: Deploy a WordPress Blog');
	console.log('='.repeat(80) + '\n');

	const manager = new ContainerManager(true);

	const targetState: SimpleState = {
		apps: {
			1: {
				appId: 1,
				appName: 'wordpress-blog',
				services: [
					{
						serviceId: 1,
						serviceName: 'mysql',
						imageName: 'mysql:8',
						appId: 1,
						appName: 'wordpress-blog',
						config: {
							image: 'mysql:8',
							environment: {
								MYSQL_ROOT_PASSWORD: 'rootpass',
								MYSQL_DATABASE: 'wordpress',
								MYSQL_USER: 'wpuser',
								MYSQL_PASSWORD: 'wppass',
							},
							volumes: ['mysql-data:/var/lib/mysql'],
							restart: 'unless-stopped',
						},
					},
					{
						serviceId: 2,
						serviceName: 'wordpress',
						imageName: 'wordpress:latest',
						appId: 1,
						appName: 'wordpress-blog',
						config: {
							image: 'wordpress:latest',
							ports: ['8080:80'],
							environment: {
								WORDPRESS_DB_HOST: 'mysql',
								WORDPRESS_DB_USER: 'wpuser',
								WORDPRESS_DB_PASSWORD: 'wppass',
								WORDPRESS_DB_NAME: 'wordpress',
							},
							volumes: ['wordpress-data:/var/www/html'],
							restart: 'unless-stopped',
						},
					},
				],
			},
		},
	};

	console.log('🚀 Deploying WordPress blog...\n');
	manager.setTarget(targetState);
	await manager.applyTargetState();

	console.log('\n✅ WordPress blog deployed!');
	console.log('\n📝 Access your blog at: http://localhost:8080');
	console.log('\n💡 To stop and remove:');
	console.log('   manager.setTarget({ apps: {} });');
	console.log('   await manager.applyTargetState();');
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// RUN EXAMPLES
// ============================================================================

async function main() {
	console.log('\n');
	console.log('╔════════════════════════════════════════════════════════════════════════════╗');
	console.log('║                    DOCKER INTEGRATION EXAMPLES                             ║');
	console.log('╚════════════════════════════════════════════════════════════════════════════╝');

	const args = process.argv.slice(2);
	const exampleNumber = args[0] || '1';

	try {
		switch (exampleNumber) {
			case '1':
				await example1_basicDocker();
				break;
			case '2':
				await example2_multiContainer();
				break;
			case '3':
				await example3_updateRollout();
				break;
			case '4':
				await example4_directDocker();
				break;
			case '5':
				await example5_realWorld();
				break;
			case 'all':
				await example1_basicDocker();
				await example2_multiContainer();
				await example3_updateRollout();
				await example4_directDocker();
				await example5_realWorld();
				break;
			default:
				console.log('❌ Invalid example number');
				console.log('Usage: npx tsx examples/docker-integration.ts [1-5|all]');
				process.exit(1);
		}
	} catch (error: any) {
		console.error('\n❌ Error:', error.message);
		console.error('\n💡 Make sure Docker is running!');
		process.exit(1);
	}
}

// Run if called directly
if (require.main === module) {
	main().catch(console.error);
}

export {
	example1_basicDocker,
	example2_multiContainer,
	example3_updateRollout,
	example4_directDocker,
	example5_realWorld,
};
