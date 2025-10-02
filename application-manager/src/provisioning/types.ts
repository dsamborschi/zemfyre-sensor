/**
 * Types for device provisioning in standalone container-manager
 */

export interface DeviceInfo {
	uuid: string;
	deviceId?: string;
	deviceName?: string;
	deviceType?: string;
	apiKey?: string;
	apiEndpoint?: string;
	registeredAt?: number;
	provisioned: boolean;
}

export interface ProvisioningConfig {
	uuid?: string;
	deviceName?: string;
	deviceType?: string;
	apiEndpoint?: string;
	apiKey?: string;
}

export interface ProvisionRequest {
	uuid: string;
	deviceName: string;
	deviceType: string;
	macAddress?: string;
	osVersion?: string;
	supervisorVersion?: string;
}

export interface ProvisionResponse {
	deviceId: string;
	uuid: string;
	deviceName: string;
	apiKey: string;
	registeredAt: number;
}
