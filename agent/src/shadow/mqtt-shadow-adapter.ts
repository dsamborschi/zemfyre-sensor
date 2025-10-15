/**
 * MQTT Connection Adapter for Shadow Feature
 * 
 * This adapter wraps your existing Mosquitto MQTT client to match
 * the MqttConnection interface expected by ShadowFeature.
 */

import mqtt from 'mqtt';
import { MqttConnection } from './types';

export class MqttShadowAdapter implements MqttConnection {
  private client: mqtt.MqttClient;
  private messageHandlers: Map<string, (topic: string, payload: Buffer) => void> = new Map();

  constructor(brokerUrl: string, options?: mqtt.IClientOptions) {
    this.client = mqtt.connect(brokerUrl, {
      ...options,
      clean: true,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      console.log('✅ MQTT connected for Shadow feature');
    });

    this.client.on('error', (error) => {
      console.error('❌ MQTT error:', error);
    });

    this.client.on('message', (topic, payload) => {
      // Route messages to registered handlers
      for (const [subscribedTopic, handler] of this.messageHandlers.entries()) {
        if (this.topicMatches(subscribedTopic, topic)) {
          handler(topic, payload);
        }
      }
    });
  }

  /**
   * Publish message to MQTT topic
   */
  async publish(topic: string, payload: string | Buffer, qos: 0 | 1 | 2 = 1): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, payload, { qos }, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Subscribe to MQTT topic with handler
   */
  async subscribe(
    topic: string,
    qos: 0 | 1 | 2 = 1,
    handler?: (topic: string, payload: Buffer) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.subscribe(topic, { qos }, (error) => {
        if (error) {
          reject(error);
        } else {
          if (handler) {
            this.messageHandlers.set(topic, handler);
          }
          resolve();
        }
      });
    });
  }

  /**
   * Unsubscribe from MQTT topic
   */
  async unsubscribe(topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.unsubscribe(topic, (error) => {
        if (error) {
          reject(error);
        } else {
          this.messageHandlers.delete(topic);
          resolve();
        }
      });
    });
  }

  /**
   * Check if MQTT client is connected
   */
  isConnected(): boolean {
    return this.client.connected;
  }

  /**
   * Close MQTT connection
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.client.end(false, {}, () => {
        resolve();
      });
    });
  }

  /**
   * Check if topic matches subscription pattern
   * Supports wildcards: + (single level) and # (multi level)
   */
  private topicMatches(pattern: string, topic: string): boolean {
    // Convert MQTT wildcard pattern to regex
    const regexPattern = pattern
      .replace(/\+/g, '[^/]+')  // + matches single level
      .replace(/#/g, '.*');      // # matches everything
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(topic);
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
