/**
 * MQTT Manager for API
 * 
 * Handles incoming MQTT messages from devices:
 * - Sensor data (from sensor-publish feature)
 * - Device shadow updates (from shadow feature)
 * - Container logs (from cloud logging with MQTT backend)
 * - System metrics
 * 
 * Designed to be broker-agnostic (works with local or external MQTT)
 */

import mqtt from 'mqtt';
import { EventEmitter } from 'events';

export interface MqttConfig {
  brokerUrl: string;
  clientId?: string;
  username?: string;
  password?: string;
  reconnectPeriod?: number;
  keepalive?: number;
  clean?: boolean;
  qos?: 0 | 1 | 2;
}

export interface SensorData {
  deviceUuid: string;
  sensorName: string;
  timestamp: string;
  data: any;
  metadata?: Record<string, any>;
}

export interface ShadowUpdate {
  deviceUuid: string;
  reported?: any;
  desired?: any;
  timestamp: string;
  version: number;
}

export interface LogMessage {
  deviceUuid: string;
  containerId: string;
  containerName: string;
  message: string;
  timestamp: string;
  level?: string;
  stream?: 'stdout' | 'stderr';
}

export interface MetricsData {
  deviceUuid: string;
  timestamp: string;
  cpu_usage?: number;
  memory_usage?: number;
  memory_total?: number;
  storage_usage?: number;
  storage_total?: number;
  cpu_temp?: number;
  network?: any;
}

/**
 * MQTT Topic Structure (Convention)
 * 
 * Sensor Data:     device/{uuid}/sensor/{sensorName}/data
 * Shadow Reported: device/{uuid}/shadow/reported
 * Shadow Desired:  device/{uuid}/shadow/desired
 * Logs:            device/{uuid}/logs/{containerId}
 * Metrics:         device/{uuid}/metrics
 * Status:          device/{uuid}/status
 */

export class MqttManager extends EventEmitter {
  private client: mqtt.MqttClient | null = null;
  private config: Required<MqttConfig>;
  private subscriptions: Set<string> = new Set();
  private reconnecting: boolean = false;

  constructor(config: MqttConfig) {
    super();
    
    this.config = {
      brokerUrl: config.brokerUrl,
      clientId: config.clientId || `api-mqtt-${Date.now()}`,
      username: config.username || '',
      password: config.password || '',
      reconnectPeriod: config.reconnectPeriod || 5000,
      keepalive: config.keepalive || 60,
      clean: config.clean !== false,
      qos: config.qos || 1
    };
  }

  /**
   * Connect to MQTT broker
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('📡 Connecting to MQTT broker:', this.config.brokerUrl);

      const options: mqtt.IClientOptions = {
        clientId: this.config.clientId,
        username: this.config.username || undefined,
        password: this.config.password || undefined,
        reconnectPeriod: this.config.reconnectPeriod,
        keepalive: this.config.keepalive,
        clean: this.config.clean
      };

      this.client = mqtt.connect(this.config.brokerUrl, options);

      this.client.on('connect', () => {
        console.log('✅ Connected to MQTT broker');
        this.reconnecting = false;
        this.resubscribe();
        resolve();
      });

      this.client.on('error', (error) => {
        console.error('❌ MQTT connection error:', error);
        if (!this.reconnecting) {
          reject(error);
        }
      });

      this.client.on('reconnect', () => {
        console.log('🔄 Reconnecting to MQTT broker...');
        this.reconnecting = true;
      });

      this.client.on('offline', () => {
        console.warn('⚠️  MQTT client offline');
      });

      this.client.on('message', (topic, payload) => {
        this.handleMessage(topic, payload);
      });
    });
  }

  /**
   * Disconnect from MQTT broker
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    return new Promise((resolve) => {
      this.client!.end(false, {}, () => {
        console.log('✅ Disconnected from MQTT broker');
        this.client = null;
        resolve();
      });
    });
  }

  /**
   * Subscribe to device topics
   * 
   * @param deviceUuid - Device UUID or '*' for all devices
   * @param topics - Array of topic types: 'sensor', 'shadow', 'logs', 'metrics', 'status'
   */
  subscribe(deviceUuid: string, topics: string[]): void {
    if (!this.client) {
      throw new Error('MQTT client not connected');
    }

    const topicPatterns = topics.map(type => {
      switch (type) {
        case 'sensor':
          return `device/${deviceUuid}/sensor/+/data`;
        case 'shadow-reported':
          return `device/${deviceUuid}/shadow/reported`;
        case 'shadow-desired':
          return `device/${deviceUuid}/shadow/desired`;
        case 'logs':
          return `device/${deviceUuid}/logs/+`;
        case 'metrics':
          return `device/${deviceUuid}/metrics`;
        case 'status':
          return `device/${deviceUuid}/status`;
        default:
          return `device/${deviceUuid}/${type}`;
      }
    });

    topicPatterns.forEach(pattern => {
      this.client!.subscribe(pattern, { qos: this.config.qos }, (err) => {
        if (err) {
          console.error(`❌ Failed to subscribe to ${pattern}:`, err);
        } else {
          console.log(`✅ Subscribed to ${pattern}`);
          this.subscriptions.add(pattern);
        }
      });
    });
  }

  /**
   * Subscribe to all devices
   */
  subscribeToAll(topics: string[]): void {
    this.subscribe('*', topics);
  }

  /**
   * Unsubscribe from topics
   */
  unsubscribe(patterns: string[]): void {
    if (!this.client) {
      return;
    }

    patterns.forEach(pattern => {
      this.client!.unsubscribe(pattern, {}, (err) => {
        if (err) {
          console.error(`❌ Failed to unsubscribe from ${pattern}:`, err);
        } else {
          console.log(`✅ Unsubscribed from ${pattern}`);
          this.subscriptions.delete(pattern);
        }
      });
    });
  }

  /**
   * Publish message to device topic
   */
  publish(topic: string, message: any): void {
    if (!this.client) {
      throw new Error('MQTT client not connected');
    }

    const payload = typeof message === 'string' ? message : JSON.stringify(message);

    this.client.publish(topic, payload, { qos: this.config.qos }, (err) => {
      if (err) {
        console.error(`❌ Failed to publish to ${topic}:`, err);
      }
    });
  }

  /**
   * Re-subscribe to all topics after reconnection
   */
  private resubscribe(): void {
    if (!this.client || this.subscriptions.size === 0) {
      return;
    }

    console.log('🔄 Re-subscribing to topics...');
    const topics = Array.from(this.subscriptions);

    this.client.subscribe(topics, { qos: this.config.qos }, (err) => {
      if (err) {
        console.error('❌ Failed to re-subscribe:', err);
      } else {
        console.log(`✅ Re-subscribed to ${topics.length} topics`);
      }
    });
  }

  /**
   * Handle incoming MQTT messages
   */
  private handleMessage(topic: string, payload: Buffer): void {
    try {
      const message = payload.toString();
      
      // Parse topic to determine message type and device UUID
      const parts = topic.split('/');
      
      if (parts[0] !== 'device' || parts.length < 3) {
        console.warn('⚠️  Unknown topic format:', topic);
        return;
      }

      const deviceUuid = parts[1];
      const messageType = parts[2];

      // Parse JSON payload
      let data: any;
      try {
        data = JSON.parse(message);
      } catch {
        // Non-JSON payload (e.g., raw log messages)
        data = message;
      }

      // Route message based on type
      switch (messageType) {
        case 'sensor':
          this.handleSensorData(deviceUuid, parts[3], data);
          break;
        case 'shadow':
          this.handleShadowUpdate(deviceUuid, parts[3], data);
          break;
        case 'logs':
          this.handleLogMessage(deviceUuid, parts[3], data);
          break;
        case 'metrics':
          this.handleMetrics(deviceUuid, data);
          break;
        case 'status':
          this.handleStatus(deviceUuid, data);
          break;
        default:
          console.warn('⚠️  Unknown message type:', messageType);
          this.emit('unknown', { topic, deviceUuid, data });
      }

    } catch (error) {
      console.error('❌ Error handling MQTT message:', error);
    }
  }

  /**
   * Handle sensor data message
   */
  private handleSensorData(deviceUuid: string, sensorName: string, data: any): void {
    const sensorData: SensorData = {
      deviceUuid,
      sensorName,
      timestamp: data.timestamp || new Date().toISOString(),
      data: data.data || data,
      metadata: data.metadata
    };

    console.log(`📊 Sensor data from ${deviceUuid}/${sensorName}`);
    this.emit('sensor', sensorData);
  }

  /**
   * Handle shadow update message
   */
  private handleShadowUpdate(deviceUuid: string, updateType: string, data: any): void {
    const shadowUpdate: ShadowUpdate = {
      deviceUuid,
      timestamp: data.timestamp || new Date().toISOString(),
      version: data.version || 0,
      ...(updateType === 'reported' ? { reported: data } : { desired: data })
    };

    console.log(`🌓 Shadow update from ${deviceUuid}: ${updateType}`);
    this.emit('shadow', shadowUpdate);
    this.emit(`shadow:${updateType}`, shadowUpdate);
  }

  /**
   * Handle log message
   */
  private handleLogMessage(deviceUuid: string, containerId: string, data: any): void {
    const logMessage: LogMessage = {
      deviceUuid,
      containerId,
      containerName: data.containerName || containerId,
      message: data.message || data,
      timestamp: data.timestamp || new Date().toISOString(),
      level: data.level,
      stream: data.stream
    };

    console.log(`📝 Log from ${deviceUuid}/${containerId}`);
    this.emit('log', logMessage);
  }

  /**
   * Handle metrics message
   */
  private handleMetrics(deviceUuid: string, data: any): void {
    const metrics: MetricsData = {
      deviceUuid,
      timestamp: data.timestamp || new Date().toISOString(),
      cpu_usage: data.cpu_usage,
      memory_usage: data.memory_usage,
      memory_total: data.memory_total,
      storage_usage: data.storage_usage,
      storage_total: data.storage_total,
      cpu_temp: data.cpu_temp,
      network: data.network
    };

    console.log(`📈 Metrics from ${deviceUuid}`);
    this.emit('metrics', metrics);
  }

  /**
   * Handle status message
   */
  private handleStatus(deviceUuid: string, data: any): void {
    console.log(`📡 Status from ${deviceUuid}:`, data.status || data);
    this.emit('status', { deviceUuid, status: data });
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.client?.connected || false;
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }
}

export default MqttManager;
