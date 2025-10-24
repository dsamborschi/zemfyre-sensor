/**
 * Device API Actions
 * Core actions for device management
 */

import type ContainerManager from '../compose/container-manager';
import type { DeviceManager } from '../provisioning';
import type { ApiBinder } from '../api-binder';

let containerManager: ContainerManager;
let deviceManager: DeviceManager;
let apiBinder: ApiBinder | undefined;

export function initialize(cm: ContainerManager, dm: DeviceManager, ab?: ApiBinder) {
	containerManager = cm;
	deviceManager = dm;
	apiBinder = ab;
}

/**
 * Run an array of healthchecks, outputting whether all passed or not
 * Used by: GET /v1/healthy
 */
export const runHealthchecks = async (
	healthchecks: Array<() => Promise<boolean>>,
): Promise<boolean> => {
	const HEALTHCHECK_FAILURE = 'Healthcheck failed';

	try {
		const checks = await Promise.all(healthchecks.map((fn) => fn()));
		if (checks.some((check) => !check)) {
			throw new Error(HEALTHCHECK_FAILURE);
		}
	} catch {
		console.error(HEALTHCHECK_FAILURE);
		return false;
	}

	return true;
};

/**
 * Restarts an application by recreating containers
 * Used by: POST /v1/apps/:appId/restart
 */
export const restartApp = async (appId: number, force: boolean = false) => {
	const currentState = await containerManager.getCurrentState();
	const app = currentState.apps[appId];
	
	if (!app) {
		throw new Error(`Application with ID ${appId} not found`);
	}

	// Get target state and update it
	const targetState = containerManager.getTargetState();
	if (!targetState.apps[appId]) {
		throw new Error(`Application ${appId} not in target state`);
	}

	// Trigger reconciliation
	await containerManager.applyTargetState();
};

/**
 * Stops a service
 * Used by: POST /v1/apps/:appId/stop
 */
export const stopService = async (appId: number, serviceName?: string, force: boolean = false) => {
	const currentState = await containerManager.getCurrentState();
	const app = currentState.apps[appId];
	
	if (!app) {
		throw new Error(`Application with ID ${appId} not found`);
	}

	// For single-container apps, stop the first service
	const service = serviceName 
		? app.services.find(s => s.serviceName === serviceName)
		: app.services[0];

	if (!service) {
		throw new Error(`Service not found`);
	}

	// Stop the container
	if (service.containerId) {
		const docker = containerManager.getDocker();
		if (docker) {
			const container = docker.getContainer(service.containerId);
			await container.stop();
		}
	}

	return service;
};

/**
 * Starts a service
 * Used by: POST /v1/apps/:appId/start
 */
export const startService = async (appId: number, serviceName?: string, force: boolean = false) => {
	const currentState = await containerManager.getCurrentState();
	const app = currentState.apps[appId];
	
	if (!app) {
		throw new Error(`Application with ID ${appId} not found`);
	}

	// For single-container apps, start the first service
	const service = serviceName 
		? app.services.find(s => s.serviceName === serviceName)
		: app.services[0];

	if (!service) {
		throw new Error(`Service not found`);
	}

	// Start the container
	if (service.containerId) {
		const docker = containerManager.getDocker();
		if (docker) {
			const container = docker.getContainer(service.containerId);
			await container.start();
		}
	}

	return service;
};

/**
 * Get application information for a single-container app
 * Used by: GET /v1/apps/:appId
 */
export const getApp = async (appId: number) => {
	const currentState = await containerManager.getCurrentState();
	const app = currentState.apps[appId];
	
	if (!app) {
		throw new Error('App not found');
	}

	const service = app.services[0];
	if (!service) {
		throw new Error('App has no services');
	}

	return {
		appId,
		appName: app.appName,
		containerId: service.containerId,
		serviceName: service.serviceName,
		imageName: service.imageName,
		status: service.status,
		config: service.config,
	};
};

/**
 * Get device state information
 * Used by: GET /v1/device
 */
export const getDeviceState = async () => {
	const deviceInfo = deviceManager.getDeviceInfo();
	const currentState = await containerManager.getCurrentState();
	
	return {
		...deviceInfo,
		apps: Object.keys(currentState.apps).length,
		status: 'Idle',
	};
};

/**
 * Purge volumes for an application
 * Used by: POST /v1/apps/:appId/purge
 */
export const purgeApp = async (appId: number, force: boolean = false) => {
	const currentState = await containerManager.getCurrentState();
	const app = currentState.apps[appId];
	
	if (!app) {
		throw new Error(`Application with ID ${appId} not found`);
	}

	console.log(`Purging data for app ${appId}`);

	// Remove app from target state
	const targetState = containerManager.getTargetState();
	delete targetState.apps[appId];
	await containerManager.setTarget(targetState);

	// Apply changes
	await containerManager.applyTargetState();

	// Restore app to target state
	targetState.apps[appId] = app;
	await containerManager.setTarget(targetState);
	
	console.log(`Purge complete for app ${appId}`);
};

/**
 * Get connection health status
 * Used by: GET /v2/connection/health
 */
export const getConnectionHealth = async () => {
	if (!apiBinder) {
		return {
			status: 'offline',
			message: 'API binder not initialized',
		};
	}
	
	return apiBinder.getConnectionHealth();
};
