/**
 * Device provisioning manager for standalone container-manager
 * Implements two-phase authentication inspired by Balena Supervisor
 * 
 * Flow:
 * 1. Generate UUID and deviceApiKey locally
 * 2. Use provisioningApiKey (fleet-level) to register device
 * 3. Exchange provisioningApiKey for deviceApiKey authentication
 * 4. Remove provisioningApiKey (one-time use)
 */

import * as db from '../db';
import * as crypto from 'crypto';
import type { 
	DeviceInfo, 
	ProvisioningConfig, 
	ProvisionRequest, 
	ProvisionResponse,
	KeyExchangeRequest,
	KeyExchangeResponse 
} from './types';

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

/**
 * Generate cryptographically secure API key
 * Similar to Balena's generateUniqueKey()
 */
function generateAPIKey(): string {
	return crypto.randomBytes(32).toString('hex');
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
			// Create new device with generated UUID and deviceApiKey
			this.deviceInfo = {
				uuid: generateUUID(),
				deviceApiKey: generateAPIKey(), // Pre-generate device key
				provisioned: false,
			};
			await this.saveDeviceInfo();
			console.log('📱 New device created:', {
				uuid: this.deviceInfo.uuid,
				deviceApiKey: `${this.deviceInfo.deviceApiKey?.substring(0, 8)}...`,
			});
		} else {
			console.log('📱 Device loaded:', {
				uuid: this.deviceInfo.uuid,
				deviceId: this.deviceInfo.deviceId,
				provisioned: this.deviceInfo.provisioned,
				hasDeviceApiKey: !!this.deviceInfo.deviceApiKey,
				hasProvisioningKey: !!this.deviceInfo.provisioningApiKey,
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
				deviceApiKey: rows[0].deviceApiKey,
				provisioningApiKey: rows[0].provisioningApiKey,
				apiKey: rows[0].apiKey, // Legacy field
				apiEndpoint: rows[0].apiEndpoint,
				registeredAt: rows[0].registeredAt,
				provisioned: rows[0].provisioned === 1,
				applicationId: rows[0].applicationId,
				macAddress: rows[0].macAddress,
				osVersion: rows[0].osVersion,
				supervisorVersion: rows[0].supervisorVersion,
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
			deviceApiKey: this.deviceInfo.deviceApiKey || null,
			provisioningApiKey: this.deviceInfo.provisioningApiKey || null,
			apiKey: this.deviceInfo.apiKey || null, // Legacy
			apiEndpoint: this.deviceInfo.apiEndpoint || null,
			registeredAt: this.deviceInfo.registeredAt || null,
			provisioned: this.deviceInfo.provisioned ? 1 : 0,
			applicationId: this.deviceInfo.applicationId || null,
			macAddress: this.deviceInfo.macAddress || null,
			osVersion: this.deviceInfo.osVersion || null,
			supervisorVersion: this.deviceInfo.supervisorVersion || null,
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
	 * Provision device using two-phase authentication
	 * Phase 1: Register device using provisioningApiKey
	 * Phase 2: Exchange keys and remove provisioning key
	 */
	async provision(config: ProvisioningConfig): Promise<DeviceInfo> {
		if (!this.deviceInfo) {
			throw new Error('Device manager not initialized');
		}

		if (!config.provisioningApiKey) {
			throw new Error('provisioningApiKey is required for device provisioning');
		}

		// Ensure deviceApiKey exists
		if (!this.deviceInfo.deviceApiKey) {
			this.deviceInfo.deviceApiKey = generateAPIKey();
		}

		// Update device metadata
		this.deviceInfo.deviceName = config.deviceName || this.deviceInfo.deviceName || `device-${this.deviceInfo.uuid.slice(0, 8)}`;
		this.deviceInfo.deviceType = config.deviceType || this.deviceInfo.deviceType || 'generic';
		this.deviceInfo.apiEndpoint = config.apiEndpoint || this.deviceInfo.apiEndpoint;
		this.deviceInfo.provisioningApiKey = config.provisioningApiKey;
		this.deviceInfo.applicationId = config.applicationId;
		this.deviceInfo.macAddress = config.macAddress;
		this.deviceInfo.osVersion = config.osVersion;
		this.deviceInfo.supervisorVersion = config.supervisorVersion;

		// If UUID is provided in config, use it (useful for pre-configured devices)
		if (config.uuid && config.uuid !== this.deviceInfo.uuid) {
			this.deviceInfo.uuid = config.uuid;
		}

		try {
			// Phase 1: Register device with cloud API
			console.log('🔐 Phase 1: Registering device with provisioning key...');
			const response = await this.registerWithAPI(
				this.deviceInfo.apiEndpoint || 'http://localhost:3002',
				{
					uuid: this.deviceInfo.uuid,
					deviceName: this.deviceInfo.deviceName,
					deviceType: this.deviceInfo.deviceType,
					deviceApiKey: this.deviceInfo.deviceApiKey,
					applicationId: this.deviceInfo.applicationId,
					macAddress: this.deviceInfo.macAddress,
					osVersion: this.deviceInfo.osVersion,
					supervisorVersion: this.deviceInfo.supervisorVersion,
				},
				this.deviceInfo.provisioningApiKey
			);

			// Save server-assigned device ID
			this.deviceInfo.deviceId = response.id.toString();

			// Phase 2: Exchange keys - verify device can authenticate with deviceApiKey
			console.log('🔐 Phase 2: Exchanging keys...');
			await this.exchangeKeys(
				this.deviceInfo.apiEndpoint || 'http://localhost:3002',
				this.deviceInfo.uuid,
				this.deviceInfo.deviceApiKey
			);

			// Phase 3: Remove provisioning key (one-time use complete)
			console.log('🔐 Phase 3: Removing provisioning key...');
			this.deviceInfo.provisioningApiKey = undefined;

			// Mark as provisioned
			this.deviceInfo.provisioned = true;
			this.deviceInfo.registeredAt = Date.now();

			// Save to database
			await this.saveDeviceInfo();

			console.log('✅ Device provisioned successfully:', {
				uuid: this.deviceInfo.uuid,
				deviceId: this.deviceInfo.deviceId,
				deviceName: this.deviceInfo.deviceName,
				applicationId: this.deviceInfo.applicationId,
			});

			return this.getDeviceInfo();
		} catch (error: any) {
			console.error('❌ Provisioning failed:', error.message);
			throw error;
		}
	}

	/**
	 * Register device with cloud API using provisioning key
	 * POST /api/v1/device/register
	 */
	async registerWithAPI(
		apiEndpoint: string, 
		provisionRequest: ProvisionRequest,
		provisioningApiKey: string
	): Promise<ProvisionResponse> {
		if (!this.deviceInfo) {
			throw new Error('Device manager not initialized');
		}

		const apiVersion = process.env.API_VERSION || 'v1';
		const url = `${apiEndpoint}/api/${apiVersion}/device/register`;
		
		console.log('📡 Registering device with API:', url);
		console.log('   UUID:', provisionRequest.uuid);
		console.log('   Device Name:', provisionRequest.deviceName);
		console.log('   Device Type:', provisionRequest.deviceType);
		console.log('   Application ID:', provisionRequest.applicationId);

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${provisioningApiKey}`,
				},
				body: JSON.stringify(provisionRequest),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`API returned ${response.status}: ${errorText}`);
			}

			const result = await response.json() as ProvisionResponse;
			console.log('✅ Device registered with ID:', result.id);

			return result;
		} catch (error: any) {
			console.error('❌ Registration failed:', error.message);
			throw new Error(`Failed to register device: ${error.message}`);
		}
	}

	/**
	 * Exchange keys - verify device can authenticate with deviceApiKey
	 * POST /api/${API_VERSION}/device/:uuid/key-exchange
	 */
	async exchangeKeys(apiEndpoint: string, uuid: string, deviceApiKey: string): Promise<void> {
		const apiVersion = process.env.API_VERSION || 'v1';
		const url = `${apiEndpoint}/api/${apiVersion}/device/${uuid}/key-exchange`;
		
		console.log('🔑 Exchanging keys for device:', uuid);

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${deviceApiKey}`,
				},
				body: JSON.stringify({
					uuid,
					deviceApiKey,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Key exchange failed ${response.status}: ${errorText}`);
			}

			const result = await response.json();
			console.log('✅ Key exchange successful');
		} catch (error: any) {
			console.error('❌ Key exchange failed:', error.message);
			throw new Error(`Failed to exchange keys: ${error.message}`);
		}
	}

	/**
	 * Check if device already exists and try key exchange
	 * GET /api/${API_VERSION}/device/:uuid
	 */
	async fetchDevice(apiEndpoint: string, uuid: string, apiKey: string): Promise<any> {
		const apiVersion = process.env.API_VERSION || 'v1';
		const url = `${apiEndpoint}/api/${apiVersion}/devices/${uuid}`;
		
		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
				},
			});

			if (!response.ok) {
				if (response.status === 404) {
					return null; // Device not found
				}
				const errorText = await response.text();
				throw new Error(`API returned ${response.status}: ${errorText}`);
			}

			return await response.json();
		} catch (error: any) {
			console.error('Failed to fetch device:', error.message);
			return null;
		}
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
	 * Keeps UUID and deviceApiKey, clears server registration
	 */
	async reset(): Promise<void> {
		if (!this.deviceInfo) {
			throw new Error('Device manager not initialized');
		}

		this.deviceInfo.deviceId = undefined;
		this.deviceInfo.deviceName = undefined;
		this.deviceInfo.provisioningApiKey = undefined;
		this.deviceInfo.apiKey = undefined;
		this.deviceInfo.apiEndpoint = undefined;
		this.deviceInfo.registeredAt = undefined;
		this.deviceInfo.provisioned = false;
		this.deviceInfo.applicationId = undefined;

		await this.saveDeviceInfo();

		console.log('🔄 Device reset (unprovisioned)');
		console.log('   UUID and deviceApiKey preserved for re-registration');
	}
}

export default DeviceManager;
