/**
 * ORCHESTRATOR DRIVER INTERFACE
 * ===============================
 * 
 * Abstract interface that all orchestrator drivers must implement.
 * This allows seamless switching between Docker, K3s, and future orchestrators.
 * 
 * Design principles:
 * - Driver-agnostic operations
 * - Promise-based async operations
 * - Event-driven updates
 * - Graceful error handling
 */

import { EventEmitter } from 'events';
import type { Stream } from 'stream';
import type {
	TargetState,
	CurrentState,
	AppConfig,
	ServiceConfig,
	ServiceStatus,
	LogStreamOptions,
	ContainerMetrics,
	ReconciliationResult,
	NetworkConfig,
	VolumeConfig
} from './types';
import type { AgentLogger } from '../logging/agent-logger';

/**
 * Base orchestrator driver interface
 * 
 * All orchestrator implementations (Docker, K3s, etc.) must implement this interface.
 * 
 * Events emitted:
 * - 'service-started': { serviceName: string, containerId: string }
 * - 'service-stopped': { serviceName: string, containerId: string, exitCode?: number }
 * - 'service-error': { serviceName: string, error: Error }
 * - 'health-changed': { serviceName: string, health: 'healthy' | 'unhealthy' }
 * - 'reconciliation-complete': ReconciliationResult
 */
export interface IOrchestratorDriver extends EventEmitter {
	/**
	 * Driver name (e.g., 'docker', 'k3s')
	 */
	readonly name: string;

	/**
	 * Driver version
	 */
	readonly version: string;

	// ============================================================================
	// LIFECYCLE METHODS
	// ============================================================================

	/**
	 * Initialize the orchestrator driver
	 * - Connect to orchestrator API
	 * - Verify connectivity
	 * - Set up event listeners
	 * 
	 * @throws Error if initialization fails
	 */
	init(): Promise<void>;

	/**
	 * Shutdown the orchestrator driver
	 * - Clean up resources
	 * - Close connections
	 * - Stop event listeners
	 */
	shutdown(): Promise<void>;

	/**
	 * Check if driver is ready to accept operations
	 */
	isReady(): boolean;

	/**
	 * Get driver health status
	 */
	getHealth(): Promise<{
		healthy: boolean;
		message?: string;
		lastCheck: Date;
	}>;

	// ============================================================================
	// STATE MANAGEMENT
	// ============================================================================

	/**
	 * Get current state of all running services
	 * 
	 * @returns Current state snapshot
	 */
	getCurrentState(): Promise<CurrentState>;

	/**
	 * Set target state (desired state)
	 * This does NOT apply the state - use reconcile() to apply changes
	 * 
	 * @param targetState - Desired state configuration
	 */
	setTargetState(targetState: TargetState): Promise<void>;

	/**
	 * Get current target state
	 */
	getTargetState(): TargetState | null;

	/**
	 * Reconcile current state with target state
	 * - Compare current vs target
	 * - Create/update/remove services as needed
	 * - Handle errors gracefully
	 * 
	 * @returns Reconciliation result with statistics
	 */
	reconcile(): Promise<ReconciliationResult>;

	// ============================================================================
	// SERVICE OPERATIONS
	// ============================================================================

	/**
	 * Create and start a service
	 * 
	 * @param service - Service configuration
	 * @returns Container/pod ID
	 */
	createService(service: ServiceConfig): Promise<string>;

	/**
	 * Stop a running service
	 * 
	 * @param serviceId - Service identifier (name or ID)
	 * @param timeout - Graceful shutdown timeout in seconds
	 */
	stopService(serviceId: string, timeout?: number): Promise<void>;

	/**
	 * Remove a service
	 * 
	 * @param serviceId - Service identifier
	 * @param force - Force removal even if running
	 */
	removeService(serviceId: string, force?: boolean): Promise<void>;

	/**
	 * Restart a service
	 * 
	 * @param serviceId - Service identifier
	 * @param timeout - Graceful shutdown timeout in seconds
	 */
	restartService(serviceId: string, timeout?: number): Promise<void>;

	/**
	 * Get service status
	 * 
	 * @param serviceId - Service identifier
	 */
	getServiceStatus(serviceId: string): Promise<ServiceStatus>;

	/**
	 * List all services managed by this driver
	 */
	listServices(): Promise<ServiceConfig[]>;

	// ============================================================================
	// LOGGING
	// ============================================================================

	/**
	 * Get service logs
	 * 
	 * @param serviceId - Service identifier
	 * @param options - Log streaming options
	 * @returns Stream of log data
	 */
	getServiceLogs(serviceId: string, options?: LogStreamOptions): Promise<Stream>;

	// ============================================================================
	// HEALTH CHECKS
	// ============================================================================

	/**
	 * Execute health check for a service
	 * 
	 * @param serviceId - Service identifier
	 * @returns Health status
	 */
	executeHealthCheck(serviceId: string): Promise<{
		healthy: boolean;
		message?: string;
	}>;

	/**
	 * Start continuous health monitoring for a service
	 * 
	 * @param serviceId - Service identifier
	 */
	startHealthMonitoring(serviceId: string): Promise<void>;

	/**
	 * Stop health monitoring for a service
	 * 
	 * @param serviceId - Service identifier
	 */
	stopHealthMonitoring(serviceId: string): Promise<void>;

	// ============================================================================
	// METRICS
	// ============================================================================

	/**
	 * Get resource usage metrics for a service
	 * 
	 * @param serviceId - Service identifier
	 */
	getServiceMetrics(serviceId: string): Promise<ContainerMetrics>;

	/**
	 * Get metrics for all services
	 */
	getAllMetrics(): Promise<ContainerMetrics[]>;

	// ============================================================================
	// NETWORK OPERATIONS
	// ============================================================================

	/**
	 * Create a network
	 * 
	 * @param network - Network configuration
	 */
	createNetwork(network: NetworkConfig): Promise<void>;

	/**
	 * Remove a network
	 * 
	 * @param networkName - Network name
	 */
	removeNetwork(networkName: string): Promise<void>;

	/**
	 * List all networks
	 */
	listNetworks(): Promise<NetworkConfig[]>;

	// ============================================================================
	// VOLUME OPERATIONS
	// ============================================================================

	/**
	 * Create a volume
	 * 
	 * @param volume - Volume configuration
	 */
	createVolume(volume: VolumeConfig): Promise<void>;

	/**
	 * Remove a volume
	 * 
	 * @param volumeName - Volume name
	 */
	removeVolume(volumeName: string): Promise<void>;

	/**
	 * List all volumes
	 */
	listVolumes(): Promise<VolumeConfig[]>;
}

/**
 * Base abstract class that provides common functionality
 * Drivers can extend this to avoid reimplementing common logic
 */
export abstract class BaseOrchestratorDriver extends EventEmitter implements IOrchestratorDriver {
	protected logger?: AgentLogger;
	protected targetState: TargetState | null = null;
	protected ready: boolean = false;

	abstract readonly name: string;
	abstract readonly version: string;

	constructor(logger?: AgentLogger) {
		super();
		this.logger = logger;
	}

	abstract init(): Promise<void>;
	abstract shutdown(): Promise<void>;
	abstract getCurrentState(): Promise<CurrentState>;
	abstract reconcile(): Promise<ReconciliationResult>;
	abstract createService(service: ServiceConfig): Promise<string>;
	abstract stopService(serviceId: string, timeout?: number): Promise<void>;
	abstract removeService(serviceId: string, force?: boolean): Promise<void>;
	abstract restartService(serviceId: string, timeout?: number): Promise<void>;
	abstract getServiceStatus(serviceId: string): Promise<ServiceStatus>;
	abstract listServices(): Promise<ServiceConfig[]>;
	abstract getServiceLogs(serviceId: string, options?: LogStreamOptions): Promise<Stream>;
	abstract executeHealthCheck(serviceId: string): Promise<{ healthy: boolean; message?: string }>;
	abstract startHealthMonitoring(serviceId: string): Promise<void>;
	abstract stopHealthMonitoring(serviceId: string): Promise<void>;
	abstract getServiceMetrics(serviceId: string): Promise<ContainerMetrics>;
	abstract getAllMetrics(): Promise<ContainerMetrics[]>;
	abstract createNetwork(network: NetworkConfig): Promise<void>;
	abstract removeNetwork(networkName: string): Promise<void>;
	abstract listNetworks(): Promise<NetworkConfig[]>;
	abstract createVolume(volume: VolumeConfig): Promise<void>;
	abstract removeVolume(volumeName: string): Promise<void>;
	abstract listVolumes(): Promise<VolumeConfig[]>;

	// Default implementations

	isReady(): boolean {
		return this.ready;
	}

	async getHealth(): Promise<{ healthy: boolean; message?: string; lastCheck: Date }> {
		return {
			healthy: this.ready,
			message: this.ready ? 'Driver is operational' : 'Driver not initialized',
			lastCheck: new Date()
		};
	}

	async setTargetState(targetState: TargetState): Promise<void> {
		this.targetState = targetState;
		this.logger?.debugSync('Target state updated', {
			component: 'OrchestratorDriver',
			driver: this.name,
			appsCount: Object.keys(targetState.local?.apps || {}).length
		});
	}

	getTargetState(): TargetState | null {
		return this.targetState;
	}

	protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: any) {
		const logMeta = {
			component: 'OrchestratorDriver',
			driver: this.name,
			...meta
		};

		switch (level) {
			case 'debug':
				this.logger?.debugSync(message, logMeta);
				break;
			case 'info':
				this.logger?.infoSync(message, logMeta);
				break;
			case 'warn':
				this.logger?.warnSync(message, logMeta);
				break;
			case 'error':
				this.logger?.errorSync(message, logMeta);
				break;
		}
	}
}
