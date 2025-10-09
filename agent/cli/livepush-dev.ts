#!/usr/bin/env node
/**
 * Livepush Development CLI
 * 
 * Starts the container-manager in development mode with live code synchronization.
 * Use this to rapidly iterate on code changes without rebuilding containers.
 * 
 * Usage:
 *   npm run dev:livepush -- --container=<container-id> --dockerfile=<path>
 * 
 * Examples:
 *   npm run dev:livepush -- --container=my-nginx --dockerfile=./examples/nginx/Dockerfile
 *   npm run dev:livepush -- --container=abc123 --dockerfile=./Dockerfile --source=./src
 */

import { startLivepush, isContainerRunning } from '../src/livepush';
import * as path from 'path';

// Parse command line arguments
function parseArgs() {
	const args = process.argv.slice(2);
	const options: Record<string, string> = {};

	for (const arg of args) {
		if (arg.startsWith('--')) {
			const [key, value] = arg.slice(2).split('=');
			if (key && value) {
				options[key] = value;
			}
		}
	}

	return options;
}

async function main() {
	console.log('🚀 Container Manager - Livepush Development Mode\n');

	const args = parseArgs();

	// Validate required arguments
	if (!args.container) {
		console.error('❌ Error: --container argument is required');
		console.error('\nUsage:');
		console.error('  npm run dev:livepush -- --container=<container-id> --dockerfile=<path>');
		console.error('\nExample:');
		console.error('  npm run dev:livepush -- --container=my-app --dockerfile=./Dockerfile');
		process.exit(1);
	}

	if (!args.dockerfile) {
		console.error('❌ Error: --dockerfile argument is required');
		console.error('\nUsage:');
		console.error('  npm run dev:livepush -- --container=<container-id> --dockerfile=<path>');
		console.error('\nExample:');
		console.error('  npm run dev:livepush -- --container=my-app --dockerfile=./Dockerfile');
		process.exit(1);
	}

	const containerId = args.container;
	const dockerfile = path.resolve(args.dockerfile);
	const sourceDir = args.source ? path.resolve(args.source) : process.cwd();

	// Check if container is running
	console.log('🔍 Checking if container is running...');
	const isRunning = await isContainerRunning(containerId);

	if (!isRunning) {
		console.error(`❌ Error: Container '${containerId}' is not running or does not exist`);
		console.error('\nTips:');
		console.error('  1. Start your container first using docker run or the container-manager API');
		console.error('  2. Get the container ID with: docker ps');
		console.error('  3. Try using container name instead of ID');
		process.exit(1);
	}

	console.log('✅ Container is running\n');

	// Start livepush
	try {
		const livepushInstance = await startLivepush({
			containerId,
			dockerfile,
			sourceDir,
		});

		// Handle graceful shutdown
		const shutdown = async () => {
			console.log('\n\n⏹️  Shutting down gracefully...');
			await livepushInstance.stop();
			process.exit(0);
		};

		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);

		// Keep process alive
		console.log('💡 Press Ctrl+C to stop\n');

	} catch (error) {
		console.error('❌ Failed to start livepush:', error instanceof Error ? error.message : error);
		if (error instanceof Error && error.stack) {
			console.error('\nStack trace:', error.stack);
		}
		process.exit(1);
	}
}

// Run the CLI
main().catch((error) => {
	console.error('❌ Unexpected error:', error);
	process.exit(1);
});
