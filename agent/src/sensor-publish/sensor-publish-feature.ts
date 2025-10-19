import { EventEmitter } from 'events';
import {
  SensorPublishConfig,
  SensorConfig,
  MqttConnection,
  Logger
} from './types';
import { Sensor } from './sensor';

/**
 * SensorPublishFeature - Manages multiple sensors and publishes data to MQTT
 * Ported from AWS IoT Device Client SensorPublishFeature.cpp
 */
export class SensorPublishFeature extends EventEmitter {
  private static readonly NAME = 'SensorPublish';
  private static readonly TAG = 'SensorPublishFeature';
  private static readonly MAX_SENSORS = 10;

  private config: SensorPublishConfig;
  private mqttConnection: MqttConnection;
  private logger: Logger;
  private deviceUuid: string;
  
  private sensors: Sensor[] = [];
  private started = false;

  constructor(
    config: SensorPublishConfig,
    mqttConnection: MqttConnection,
    logger: Logger,
    deviceUuid: string
  ) {
    super();
    this.config = config;
    this.mqttConnection = mqttConnection;
    this.logger = logger;
    this.deviceUuid = deviceUuid;
    
    this.validateConfig();
  }

  /**
   * Get feature name
   */
  public getName(): string {
    return SensorPublishFeature.NAME;
  }

  /**
   * Start the sensor publish feature
   */
  public async start(): Promise<void> {
    if (this.config.sensors.length === 0) {
      this.logger.warn(`${SensorPublishFeature.TAG}: No sensors configured`);
      return;
    }

    this.logger.info(`${SensorPublishFeature.TAG}: Starting Sensor Publish feature with ${this.config.sensors.length} sensors`);
    
    try {
      // Create and start all sensors
      for (let i = 0; i < this.config.sensors.length; i++) {
        const sensorConfig = this.config.sensors[i];
        
        // Set default name if not provided
        if (!sensorConfig.name) {
          sensorConfig.name = `sensor-${i + 1}`;
        }
        
        // Create sensor
        const sensor = new Sensor(
          sensorConfig,
          this.mqttConnection,
          this.logger,
          this.deviceUuid
        );
        
        // Set up event handlers
        sensor.on('connected', () => {
          this.logger.info(`${SensorPublishFeature.TAG}: Sensor '${sensorConfig.name}' connected`);
          this.emit('sensor-connected', sensorConfig.name);
        });
        
        sensor.on('disconnected', () => {
          this.logger.info(`${SensorPublishFeature.TAG}: Sensor '${sensorConfig.name}' disconnected`);
          this.emit('sensor-disconnected', sensorConfig.name);
        });
        
        sensor.on('error', (error: Error) => {
          this.logger.error(`${SensorPublishFeature.TAG}: Sensor '${sensorConfig.name}' error: ${error.message}`);
          this.emit('sensor-error', sensorConfig.name, error);
        });
        
        this.sensors.push(sensor);
        
        // Start sensor
        await sensor.start();
      }
      
      this.started = true;
      this.logger.info(`${SensorPublishFeature.TAG}: Sensor Publish feature started successfully`);
      this.emit('started');
      
    } catch (error) {
      const errorMessage = `Failed to start Sensor Publish feature: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(`${SensorPublishFeature.TAG}: ${errorMessage}`);
      this.emit('error', new Error(errorMessage));
      throw error;
    }
  }

  /**
   * Stop the sensor publish feature
   */
  public async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.logger.info(`${SensorPublishFeature.TAG}: Stopping Sensor Publish feature`);
    
    try {
      // Stop all sensors
      await Promise.all(this.sensors.map(sensor => sensor.stop()));
      
      this.sensors = [];
      this.started = false;
      
      this.logger.info(`${SensorPublishFeature.TAG}: Sensor Publish feature stopped successfully`);
      this.emit('stopped');
      
    } catch (error) {
      const errorMessage = `Error stopping Sensor Publish feature: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(`${SensorPublishFeature.TAG}: ${errorMessage}`);
      this.emit('error', new Error(errorMessage));
    }
  }

  /**
   * Get statistics for all sensors
   */
  public getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const sensor of this.sensors) {
      const config = this.config.sensors[this.sensors.indexOf(sensor)];
      stats[config.name!] = {
        state: sensor.getState(),
        ...sensor.getStats()
      };
    }
    
    return stats;
  }

  /**
   * Get sensor by name
   */
  public getSensor(name: string): Sensor | undefined {
    const index = this.config.sensors.findIndex(s => s.name === name);
    return index >= 0 ? this.sensors[index] : undefined;
  }

  /**
   * Get all sensors with their configuration
   */
  public getSensors(): Array<{ name: string; enabled: boolean; addr: string; publishInterval: number }> {
    return this.config.sensors.map((sensorConfig, index) => {
      const sensor = this.sensors[index];
      return {
        name: sensorConfig.name || `sensor-${index + 1}`,
        enabled: sensorConfig.enabled !== false,
        addr: sensorConfig.addr,
        publishInterval: sensorConfig.publishInterval || 30000
      };
    });
  }

  /**
   * Enable a sensor by name
   */
  public async enableSensor(sensorName: string): Promise<void> {
    const index = this.config.sensors.findIndex(s => s.name === sensorName);
    if (index < 0) {
      throw new Error(`Sensor not found: ${sensorName}`);
    }

    const sensorConfig = this.config.sensors[index];
    const sensor = this.sensors[index];

    if (sensorConfig.enabled === false) {
      sensorConfig.enabled = true;
      
      if (sensor && this.started) {
        await sensor.start();
      }
      
      this.logger.info(`${SensorPublishFeature.TAG}: Sensor '${sensorName}' enabled`);
      this.emit('sensor-enabled', sensorName);
    }
  }

  /**
   * Disable a sensor by name
   */
  public async disableSensor(sensorName: string): Promise<void> {
    const index = this.config.sensors.findIndex(s => s.name === sensorName);
    if (index < 0) {
      throw new Error(`Sensor not found: ${sensorName}`);
    }

    const sensorConfig = this.config.sensors[index];
    const sensor = this.sensors[index];

    if (sensorConfig.enabled !== false) {
      sensorConfig.enabled = false;
      
      if (sensor && this.started) {
        await sensor.stop();
      }
      
      this.logger.info(`${SensorPublishFeature.TAG}: Sensor '${sensorName}' disabled`);
      this.emit('sensor-disabled', sensorName);
    }
  }

  /**
   * Update publish interval for a sensor
   */
  public async updateInterval(sensorName: string, intervalMs: number): Promise<void> {
    const index = this.config.sensors.findIndex(s => s.name === sensorName);
    if (index < 0) {
      throw new Error(`Sensor not found: ${sensorName}`);
    }

    const sensorConfig = this.config.sensors[index];
    const sensor = this.sensors[index];

    if (intervalMs < 1000) {
      throw new Error(`Invalid interval for ${sensorName}: minimum 1000ms`);
    }

    sensorConfig.publishInterval = intervalMs;
    
    // Update the sensor's interval if it's running
    if (sensor && this.started && sensorConfig.enabled !== false) {
      sensor.updateInterval(intervalMs);
    }
    
    this.logger.info(`${SensorPublishFeature.TAG}: Updated interval for '${sensorName}': ${intervalMs}ms`);
    this.emit('sensor-interval-updated', sensorName, intervalMs);
  }

  /**
   * Check if MQTT is connected
   */
  public isMqttConnected(): boolean {
    return this.mqttConnection.isConnected();
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    // Check max sensors limit
    if (this.config.sensors.length > SensorPublishFeature.MAX_SENSORS) {
      throw new Error(`Maximum ${SensorPublishFeature.MAX_SENSORS} sensors supported, got ${this.config.sensors.length}`);
    }

    // Validate each sensor configuration
    for (const sensorConfig of this.config.sensors) {
      this.validateSensorConfig(sensorConfig);
    }
  }

  /**
   * Validate individual sensor configuration
   */
  private validateSensorConfig(config: SensorConfig): void {
    // Check required fields
    if (!config.addr) {
      throw new Error(`Sensor '${config.name}': 'addr' is required`);
    }

    if (!config.eomDelimiter) {
      throw new Error(`Sensor '${config.name}': 'eomDelimiter' is required`);
    }

    if (!config.mqttTopic) {
      throw new Error(`Sensor '${config.name}': 'mqttTopic' is required`);
    }

    // Validate buffer capacity
    if (config.bufferCapacity && config.bufferCapacity < 1024) {
      throw new Error(`Sensor '${config.name}': 'bufferCapacity' must be at least 1024 bytes`);
    }

    // Validate regex
    try {
      new RegExp(config.eomDelimiter);
    } catch (error) {
      throw new Error(`Sensor '${config.name}': Invalid 'eomDelimiter' regex: ${config.eomDelimiter}`);
    }

    this.logger.debug(`${SensorPublishFeature.TAG}: Validated configuration for sensor '${config.name}'`);
  }
}
