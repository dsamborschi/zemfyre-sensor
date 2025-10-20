/**
 * MQTT Connection Adapter for Shadow Feature
 * 
 * Refactored to use the centralized MqttManager singleton.
 * This eliminates duplicate MQTT connections across the application.
 */

import { MqttManager } from '../mqtt/mqtt-manager';
import { MqttConnection } from './types';

export class MqttShadowAdapter implements MqttConnection {
  private mqttManager: MqttManager;

  constructor(brokerUrl: string, options?: any) {
    this.mqttManager = MqttManager.getInstance();
    
    // Connect to MQTT broker (idempotent)
    this.mqttManager.connect(brokerUrl, {
      ...options,
      clean: true,
      reconnectPeriod: 5000,
    }).then(() => {
      console.log('✅ MQTT connected for Shadow feature (using centralized manager)');
    }).catch((error) => {
      console.error('❌ MQTT connection error:', error);
    });
  }

  /**
   * Publish message to MQTT topic
   */
  async publish(topic: string, payload: string | Buffer, qos: 0 | 1 | 2 = 1): Promise<void> {
    await this.mqttManager.publish(topic, payload, { qos });
  }

  /**
   * Subscribe to MQTT topic with handler
   */
  async subscribe(
    topic: string,
    qos: 0 | 1 | 2 = 1,
    handler?: (topic: string, payload: Buffer) => void
  ): Promise<void> {
    await this.mqttManager.subscribe(topic, { qos }, handler);
  }

  /**
   * Unsubscribe from MQTT topic
   */
  async unsubscribe(topic: string): Promise<void> {
    await this.mqttManager.unsubscribe(topic);
  }

  /**
   * Check if MQTT client is connected
   */
  isConnected(): boolean {
    return this.mqttManager.isConnected();
  }

  /**
   * Close MQTT connection (Note: This will disconnect the shared manager)
   */
  async close(): Promise<void> {
    console.warn('⚠️  Closing shared MQTT connection - this affects all features');
    await this.mqttManager.disconnect();
  }
}

/**
 * Example usage in Supervisor:
 * 
 * ```typescript
 * import { MqttShadowAdapter } from './mqtt-shadow-adapter';
 * import { ShadowFeature } from './shadow';
 * 
 * export default class DeviceSupervisor {
 *   private mqttAdapter?: MqttShadowAdapter;
 *   private shadowFeature?: ShadowFeature;
 * 
 *   private async initializeShadowFeature(): Promise<void> {
 *     // Create MQTT adapter
 *     const brokerUrl = process.env.MQTT_BROKER || 'mqtt://mosquitto:1883';
 *     this.mqttAdapter = new MqttShadowAdapter(brokerUrl, {
 *       clientId: `shadow-${await this.deviceManager.getDeviceUuid()}`,
 *       username: process.env.MQTT_USERNAME,
 *       password: process.env.MQTT_PASSWORD,
 *     });
 * 
 *     // Wait for connection
 *     await new Promise(resolve => setTimeout(resolve, 1000));
 * 
 *     // Create shadow feature
 *     const config: ShadowConfig = {
 *       enabled: true,
 *       shadowName: process.env.SHADOW_NAME || 'device-state',
 *       inputFile: process.env.SHADOW_INPUT_FILE,
 *       outputFile: process.env.SHADOW_OUTPUT_FILE,
 *       syncOnDelta: true,
 *     };
 * 
 *     this.shadowFeature = new ShadowFeature(
 *       config,
 *       this.mqttAdapter,
 *       console,
 *       await this.deviceManager.getDeviceUuid()
 *     );
 * 
 *     await this.shadowFeature.start();
 *     console.log('✅ Shadow feature initialized');
 *   }
 * }
 * ```
 */
