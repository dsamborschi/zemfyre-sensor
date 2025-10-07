/**
 * Device provisioning manager for standalone container-manager
 * Simplified version inspired by balena-supervisor's provisioning
 */

import * as db from '../db';
import type { DeviceInfo, ProvisioningConfig, ProvisionRequest, ProvisionResponse } from './types';

// Dynamic import for uuid (ESM module)
let uuidv4: () => string;
(async () => {
	const { v4 } = await import('uuid');
	uuidv4 = v4;
})();

// Fallback UUID generation if uuid module not loaded yet
function generateUUID(): string {
	if (uuidv4) {
		return uuidv4();
	}
	// Simple fallback UUID v4 generator
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

export class DeviceManager {
	private deviceInfo: DeviceInfo | null = null;

	constructor() {}

	/**
	 * Initialize device manager and load device info from database
	 */
	async initialize(): Promise<void> {
		await this.loadDeviceInfo();

		if (!this.deviceInfo) {
			// Create new device with generated UUID
			this.deviceInfo = {
				uuid: generateUUID(),
				provisioned: false,
			};
			await this.saveDeviceInfo();
			console.log('📱 New device created with UUID:', this.deviceInfo.uuid);
		} else {
			console.log('📱 Device loaded:', {
				uuid: this.deviceInfo.uuid,
				deviceId: this.deviceInfo.deviceId,
				provisioned: this.deviceInfo.provisioned,
			});
		}
	}

	/**
	 * Load device info from database
	 */
	private async loadDeviceInfo(): Promise<void> {
		const rows = await db.models('device').select('*').limit(1);
		if (rows.length > 0) {
			this.deviceInfo = {
				uuid: rows[0].uuid,
				deviceId: rows[0].deviceId,
				deviceName: rows[0].deviceName,
				deviceType: rows[0].deviceType,
				apiKey: rows[0].apiKey,
				apiEndpoint: rows[0].apiEndpoint,
				registeredAt: rows[0].registeredAt,
				provisioned: rows[0].provisioned === 1,
			};
		}
	}

	/**
	 * Save device info to database
	 */
	private async saveDeviceInfo(): Promise<void> {
		if (!this.deviceInfo) {
			throw new Error('No device info to save');
		}

		const existing = await db.models('device').select('*').limit(1);
		
		const data = {
			uuid: this.deviceInfo.uuid,
			deviceId: this.deviceInfo.deviceId || null,
			deviceName: this.deviceInfo.deviceName || null,
			deviceType: this.deviceInfo.deviceType || null,
			apiKey: this.deviceInfo.apiKey || null,
			apiEndpoint: this.deviceInfo.apiEndpoint || null,
			registeredAt: this.deviceInfo.registeredAt || null,
			provisioned: this.deviceInfo.provisioned ? 1 : 0,
			updatedAt: new Date().toISOString(),
		};

		if (existing.length > 0) {
			await db.models('device').update(data);
		} else {
			await db.models('device').insert({
				...data,
				createdAt: new Date().toISOString(),
			});
		}
	}

	/**
	 * Get current device info
	 */
	getDeviceInfo(): DeviceInfo {
		if (!this.deviceInfo) {
			throw new Error('Device manager not initialized');
		}
		return { ...this.deviceInfo };
	}

	/**
	 * Check if device is provisioned
	 */
	isProvisioned(): boolean {
		return this.deviceInfo?.provisioned === true;
	}

	/**
	 * Provision device (register with API or set local config)
	 * This is a simplified version - in production you'd call a real API
	 */
	async provision(config: ProvisioningConfig): Promise<DeviceInfo> {
		if (!this.deviceInfo) {
			throw new Error('Device manager not initialized');
		}

		// Update device info with provided config
		this.deviceInfo.deviceName = config.deviceName || this.deviceInfo.deviceName || `device-${this.deviceInfo.uuid.slice(0, 8)}`;
		this.deviceInfo.deviceType = config.deviceType || this.deviceInfo.deviceType || 'generic';
		this.deviceInfo.apiEndpoint = config.apiEndpoint || this.deviceInfo.apiEndpoint;
		this.deviceInfo.apiKey = config.apiKey || this.deviceInfo.apiKey;

		// If UUID is provided in config, use it (useful for pre-configured devices)
		if (config.uuid && config.uuid !== this.deviceInfo.uuid) {
			this.deviceInfo.uuid = config.uuid;
		}

		// Generate device ID if not provided (would normally come from API)
		if (!this.deviceInfo.deviceId) {
			this.deviceInfo.deviceId = `dev_${Date.now()}`;
		}

		// Mark as provisioned
		this.deviceInfo.provisioned = true;
		this.deviceInfo.registeredAt = Date.now();

		// Save to database
		await this.saveDeviceInfo();

		console.log('✅ Device provisioned:', {
			uuid: this.deviceInfo.uuid,
			deviceId: this.deviceInfo.deviceId,
			deviceName: this.deviceInfo.deviceName,
		});

		return this.getDeviceInfo();
	}

	/**
	 * Register device with a remote API
	 * This simulates what balena-supervisor does with balena API
	 */
	async registerWithAPI(apiEndpoint: string, provisionRequest: ProvisionRequest): Promise<ProvisionResponse> {
		if (!this.deviceInfo) {
			throw new Error('Device manager not initialized');
		}

		// In a real implementation, this would POST to apiEndpoint + '/device/register'
		// For now, we simulate the response
		
		console.log('📡 Registering device with API:', apiEndpoint);
		console.log('Request:', provisionRequest);

		// Simulate API call delay
		await new Promise(resolve => setTimeout(resolve, 100));

		// Simulate API response
		const response: ProvisionResponse = {
			deviceId: `dev_${Date.now()}`,
			uuid: provisionRequest.uuid,
			deviceName: provisionRequest.deviceName,
			apiKey: this.generateAPIKey(),
			registeredAt: Date.now(),
		};

		// Update local device info with API response
		this.deviceInfo.deviceId = response.deviceId;
		this.deviceInfo.deviceName = response.deviceName;
		this.deviceInfo.apiKey = response.apiKey;
		this.deviceInfo.apiEndpoint = apiEndpoint;
		this.deviceInfo.registeredAt = response.registeredAt;
		this.deviceInfo.provisioned = true;

		await this.saveDeviceInfo();

		console.log('✅ Device registered:', response);

		return response;
	}

	/**
	 * Generate a random API key
	 */
	private generateAPIKey(): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let key = '';
		for (let i = 0; i < 32; i++) {
			key += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return key;
	}

	/**
	 * Update device name
	 */
	async updateDeviceName(name: string): Promise<void> {
		if (!this.deviceInfo) {
			throw new Error('Device manager not initialized');
		}

		this.deviceInfo.deviceName = name;
		await this.saveDeviceInfo();
	}

	/**
	 * Update API endpoint
	 */
	async updateAPIEndpoint(endpoint: string): Promise<void> {
		if (!this.deviceInfo) {
			throw new Error('Device manager not initialized');
		}

		this.deviceInfo.apiEndpoint = endpoint;
		await this.saveDeviceInfo();
	}

	/**
	 * Reset device (unprovision)
	 * Useful for testing or re-provisioning
	 */
	async reset(): Promise<void> {
		if (!this.deviceInfo) {
			throw new Error('Device manager not initialized');
		}

		this.deviceInfo.deviceId = undefined;
		this.deviceInfo.deviceName = undefined;
		this.deviceInfo.apiKey = undefined;
		this.deviceInfo.apiEndpoint = undefined;
		this.deviceInfo.registeredAt = undefined;
		this.deviceInfo.provisioned = false;

		await this.saveDeviceInfo();

		console.log('🔄 Device reset (unprovisioned)');
	}
}

export default DeviceManager;
