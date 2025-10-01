#!/usr/bin/env node
/**
 * QUICK START - Deploy your first container!
 * ===========================================
 */

import { ContainerManager, SimpleState } from './src/container-manager';
import { DockerManager } from './src/docker-manager';

async function main() {
	console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
	console.log('║                🐳 DOCKER QUICK START                                       ║');
	console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

	// Step 1: Check Docker
	console.log('Step 1: Checking Docker connection...');
	const docker = new DockerManager();
	const isConnected = await docker.ping();

	if (!isConnected) {
		console.error('❌ Docker is not running!');
		console.error('   Please start Docker Desktop and try again.\n');
		process.exit(1);
	}

	const version = await docker.getVersion();
	console.log(`✅ Docker is running (version ${version.Version})\n`);

	// Step 2: Create manager
	console.log('Step 2: Creating container manager...');
	const manager = new ContainerManager(true); // true = real Docker
	console.log('✅ Manager created\n');

	// Step 3: Define what to deploy
	console.log('Step 3: Defining target state (nginx web server)...');
	const targetState: SimpleState = {
		apps: {
			1: {
				appId: 1,
				appName: 'quick-start-app',
				services: [
					{
						serviceId: 1,
						serviceName: 'web',
						imageName: 'nginx:alpine',
						appId: 1,
						appName: 'quick-start-app',
						config: {
							image: 'nginx:alpine',
							ports: ['8080:80'],
							environment: {
								NGINX_PORT: '80',
							},
						},
					},
				],
			},
		},
	};
	console.log('✅ Target state defined\n');

	// Step 4: Deploy!
	console.log('Step 4: Deploying...');
	console.log('(This will pull nginx:alpine and start the container)\n');
	manager.setTarget(targetState);
	await manager.applyTargetState();

	// Step 5: Verify
	console.log('\n═══════════════════════════════════════════════════════════════════════════');
	console.log('🎉 SUCCESS! Your web server is running!');
	console.log('═══════════════════════════════════════════════════════════════════════════\n');
	console.log('📝 Open your browser and visit: http://localhost:8080');
	console.log('   You should see the nginx welcome page!\n');

	const currentState = await manager.getCurrentState();
	const service = currentState.apps[1]?.services[0];
	if (service && service.containerId) {
		console.log(`✅ Container ID: ${service.containerId.substring(0, 12)}`);
		console.log(`✅ Image: ${service.imageName}`);
		console.log(`✅ Status: ${service.status}\n`);
	}

	// Step 6: View logs
	console.log('───────────────────────────────────────────────────────────────────────────');
	console.log('Container logs (last 10 lines):');
	console.log('───────────────────────────────────────────────────────────────────────────\n');

	if (service && service.containerId) {
		try {
			const logs = await docker.getContainerLogs(service.containerId, 10);
			console.log(logs);
		} catch (err) {
			console.log('(No logs yet, container just started)');
		}
	}

	// Instructions
	console.log('\n═══════════════════════════════════════════════════════════════════════════');
	console.log('📚 What to do next:');
	console.log('═══════════════════════════════════════════════════════════════════════════\n');
	console.log('1. Visit http://localhost:8080 in your browser');
	console.log('2. Check running containers: docker ps');
	console.log('3. View logs: docker logs <container-id>');
	console.log('4. Stop the container: docker stop <container-id>');
	console.log('\n   OR use the manager to stop it:\n');
	console.log('   manager.setTarget({ apps: {} });');
	console.log('   await manager.applyTargetState();\n');

	console.log('───────────────────────────────────────────────────────────────────────────');
	console.log('📖 Learn more:');
	console.log('───────────────────────────────────────────────────────────────────────────\n');
	console.log('• Try more examples: npx tsx examples/docker-integration.ts');
	console.log('• Read the guide: DOCKER-GUIDE.md');
	console.log('• Run tests: npx tsx test/docker-test.ts');
	console.log('• Use REST API: cd api && USE_REAL_DOCKER=true npm run dev\n');

	// Keep container running
	console.log('═══════════════════════════════════════════════════════════════════════════');
	console.log('ℹ️  Container will keep running. Press Ctrl+C to exit.');
	console.log('   (Container will continue running in the background)');
	console.log('═══════════════════════════════════════════════════════════════════════════\n');
}

// Run
if (require.main === module) {
	main().catch((err) => {
		console.error('\n❌ Error:', err.message);
		console.error('\n💡 Troubleshooting:');
		console.error('   • Make sure Docker Desktop is running');
		console.error('   • Check: docker ps');
		console.error('   • Read: DOCKER-GUIDE.md\n');
		process.exit(1);
	});
}

export default main;
