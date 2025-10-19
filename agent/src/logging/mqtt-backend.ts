// COPY THIS FILE TO: src/logging/mqtt-backend.ts
//
// This is the working MQTT backend implementation
// The file creation tool has encoding issues, so copy this manually

import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { LogBackend, LogMessage, LogFilter } from './types';

export interface MqttLogBackendOptions {
	brokerUrl: string;
	clientOptions?: any;
	baseTopic?: string;
	qos?: 0 | 1 | 2;
	retain?: boolean;
	enableBatching?: boolean;
	batchInterval?: number;
	maxBatchSize?: number;
	debug?: boolean;
}

export class MqttLogBackend implements LogBackend {
	private client: MqttClient | null;
	private options: Required<MqttLogBackendOptions>;
	private connected: boolean;
	private batch: LogMessage[];
	private batchTimer: NodeJS.Timeout | null;

	constructor(options: MqttLogBackendOptions) {
		this.client = null;
		this.connected = false;
		this.batch = [];
		this.batchTimer = null;
		
		this.options = {
			brokerUrl: options.brokerUrl,
			clientOptions: options.clientOptions || {},
			baseTopic: options.baseTopic || 'container-manager/logs',
			qos: options.qos !== undefined ? options.qos : 1,
			retain: options.retain || false,
			enableBatching: options.enableBatching || false,
			batchInterval: options.batchInterval || 1000,
			maxBatchSize: options.maxBatchSize || 50,
			debug: options.debug || false,
		};
	}

	public async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			// Add connection timeout (10 seconds)
			const connectionTimeout = setTimeout(() => {
				if (!this.connected && this.client) {
					this.debugLog('Connection timeout - MQTT broker not responding');
					this.client.end(true); // Force close
					reject(new Error(`MQTT connection timeout after 10s: ${this.options.brokerUrl}`));
				}
			}, 10000);

			try {
				this.client = mqtt.connect(this.options.brokerUrl, {
					...this.options.clientOptions,
					reconnectPeriod: 5000,
					connectTimeout: 10000, // 10 second timeout
				});

				this.client.on('connect', () => {
					clearTimeout(connectionTimeout);
					this.connected = true;
					this.debugLog('Connected to MQTT broker');
					resolve();
				});

				this.client.on('error', (error: Error) => {
					this.debugLog('MQTT error: ' + error.message);
					if (!this.connected) {
						clearTimeout(connectionTimeout);
						reject(error);
					}
				});

				this.client.on('reconnect', () => {
					this.debugLog('Reconnecting to MQTT broker');
				});

				this.client.on('offline', () => {
					this.connected = false;
					this.debugLog('MQTT client offline');
				});

				this.client.on('close', () => {
					clearTimeout(connectionTimeout);
					this.connected = false;
					this.debugLog('MQTT connection closed');
				});
			} catch (error) {
				clearTimeout(connectionTimeout);
				reject(error);
			}
		});
	}

	public async disconnect(): Promise<void> {
		if (this.batch.length > 0) {
			await this.publishBatch();
		}

		if (this.batchTimer) {
			clearInterval(this.batchTimer);
			this.batchTimer = null;
		}

		return new Promise((resolve) => {
			if (this.client) {
				this.client.end(false, {}, () => {
					this.debugLog('Disconnected from MQTT broker');
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

	public async log(message: LogMessage): Promise<void> {
		if (!this.client || !this.connected) {
			this.debugLog('MQTT not connected, dropping log');
			return;
		}

		if (this.options.enableBatching) {
			this.addToBatch(message);
		} else {
			await this.publishSingle(message);
		}
	}

	public async getLogs(_filter?: LogFilter): Promise<LogMessage[]> {
		throw new Error('MqttLogBackend does not support querying logs (stream-only)');
	}

	public async cleanup(_olderThanMs: number): Promise<number> {
		return 0;
	}

	public async getLogCount(): Promise<number> {
		return 0;
	}

	private addToBatch(message: LogMessage): void {
		this.batch.push(message);

		if (!this.batchTimer) {
			this.batchTimer = setInterval(() => {
				this.publishBatch();
			}, this.options.batchInterval);
		}

		if (this.batch.length >= this.options.maxBatchSize) {
			this.publishBatch();
		}
	}

	private async publishSingle(message: LogMessage): Promise<void> {
		const topic = this.buildTopic(message);
		const payload = JSON.stringify(message);

		return new Promise((resolve, reject) => {
			this.client!.publish(
				topic,
				payload,
				{
					qos: this.options.qos,
					retain: this.options.retain,
				},
				(error?: Error) => {
					if (error) {
						this.debugLog('Failed to publish log: ' + error.message);
						reject(error);
					} else {
						resolve();
					}
				},
			);
		});
	}

	private async publishBatch(): Promise<void> {
		if (this.batch.length === 0) {
			return;
		}

		const logsToPublish = [...this.batch];
		this.batch = [];

		const logsByTopic = new Map<string, LogMessage[]>();
		for (const logMsg of logsToPublish) {
			const topic = this.buildTopic(logMsg);
			if (!logsByTopic.has(topic)) {
				logsByTopic.set(topic, []);
			}
			logsByTopic.get(topic)!.push(logMsg);
		}

		for (const [topic, logs] of logsByTopic) {
			const payload = JSON.stringify({
				count: logs.length,
				logs,
			});
			const batchTopic = topic + '/batch';

			await new Promise<void>((resolve, reject) => {
				this.client!.publish(
					batchTopic,
					payload,
					{
						qos: this.options.qos,
						retain: false,
					},
					(error?: Error) => {
						if (error) {
							this.debugLog('Failed to publish batch: ' + error.message);
							reject(error);
						} else {
							resolve();
						}
					},
				);
			});
		}
	}

	private buildTopic(message: LogMessage): string {
		const parts = [this.options.baseTopic];

		if (message.source.type === 'container' && message.serviceName) {
			const appId = message.serviceId ? Math.floor(message.serviceId / 1000) : 'unknown';
			parts.push(appId.toString(), message.serviceName);
		} else if (message.source.type === 'system') {
			parts.push('system');
		} else if (message.source.type === 'manager') {
			parts.push('manager');
		} else {
			parts.push('other');
		}

		parts.push(message.level);

		return parts.join('/');
	}

	private debugLog(msg: string): void {
		if (this.options.debug) {
			console.log('[MqttLogBackend] ' + msg);
		}
	}

	public isConnected(): boolean {
		return this.connected;
	}

	// Additional methods for direct MQTT operations (used by Shadow feature)
	public async publish(topic: string, payload: string | Buffer, qos?: 0 | 1 | 2): Promise<void> {
		if (!this.client || !this.connected) {
			throw new Error('MQTT client not connected');
		}

		// Debug: Log what we're publishing
		console.log(`📡 MQTT Publish: ${topic}`);
		console.log(`   QoS: ${qos !== undefined ? qos : this.options.qos}`);
		console.log(`   Payload size: ${Buffer.byteLength(payload)} bytes`);

		return new Promise((resolve, reject) => {
			this.client!.publish(
				topic,
				payload,
				{ qos: qos !== undefined ? qos : this.options.qos },
				(error?: Error) => {
					if (error) {
						console.error(`❌ MQTT Publish failed for ${topic}:`, error);
						reject(error);
					} else {
						console.log(`✅ MQTT Publish success: ${topic}`);
						resolve();
					}
				}
			);
		});
	}

	public async subscribe(topic: string, qos?: 0 | 1 | 2, handler?: (topic: string, payload: Buffer) => void): Promise<void> {
		if (!this.client || !this.connected) {
			throw new Error('MQTT client not connected');
		}

		return new Promise((resolve, reject) => {
			this.client!.subscribe(topic, { qos: qos !== undefined ? qos : this.options.qos }, (error) => {
				if (error) {
					reject(error);
				} else {
					if (handler) {
						// Set up message handler for this topic
						this.client!.on('message', (receivedTopic, payload) => {
							if (this.topicMatches(receivedTopic, topic)) {
								handler(receivedTopic, payload);
							}
						});
					}
					resolve();
				}
			});
		});
	}

	public async unsubscribe(topic: string): Promise<void> {
		if (!this.client || !this.connected) {
			throw new Error('MQTT client not connected');
		}

		return new Promise((resolve, reject) => {
			this.client!.unsubscribe(topic, (error) => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	// Helper to match MQTT topics with wildcards
	private topicMatches(actualTopic: string, filterTopic: string): boolean {
		const actualParts = actualTopic.split('/');
		const filterParts = filterTopic.split('/');

		for (let i = 0; i < filterParts.length; i++) {
			if (filterParts[i] === '#') {
				return true; // Multi-level wildcard matches everything after
			}
			if (filterParts[i] === '+') {
				continue; // Single-level wildcard matches any single level
			}
			if (actualParts[i] !== filterParts[i]) {
				return false;
			}
		}

		return actualParts.length === filterParts.length;
	}
}
