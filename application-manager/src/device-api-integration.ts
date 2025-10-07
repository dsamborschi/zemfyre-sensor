/**
 * Device API Integration Example
 * Shows how to integrate device API with standalone-application-manager
 */

import { DeviceAPI } from './device-api';
import { router as v1Router } from './device-api/v1';
import { router as v2Router } from './device-api/v2';
import * as actions from './device-api/actions';
import ContainerManager from './compose/container-manager';
import { DeviceManager } from './provisioning';

/**
 * Initialize and start the device API
 */
export async function startDeviceAPI(
	containerManager: ContainerManager,
	deviceManager: DeviceManager,
	port: number = 48484
) {
	// Initialize actions with managers
	actions.initialize(containerManager, deviceManager);

	// Create healthcheck function
	const healthchecks = [
		async () => {
			// Check if container manager is working
			try {
				const status = containerManager.getStatus();
				return true;
			} catch {
				return false;
			}
		},
	];

	// Create device API with routers
	const deviceAPI = new DeviceAPI({
		routers: [v1Router, v2Router],
		healthchecks,
	});

	// Start listening
	await deviceAPI.listen(port);

	return deviceAPI;
}

export { DeviceAPI } from './device-api';
export { router as v1Router } from './device-api/v1';
export { router as v2Router } from './device-api/v2';
