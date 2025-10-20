/**
 * MQTT Connection Adapter
 * 
 * Implements the MqttConnection interface used by Jobs and Shadow features,
 * delegating to the centralized MqttManager singleton.
 */

import { MqttManager } from './mqtt-manager';

/**
 * Jobs-style MqttConnection interface
 */
export interface JobsMqttConnection {
  publish(topic: string, payload: string): Promise<void>;
  subscribe(topic: string, callback: (topic: string, payload: Buffer) => void): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  isConnected(): boolean;
}

/**
 * Shadow-style MqttConnection interface
 */
export interface ShadowMqttConnection {
  publish(topic: string, payload: string | Buffer, qos?: 0 | 1 | 2): Promise<void>;
  subscribe(topic: string, qos?: 0 | 1 | 2, handler?: (topic: string, payload: Buffer) => void): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  isConnected(): boolean;
}

/**
 * Adapter for Jobs feature (simpler interface)
 */
export class JobsMqttConnectionAdapter implements JobsMqttConnection {
  private mqttManager: MqttManager;

  constructor() {
    this.mqttManager = MqttManager.getInstance();
  }

  async publish(topic: string, payload: string): Promise<void> {
    await this.mqttManager.publish(topic, payload, { qos: 1 });
  }

  async subscribe(topic: string, callback: (topic: string, payload: Buffer) => void): Promise<void> {
    await this.mqttManager.subscribe(topic, { qos: 1 }, callback);
  }

  async unsubscribe(topic: string): Promise<void> {
    await this.mqttManager.unsubscribe(topic);
  }

  isConnected(): boolean {
    return this.mqttManager.isConnected();
  }
}

/**
 * Adapter for Shadow feature (includes QoS parameter)
 */
export class ShadowMqttConnectionAdapter implements ShadowMqttConnection {
  private mqttManager: MqttManager;

  constructor() {
    this.mqttManager = MqttManager.getInstance();
  }

  async publish(topic: string, payload: string | Buffer, qos: 0 | 1 | 2 = 1): Promise<void> {
    await this.mqttManager.publish(topic, payload, { qos });
  }

  async subscribe(
    topic: string,
    qos: 0 | 1 | 2 = 1,
    handler?: (topic: string, payload: Buffer) => void
  ): Promise<void> {
    await this.mqttManager.subscribe(topic, { qos }, handler);
  }

  async unsubscribe(topic: string): Promise<void> {
    await this.mqttManager.unsubscribe(topic);
  }

  isConnected(): boolean {
    return this.mqttManager.isConnected();
  }
}
