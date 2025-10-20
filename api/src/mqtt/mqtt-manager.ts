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
 * IoT Device Format (used by device agent):
 *   Note: No leading $ - topics starting with $ are reserved for MQTT broker system topics
 * 
 *   Sensor Data:        iot/device/{uuid}/sensor/{sensorTopic}
 *   Shadow - Update:    iot/device/{uuid}/shadow/name/{shadowName}/update
 *   Shadow - Accepted:  iot/device/{uuid}/shadow/name/{shadowName}/update/accepted
 *   Shadow - Delta:     iot/device/{uuid}/shadow/name/{shadowName}/update/delta
 *   Shadow - Documents: iot/device/{uuid}/shadow/name/{shadowName}/update/documents
 *   Shadow - Rejected:  iot/device/{uuid}/shadow/name/{shadowName}/update/rejected
 * 
 * Legacy Format (for logs, metrics, status):
 *   Logs:            device/{uuid}/logs/{containerId}
 *   Metrics:         device/{uuid}/metrics
 *   Status:          device/{uuid}/status
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
  
        console.log('✅ Connected to MQTT broker, 📋 Client ID:', this.config.clientId);
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
        console.log('📨 Raw MQTT message event fired:', topic);
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

    // Convert '*' to MQTT wildcard '+'
    // MQTT wildcards: + (single level), # (multi-level)
    const mqttDevicePattern = deviceUuid === '*' ? '+' : deviceUuid;

    const topicPatterns = topics.map(type => {
      switch (type) {
        case 'sensor':
          // Subscribe to IoT sensor data format (matches device agent)
          // No leading $ - topics starting with $ are reserved for broker system topics
          return `iot/device/${mqttDevicePattern}/sensor/+`;
        case 'shadow-reported':
          // Subscribe to IoT Shadow /update topic (device publishes state updates here)
          // Device publishes to: iot/device/{uuid}/shadow/name/{shadowName}/update
          return `iot/device/${mqttDevicePattern}/shadow/name/+/update`;
        case 'shadow-desired':
          // Subscribe to IoT Shadow update/delta (cloud sets desired state)
          return `iot/device/${mqttDevicePattern}/shadow/name/+/update/delta`;
        case 'logs':
          return `device/${mqttDevicePattern}/logs/+`;
        case 'metrics':
          return `device/${mqttDevicePattern}/metrics`;
        case 'status':
          return `device/${mqttDevicePattern}/status`;
        default:
          return `device/${mqttDevicePattern}/${type}`;
      }
    });

    
    // Use Promise.all to track all subscriptions
    const subscriptionPromises = topicPatterns.map(pattern => {
      return new Promise<void>((resolve, reject) => {
    
        this.client!.subscribe(pattern, { qos: this.config.qos }, (err) => {
          if (err) {
            console.error(`❌ Failed to subscribe to ${pattern}:`, err);
            reject(err);
          } else {
            console.log(`✅ Subscribed to ${pattern} (QoS: ${this.config.qos})`);
            this.subscriptions.add(pattern);
            resolve();
          }
        });
      });
    });

    // Wait for all subscriptions and log summary
    Promise.all(subscriptionPromises)
      .then(() => {
        console.log(`✅ Successfully subscribed to ${topicPatterns.length} topics`);
      })
      .catch(err => {
        console.error('❌ Some subscriptions failed:', err);
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
      
      // Debug: Log ALL incoming messages
      console.log('🔔 MQTT Message received:', {
        topic,
        payloadSize: payload.length,
        preview: message.substring(0, 200)
      });
      
      // Check if this is an IoT device topic (sensors/shadows)
      if (topic.startsWith('iot/device/')) {
        console.log('✅ Detected IoT device topic');
        
        // Check if it's a shadow topic or sensor topic
        if (topic.includes('/shadow/')) {
          this.handleIotShadowMessage(topic, message);
        } else if (topic.includes('/sensor/')) {
          this.handleIotSensorMessage(topic, message);
        }
        return;
      }
      
      // Parse standard topic format: device/{uuid}/{type}/...
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
   * Handle IoT Shadow message
   * Topic formats:
   *   - Device publishes: iot/device/{uuid}/shadow/name/{shadowName}/update
   *   - Cloud responses: iot/device/{uuid}/shadow/name/{shadowName}/update/{accepted|delta|rejected|documents}
   */
  private handleIotShadowMessage(topic: string, message: string): void {
    try {
      // Parse IoT Shadow topic
      const parts = topic.split('/');
      
      if (parts.length < 6 || parts[0] !== 'iot' || parts[1] !== 'device') {
        console.warn('⚠️  Invalid IoT Shadow topic:', topic);
        return;
      }

      const deviceUuid = parts[2];
      const shadowName = parts[4];
      const updateType = parts[6] || 'update'; // 'update' (device publish), 'accepted', 'delta', etc.

      // Parse JSON payload
      let data: any;
      try {
        data = JSON.parse(message);
      } catch (error) {
        console.error('❌ Failed to parse shadow message:', error);
        return;
      }

      console.log(`🔔 Shadow message: ${deviceUuid}/${shadowName} [${updateType}]`);

      // Handle different shadow update types
      if (updateType === 'update') {
        // Device publishing state update (treat as reported state)
        this.handleShadowReported(deviceUuid, shadowName, data);
      } else if (updateType === 'accepted') {
        // Device successfully reported state
        this.handleShadowReported(deviceUuid, shadowName, data);
      } else if (updateType === 'delta') {
        // Cloud set desired state (desired !== reported)
        this.handleShadowDelta(deviceUuid, shadowName, data);
      } else if (updateType === 'documents') {
        // Complete shadow document
        this.handleShadowDocuments(deviceUuid, shadowName, data);
      } else if (updateType === 'rejected') {
        // Shadow update was rejected
        console.error(`❌ Shadow update rejected for ${deviceUuid}/${shadowName}:`, data.message);
      }

    } catch (error) {
      console.error('❌ Error handling AWS IoT Shadow message:', error);
    }
  }

  /**
   * Handle shadow reported state (from device)
   */
  private handleShadowReported(deviceUuid: string, shadowName: string, data: any): void {
    // Extract reported state from shadow update response
    const reported = data.state?.reported || data.state || data;
    
    const shadowUpdate: ShadowUpdate = {
      deviceUuid,
      reported,
      timestamp: data.timestamp || new Date().toISOString(),
      version: data.version || 0
    };

    console.log(`🌓 Shadow reported from ${deviceUuid}/${shadowName}`);
    this.emit('shadow', shadowUpdate);
    this.emit('shadow:reported', shadowUpdate);
  }

  /**
   * Handle shadow delta (desired state from cloud)
   */
  private handleShadowDelta(deviceUuid: string, shadowName: string, data: any): void {
    // Delta contains the difference between desired and reported
    const desired = data.state || data;
    
    const shadowUpdate: ShadowUpdate = {
      deviceUuid,
      desired,
      timestamp: data.timestamp || new Date().toISOString(),
      version: data.version || 0
    };

    console.log(`🌓 Shadow delta for ${deviceUuid}/${shadowName}`);
    this.emit('shadow', shadowUpdate);
    this.emit('shadow:desired', shadowUpdate);
  }

  /**
   * Handle shadow documents (complete shadow state)
   */
  private handleShadowDocuments(deviceUuid: string, shadowName: string, data: any): void {
    const shadowUpdate: ShadowUpdate = {
      deviceUuid,
      reported: data.current?.state?.reported,
      desired: data.current?.state?.desired,
      timestamp: data.timestamp || new Date().toISOString(),
      version: data.current?.version || 0
    };

    console.log(`🌓 Shadow documents for ${deviceUuid}/${shadowName}`);
    this.emit('shadow', shadowUpdate);
  }

  /**
   * Handle IoT sensor message
   * Topic format: iot/device/{uuid}/sensor/{sensorTopic}
   */
  private handleIotSensorMessage(topic: string, message: string): void {
    try {
      // Parse IoT sensor topic: iot/device/{uuid}/sensor/{sensorTopic}
      const parts = topic.split('/');
      
      if (parts.length < 4 || parts[0] !== 'iot' || parts[1] !== 'device') {
        console.warn('⚠️  Invalid IoT sensor topic:', topic);
        return;
      }

      const deviceUuid = parts[2];
      const sensorTopic = parts[4]; // temperature, humidity, etc.

      // Parse JSON payload
      let data: any;
      try {
        data = JSON.parse(message);
      } catch (error) {
        console.error('❌ Failed to parse sensor message:', error);
        return;
      }

      // Extract sensor name from data or use topic as fallback
      const sensorName = data.sensorName || data.sensor || sensorTopic;

      this.handleSensorData(deviceUuid, sensorName, data);

    } catch (error) {
      console.error('❌ Error handling AWS IoT sensor message:', error);
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
