/**
 * Device Application Entry Point
 * 
 * This is the main entry point for the device-side code.
 * Runs on the device (Raspberry Pi, etc.) and manages:
 * - Container lifecycle
 * - Device provisioning
 * - System monitoring
 * - Device API (for cloud communication)
 */

import process from 'process';
import DeviceAgent from './agent';

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => {
	console.log('Received SIGTERM. Exiting gracefully...');
	process.exit(143); // 128 + 15 (SIGTERM signal code)
});

process.on('SIGINT', () => {
	console.log('Received SIGINT. Exiting gracefully...');
	process.exit(130); // 128 + 2 (SIGINT signal code)
});

// Catch unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	process.exit(1);
});

// Start the device agent
const supervisor = new DeviceAgent();

supervisor.init().catch((error) => {
	console.error('Failed to initialize device agent:', error);
	process.exit(1);
});
