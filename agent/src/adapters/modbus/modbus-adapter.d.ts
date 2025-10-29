import { EventEmitter } from 'events';
import { ModbusAdapterConfig, DeviceStatus, Logger } from './types';
/**
 * Main Modbus Adapter class that coordinates Modbus devices and Unix socket output
 */
export declare class ModbusAdapter extends EventEmitter {
    private config;
    private logger;
    private clients;
    private socketServer;
    private pollTimers;
    private deviceStatuses;
    private running;
    constructor(config: ModbusAdapterConfig, logger: Logger);
    /**
     * Start the Modbus adapter
     */
    start(): Promise<void>;
    /**
     * Stop the Modbus adapter
     */
    stop(): Promise<void>;
    /**
     * Get status of all devices
     */
    getDeviceStatuses(): DeviceStatus[];
    /**
     * Get status of a specific device
     */
    getDeviceStatus(deviceName: string): DeviceStatus | undefined;
    /**
     * Enable a device
     */
    enableDevice(deviceName: string): Promise<void>;
    /**
     * Disable a device
     */
    disableDevice(deviceName: string): Promise<void>;
    /**
     * Check if adapter is running
     */
    isRunning(): boolean;
    /**
     * Get number of connected socket clients
     */
    getSocketClientCount(): number;
    /**
     * Initialize device statuses
     */
    private initializeDeviceStatuses;
    /**
     * Initialize and start polling for a device
     */
    private initializeDevice;
    /**
     * Cleanup device resources
     */
    private cleanupDevice;
    /**
     * Start polling for a device
     */
    private startPolling;
    /**
     * Schedule device retry
     */
    private scheduleDeviceRetry;
}
//# sourceMappingURL=modbus-adapter.d.ts.map