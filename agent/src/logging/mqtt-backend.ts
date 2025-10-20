// Refactored MQTT Log Backend - uses centralized MqttManager

import { MqttManager } from '../mqtt/mqtt-manager';
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
	private mqttManager: MqttManager;
	private options: Required<MqttLogBackendOptions>;
	private batch: LogMessage[];
	private batchTimer: NodeJS.Timeout | null;
	private connectionPromise: Promise<void> | null = null;

	constructor(options: MqttLogBackendOptions) {
		this.mqttManager = MqttManager.getInstance();
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

		// Enable debug in MqttManager if requested
		if (this.options.debug) {
			this.mqttManager.setDebug(true);
		}
	}

	public async connect(): Promise<void> {
		if (this.connectionPromise) {
			return this.connectionPromise;
		}

		this.connectionPromise = this.mqttManager.connect(this.options.brokerUrl, {
			...this.options.clientOptions,
			reconnectPeriod: 5000,
			connectTimeout: 10000,
		});

		try {
			await this.connectionPromise;
			this.debugLog('Connected to MQTT broker (using centralized manager)');
		} catch (error) {
			this.connectionPromise = null;
			throw error;
		}

		return this.connectionPromise;
	}

	public async disconnect(): Promise<void> {
		if (this.batch.length > 0) {
			await this.publishBatch();
		}

		if (this.batchTimer) {
			clearInterval(this.batchTimer);
			this.batchTimer = null;
		}

		// Note: We don't disconnect the shared manager here
		// It may be used by other features
		this.debugLog('MqttLogBackend disconnected (shared manager still active)');
	}

	public async log(message: LogMessage): Promise<void> {
		if (!this.mqttManager.isConnected()) {
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

		await this.mqttManager.publish(topic, payload, {
			qos: this.options.qos,
			retain: this.options.retain,
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

			await this.mqttManager.publish(batchTopic, payload, {
				qos: this.options.qos,
				retain: false,
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
		return this.mqttManager.isConnected();
	}

	// Additional methods for direct MQTT operations (if needed)
	public async publish(topic: string, payload: string | Buffer, qos?: 0 | 1 | 2): Promise<void> {
		await this.mqttManager.publish(topic, payload, {
			qos: qos !== undefined ? qos : this.options.qos
		});
	}

	public async subscribe(topic: string, qos?: 0 | 1 | 2, handler?: (topic: string, payload: Buffer) => void): Promise<void> {
		await this.mqttManager.subscribe(topic, {
			qos: qos !== undefined ? qos : this.options.qos
		}, handler);
	}

	public async unsubscribe(topic: string): Promise<void> {
		await this.mqttManager.unsubscribe(topic);
	}
}
