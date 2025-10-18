/**
 * Cloud Log Backend
 * ==================
 * 
 * Streams container logs to cloud API in real-time
 * Inspired by balena's BalenaLogBackend but simplified
 * 
 * Features:
 * - Streams logs via HTTP POST
 * - Compression with gzip
 * - Local buffering during network issues
 * - Automatic reconnection with exponential backoff
 * - NDJSON format (newline-delimited JSON)
 */

import { Writable } from 'stream';
import zlib from 'zlib';
import type { LogBackend, LogMessage, LogFilter } from './types';

/**
 * Cloud Log Backend Configuration
 */
interface CloudLogBackendConfig {
	cloudEndpoint: string;
	deviceUuid: string;
	deviceApiKey?: string;
	compression?: boolean;
	batchSize?: number;
	maxRetries?: number;
	bufferSize?: number;
	flushInterval?: number;
	reconnectInterval?: number;
	maxReconnectInterval?: number;
}

export class CloudLogBackend implements LogBackend {
	private config: Required<CloudLogBackendConfig>;
	private buffer: LogMessage[] = [];
	private isStreaming: boolean = false;
	private retryCount: number = 0;
	private abortController?: AbortController;
	private flushTimer?: NodeJS.Timeout;
	private reconnectTimer?: NodeJS.Timeout;
	
	constructor(config: CloudLogBackendConfig) {
		this.config = {
			cloudEndpoint: config.cloudEndpoint,
			deviceUuid: config.deviceUuid,
			deviceApiKey: config.deviceApiKey ?? '',
			compression: config.compression ?? true,
			batchSize: config.batchSize ?? 100,
			maxRetries: config.maxRetries ?? 3,
			bufferSize: config.bufferSize ?? 256 * 1024, // 256KB
			flushInterval: config.flushInterval ?? 100, // 100ms
			reconnectInterval: config.reconnectInterval ?? 5000, // 5s
			maxReconnectInterval: config.maxReconnectInterval ?? 300000, // 5min
		};
	}
	
	async initialize(): Promise<void> {
		console.log('📡 Initializing Cloud Log Backend...');
		console.log(`   Endpoint: ${this.config.cloudEndpoint}`);
		console.log(`   Device: ${this.config.deviceUuid}`);
		console.log(`   Compression: ${this.config.compression ? 'Enabled' : 'Disabled'}`);
		
		// Start streaming
		await this.connect();
		
		console.log('✅ Cloud Log Backend initialized');
	}
	
	async log(logMessage: LogMessage): Promise<void> {
		// Add to buffer
		this.buffer.push(logMessage);
		
		// Schedule flush if not already scheduled
		if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => {
				this.flush();
			}, this.config.flushInterval);
		}
		
		// Check buffer size (prevent memory overflow)
		const bufferBytes = JSON.stringify(this.buffer).length;
		if (bufferBytes > this.config.bufferSize) {
			console.warn(`⚠️  Log buffer full (${Math.round(bufferBytes / 1024)}KB), forcing flush`);
			await this.flush();
		}
	}
	
	async getLogs(filter?: LogFilter): Promise<LogMessage[]> {
		// CloudLogBackend doesn't store logs locally (they're streamed to cloud)
		// Return empty array
		return [];
	}
	
	async getLogCount(): Promise<number> {
		return 0;
	}
	
	async cleanup(olderThanMs: number): Promise<number> {
		// CloudLogBackend doesn't store logs locally
		return 0;
	}
	
	async stop(): Promise<void> {
		console.log('🛑 Stopping Cloud Log Backend...');
		
		// Flush remaining logs
		await this.flush();
		
		// Stop streaming
		this.isStreaming = false;
		
		// Cancel any pending operations
		if (this.abortController) {
			this.abortController.abort();
		}
		
		// Clear timers
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
		}
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
		}
		
		console.log('✅ Cloud Log Backend stopped');
	}
	
	// ============================================================================
	// PRIVATE METHODS
	// ============================================================================
	
	private async connect(): Promise<void> {
		if (this.isStreaming) {
			return;
		}
		
		this.isStreaming = true;
		console.log('📡 Connecting to cloud log stream...');
	}
	
	private async flush(): Promise<void> {
		// Clear flush timer
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = undefined;
		}
		
		// Nothing to flush
		if (this.buffer.length === 0) {
			return;
		}
		
		// Get logs to send
		const logsToSend = [...this.buffer];
		this.buffer = [];
		
		try {
			await this.sendLogs(logsToSend);
			this.retryCount = 0; // Reset on success
		} catch (error) {
			console.error('❌ Failed to send logs to cloud:', error);
			
			// Put logs back in buffer (at the beginning)
			this.buffer = [...logsToSend, ...this.buffer];
			
			// Increment retry count
			this.retryCount++;
			
			// Schedule reconnect with exponential backoff
			this.scheduleReconnect();
		}
	}
	
	private async sendLogs(logs: LogMessage[]): Promise<void> {
		const apiVersion = process.env.API_VERSION || 'v1';
		const endpoint = `${this.config.cloudEndpoint}/api/${apiVersion}/device/${this.config.deviceUuid}/logs`;
		
		// Convert to NDJSON (newline-delimited JSON)
		const ndjson = logs.map(log => JSON.stringify(log)).join('\n') + '\n';
		
		// Compress if enabled
		let body: string | Buffer = ndjson;
		const headers: Record<string, string> = {
			'Content-Type': 'application/x-ndjson',
			'X-Device-API-Key': this.config.deviceApiKey || '',
		};
		
		if (this.config.compression) {
			body = await this.compress(ndjson);
			headers['Content-Encoding'] = 'gzip';
		}
		
		// Create abort controller for this request
		this.abortController = new AbortController();
		
		// Send to cloud
		const response = await fetch(endpoint, {
			method: 'POST',
			headers,
			body,
			signal: this.abortController.signal,
		});
		
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		
		console.log(`📤 Sent ${logs.length} log(s) to cloud`);
	}
	
	private async compress(data: string): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			zlib.gzip(data, (err, result) => {
				if (err) {
					reject(err);
				} else {
					resolve(result);
				}
			});
		});
	}
	
	private scheduleReconnect(): void {
		if (this.reconnectTimer) {
			return; // Already scheduled
		}
		
		// Calculate backoff delay (exponential)
		const delay = Math.min(
			this.config.reconnectInterval * Math.pow(2, this.retryCount - 1),
			this.config.maxReconnectInterval
		);
		
		console.log(`⏳ Retrying log upload in ${Math.round(delay / 1000)}s...`);
		
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined;
			this.flush();
		}, delay);
	}
}
