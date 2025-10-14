/**
 * SIMPLE CONTAINER MANAGER
 * =========================
 * 
 * Simplified version of application-manager WITHOUT commit logic
 * 
 * Purpose: Control containers on a device and update state
 * 
 * Core concept:
 *   currentState  = what co				config: {
					image: container.image,
					ports: container.ports && container.ports.length > 0
						? Array.from(new Set(container.ports
							.filter(p => p.PublicPort && p.PrivatePort)
							.map(p => `${p.PublicPort}:${p.PrivatePort}`)))
						: undefined,
				}, are running now
 *   targetState   = what containers should be running
 *   → Generate steps to transform current → target
 *   → Execute steps
 */

import { EventEmitter } from 'events';
import _ from 'lodash';
import crypto from 'crypto';
import type Docker from 'dockerode';
import { DockerManager } from './docker-manager';
import * as db from '../db';
import type { ContainerLogMonitor } from '../logging/monitor';
import * as networkManager from './network-manager';
import { Network } from './network';

// ============================================================================
// TYPES (Simplified)
// ============================================================================

export interface SimpleService {
	serviceId: number;
	serviceName: string;
	imageName: string; // e.g., "nginx:latest"
	appId: number;
	appName: string;

	// Configuration
	config: {
		image: string;
		environment?: Record<string, string>;
		ports?: string[]; // e.g., ["80:80", "443:443"]
		volumes?: string[]; // e.g., ["data:/var/lib/data"]
		networks?: string[]; // e.g., ["frontend", "backend"]
		networkMode?: string;
		restart?: string;
		labels?: Record<string, string>;
	};

	// Runtime state (for current state)
	containerId?: string;
	status?: string; // "Running", "Exited", etc.
}

export interface SimpleApp {
	appId: number;
	appName: string;
	appUuid?: string; // Optional UUID for network naming
	services: SimpleService[];
}

export interface SimpleState {
	apps: Record<number, SimpleApp>; // Keyed by appId
}

export type SimpleStep =
	| { action: 'downloadImage'; appId: number; imageName: string }
	| { action: 'createVolume'; appId: number; volumeName: string }
	| { action: 'createNetwork'; appId: number; networkName: string }
	| {
			action: 'stopContainer';
			appId: number;
			serviceId: number;
			containerId: string;
	  }
	| {
			action: 'removeContainer';
			appId: number;
			serviceId: number;
			containerId: string;
	  }
	| { action: 'startContainer'; appId: number; service: SimpleService }
	| { action: 'removeNetwork'; appId: number; networkName: string }
	| { action: 'removeVolume'; appId: number; volumeName: string }
	| { action: 'noop' };

// ============================================================================
// SIMPLE CONTAINER MANAGER
// ============================================================================

export interface ContainerManagerEvents {
	'target-state-changed': (state: SimpleState) => void;
	'current-state-changed': (state: SimpleState) => void;
	'state-applied': () => void;
}

export class ContainerManager extends EventEmitter {
	private currentState: SimpleState = { apps: {} };
	private targetState: SimpleState = { apps: {} };
	private isApplyingState = false;
	private dockerManager: DockerManager;
	private useRealDocker: boolean;
	private reconciliationInterval?: NodeJS.Timeout;
	private isReconciliationEnabled = false;
	private logMonitor?: ContainerLogMonitor;
	private lastSavedCurrentStateHash: string = '';
	private lastSavedTargetStateHash: string = '';

	constructor(useRealDocker: boolean = false) {
		super();
		this.useRealDocker = useRealDocker;
		console.log(`[ContainerManager] Creating DockerManager (platform: ${process.platform})`);
		this.dockerManager = new DockerManager();
	}

	/**
	 * Initialize and load persisted state from database
	 */
	public async init(): Promise<void> {
		console.log('Initializing ContainerManager...');
		
		// Load target state from database
		await this.loadTargetStateFromDB();
		
		// Sync current state from Docker if using real Docker
		if (this.useRealDocker) {
			await this.syncCurrentStateFromDocker();
		}
		
		console.log('✅ ContainerManager initialized');
	}

	/**
	 * Generate SHA-256 hash of state for efficient comparison
	 */
	private getStateHash(state: SimpleState): string {
		const stateJson = JSON.stringify(state);
		return crypto.createHash('sha256').update(stateJson).digest('hex');
	}

	/**
	 * Load target state from database
	 */
	private async loadTargetStateFromDB(): Promise<void> {
		try {
			const snapshots = await db.models('stateSnapshot')
				.where({ type: 'target' })
				.orderBy('createdAt', 'desc')
				.limit(1);

			if (snapshots.length > 0) {
				this.targetState = JSON.parse(snapshots[0].state);
				
				// Sanitize loaded state to ensure ports are strings
				this.sanitizeState(this.targetState);
				
				console.log('✅ Loaded target state from database');
				this.emit('target-state-changed', this.targetState);
			}
		} catch (error) {
			console.error('Failed to load target state from DB:', error);
		}
	}

	/**
	 * Save target state to database (only if changed)
	 */
	private async saveTargetStateToDB(): Promise<void> {
		try {
			const stateHash = this.getStateHash(this.targetState);
			
			// Skip if state hasn't changed (compare hashes)
			if (stateHash === this.lastSavedTargetStateHash) {
				console.log('  Target state unchanged, skipping DB write');
				return;
			}
			
			console.log('  Target state changed, saving to DB');
			this.lastSavedTargetStateHash = stateHash;
			
			const stateJson = JSON.stringify(this.targetState);
			
			// Delete old target snapshots and insert new
			await db.models('stateSnapshot')
				.where({ type: 'target' })
				.delete();
			
			await db.models('stateSnapshot').insert({
				type: 'target',
				state: stateJson,
			});
			console.log('✅ Saved target state to database');
		} catch (error) {
			console.error('Failed to save target state to DB:', error);
		}
	}

	/**
	 * Save current state to database (only if changed)
	 */
	private async saveCurrentStateToDB(): Promise<void> {
		try {
			const stateHash = this.getStateHash(this.currentState);
			
			// Skip if state hasn't changed (compare hashes)
			if (stateHash === this.lastSavedCurrentStateHash) {
				console.log('  Current state unchanged, skipping DB write');
				return;
			}
			
			console.log('  Current state changed, saving to DB');
			this.lastSavedCurrentStateHash = stateHash;
			
			const stateJson = JSON.stringify(this.currentState);
			
			// Delete old current snapshots and insert new
			await db.models('stateSnapshot')
				.where({ type: 'current' })
				.delete();
			
			await db.models('stateSnapshot').insert({
				type: 'current',
				state: stateJson,
			});
		} catch (error) {
			console.error('Failed to save current state to DB:', error);
		}
	}

	// Typed event emitter methods
	public on<K extends keyof ContainerManagerEvents>(
		event: K,
		listener: ContainerManagerEvents[K],
	): this {
		return super.on(event, listener as any);
	}

	public emit<K extends keyof ContainerManagerEvents>(
		event: K,
		...args: Parameters<ContainerManagerEvents[K]>
	): boolean {
		return super.emit(event, ...args);
	}

	// ========================================================================
	// PUBLIC API
	// ========================================================================

	/**
	 * Set what containers SHOULD be running (target state)
	 */
	public async setTarget(target: SimpleState): Promise<void> {
		console.log('Setting target state...');
		this.targetState = _.cloneDeep(target);
		
		// Sanitize the target state to ensure correct data types
		this.sanitizeState(this.targetState);
		
		// Persist to database
		await this.saveTargetStateToDB();
		
		this.emit('target-state-changed', target);
		
		// Trigger immediate reconciliation if using real Docker
		if (this.useRealDocker && !this.isApplyingState) {
			console.log('🔄 Triggering immediate reconciliation...');
			try {
				await this.applyTargetState();
			} catch (error) {
				console.error('❌ Failed to apply target state:', error);
			}
		}
	}

	/**
	 * Get what containers ARE running (current state)
	 */
	public async getCurrentState(): Promise<SimpleState> {
		if (this.useRealDocker) {
			// Query Docker for actual state
			await this.syncCurrentStateFromDocker();
		}
		return _.cloneDeep(this.currentState);
	}

	/**
	 * Sync current state from real Docker containers
	 */
	private async syncCurrentStateFromDocker(): Promise<void> {
		try {
			const containers = await this.dockerManager.listManagedContainers();

			// Reset current state
			this.currentState = { apps: {} };

			// Build state from running containers
			for (const container of containers) {
				const appId = parseInt(container.labels['iotistic.app-id']);
				const appName = container.labels['iotistic.app-name'];
				const serviceId = parseInt(container.labels['iotistic.service-id']);
				const serviceName = container.labels['iotistic.service-name'];

				// Ensure app exists
				if (!this.currentState.apps[appId]) {
					this.currentState.apps[appId] = {
						appId,
						appName,
						services: [],
					};
				}

				// Get network and environment information from container inspect
				let networks: string[] = [];
				let environment: Record<string, string> = {};
				try {
					const containerInfo = await this.dockerManager.inspectContainer(container.id);
					
					// Extract networks
					if (containerInfo.NetworkSettings?.Networks) {
						// Extract network names, filtering out default networks
						const networkNames = Object.keys(containerInfo.NetworkSettings.Networks)
							.filter((name) => {
								// Filter to only include our custom networks (appId_networkName pattern)
								return name.startsWith(`${appId}_`);
							})
							.map((name) => {
								// Remove the appId_ prefix to get the original network name
								return name.replace(`${appId}_`, '');
							});
						
						if (networkNames.length > 0) {
							networks = networkNames;
						}
					}
					
					// Extract environment variables
					if (containerInfo.Config?.Env) {
						for (const envVar of containerInfo.Config.Env) {
							const [key, ...valueParts] = envVar.split('=');
							if (key) {
								environment[key] = valueParts.join('=');
							}
						}
					}
				} catch (error) {
					console.error(`Warning: Failed to inspect container ${container.id}:`, error);
				}

				// Add service
				const service: SimpleService = {
					serviceId,
					serviceName,
					imageName: container.image,
					appId,
					appName,
					containerId: container.id,
					// Normalize status to lowercase for consistent comparison
					status: container.state.toLowerCase(),
					config: {
						image: container.image,
						ports: container.ports && container.ports.length > 0
						? Array.from(new Set(container.ports
							.filter(p => p.PublicPort && p.PrivatePort)
							.map(p => `${p.PublicPort}:${p.PrivatePort}`)))
						: [],  // Use empty array instead of undefined
						networks,  // Already defaults to []
						environment,  // Extract actual environment variables
					},
				};
				
				this.currentState.apps[appId].services.push(service);
			}

			// Save the synced current state to database
			await this.saveCurrentStateToDB();
		} catch (error) {
			console.error('❌ Failed to sync state from Docker:', error);
		}
	}

	/**
	 * Get target state
	 */
	public getTargetState(): SimpleState {
		return _.cloneDeep(this.targetState);
	}

	/**
	 * Main function: Reconcile current state → target state
	 * @param options.saveState - Whether to save state to DB after reconciliation (default: true)
	 */
	public async applyTargetState(options: { saveState?: boolean } = {}): Promise<void> {
		const { saveState = true } = options;
		
		if (this.isApplyingState) {
			console.log('Already applying state, skipping...');
			return;
		}

		this.isApplyingState = true;

		try {
			console.log('\n' + '='.repeat(80));
			console.log('RECONCILING STATE');
			console.log('='.repeat(80));

			// Step 1: Calculate what needs to change
			const steps = this.calculateSteps();

			if (steps.length === 0) {
				console.log('No changes needed - system is in desired state!');
				return;
			}

			console.log(`\nGenerated ${steps.length} step(s):\n`);
			steps.forEach((step, i) => {
				console.log(`  ${i + 1}. ${step.action}`);
				if (step.action === 'downloadImage') {
					console.log(`     Image: ${step.imageName}`);
				} else if (step.action === 'startContainer') {
					console.log(
						`     Service: ${step.service.serviceName} (${step.service.imageName})`,
					);
				}
			});

			// Step 2: Execute steps sequentially
			console.log('\nExecuting steps...\n');
			for (let i = 0; i < steps.length; i++) {
				const step = steps[i];
				console.log(`[${i + 1}/${steps.length}] ${step.action}...`);
				await this.executeStep(step);
				console.log(`  Done`);
			}

			console.log('\nState reconciliation complete!');
			console.log('='.repeat(80) + '\n');

			// Save current state snapshot after successful reconciliation (if requested)
			if (saveState) {
				await this.saveCurrentStateToDB();
			}

			this.emit('state-applied');
		} catch (error) {
			console.error('Error applying state:', error);
			throw error;
		} finally {
			this.isApplyingState = false;
		}
	}

	/**
	 * Simulate updating current state (in real app: query Docker)
	 */
	public setCurrentState(state: SimpleState): void {
		this.currentState = _.cloneDeep(state);
		this.emit('current-state-changed', state);
	}

	// ========================================================================
	// NETWORK RECONCILIATION
	// ========================================================================

	/**
	 * Reconcile networks for an app
	 * Returns steps to create/remove networks based on service requirements
	 */
	private reconcileNetworksForApp(
		appId: number,
		currentApp: SimpleApp | undefined,
		targetApp: SimpleApp | undefined,
	): SimpleStep[] {
		const steps: SimpleStep[] = [];

		// Collect all network names from current and target services
		const currentNetworks = new Set<string>();
		const targetNetworks = new Set<string>();

		if (currentApp) {
			for (const service of currentApp.services) {
				// Handle both formats: service.config.networks and service.networks
				const networks = service.config?.networks || (service as any).networks;
				if (networks) {
					networks.forEach((net: string) => currentNetworks.add(net));
				}
			}
		}

		if (targetApp) {
			for (const service of targetApp.services) {
				// Handle both formats: service.config.networks and service.networks
				const networks = service.config?.networks || (service as any).networks;
				if (networks) {
					networks.forEach((net: string) => targetNetworks.add(net));
				}
			}
		}

		// Networks to create (in target but not in current)
		for (const networkName of targetNetworks) {
			if (!currentNetworks.has(networkName)) {
				steps.push({
					action: 'createNetwork',
					appId,
					networkName,
				});
			}
		}

		// Networks to remove (in current but not in target)
		for (const networkName of currentNetworks) {
			if (!targetNetworks.has(networkName)) {
				steps.push({
					action: 'removeNetwork',
					appId,
					networkName,
				});
			}
		}

		return steps;
	}

	private reconcileVolumesForApp(
		appId: number,
		currentApp: SimpleApp | undefined,
		targetApp: SimpleApp | undefined,
	): SimpleStep[] {
		const steps: SimpleStep[] = [];

		// Collect all volume names from current and target services
		const currentVolumes = new Set<string>();
		const targetVolumes = new Set<string>();

		if (currentApp) {
			for (const service of currentApp.services) {
				// Handle both formats: service.config.volumes and service.volumes
				const volumes = service.config?.volumes || (service as any).volumes;
				if (volumes) {
					for (const volume of volumes) {
						// Only track named volumes (format: "volumeName:/path")
						// Skip bind mounts (format: "/host/path:/container/path")
						if (!volume.startsWith('/')) {
							const volumeName = volume.split(':')[0];
							currentVolumes.add(volumeName);
						}
					}
				}
			}
		}

		if (targetApp) {
			for (const service of targetApp.services) {
				// Handle both formats: service.config.volumes and service.volumes
				const volumes = service.config?.volumes || (service as any).volumes;
				if (volumes) {
					for (const volume of volumes) {
						// Only track named volumes (format: "volumeName:/path")
						// Skip bind mounts (format: "/host/path:/container/path")
						if (!volume.startsWith('/')) {
							const volumeName = volume.split(':')[0];
							targetVolumes.add(volumeName);
						}
					}
				}
			}
		}

		// Volumes to create (in target but not in current)
		for (const volumeName of targetVolumes) {
			if (!currentVolumes.has(volumeName)) {
				steps.push({
					action: 'createVolume',
					appId,
					volumeName,
				});
			}
		}

		// Volumes to remove (in current but not in target)
		for (const volumeName of currentVolumes) {
			if (!targetVolumes.has(volumeName)) {
				steps.push({
					action: 'removeVolume',
					appId,
					volumeName,
				});
			}
		}

		return steps;
	}

	// ========================================================================
	// STEP CALCULATION (The Brain)
	// ========================================================================

	private calculateSteps(): SimpleStep[] {
		const steps: SimpleStep[] = [];
		const currentApps = this.currentState.apps;
		const targetApps = this.targetState.apps;

		// Get all app IDs
		const allAppIds = _.uniq([
			...Object.keys(currentApps).map(Number),
			...Object.keys(targetApps).map(Number),
		]);

		for (const appId of allAppIds) {
			const currentApp = currentApps[appId];
			const targetApp = targetApps[appId];

			// === VOLUME STEPS (BEFORE NETWORKS) ===
			// Volumes must be created before networks/containers can use them
			const volumeCreateSteps = this.reconcileVolumesForApp(
				appId,
				currentApp,
				targetApp,
			).filter((step) => step.action === 'createVolume');
			steps.push(...volumeCreateSteps);

			// === NETWORK STEPS (BEFORE CONTAINER STEPS) ===
			// Networks must be created before containers can use them
			const networkCreateSteps = this.reconcileNetworksForApp(
				appId,
				currentApp,
				targetApp,
			).filter((step) => step.action === 'createNetwork');
			steps.push(...networkCreateSteps);

			// === CONTAINER STEPS ===
			// Case 1: App should be removed (exists in current, not in target)
			if (currentApp && !targetApp) {
				steps.push(...this.stepsToRemoveApp(currentApp));
			}
			// Case 2: App should be added (exists in target, not in current)
			else if (!currentApp && targetApp) {
				steps.push(...this.stepsToAddApp(targetApp));
			}
			// Case 3: App exists in both - check for updates
			else if (currentApp && targetApp) {
				steps.push(...this.stepsToUpdateApp(currentApp, targetApp));
			}

			// === NETWORK CLEANUP (AFTER CONTAINER STEPS) ===
			// Networks should be removed after containers are stopped
			const networkRemoveSteps = this.reconcileNetworksForApp(
				appId,
				currentApp,
				targetApp,
			).filter((step) => step.action === 'removeNetwork');
			steps.push(...networkRemoveSteps);

			// === VOLUME CLEANUP (AFTER EVERYTHING) ===
			// Volumes should be removed last, after containers and networks
			const volumeRemoveSteps = this.reconcileVolumesForApp(
				appId,
				currentApp,
				targetApp,
			).filter((step) => step.action === 'removeVolume');
			steps.push(...volumeRemoveSteps);
		}

		return steps;
	}

	private stepsToRemoveApp(app: SimpleApp): SimpleStep[] {
		const steps: SimpleStep[] = [];

		// Stop and remove all services
		for (const service of app.services) {
			if (service.containerId) {
				steps.push({
					action: 'stopContainer',
					appId: app.appId,
					serviceId: service.serviceId,
					containerId: service.containerId,
				});
				steps.push({
					action: 'removeContainer',
					appId: app.appId,
					serviceId: service.serviceId,
					containerId: service.containerId,
				});
			}
		}

		return steps;
	}

	private stepsToAddApp(app: SimpleApp): SimpleStep[] {
		const steps: SimpleStep[] = [];

		// Download images and start all services
		for (const service of app.services) {
			// 1. Download image
			steps.push({
				action: 'downloadImage',
				appId: app.appId,
				imageName: service.imageName,
			});

			// 2. Start container
			steps.push({
				action: 'startContainer',
				appId: app.appId,
				service: service,
			});
		}

		return steps;
	}

	private stepsToUpdateApp(
		current: SimpleApp,
		target: SimpleApp,
	): SimpleStep[] {
		const steps: SimpleStep[] = [];

		// Build maps for easy lookup
		const currentServices = new Map(
			current.services.map((s) => [s.serviceId, s]),
		);
		const targetServices = new Map(
			target.services.map((s) => [s.serviceId, s]),
		);

		// Get all service IDs
		const allServiceIds = _.uniq([
			...currentServices.keys(),
			...targetServices.keys(),
		]);

		for (const serviceId of allServiceIds) {
			const currentSvc = currentServices.get(serviceId);
			const targetSvc = targetServices.get(serviceId);

			// Service removed
			if (currentSvc && !targetSvc && currentSvc.containerId) {
				steps.push({
					action: 'stopContainer',
					appId: current.appId,
					serviceId: serviceId,
					containerId: currentSvc.containerId,
				});
				steps.push({
					action: 'removeContainer',
					appId: current.appId,
					serviceId: serviceId,
					containerId: currentSvc.containerId,
				});
			}

			// Service added
			if (!currentSvc && targetSvc) {
				steps.push({
					action: 'downloadImage',
					appId: target.appId,
					imageName: targetSvc.imageName,
				});
				steps.push({
					action: 'startContainer',
					appId: target.appId,
					service: targetSvc,
				});
			}

			// Service updated (image or config changed) OR container is not running
			if (currentSvc && targetSvc) {
				// Check if image changed (this requires container recreation)
				const imageChanged = currentSvc.imageName !== targetSvc.imageName;
				
				// Check if configuration changed (ports, environment, volumes, networks, etc.)
				// Normalize undefined/null to empty arrays/objects for consistent comparison
				const currentPorts = JSON.stringify(currentSvc.config.ports || []);
				const targetPorts = JSON.stringify(targetSvc.config.ports || []);
				const portsChanged = currentPorts !== targetPorts;
				
				// For environment, only compare variables that are defined in target state
				// Docker injects many env vars (PATH, HOSTNAME, etc.) that we don't care about
				const targetEnvKeys = Object.keys(targetSvc.config.environment || {});
				const filteredCurrentEnv: Record<string, string> = {};
				for (const key of targetEnvKeys) {
					if (currentSvc.config.environment && key in currentSvc.config.environment) {
						filteredCurrentEnv[key] = currentSvc.config.environment[key];
					}
				}
				const currentEnv = JSON.stringify(filteredCurrentEnv);
				const targetEnv = JSON.stringify(targetSvc.config.environment || {});
				const envChanged = currentEnv !== targetEnv;
				
				const currentVolumes = JSON.stringify(currentSvc.config.volumes || []);
				const targetVolumes = JSON.stringify(targetSvc.config.volumes || []);
				const volumesChanged = currentVolumes !== targetVolumes;
				
				const currentNetworks = JSON.stringify(currentSvc.config.networks || []);
				const targetNetworks = JSON.stringify(targetSvc.config.networks || []);
				const networksChanged = currentNetworks !== targetNetworks;
				
				const configChanged = portsChanged || envChanged || volumesChanged || networksChanged;
				
				// Only check if container is stopped/exited (not just "not running")
				// Don't restart containers that are already running
				const containerStopped = currentSvc.status?.toLowerCase() === 'exited' || 
				                        currentSvc.status?.toLowerCase() === 'stopped' ||
				                        currentSvc.status?.toLowerCase() === 'dead';
				
				const needsUpdate = imageChanged || configChanged || containerStopped;
				
				// DEBUG: Log comparison details for debugging
				if (needsUpdate) {
					console.log(`\n🔍 Service ${currentSvc.serviceName} needs update:`);
					if (imageChanged) {
						console.log(`  ❌ Image changed: ${currentSvc.imageName} → ${targetSvc.imageName}`);
					}
					if (portsChanged) {
						console.log(`  ❌ Ports changed:`);
						console.log(`     Current: ${currentPorts}`);
						console.log(`     Target:  ${targetPorts}`);
					}
					if (envChanged) {
						console.log(`  ❌ Environment changed:`);
						console.log(`     Current: ${currentEnv}`);
						console.log(`     Target:  ${targetEnv}`);
					}
					if (volumesChanged) {
						console.log(`  ❌ Volumes changed:`);
						console.log(`     Current: ${currentVolumes}`);
						console.log(`     Target:  ${targetVolumes}`);
					}
					if (networksChanged) {
						console.log(`  ❌ Networks changed:`);
						console.log(`     Current: ${currentNetworks}`);
						console.log(`     Target:  ${targetNetworks}`);
					}
					if (containerStopped) {
						console.log(`  ❌ Container stopped: ${currentSvc.status}`);
					}
				}

				if (needsUpdate && currentSvc.containerId) {
					// Download new image
					if (currentSvc.imageName !== targetSvc.imageName) {
						steps.push({
							action: 'downloadImage',
							appId: target.appId,
							imageName: targetSvc.imageName,
						});
					}

					// Stop old container
					steps.push({
						action: 'stopContainer',
						appId: current.appId,
						serviceId: serviceId,
						containerId: currentSvc.containerId,
					});

					// Remove old container
					steps.push({
						action: 'removeContainer',
						appId: current.appId,
						serviceId: serviceId,
						containerId: currentSvc.containerId,
					});

					// Start new container
					steps.push({
						action: 'startContainer',
						appId: target.appId,
						service: targetSvc,
					});
				}
			}
		}

		return steps;
	}

	// ========================================================================
	// STEP EXECUTION
	// ========================================================================

	private async executeStep(step: SimpleStep): Promise<void> {
		switch (step.action) {
			case 'downloadImage':
				await this.downloadImage(step.imageName);
				break;

			case 'createNetwork':
				await this.createNetwork(step.appId, step.networkName);
				break;

			case 'stopContainer':
				await this.stopContainer(step.containerId);
				break;

			case 'removeContainer':
				await this.removeContainer(step.containerId);
				// Update current state
				this.removeServiceFromCurrentState(step.appId, step.serviceId);
				break;

			case 'startContainer':
				const containerId = await this.startContainer(step.service);
				// Update current state
				this.addServiceToCurrentState(step.appId, step.service, containerId);
				// Attach logs automatically
				await this.attachLogsToContainer(containerId, step.service);
				break;

			case 'removeNetwork':
				await this.removeNetwork(step.appId, step.networkName);
				break;

			case 'createVolume':
				await this.createVolume(step.appId, step.volumeName);
				break;

			case 'removeVolume':
				await this.removeVolume(step.appId, step.volumeName);
				break;

			case 'noop':
				// Do nothing
				break;
		}
	}

	// ========================================================================
	// DOCKER OPERATIONS
	// ========================================================================

	private async downloadImage(imageName: string): Promise<void> {
		if (this.useRealDocker) {
			// Real Docker pull
			await this.dockerManager.pullImage(imageName);
		} else {
			// Simulated for testing
			console.log(`    [SIMULATED] Downloading image: ${imageName}`);
			await this.sleep(100);
		}
	}

	private async stopContainer(containerId: string): Promise<void> {
		if (this.useRealDocker) {
			// Real Docker stop
			await this.dockerManager.stopContainer(containerId);
		} else {
			// Simulated for testing
			console.log(`    [SIMULATED] Stopping container: ${containerId}`);
			await this.sleep(50);
		}
	}

	private async removeContainer(containerId: string): Promise<void> {
		if (this.useRealDocker) {
			// Real Docker remove
			await this.dockerManager.removeContainer(containerId);
		} else {
			// Simulated for testing
			console.log(`    [SIMULATED] Removing container: ${containerId}`);
			await this.sleep(50);
		}
	}

	private async startContainer(service: SimpleService): Promise<string> {
		if (this.useRealDocker) {
			// Real Docker start (now supports networks)
			return await this.dockerManager.startContainer(service);
		} else {
			// Simulated for testing
			const containerId = `container_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			console.log(`    [SIMULATED] Starting container: ${service.serviceName}`);
			console.log(`        Container ID: ${containerId}`);
			await this.sleep(100);
			return containerId;
		}
	}

	private async createNetwork(appId: number, networkName: string): Promise<void> {
		if (this.useRealDocker) {
			// Get app info for UUID
			const app = this.targetState.apps[appId] || this.currentState.apps[appId];
			const appUuid = app?.appUuid || String(appId); // Fallback to appId if no UUID

			// Create Network object
			const network = Network.fromComposeObject(
				networkName,
				appId,
				appUuid,
				{ driver: 'bridge' }, // Simple bridge network
			);

			// Create via network-manager
			await networkManager.create(network);
			console.log(`✅ Created network: ${networkName} (${appId}_${networkName})`);
		} else {
			// Simulated for testing
			console.log(`    [SIMULATED] Creating network: ${networkName} for app ${appId}`);
			await this.sleep(50);
		}
	}

	private async removeNetwork(appId: number, networkName: string): Promise<void> {
		if (this.useRealDocker) {
			// Get app info for UUID
			const app = this.currentState.apps[appId];
			const appUuid = app?.appUuid || String(appId); // Fallback to appId if no UUID

			// Create Network object for removal
			const network = Network.fromComposeObject(
				networkName,
				appId,
				appUuid,
				{ driver: 'bridge' },
			);

			// Remove via network-manager
			await networkManager.remove(network);
			console.log(`✅ Removed network: ${networkName} (${appId}_${networkName})`);
		} else {
			// Simulated for testing
			console.log(`    [SIMULATED] Removing network: ${networkName} for app ${appId}`);
			await this.sleep(50);
		}
	}

	private async createVolume(appId: number, volumeName: string): Promise<void> {
		if (this.useRealDocker) {
			const { Volume } = await import('./volume.js');
			const appUuid = String(appId);

			const volume = Volume.fromComposeObject(
				volumeName,
				appId,
				appUuid,
				{
					driver: 'local',
					labels: {
						'iotistic.managed': 'true',
						'iotistic.app-id': String(appId),
					},
				},
			);

			await volume.create();
			console.log(`✅ Created volume: ${volumeName} (${appId}_${volumeName})`);
		} else {
			console.log(`    [SIMULATED] Creating volume: ${volumeName} for app ${appId}`);
			await this.sleep(50);
		}
	}

	private async removeVolume(appId: number, volumeName: string): Promise<void> {
		if (this.useRealDocker) {
			const { Volume } = await import('./volume.js');
			const appUuid = String(appId);

			const volume = Volume.fromComposeObject(
				volumeName,
				appId,
				appUuid,
				{},
			);

			await volume.remove();
			console.log(`✅ Removed volume: ${volumeName} (${appId}_${volumeName})`);
		} else {
			console.log(`    [SIMULATED] Removing volume: ${volumeName} for app ${appId}`);
			await this.sleep(50);
		}
	}

	// ========================================================================
	// STATE MANAGEMENT HELPERS
	// ========================================================================

	private removeServiceFromCurrentState(
		appId: number,
		serviceId: number,
	): void {
		const app = this.currentState.apps[appId];
		if (app) {
			app.services = app.services.filter((s) => s.serviceId !== serviceId);
			// Remove app if no services left
			if (app.services.length === 0) {
				delete this.currentState.apps[appId];
			}
		}
	}

	private addServiceToCurrentState(
		appId: number,
		service: SimpleService,
		containerId: string,
	): void {
		// Ensure app exists
		if (!this.currentState.apps[appId]) {
			this.currentState.apps[appId] = {
				appId: appId,
				appName: service.appName,
				services: [],
			};
		}

		// Add service with container ID
		const serviceWithContainer = {
			...service,
			containerId: containerId,
			status: 'running',  // Use lowercase for consistency
		};

		this.currentState.apps[appId].services.push(serviceWithContainer);
	}

	// ========================================================================
	// UTILITIES
	// ========================================================================

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Sanitize state to ensure all data is in correct format
	 * Fixes issues with data loaded from database that may have wrong types
	 */
	private sanitizeState(state: SimpleState): void {
		for (const app of Object.values(state.apps)) {
			for (const service of app.services) {
				// Normalize flat format to nested config format
				// If service has properties at top level (from cloud API), move them to config
				const flatService = service as any;
				
				if (!service.config) {
					service.config = {
						image: flatService.image || 'unknown',
					};
				}
				
				// Move image to both imageName and config.image
				if (flatService.image && !service.imageName) {
					service.imageName = flatService.image;
					service.config.image = flatService.image;
				}
				
				// Move top-level properties to config
				if (flatService.environment && !service.config.environment) {
					service.config.environment = flatService.environment;
				}
				if (flatService.ports && !service.config.ports) {
					service.config.ports = flatService.ports;
				}
				if (flatService.volumes && !service.config.volumes) {
					service.config.volumes = flatService.volumes;
				}
				if (flatService.networks && !service.config.networks) {
					service.config.networks = flatService.networks;
				}
				if (flatService.restart && !service.config.restart) {
					service.config.restart = flatService.restart;
				}
				if (flatService.labels && !service.config.labels) {
					service.config.labels = flatService.labels;
				}
				
				// Set appId and appName if missing
				if (!service.appId) {
					service.appId = app.appId;
				}
				if (!service.appName) {
					service.appName = app.appName;
				}
				
				// Ensure ports are strings
				if (service.config.ports) {
					service.config.ports = service.config.ports.map(port => {
						// Convert any non-string port to string
						return typeof port === 'string' ? port : String(port);
					});
				}
				
				// Ensure environment values are strings
				if (service.config.environment) {
					const sanitizedEnv: Record<string, string> = {};
					for (const [key, value] of Object.entries(service.config.environment)) {
						sanitizedEnv[key] = typeof value === 'string' ? value : String(value);
					}
					service.config.environment = sanitizedEnv;
				}
				
				// Ensure volumes are strings
				if (service.config.volumes) {
					service.config.volumes = service.config.volumes.map(vol => {
						return typeof vol === 'string' ? vol : String(vol);
					});
				}
			}
		}
	}

	// ========================================================================
	// STATUS & REPORTING
	// ========================================================================

	public getStatus(): {
		isApplying: boolean;
		currentApps: number;
		targetApps: number;
		currentServices: number;
		targetServices: number;
	} {
		return {
			isApplying: this.isApplyingState,
			currentApps: Object.keys(this.currentState.apps).length,
			targetApps: Object.keys(this.targetState.apps).length,
			currentServices: Object.values(this.currentState.apps).reduce(
				(sum, app) => sum + app.services.length,
				0,
			),
			targetServices: Object.values(this.targetState.apps).reduce(
				(sum, app) => sum + app.services.length,
				0,
			),
		};
	}

	/**
	 * Get reconciliation status for each service
	 * Returns which services are out of sync and need updates
	 */
	public getReconciliationStatus(): {
		[appId: number]: {
			appName: string;
			services: {
				[serviceId: number]: {
					serviceName: string;
					status: 'in-sync' | 'needs-update' | 'missing' | 'extra';
					reason?: string;
				};
			};
		};
	} {
		const status: any = {};

		// Get all app IDs from both states
		const allAppIds = _.uniq([
			...Object.keys(this.currentState.apps).map(Number),
			...Object.keys(this.targetState.apps).map(Number),
		]);

		for (const appId of allAppIds) {
			const currentApp = this.currentState.apps[appId];
			const targetApp = this.targetState.apps[appId];

			if (!targetApp) {
				// App exists in current but not in target (should be removed)
				status[appId] = {
					appName: currentApp.appName,
					services: {},
				};
				for (const svc of currentApp.services) {
					status[appId].services[svc.serviceId] = {
						serviceName: svc.serviceName,
						status: 'extra',
						reason: 'Service exists but not in target state',
					};
				}
				continue;
			}

			status[appId] = {
				appName: targetApp.appName,
				services: {},
			};

			// Build service maps
			const currentServices = new Map(
				currentApp ? currentApp.services.map((s) => [s.serviceId, s]) : [],
			);
			const targetServices = new Map(
				targetApp.services.map((s) => [s.serviceId, s]),
			);

			// Check all services
			const allServiceIds = _.uniq([
				...currentServices.keys(),
				...targetServices.keys(),
			]);

			for (const serviceId of allServiceIds) {
				const currentSvc = currentServices.get(serviceId);
				const targetSvc = targetServices.get(serviceId);

				if (!targetSvc) {
					// Service in current but not target (extra)
					status[appId].services[serviceId] = {
						serviceName: currentSvc!.serviceName,
						status: 'extra',
						reason: 'Service exists but not in target state',
					};
				} else if (!currentSvc) {
					// Service in target but not current (missing)
					status[appId].services[serviceId] = {
						serviceName: targetSvc.serviceName,
						status: 'missing',
						reason: 'Service not yet deployed',
					};
				} else {
					// Both exist - check if they match
					const imageChanged = currentSvc.imageName !== targetSvc.imageName;
					const portsChanged = JSON.stringify(currentSvc.config.ports || []) !== 
					                     JSON.stringify(targetSvc.config.ports || []);
					const envChanged = JSON.stringify(currentSvc.config.environment || {}) !== 
					                   JSON.stringify(targetSvc.config.environment || {});
					const volumesChanged = JSON.stringify(currentSvc.config.volumes || []) !== 
					                       JSON.stringify(targetSvc.config.volumes || []);
					
					const containerStopped = currentSvc.status?.toLowerCase() === 'exited' || 
					                        currentSvc.status?.toLowerCase() === 'stopped' ||
					                        currentSvc.status?.toLowerCase() === 'dead';

					const needsUpdate = imageChanged || portsChanged || envChanged || volumesChanged || containerStopped;

					if (needsUpdate) {
						const reasons = [];
						if (imageChanged) reasons.push('Image changed');
						if (portsChanged) reasons.push('Ports changed');
						if (envChanged) reasons.push('Environment changed');
						if (volumesChanged) reasons.push('Volumes changed');
						if (containerStopped) reasons.push('Container stopped');

						status[appId].services[serviceId] = {
							serviceName: currentSvc.serviceName,
							status: 'needs-update',
							reason: reasons.join(', '),
						};
					} else {
						status[appId].services[serviceId] = {
							serviceName: currentSvc.serviceName,
							status: 'in-sync',
						};
					}
				}
			}
		}

		return status;
	}

	public printState(): void {
		console.log('\n' + '='.repeat(80));
		console.log('SYSTEM STATE');
		console.log('='.repeat(80));

		console.log('\nCURRENT STATE (what IS running):');
		this.printStateDetails(this.currentState);

		console.log('\nTARGET STATE (what SHOULD be running):');
		this.printStateDetails(this.targetState);

		const status = this.getStatus();
		console.log('\nSTATUS:');
		console.log(`  Current Apps:     ${status.currentApps}`);
		console.log(`  Current Services: ${status.currentServices}`);
		console.log(`  Target Apps:      ${status.targetApps}`);
		console.log(`  Target Services:  ${status.targetServices}`);
		console.log(`  Is Applying:      ${status.isApplying ? 'Yes' : 'No'}`);
		console.log('='.repeat(80) + '\n');
	}

	private printStateDetails(state: SimpleState): void {
		const apps = Object.values(state.apps);
		if (apps.length === 0) {
			console.log('  (empty)');
			return;
		}

		apps.forEach((app) => {
			console.log(`  App ${app.appId}: ${app.appName}`);
			app.services.forEach((svc) => {
				console.log(`    - ${svc.serviceName} (${svc.imageName})`);
				if (svc.containerId) {
					console.log(`      Container: ${svc.containerId}`);
				}
			});
		});
	}

	// ========================================================================
	// AUTO-RECONCILIATION (Like Balena Supervisor)
	// ========================================================================

	/**
	 * Start automatic reconciliation loop
	 * This monitors containers and automatically restarts them if they stop
	 */
	public startAutoReconciliation(intervalMs: number = 30000): void {
		if (this.isReconciliationEnabled) {
			console.log('Auto-reconciliation already running');
			return;
		}

		console.log(`🔄 Starting auto-reconciliation every ${intervalMs}ms (DB writes optimized)`);
		this.isReconciliationEnabled = true;

		this.reconciliationInterval = setInterval(async () => {
			if (this.useRealDocker && !this.isApplyingState) {
				console.log('🔄 Auto-reconciliation check...');
				try {
					// Don't save to DB on auto-reconciliation (reduces writes by 99%)
					// State is only saved when it actually changes via syncStateFromDocker
					await this.applyTargetState({ saveState: false });
				} catch (error) {
					console.error('Auto-reconciliation error:', error);
				}
			}
		}, intervalMs);
	}

	/**
	 * Stop automatic reconciliation loop
	 */
	public stopAutoReconciliation(): void {
		if (this.reconciliationInterval) {
			clearInterval(this.reconciliationInterval);
			this.reconciliationInterval = undefined;
			this.isReconciliationEnabled = false;
			console.log('🛑 Stopped auto-reconciliation');
		}
	}

	/**
	 * Check if auto-reconciliation is enabled
	 */
	public isAutoReconciliationEnabled(): boolean {
		return this.isReconciliationEnabled;
	}

	/**
	 * Get the Docker instance (for logging and advanced operations)
	 */
	public getDocker(): Docker | undefined {
		if (this.useRealDocker && this.dockerManager) {
			return this.dockerManager.getDockerInstance();
		}
		return undefined;
	}

	/**
	 * Set the log monitor (called by API server after initialization)
	 */
	public setLogMonitor(monitor: ContainerLogMonitor): void {
		this.logMonitor = monitor;
		console.log('✅ Log monitor attached to ContainerManager');
	}

	/**
	 * Attach log monitor to a container
	 */
	private async attachLogsToContainer(
		containerId: string,
		service: SimpleService,
	): Promise<void> {
		if (!this.logMonitor) {
			return;
		}

		try {
			// Check if already attached
			if (this.logMonitor.isAttached(containerId)) {
				return;
			}

			await this.logMonitor.attach({
				containerId,
				serviceId: service.serviceId,
				serviceName: service.serviceName,
				follow: true,
				stdout: true,
				stderr: true,
			});

			console.log(`📝 Attached logs: ${service.serviceName} (${containerId.substring(0, 12)})`);
		} catch (error) {
			console.error(`Failed to attach logs for ${service.serviceName}:`, error);
		}
	}

	/**
	 * Attach logs to all running containers
	 */
	public async attachLogsToAllContainers(): Promise<void> {
		if (!this.logMonitor || !this.useRealDocker) {
			return;
		}

		console.log('📝 Attaching logs to existing containers...');

		for (const app of Object.values(this.currentState.apps)) {
			for (const service of app.services) {
				if (service.containerId && service.status === 'running') {
					await this.attachLogsToContainer(service.containerId, service);
				}
			}
		}
	}
}

// ============================================================================
// EXPORT
// ============================================================================

export default ContainerManager;
