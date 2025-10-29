import { ModbusAdapterConfig } from './types';
/**
 * Configuration loader for Modbus Adapter
 */
export declare class ConfigLoader {
    /**
     * Load configuration from file
     */
    static loadFromFile(configPath: string): ModbusAdapterConfig;
    /**
     * Load configuration from environment variables
     */
    static loadFromEnv(): ModbusAdapterConfig;
    /**
     * Create example configuration
     */
    static createExampleConfig(): ModbusAdapterConfig;
    /**
     * Save configuration to file
     */
    static saveToFile(config: ModbusAdapterConfig, configPath: string): void;
    /**
     * Validate configuration
     */
    static validate(config: any): ModbusAdapterConfig;
}
//# sourceMappingURL=config-loader.d.ts.map