/**
 * Constants (simplified - no supervisor network for now)
 */

export const supervisorNetworkInterface = 'supervisor0';
export const supervisorNetworkGateway = '10.114.104.1';
export const supervisorNetworkSubnet = '10.114.104.0/24';

// Default labels for managed volumes
export const defaultVolumeLabels = {
	'iotistic.managed': 'true',
};
