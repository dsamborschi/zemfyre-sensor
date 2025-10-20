/**
 * MQTT Schema Agent - TypeScript Port
 * Monitors MQTT topics and automatically generates schemas for JSON payloads
 */

import mqtt, { MqttClient } from 'mqtt';
import isUtf8 from 'is-utf8';
import { EventEmitter } from 'events';

interface TopicSchema {
  topic: string;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'xml' | 'bin' | 'unknown';
  properties?: Record<string, any>;
  items?: any;
  timestamp: number;
}

interface MQTTSchemaAgentOptions {
  brokerUrl: string;
  username?: string;
  password?: string;
  clientId?: string;
  topics?: string[];
  reportInterval?: number; // milliseconds
}

interface MQTTStats {
  messagesSent: number;
  subscriptions: number;
  retainedMessages: number;
  connectedClients: number;
  bytesReceived15min: number;
  bytesSent15min: number;
  userMessages: number;
}

/**
 * Generates JSON Schema from a parsed JSON object
 */
class SchemaGenerator {
  /**
   * Get the type of a value (handles JSON-compatible types)
   */
  private static getObjectType(obj: any): string {
    let type: string = typeof obj;
    if (type === 'object') {
      if (Array.isArray(obj)) {
        type = 'array';
      } else if (obj === null) {
        type = 'null';
      }
    }
    return type;
  }

  /**
   * Handle array schema generation
   */
  private static handleArray(obj: any[]): any {
    const schema: any = {
      type: 'array'
    };

    if (obj.length === 0) {
      return schema;
    }

    let arrayType: string | undefined;
    let multipleTypes = false;
    let itemsSchema: any;

    for (let i = 0; i < obj.length; i++) {
      const elementSchema = this.generateSchema(obj[i]);
      const elementType = elementSchema.type;

      if (i > 0 && elementType !== arrayType) {
        multipleTypes = true;
        break;
      } else {
        arrayType = elementType;
        if (elementType === 'object') {
          if (!itemsSchema) {
            itemsSchema = elementSchema;
          } else {
            // Merge properties from multiple objects
            const keys = Object.keys(elementSchema.properties || {});
            keys.forEach(key => {
              if (!itemsSchema.properties[key]) {
                itemsSchema.properties[key] = elementSchema.properties[key];
              }
            });
          }
        } else if (elementType === 'array') {
          if (!itemsSchema) {
            itemsSchema = elementSchema;
          }
        } else {
          itemsSchema = this.generateSchema(obj[i]);
        }
      }
    }

    if (!multipleTypes && arrayType) {
      schema.items = itemsSchema;
    }

    return schema;
  }

  /**
   * Handle object schema generation
   */
  private static handleObject(obj: Record<string, any>): any {
    const schema: any = {
      type: 'object',
      properties: {}
    };

    for (const [key, value] of Object.entries(obj)) {
      schema.properties[key] = this.generateSchema(value);
    }

    return schema;
  }

  /**
   * Generate JSON Schema for a value
   */
  static generateSchema(obj: any): any {
    const type = this.getObjectType(obj);
    
    switch (type) {
      case 'object':
        return this.handleObject(obj);
      case 'array':
        return this.handleArray(obj);
      default:
        return { type };
    }
  }
}

/**
 * MQTT Schema Agent - Monitors topics and generates schemas
 */
export class MQTTSchemaAgent extends EventEmitter {
  private client: MqttClient | null = null;
  private options: MQTTSchemaAgentOptions;
  private topics: Map<string, TopicSchema> = new Map();
  private connected = false;
  private stopped = true;
  private reconnectCount = 0;
  private reconnectTimeout?: NodeJS.Timeout;
  private reportInterval?: NodeJS.Timeout;
  private stats: MQTTStats = {
    messagesSent: 0,
    subscriptions: 0,
    retainedMessages: 0,
    connectedClients: 0,
    bytesReceived15min: 0,
    bytesSent15min: 0,
    userMessages: 0
  };

  // Monitored $SYS topics for stats
  private static readonly MONITORED_TOPICS: Record<string, keyof MQTTStats> = {
    '$SYS/broker/messages/sent': 'messagesSent',
    '$SYS/broker/subscriptions/count': 'subscriptions',
    '$SYS/broker/retained messages/count': 'retainedMessages',
    '$SYS/broker/clients/connected': 'connectedClients',
    '$SYS/broker/load/bytes/received/15min': 'bytesReceived15min',
    '$SYS/broker/load/bytes/sent/15min': 'bytesSent15min'
  };

  constructor(options: MQTTSchemaAgentOptions) {
    super();
    this.options = {
      topics: ['#'], // Subscribe to all topics by default
      reportInterval: 1000 * 60 * 2, // 2 minutes
      ...options
    };
  }

  /**
   * Start the MQTT schema agent
   */
  async start(): Promise<void> {
    if (this.client) {
      await this.stop();
    }
    await this.connect();
  }

  /**
   * Connect to MQTT broker
   */
  private async connect(): Promise<void> {
    this.connected = false;
    this.reconnectCount = 0;
    this.stopped = false;

    const mqttOptions: mqtt.IClientOptions = {
      clientId: this.options.clientId || `mqtt-schema-agent-${Date.now()}`,
      reconnectPeriod: 0, // Manual reconnection
      username: this.options.username,
      password: this.options.password
    };

    console.log(`[MQTT Schema Agent] Connecting to ${this.options.brokerUrl}...`);
    
    this.client = mqtt.connect(this.options.brokerUrl, mqttOptions);

    this.client.on('connect', () => {
      this.connected = true;
      console.log(`[MQTT Schema Agent] Connected to ${this.options.brokerUrl}`);
      this.emit('connected');

      // Subscribe to topics
      const topicsToSubscribe = [...this.options.topics!];
      
      // Always include $SYS topics for stats
      if (!topicsToSubscribe.some(t => t.includes('$SYS'))) {
        topicsToSubscribe.push('$SYS/broker/#');
      }

      console.log(`[MQTT Schema Agent] Subscribing to: ${topicsToSubscribe.join(', ')}`);
      
      this.client!.subscribe(topicsToSubscribe, (err) => {
        if (err) {
          console.error('[MQTT Schema Agent] Subscription error:', err);
          this.emit('error', err);
        } else {
          console.log('[MQTT Schema Agent] Subscribed successfully');
          this.emit('subscribed');
        }
      });
    });

    // Note: 'subscribe' event exists but not in type definitions
    // @ts-ignore - MQTT.js has this event but TypeScript types are incomplete
    this.client.on('subscribe', () => {
      this.reconnectCount = 0;
    });

    this.client.on('reconnect', () => {
      console.log('[MQTT Schema Agent] Reconnecting...');
    });

    this.client.on('close', () => {
      console.log('[MQTT Schema Agent] Connection closed');
      if (!this.stopped && this.reconnectCount < 3) {
        this.reconnectCount++;
        this.reconnectTimeout = setTimeout(() => {
          this.client?.reconnect();
        }, 5000);
      }
    });

    this.client.on('error', (error: any) => {
      console.error('[MQTT Schema Agent] Error:', error);
      this.emit('error', error);
    });

    this.client.on('message', (topic: string, payload: Buffer) => {
      this.handleMessage(topic, payload);
    });

    // Start periodic reporting
    this.startReporting();
  }

  /**
   * Handle incoming MQTT message
   */
  private handleMessage(topic: string, payload: Buffer): void {
    let schema: Partial<TopicSchema> = { type: 'unknown' };

    try {
      if (isUtf8(payload)) {
        const stringPayload = payload.toString('utf8');
        schema = { type: 'string' };

        // Check for XML
        if (stringPayload.startsWith('<') && stringPayload.endsWith('>')) {
          schema.type = 'xml';
        } else {
          // Try to parse as JSON
          try {
            const json = JSON.parse(stringPayload);
            schema = SchemaGenerator.generateSchema(json);
          } catch {
            // Not JSON, keep as string
          }
        }
      } else {
        schema.type = 'bin';
      }
    } catch (err) {
      console.error(`[MQTT Schema Agent] Error parsing payload on topic '${topic}':`, err);
    }

    // Store topic schema
    this.topics.set(topic, {
      topic,
      timestamp: Date.now(),
      ...schema
    } as TopicSchema);

    // Update stats for monitored topics
    if (MQTTSchemaAgent.MONITORED_TOPICS[topic]) {
      const statKey = MQTTSchemaAgent.MONITORED_TOPICS[topic];
      const value = parseFloat(payload.toString());
      this.stats[statKey] = value as any;
    } else if (!topic.startsWith('$SYS/')) {
      // User message (not system topic)
      this.stats.userMessages++;
    }

    // Emit event for new schema
    this.emit('schema', { topic, schema });
  }

  /**
   * Start periodic reporting
   */
  private startReporting(): void {
    this.reportInterval = setInterval(() => {
      if (this.connected) {
        const schemas = Array.from(this.topics.values());
        
        console.log(`[MQTT Schema Agent] Report: ${schemas.length} topics discovered`);
        
        // Emit report event
        this.emit('report', {
          timestamp: Date.now(),
          schemas,
          stats: this.getStats()
        });

        // Clear topics after reporting (only report new/updated topics next time)
        this.topics.clear();
      }
    }, this.options.reportInterval);
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    this.stopped = true;
    
    if (this.client) {
      this.client.end();
      this.client = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }
    
    this.connected = false;
    this.topics.clear();
    
    console.log('[MQTT Schema Agent] Stopped');
  }

  /**
   * Get agent status
   */
  getStatus(): { connected: boolean; topicCount: number } {
    return {
      connected: this.connected,
      topicCount: this.topics.size
    };
  }

  /**
   * Get current topics
   */
  getTopics(): TopicSchema[] {
    return Array.from(this.topics.values());
  }

  /**
   * Get statistics
   */
  getStats(): MQTTStats & { mqtt_connected: boolean } {
    return {
      ...this.stats,
      mqtt_connected: this.connected
    };
  }

  /**
   * Get schema for a specific topic
   */
  getTopicSchema(topic: string): TopicSchema | undefined {
    return this.topics.get(topic);
  }
}
