/**
 * MQTT Jobs Notifier Service
 * 
 * Publishes job notifications to MQTT topics when jobs are created/updated.
 * Implements AWS IoT Jobs-style MQTT notifications for real-time job delivery.
 */

import mqtt from 'mqtt';

export interface MqttJobNotification {
  execution: {
    jobId: string;
    jobDocument: any;
    queuedAt: number;
    lastUpdatedAt: number;
    versionNumber: number;
    executionNumber: number;
    status: string;
    statusDetails?: any;
  };
  timestamp: number;
}

export class MqttJobsNotifier {
  private mqttClient: mqtt.MqttClient | null = null;
  private isConnected = false;

  constructor(
    private brokerUrl: string = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    private username?: string,
    private password?: string
  ) {}

  /**
   * Connect to MQTT broker
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('[MqttJobsNotifier] Connecting to MQTT broker:', this.brokerUrl);

      this.mqttClient = mqtt.connect(this.brokerUrl, {
        username: this.username,
        password: this.password,
        clientId: `api-jobs-notifier-${Date.now()}`,
        clean: true,
        reconnectPeriod: 5000,
      });

      this.mqttClient.on('connect', () => {
        console.log('[MqttJobsNotifier] Connected to MQTT broker');
        this.isConnected = true;
        resolve();
      });

      this.mqttClient.on('error', (error) => {
        console.error('[MqttJobsNotifier] MQTT connection error:', error);
        this.isConnected = false;
        reject(error);
      });

      this.mqttClient.on('close', () => {
        console.log('[MqttJobsNotifier] MQTT connection closed');
        this.isConnected = false;
      });
    });
  }

  /**
   * Disconnect from MQTT broker
   */
  async disconnect(): Promise<void> {
    if (this.mqttClient) {
      return new Promise((resolve) => {
        this.mqttClient!.end(false, {}, () => {
          console.log('[MqttJobsNotifier] Disconnected from MQTT broker');
          resolve();
        });
      });
    }
  }

  /**
   * Notify device about next pending job
   * Publishes to: iot/device/{deviceUuid}/jobs/notify-next
   */
  async notifyNextJob(deviceUuid: string, job: {
    job_id: string;
    job_name: string;
    job_document: any;
    queued_at: Date;
    timeout_seconds?: number;
  }): Promise<void> {
    if (!this.isConnected || !this.mqttClient) {
      console.warn('[MqttJobsNotifier] Not connected to MQTT, skipping notification');
      return;
    }

    const topic = `iot/device/${deviceUuid}/jobs/notify-next`;
    
    const notification: MqttJobNotification = {
      execution: {
        jobId: job.job_id,
        jobDocument: job.job_document,
        queuedAt: new Date(job.queued_at).getTime(),
        lastUpdatedAt: Date.now(),
        versionNumber: 1,
        executionNumber: 1,
        status: 'QUEUED',
      },
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      this.mqttClient!.publish(
        topic,
        JSON.stringify(notification),
        { qos: 1, retain: false },
        (error) => {
          if (error) {
            console.error(`[MqttJobsNotifier] Failed to publish to ${topic}:`, error);
            reject(error);
          } else {
            console.log(`[MqttJobsNotifier] Published job notification to ${topic}:`, job.job_id);
            resolve();
          }
        }
      );
    });
  }

  /**
   * Respond to start-next request
   * Publishes to: iot/device/{deviceUuid}/jobs/start-next/accepted
   */
  async publishStartNextAccepted(deviceUuid: string, job: {
    job_id: string;
    job_name: string;
    job_document: any;
    queued_at: Date;
  } | null): Promise<void> {
    if (!this.isConnected || !this.mqttClient) {
      return;
    }

    const topic = `iot/device/${deviceUuid}/jobs/start-next/accepted`;
    
    const payload = job ? {
      execution: {
        jobId: job.job_id,
        jobDocument: job.job_document,
        queuedAt: new Date(job.queued_at).getTime(),
        lastUpdatedAt: Date.now(),
        versionNumber: 1,
        executionNumber: 1,
        status: 'IN_PROGRESS',
      },
      timestamp: Date.now(),
    } : {
      timestamp: Date.now(),
      clientToken: null,
    };

    return new Promise((resolve, reject) => {
      this.mqttClient!.publish(
        topic,
        JSON.stringify(payload),
        { qos: 1, retain: false },
        (error) => {
          if (error) {
            console.error(`[MqttJobsNotifier] Failed to publish to ${topic}:`, error);
            reject(error);
          } else {
            console.log(`[MqttJobsNotifier] Published start-next response to ${topic}`);
            resolve();
          }
        }
      );
    });
  }

  /**
   * Respond to job update
   * Publishes to: iot/device/{deviceUuid}/jobs/{jobId}/update/accepted
   */
  async publishUpdateAccepted(deviceUuid: string, jobId: string, status: string): Promise<void> {
    if (!this.isConnected || !this.mqttClient) {
      return;
    }

    const topic = `iot/device/${deviceUuid}/jobs/${jobId}/update/accepted`;
    
    const payload = {
      executionState: {
        status,
        statusDetails: {},
        versionNumber: 1,
      },
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      this.mqttClient!.publish(
        topic,
        JSON.stringify(payload),
        { qos: 1, retain: false },
        (error) => {
          if (error) {
            console.error(`[MqttJobsNotifier] Failed to publish to ${topic}:`, error);
            reject(error);
          } else {
            console.log(`[MqttJobsNotifier] Published update response to ${topic}`);
            resolve();
          }
        }
      );
    });
  }

  /**
   * Check if connected to MQTT broker
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
let instance: MqttJobsNotifier | null = null;

export function getMqttJobsNotifier(): MqttJobsNotifier {
  if (!instance) {
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    const username = process.env.MQTT_USERNAME;
    const password = process.env.MQTT_PASSWORD;
    
    instance = new MqttJobsNotifier(brokerUrl, username, password);
    
    // Auto-connect
    instance.connect().catch((error) => {
      console.error('[MqttJobsNotifier] Failed to connect:', error);
    });
  }
  
  return instance;
}
