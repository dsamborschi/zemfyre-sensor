/**
 * ORCHESTRATOR DRIVER FACTORY
 * ============================
 * 
 * Factory for creating orchestrator driver instances based on configuration.
 * Handles driver selection and initialization.
 */

import type { IOrchestratorDriver } from './driver-interface';
import type { TargetState } from './types';
import type { AgentLogger } from '../logging/agent-logger';

/**
 * Driver factory configuration
 */
export interface DriverFactoryConfig {
	orchestrator?: 'docker' | 'k3s';
	logger?: AgentLogger;
	targetState?: TargetState;
}

/**
 * Create an orchestrator driver instance
 * 
 * @param config - Factory configuration
 * @returns Initialized driver instance
 * @throws Error if driver type is unsupported or initialization fails
 */
export async function createOrchestratorDriver(
	config: DriverFactoryConfig
): Promise<IOrchestratorDriver> {
	const { orchestrator = 'docker', logger, targetState } = config;

	logger?.infoSync('Creating orchestrator driver', {
		component: 'DriverFactory',
		orchestrator
	});

	let driver: IOrchestratorDriver;

	switch (orchestrator) {
		case 'docker':
			// Lazy load to avoid import overhead
			const { DockerDriver } = await import('./docker-driver.js');
			driver = new DockerDriver(logger);
			break;

		case 'k3s':
			// Lazy load K3s driver
			const { K3sDriver } = await import('./k3s-driver.js');
			driver = new K3sDriver(logger);
			break;

		default:
			throw new Error(`Unsupported orchestrator type: ${orchestrator}`);
	}

	// Initialize the driver
	try {
		await driver.init();
		logger?.infoSync('Driver initialized successfully', {
			component: 'DriverFactory',
			driver: driver.name,
			version: driver.version
		});
	} catch (error) {
		const errorObj = error instanceof Error ? error : new Error(String(error));
		logger?.errorSync('Driver initialization failed', errorObj, {
			component: 'DriverFactory',
			driver: orchestrator
		});
		throw new Error(`Failed to initialize ${orchestrator} driver: ${errorObj.message}`);
	}

	// Set target state if provided
	if (targetState) {
		await driver.setTargetState(targetState);
	}

	return driver;
}

/**
 * Get list of available orchestrator drivers
 */
export function getAvailableDrivers(): Array<{
	name: string;
	description: string;
	available: boolean;
}> {
	return [
		{
			name: 'docker',
			description: 'Docker container runtime',
			available: true
		},
		{
			name: 'k3s',
			description: 'Lightweight Kubernetes (K3s)',
			available: true // Will be false if @kubernetes/client-node not installed
		}
	];
}

/**
 * Detect best available orchestrator
 * Tries to auto-detect which orchestrator is available on the system
 * 
 * @returns Recommended orchestrator type
 */
export async function detectOrchestrator(logger?: AgentLogger): Promise<'docker' | 'k3s'> {
	logger?.debugSync('Detecting available orchestrator', {
		component: 'DriverFactory'
	});

	// Try Docker first (most common)
	try {
		const { DockerDriver } = await import('./docker-driver.js');
		const testDriver = new DockerDriver(logger);
		await testDriver.init();
		await testDriver.shutdown();
		logger?.infoSync('Docker detected and available', {
			component: 'DriverFactory'
		});
		return 'docker';
	} catch (error) {
		logger?.debugSync('Docker not available', {
			component: 'DriverFactory',
			error: error instanceof Error ? error.message : String(error)
		});
	}

	// Try K3s
	try {
		const { K3sDriver } = await import('./k3s-driver.js');
		const testDriver = new K3sDriver(logger);
		await testDriver.init();
		await testDriver.shutdown();
		logger?.infoSync('K3s detected and available', {
			component: 'DriverFactory'
		});
		return 'k3s';
	} catch (error) {
		logger?.debugSync('K3s not available', {
			component: 'DriverFactory',
			error: error instanceof Error ? error.message : String(error)
		});
	}

	// Default to Docker if nothing detected
	logger?.warnSync('No orchestrator detected, defaulting to Docker', {
		component: 'DriverFactory'
	});
	return 'docker';
}
