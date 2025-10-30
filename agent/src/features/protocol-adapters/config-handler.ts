/**
 * Protocol Adapter Configuration Handler
 * 
 * Manages protocol adapter device configuration updates.
 * Syncs devices from cloud PostgreSQL to local SQLite.
 * 
 * Responsibilities:
 * - Listen for config.protocolAdapterDevices changes
 * - Sync devices to SQLite (create/update/delete)
 * - Normalize property names (camelCase → snake_case)
 * - Restart protocol adapters when config changes
 */

import { BaseConfigHandler, type ConfigHandlerOptions } from '../../config/handlers/base-handler.js';
import type { ConfigChangeEvent } from '../../config/config-manager.js';

export interface ProtocolAdapterDevice {
	name: string;
	protocol: 'modbus' | 'can' | 'opcua';
	enabled: boolean;
	pollInterval?: number; // camelCase from API
	poll_interval?: number; // snake_case for SQLite
	connection: Record<string, any>;
	dataPoints?: any[]; // Protocol-neutral: Modbus registers, OPC-UA nodes, CAN messages
	data_points?: any[]; // snake_case for SQLite
	registers?: any[]; // Deprecated: kept for backward compatibility
	metadata?: Record<string, any>;
}

export interface ProtocolAdaptersManager {
	stop(): Promise<void>;
	start(): Promise<void>;
}

export interface ProtocolAdaptersHandlerOptions extends ConfigHandlerOptions {
	protocolAdaptersManager?: ProtocolAdaptersManager;
}

export class ProtocolAdaptersHandler extends BaseConfigHandler {
	private protocolAdaptersManager?: ProtocolAdaptersManager;

	constructor(options: ProtocolAdaptersHandlerOptions) {
		super('protocolAdapterDevices', options);
		this.protocolAdaptersManager = options.protocolAdaptersManager;
	}

	async handleConfigChange(event: ConfigChangeEvent): Promise<void> {
		const devices = event.value;

		if (!devices || !Array.isArray(devices)) {
			this.logger?.debug('No protocol adapter devices in config', {
				category: 'ProtocolAdaptersHandler'
			});
			return;
		}

		this.logger?.info('📥 Protocol adapter device configuration detected', {
			category: 'ProtocolAdaptersHandler',
			deviceCount: devices.length,
			devices: devices.map((d: ProtocolAdapterDevice) => `${d.name} (${d.protocol})`).join(', ')
		});

		try {
			const { ProtocolAdapterDeviceModel } = await import('../../models/protocol-adapter-device.model.js');

			// Get current devices from SQLite to detect deletions
			const currentDevices = await ProtocolAdapterDeviceModel.getAll();
			const targetDeviceNames = new Set(devices.map((d: ProtocolAdapterDevice) => d.name));

			// Sync each device to SQLite
			for (const device of devices) {
				// Normalize property names from cloud API (camelCase) to SQLite (snake_case)
				const normalizedDevice = this.normalizeDevice(device);

				const existing = await ProtocolAdapterDeviceModel.getByName(normalizedDevice.name);

				if (existing) {
					await ProtocolAdapterDeviceModel.update(normalizedDevice.name, normalizedDevice);
					this.logger?.info('Updated protocol adapter device', {
						category: 'ProtocolAdaptersHandler',
						deviceName: normalizedDevice.name,
						protocol: normalizedDevice.protocol
					});
				} else {
					await ProtocolAdapterDeviceModel.create(normalizedDevice);
					this.logger?.info('Added protocol adapter device', {
						category: 'ProtocolAdaptersHandler',
						deviceName: normalizedDevice.name,
						protocol: normalizedDevice.protocol
					});
				}
			}

			// Delete devices that are no longer in target state
			for (const currentDevice of currentDevices) {
				if (!targetDeviceNames.has(currentDevice.name)) {
					await ProtocolAdapterDeviceModel.delete(currentDevice.name);
					this.logger?.info('Removed protocol adapter device', {
						category: 'ProtocolAdaptersHandler',
						deviceName: currentDevice.name,
						protocol: currentDevice.protocol
					});
				}
			}

			// Restart protocol adapters to apply changes
			if (this.protocolAdaptersManager) {
				this.logger?.info('Restarting protocol adapters to apply configuration changes', {
					category: 'ProtocolAdaptersHandler'
				});
				await this.protocolAdaptersManager.stop();
				await this.protocolAdaptersManager.start();
			}

		} catch (error) {
			this.logger?.errorSync('Failed to sync protocol adapter devices', error instanceof Error ? error : new Error(String(error)), {
				category: 'ProtocolAdaptersHandler'
			});
		}
	}

	/**
	 * Normalize device property names
	 * Handles both camelCase (API) and snake_case (SQLite) conventions
	 */
	private normalizeDevice(device: ProtocolAdapterDevice): any {
		return {
			name: device.name,
			protocol: device.protocol,
			enabled: device.enabled !== undefined ? device.enabled : true,
			poll_interval: device.pollInterval || device.poll_interval || 5000,
			connection: device.connection,
			data_points: device.dataPoints || device.data_points || device.registers, // Protocol-neutral with backward compatibility
			metadata: device.metadata
		};
	}
}
