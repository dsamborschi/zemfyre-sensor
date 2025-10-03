/**
 * Livepush module - Live code synchronization for rapid development
 * 
 * This module enables "hot reload" style development by watching source files
 * and syncing changes to running containers without rebuilds.
 * 
 * Based on balena-supervisor's livepush implementation.
 */

import * as chokidar from 'chokidar';
import type { Dockerfile } from 'livepush';
import { Livepush } from 'livepush';
import * as path from 'path';

export interface LivepushOptions {
	/** Container ID or name to sync code into */
	containerId: string;
	/** Path to the Dockerfile (used to understand build context) */
	dockerfile: string;
	/** Source directory to watch (defaults to current directory) */
	sourceDir?: string;
	/** Directories/files to ignore (node_modules, .git, etc.) */
	ignored?: string[];
	/** Docker socket path */
	dockerSocket?: string;
}

export interface LivepushInstance {
	/** Stop watching files and cleanup */
	stop: () => Promise<void>;
	/** Check if livepush is currently active */
	isActive: () => boolean;
}

/**
 * Start live code synchronization to a running container
 * 
 * @example
 * ```typescript
 * const livepush = await startLivepush({
 *   containerId: 'my-app-container',
 *   dockerfile: './Dockerfile',
 *   sourceDir: './src'
 * });
 * 
 * // Later, stop watching:
 * await livepush.stop();
 * ```
 */
export async function startLivepush(opts: LivepushOptions): Promise<LivepushInstance> {
	const {
		containerId,
		dockerfile,
		sourceDir = process.cwd(),
		ignored = ['node_modules/**', '.git/**', 'dist/**', 'data/**', '*.log'],
		dockerSocket = process.env.DOCKER_SOCKET || '/var/run/docker.sock',
	} = opts;

	console.log('🔄 Starting livepush for container:', containerId);
	console.log('📁 Watching directory:', sourceDir);
	console.log('📄 Using Dockerfile:', dockerfile);

	// Read and parse the Dockerfile
	const fs = await import('fs/promises');
	const dockerfileContent = await fs.readFile(dockerfile, 'utf-8');

	// Get build context (directory containing Dockerfile)
	const context = path.dirname(dockerfile);

	// Initialize Docker connection
	const Docker = require('dockerode');
	const docker = new Docker({ socketPath: dockerSocket });

	// Initialize livepush with container and Dockerfile
	// API: Livepush.init(dockerfileContent, context, containerId, stageImages, docker)
	const livepush = await Livepush.init(
		dockerfileContent,
		context,
		containerId,
		[], // stageImages - empty for now
		docker,
	);

	// Set up event listeners for livepush operations
	livepush.addListener('commandExecute', ({ command }: any) => {
		console.log('  ⚙️  Executing:', command);
	});

	livepush.addListener('commandReturn', ({ returnCode }: any) => {
		if (returnCode !== 0) {
			console.error('  ❌ Command failed with code:', returnCode);
		} else {
			console.log('  ✅ Command completed successfully');
		}
	});

	livepush.addListener('commandOutput', ({ output }: any) => {
		const outputStr = typeof output === 'string' ? output : String(output);
		if (outputStr.trim()) {
			console.log('  📤', outputStr.trim());
		}
	});

	livepush.addListener('containerRestart', () => {
		console.log('  🔄 Container restarted');
	});

	// Create debounced executor to batch rapid file changes
	const livepushExecutor = getExecutor(livepush);

	// Watch the source directory for changes
	const watcher = chokidar
		.watch(sourceDir, {
			ignored,
			persistent: true,
			ignoreInitial: true,
			awaitWriteFinish: {
				stabilityThreshold: 300,
				pollInterval: 100,
			},
		})
		.on('ready', () => {
			console.log('👀 Watching for file changes...');
			console.log('💡 Tip: Make changes to your code and they will sync automatically!\n');
		})
		.on('add', (filePath: string) => {
			console.log('📝 File added:', path.relative(sourceDir, filePath));
			livepushExecutor(filePath);
		})
		.on('change', (filePath: string) => {
			console.log('📝 File changed:', path.relative(sourceDir, filePath));
			livepushExecutor(filePath);
		})
		.on('unlink', (filePath: string) => {
			console.log('🗑️  File deleted:', path.relative(sourceDir, filePath));
			livepushExecutor(undefined, filePath);
		});

	let isActive = true;

	// Return control interface
	return {
		stop: async () => {
			if (!isActive) {
				return;
			}
			console.log('\n🛑 Stopping livepush...');
			await watcher.close();
			await livepush.cleanupIntermediateContainers();
			isActive = false;
			console.log('✅ Livepush stopped');
		},
		isActive: () => isActive,
	};
}

/**
 * Creates a debounced executor that batches file changes
 * to avoid excessive sync operations during rapid edits
 */
function getExecutor(livepush: Livepush) {
	let changedFiles: string[] = [];
	let deletedFiles: string[] = [];
	let timeoutId: NodeJS.Timeout | null = null;

	return async (changedFile?: string, deletedFile?: string) => {
		// Add files to the batch
		if (changedFile) {
			changedFiles.push(changedFile);
		}
		if (deletedFile) {
			deletedFiles.push(deletedFile);
		}

		// Clear existing timeout
		if (timeoutId) {
			clearTimeout(timeoutId);
		}

		// Debounce: wait 300ms for more changes before syncing
		timeoutId = setTimeout(async () => {
			const toSync = changedFiles;
			const toDelete = deletedFiles;
			changedFiles = [];
			deletedFiles = [];
			timeoutId = null;

			if (toSync.length > 0 || toDelete.length > 0) {
				console.log(`\n🚀 Syncing ${toSync.length} changed and ${toDelete.length} deleted files...`);
				try {
					await livepush.performLivepush(toSync, toDelete);
					console.log('✅ Sync complete!\n');
				} catch (error) {
					console.error('❌ Sync failed:', error instanceof Error ? error.message : error);
				}
			}
		}, 300);
	};
}

/**
 * Check if a container exists and is running
 */
export async function isContainerRunning(containerId: string): Promise<boolean> {
	try {
		const Docker = require('dockerode');
		const docker = new Docker();
		const container = docker.getContainer(containerId);
		const info = await container.inspect();
		return info.State.Running === true;
	} catch (error) {
		return false;
	}
}
