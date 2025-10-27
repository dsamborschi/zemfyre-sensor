import { ModbusDevice, SensorDataPoint, Logger } from './types';
/**
 * Modbus Client wrapper that handles different connection types and data reading
 */
export declare class ModbusClient {
    private client;
    private device;
    private logger;
    private connected;
    private reconnectTimer?;
    constructor(device: ModbusDevice, logger: Logger);
    /**
     * Connect to the Modbus device
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the Modbus device
     */
    disconnect(): Promise<void>;
    /**
     * Read all configured registers and return sensor data points
     */
    readAllRegisters(): Promise<SensorDataPoint[]>;
    /**
     * Read a single register
     */
    private readRegister;
    /**
     * Parse coil/discrete input data
     */
    private parseCoilData;
    /**
     * Parse register data based on data type
     */
    private parseRegisterData;
    /**
     * Check if client is connected
     */
    isConnected(): boolean;
    /**
     * Setup error handlers
     */
    private setupErrorHandlers;
    /**
     * Schedule automatic reconnection
     */
    private scheduleReconnect;
}
//# sourceMappingURL=modbus-client.d.ts.map