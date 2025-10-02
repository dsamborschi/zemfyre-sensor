/**
 * SIMPLE CONTAINER MANAGER
 * =========================
 * 
 * Simplified version of application-manager WITHOUT commit logic
 * 
 * Purpose: Control containers on a device and update state
 * 
 * Core concept:
 *   currentState  = what containers are running now
 *   targetState   = what containers should be running
 *   → Generate steps to transform current → target
 *   → Execute steps
 */

import { EventEmitter } from 'events';
import _ from 'lodash';
import type Docker from 'dockerode';
import { DockerManager } from './docker-manager';
import * as db from './db';

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
	services: SimpleService[];
}

export interface SimpleState {
	apps: Record<number, SimpleApp>; // Keyed by appId
}

export type SimpleStep =
	| { action: 'downloadImage'; appId: number; imageName: string }
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

	constructor(useRealDocker: boolean = false) {
		super();
		this.useRealDocker = useRealDocker;
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
				console.log('✅ Loaded target state from database');
				this.emit('target-state-changed', this.targetState);
			}
		} catch (error) {
			console.error('Failed to load target state from DB:', error);
		}
	}

	/**
	 * Save target state to database
	 */
	private async saveTargetStateToDB(): Promise<void> {
		try {
			await db.models('stateSnapshot').insert({
				type: 'target',
				state: JSON.stringify(this.targetState),
			});
			console.log('✅ Saved target state to database');
		} catch (error) {
			console.error('Failed to save target state to DB:', error);
		}
	}

	/**
	 * Save current state to database
	 */
	private async saveCurrentStateToDB(): Promise<void> {
		try {
			await db.models('stateSnapshot').insert({
				type: 'current',
				state: JSON.stringify(this.currentState),
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
		
		// Persist to database
		await this.saveTargetStateToDB();
		
		this.emit('target-state-changed', target);
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

				// Add service
				this.currentState.apps[appId].services.push({
					serviceId,
					serviceName,
					imageName: container.image,
					appId,
					appName,
					containerId: container.id,
					status: container.state,
					config: {
						image: container.image,
					},
				});
			}
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
	 */
	public async applyTargetState(): Promise<void> {
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

			// Save current state snapshot after successful reconciliation
			await this.saveCurrentStateToDB();

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

			// Case 1: App should be removed (exists in current, not in target)
			if (currentApp && !targetApp) {
				steps.push(...this.stepsToRemoveApp(currentApp));
				continue;
			}

			// Case 2: App should be added (exists in target, not in current)
			if (!currentApp && targetApp) {
				steps.push(...this.stepsToAddApp(targetApp));
				continue;
			}

			// Case 3: App exists in both - check for updates
			if (currentApp && targetApp) {
				steps.push(...this.stepsToUpdateApp(currentApp, targetApp));
			}
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
				const needsUpdate =
					currentSvc.imageName !== targetSvc.imageName ||
					!_.isEqual(currentSvc.config, targetSvc.config) ||
					currentSvc.status !== 'running'; // Check if container is not running

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
			// Real Docker start
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
			status: 'Running',
		};

		this.currentState.apps[appId].services.push(serviceWithContainer);
	}

	// ========================================================================
	// UTILITIES
	// ========================================================================

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
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

		console.log(`🔄 Starting auto-reconciliation every ${intervalMs}ms`);
		this.isReconciliationEnabled = true;

		this.reconciliationInterval = setInterval(async () => {
			if (this.useRealDocker && !this.isApplyingState) {
				console.log('🔄 Auto-reconciliation check...');
				try {
					await this.applyTargetState();
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
}

// ============================================================================
// EXPORT
// ============================================================================

export default ContainerManager;
