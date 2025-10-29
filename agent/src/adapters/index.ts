/**
 * Protocol Adapters Feature
 * 
 * Manages industrial protocol adapters (Modbus, CAN, OPC-UA, etc.)
 * Each adapter reads sensor data and publishes to Unix sockets for consumption
 * by the sensor-publish system.
 */

import { ModbusAdapter } from './modbus/modbus-adapter.js';
import { ModbusAdapterConfig } from './modbus/types.js';
import { ConfigLoader } from './modbus/config-loader.js';
import { Logger } from './common/types.js';

export interface ProtocolAdaptersConfig {
  modbus?: {
    enabled: boolean;
    configPath?: string;
    config?: ModbusAdapterConfig;
  };
  can?: {
    enabled: boolean;
    configPath?: string;
  };
  opcua?: {
    enabled: boolean;
    configPath?: string;
  };
}

export class ProtocolAdaptersFeature {
  private modbusAdapter?: ModbusAdapter;
  private config: ProtocolAdaptersConfig;
  private logger: Logger;
  private running = false;

  constructor(config: ProtocolAdaptersConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Start all enabled protocol adapters
   */
  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn('Protocol adapters already running');
      return;
    }

    this.logger.info('Starting protocol adapters feature...');

    // Start Modbus adapter if enabled
    if (this.config.modbus?.enabled) {
      await this.startModbusAdapter();
    }

    // TODO: Start CAN adapter when implemented
    if (this.config.can?.enabled) {
      this.logger.warn('CAN adapter not yet implemented');
    }

    // TODO: Start OPC-UA adapter when implemented
    if (this.config.opcua?.enabled) {
      this.logger.warn('OPC-UA adapter not yet implemented');
    }

    this.running = true;
    this.logger.info('Protocol adapters feature started');
  }

  /**
   * Stop all running protocol adapters
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.logger.info('Stopping protocol adapters feature...');

    // Stop Modbus adapter
    if (this.modbusAdapter) {
      await this.modbusAdapter.stop();
      this.modbusAdapter = undefined;
    }

    // TODO: Stop other adapters

    this.running = false;
    this.logger.info('Protocol adapters feature stopped');
  }

  /**
   * Start Modbus adapter
   */
  private async startModbusAdapter(): Promise<void> {
    try {
      let modbusConfig: ModbusAdapterConfig;

      // Load config from file or use provided config
      if (this.config.modbus!.configPath) {
        this.logger.info(`Loading Modbus config from: ${this.config.modbus!.configPath}`);
        modbusConfig = ConfigLoader.loadFromFile(this.config.modbus!.configPath);
      } else if (this.config.modbus!.config) {
        modbusConfig = this.config.modbus!.config;
      } else {
        throw new Error('Modbus adapter enabled but no config provided');
      }

      // Create and start adapter
      this.modbusAdapter = new ModbusAdapter(modbusConfig, this.logger);

      // Setup event listeners
      this.modbusAdapter.on('started', () => {
        this.logger.info('Modbus adapter started');
      });

      this.modbusAdapter.on('device-connected', (deviceName: string) => {
        this.logger.info(`Modbus device connected: ${deviceName}`);
      });

      this.modbusAdapter.on('device-disconnected', (deviceName: string) => {
        this.logger.warn(`Modbus device disconnected: ${deviceName}`);
      });

      this.modbusAdapter.on('device-error', (deviceName: string, error: Error) => {
        this.logger.error(`Modbus device error [${deviceName}]: ${error.message}`);
      });

      await this.modbusAdapter.start();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start Modbus adapter: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get Modbus adapter instance (for testing/debugging)
   */
  getModbusAdapter(): ModbusAdapter | undefined {
    return this.modbusAdapter;
  }

  /**
   * Check if feature is running
   */
  isRunning(): boolean {
    return this.running;
  }
}
