/**
 * Base Feature Class
 * 
 * Provides common functionality for all agent features:
 * - MQTT connection management
 * - Logger setup
 * - Lifecycle management (start/stop)
 * - Configuration validation
 * - Event emitter capabilities
 */

import { EventEmitter } from 'events';
import { MqttManager } from '../mqtt/mqtt-manager.js';
import { AgentLogger } from '../logging/agent-logger.js';

export interface FeatureConfig {
  enabled: boolean;
  [key: string]: any;
}

export interface FeatureLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: any): void;
  debug(message: string, ...args: any[]): void;
}

export interface MqttConnection {
  publish(topic: string, payload: string | Buffer, options?: { qos?: 0 | 1 | 2 }): Promise<void>;
  subscribe(topic: string, options?: { qos?: 0 | 1 | 2 }, handler?: (topic: string, payload: Buffer) => void): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  isConnected(): boolean;
}

export abstract class BaseFeature extends EventEmitter {
  protected config: FeatureConfig;
  protected logger: FeatureLogger;
  protected mqttConnection?: MqttConnection;
  protected deviceUuid: string;
  protected featureName: string;
  protected isRunning: boolean = false;
  private debugEnvVar: string;

  constructor(
    config: FeatureConfig,
    agentLogger: AgentLogger,
    featureName: string,
    deviceUuid: string,
    requiresMqtt: boolean = true,
    debugEnvVar?: string
  ) {
    super(); // Initialize EventEmitter
    this.config = config;
    this.deviceUuid = deviceUuid;
    this.featureName = featureName;
    this.debugEnvVar = debugEnvVar || 'DEBUG';

    // Create feature-specific logger wrapper
    this.logger = this.createLogger(agentLogger, featureName);

    // Setup MQTT connection if required
    if (requiresMqtt) {
      this.mqttConnection = this.setupMqttConnection();
    }
  }

  /**
   * Create a feature-specific logger that wraps the agent logger
   */
  private createLogger(agentLogger: AgentLogger, featureName: string): FeatureLogger {
    return {
      info: (message: string) => agentLogger.infoSync(message, { component: featureName }),
      warn: (message: string) => agentLogger.warnSync(message, { component: featureName }),
      error: (message: string, error?: any) => {
        agentLogger.errorSync(
          message,
          error instanceof Error ? error : new Error(String(error)),
          { component: featureName }
        );
      },
      debug: (message: string, ...args: any[]) => {
        if (this.isDebugEnabled()) {
          agentLogger.debugSync(message, { component: featureName, args });
        }
      }
    };
  }

  /**
   * Setup MQTT connection using centralized MqttManager
   */
  private setupMqttConnection(): MqttConnection {
    const mqttManager = MqttManager.getInstance();

    if (!mqttManager.isConnected()) {
      this.logger.warn('MQTT Manager not connected - feature will have limited functionality');
    }

    // Return MqttManager directly (it implements MqttConnection interface)
    return mqttManager;
  }

  /**
   * Check if debug mode is enabled for this feature
   */
  protected isDebugEnabled(): boolean {
    return process.env[this.debugEnvVar] === 'true';
  }

  /**
   * Wait for MQTT connection with timeout
   */
  protected async waitForMqttConnection(timeoutMs: number = 5000): Promise<boolean> {
    if (!this.mqttConnection) {
      return false;
    }

    if (this.mqttConnection.isConnected()) {
      return true;
    }

    this.logger.warn(`MQTT not connected, waiting up to ${timeoutMs}ms...`);

    const checkInterval = 100;
    let waited = 0;

    while (!this.mqttConnection.isConnected() && waited < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (this.mqttConnection.isConnected()) {
      this.logger.info('MQTT connection established');
      return true;
    } else {
      this.logger.error('MQTT connection timeout');
      return false;
    }
  }

  /**
   * Validate configuration
   * Override in subclass to implement feature-specific validation
   */
  protected validateConfig(): void {
    if (!this.config.enabled) {
      throw new Error('Feature is disabled');
    }
  }

  /**
   * Initialize the feature
   * Override in subclass to implement feature-specific initialization
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Start the feature
   * Override in subclass to implement feature-specific start logic
   */
  protected abstract onStart(): Promise<void>;

  /**
   * Stop the feature
   * Override in subclass to implement feature-specific stop logic
   */
  protected abstract onStop(): Promise<void>;

  /**
   * Public start method with common lifecycle management
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Feature already running');
      return;
    }

    try {
      this.logger.info('Starting feature...');
      this.validateConfig();
      await this.onInitialize();
      await this.onStart();
      this.isRunning = true;
      this.logger.info('Feature started successfully');
    } catch (error) {
      this.logger.error('Failed to start feature', error);
      throw error;
    }
  }

  /**
   * Public stop method with common lifecycle management
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.logger.info('Stopping feature...');
      await this.onStop();
      this.isRunning = false;
      this.logger.info('Feature stopped successfully');
    } catch (error) {
      this.logger.error('Failed to stop feature', error);
      throw error;
    }
  }

  /**
   * Check if feature is running
   */
  public running(): boolean {
    return this.isRunning;
  }
}
