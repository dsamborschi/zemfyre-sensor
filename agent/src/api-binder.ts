/**
 * API BINDER - Device ↔ Cloud Communication
 * ==========================================
 * 
 * Implements balena-supervisor style communication pattern:
 * 1. POLL cloud for target state (what SHOULD be running)
 * 2. REPORT current state + metrics to cloud (what IS running)
 * 
 * Features:
 * - ETag caching to avoid unnecessary downloads
 * - Diff-based reporting (only send what changed)
 * - Rate limiting (10s for state, 5min for metrics)
 * - Exponential backoff on errors
 * - State caching to survive restarts
 */

import { EventEmitter } from 'events';
import type ContainerManager from './compose/container-manager';
import type { DeviceManager } from './provisioning';
import type { SimpleState } from './compose/container-manager';
import * as systemMetrics from './system-metrics';

interface DeviceStateReport {
	[deviceUuid: string]: {
		apps: { [appId: string]: any };
		cpu_usage?: number;
		memory_usage?: number;
		memory_total?: number;
		storage_usage?: number;
		storage_total?: number;
		temperature?: number;
		is_online?: boolean;
		local_ip?: string;
		os_version?: string;
		supervisor_version?: string;
		uptime?: number;
	};
}

interface ApiBinderConfig {
	cloudApiEndpoint: string;
	pollInterval?: number; // Default: 60000ms (60s)
	reportInterval?: number; // Default: 10000ms (10s)
	metricsInterval?: number; // Default: 300000ms (5min)
	apiTimeout?: number; // Default: 30000ms (30s)
}

interface TargetStateResponse {
	[deviceUuid: string]: {
		apps: { [appId: string]: any };
	};
}

export class ApiBinder extends EventEmitter {
	private containerManager: ContainerManager;
	private deviceManager: DeviceManager;
	private config: Required<ApiBinderConfig>;
	
	// State management
	private targetState: SimpleState = { apps: {} };
	private lastReport: DeviceStateReport = {};
	private lastReportTime: number = -Infinity;
	private lastMetricsTime: number = -Infinity;
	
	// ETag caching for target state
	private targetStateETag?: string;
	
	// Polling control
	private pollTimer?: NodeJS.Timeout;
	private reportTimer?: NodeJS.Timeout;
	private isPolling: boolean = false;
	private isReporting: boolean = false;
	
	// Error tracking
	private pollErrors: number = 0;
	private reportErrors: number = 0;
	
	constructor(
		containerManager: ContainerManager,
		deviceManager: DeviceManager,
		config: ApiBinderConfig,
	) {
		super();
		this.containerManager = containerManager;
		this.deviceManager = deviceManager;
		
		// Set defaults
		this.config = {
			cloudApiEndpoint: config.cloudApiEndpoint,
			pollInterval: config.pollInterval || 60000, // 60s
			reportInterval: config.reportInterval || 10000, // 10s
			metricsInterval: config.metricsInterval || 300000, // 5min
			apiTimeout: config.apiTimeout || 30000, // 30s
		};
	}
	
	/**
	 * Start polling cloud for target state
	 */
	public async startPoll(): Promise<void> {
		if (this.isPolling) {
			console.log('⚠️  API Binder already polling');
			return;
		}
		
		this.isPolling = true;
		console.log('📡 Starting target state polling...');
		console.log(`   Endpoint: ${this.config.cloudApiEndpoint}`);
		console.log(`   Interval: ${this.config.pollInterval}ms`);
		
		// Start polling loop
		await this.pollLoop();
	}
	
	/**
	 * Start reporting current state to cloud
	 */
	public async startReporting(): Promise<void> {
		if (this.isReporting) {
			console.log('⚠️  API Binder already reporting');
			return;
		}
		
		this.isReporting = true;
		console.log('📡 Starting state reporting...');
		console.log(`   Endpoint: ${this.config.cloudApiEndpoint}`);
		console.log(`   Interval: ${this.config.reportInterval}ms`);
		
		// Listen for state changes
		this.containerManager.on('current-state-changed', () => {
			this.scheduleReport('state-change');
		});
		
		// Start reporting loop
		await this.reportLoop();
	}
	
	/**
	 * Stop polling and reporting
	 */
	public async stop(): Promise<void> {
		console.log('🛑 Stopping API Binder...');
		
		this.isPolling = false;
		this.isReporting = false;
		
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
		}
		if (this.reportTimer) {
			clearTimeout(this.reportTimer);
		}
		
		this.removeAllListeners();
	}
	
	/**
	 * Get current target state
	 */
	public getTargetState(): SimpleState {
		return this.targetState;
	}
	
	// ============================================================================
	// POLLING LOGIC
	// ============================================================================
	
	private async pollLoop(): Promise<void> {
		if (!this.isPolling) {
			return;
		}
		
		try {
			await this.pollTargetState();
			this.pollErrors = 0; // Reset on success
		} catch (error) {
			this.pollErrors++;
			console.error('❌ Failed to poll target state:', error);
		}
		
		// Calculate next poll interval (exponential backoff on errors)
		const interval = this.pollErrors > 0
			? Math.min(this.config.pollInterval, 15000 * Math.pow(2, this.pollErrors - 1))
			: this.config.pollInterval;
		
		// Schedule next poll
		this.pollTimer = setTimeout(() => this.pollLoop(), interval);
	}
	
	private async pollTargetState(): Promise<void> {
		const deviceInfo = this.deviceManager.getDeviceInfo();
		
		if (!deviceInfo.provisioned) {
			console.log('⚠️  Device not provisioned, skipping target state poll');
			return;
		}
		
		const endpoint = `${this.config.cloudApiEndpoint}/api/v1/device/${deviceInfo.uuid}/state`;
		
		try {
			const response = await fetch(endpoint, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					...(this.targetStateETag && { 'If-None-Match': this.targetStateETag }),
				},
				signal: AbortSignal.timeout(this.config.apiTimeout),
			});
			
			// 304 Not Modified - target state unchanged
			if (response.status === 304) {
				console.log('📡 Target state unchanged (304)');
				return;
			}
			
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			
			// Get ETag for next request
			const etag = response.headers.get('etag');
			if (etag) {
				this.targetStateETag = etag;
			}
			
			// Parse response
			const targetStateResponse = await response.json() as TargetStateResponse;
	
			const deviceState = targetStateResponse[deviceInfo.uuid];
			
			if (!deviceState) {
				console.warn('⚠️  No target state for this device in response');
				console.warn('   Available UUIDs:', Object.keys(targetStateResponse));
				return;
			}
			
			
			// Check if target state changed
			const newTargetState: SimpleState = { apps: deviceState.apps || {} };
			
			// Debug: Log the actual comparison strings
			const currentStateStr = JSON.stringify(this.targetState);
			const newStateStr = JSON.stringify(newTargetState);
			
			if (currentStateStr !== newStateStr) {
				console.log('🎯 New target state received from cloud');
				console.log(`   Apps: ${Object.keys(newTargetState.apps).length}`);
				console.log('🔍 Difference detected - applying new state');
				
				this.targetState = newTargetState;
				
				// Apply target state to container manager
				await this.containerManager.setTarget(this.targetState);
				
				// Trigger reconciliation
				this.emit('target-state-changed', this.targetState);
				
				console.log('✅ Target state applied');
			} else {
				console.log('📡 Target state fetched (no changes)');
			}
			
		} catch (error) {
			if ((error as Error).name === 'AbortError') {
				throw new Error('Target state poll timeout');
			}
			throw error;
		}
	}
	
	// ============================================================================
	// REPORTING LOGIC
	// ============================================================================
	
	private async reportLoop(): Promise<void> {
		if (!this.isReporting) {
			return;
		}
		
		try {
			await this.reportCurrentState();
			this.reportErrors = 0; // Reset on success
		} catch (error) {
			this.reportErrors++;
			console.error('❌ Failed to report current state:', error);
		}
		
		// Calculate next report interval (exponential backoff on errors)
		const interval = this.reportErrors > 0
			? Math.min(this.config.reportInterval, 15000 * Math.pow(2, this.reportErrors - 1))
			: this.config.reportInterval;
		
		// Schedule next report
		this.reportTimer = setTimeout(() => this.reportLoop(), interval);
	}
	
	private scheduleReport(reason: 'state-change' | 'metrics' | 'scheduled'): void {
		// Just emit event, actual reporting happens in reportLoop
		this.emit('report-scheduled', reason);
	}
	
	private async reportCurrentState(): Promise<void> {
		const deviceInfo = this.deviceManager.getDeviceInfo();
		
		if (!deviceInfo.provisioned) {
			console.log('⚠️  Device not provisioned, skipping state report');
			return;
		}
		
		const now = Date.now();
		
		// Check if we should report (rate limiting)
		const timeSinceLastReport = now - this.lastReportTime;
		const timeSinceLastMetrics = now - this.lastMetricsTime;
		
		if (timeSinceLastReport < this.config.reportInterval) {
			// Too soon to report
			return;
		}
		
		// Build current state report
		const currentState = await this.containerManager.getCurrentState();
		
		// Get metrics if interval elapsed
		const includeMetrics = timeSinceLastMetrics >= this.config.metricsInterval;
		
		const stateReport: DeviceStateReport = {
			[deviceInfo.uuid]: {
				apps: currentState.apps,
				is_online: true,
			},
		};
		
		// Add metrics if needed
		if (includeMetrics) {
			try {
				const metrics = await systemMetrics.getSystemMetrics();
				stateReport[deviceInfo.uuid].cpu_usage = metrics.cpu_usage;
				stateReport[deviceInfo.uuid].memory_usage = metrics.memory_usage;
				stateReport[deviceInfo.uuid].memory_total = metrics.memory_total;
				stateReport[deviceInfo.uuid].storage_usage = metrics.storage_usage ?? undefined;
				stateReport[deviceInfo.uuid].storage_total = metrics.storage_total ?? undefined;
				stateReport[deviceInfo.uuid].temperature = metrics.cpu_temp ?? undefined;
				stateReport[deviceInfo.uuid].uptime = metrics.uptime;
				
				this.lastMetricsTime = now;
			} catch (error) {
				console.warn('⚠️  Failed to collect metrics:', error);
			}
		}
		
		// Build state-only report for diff comparison (without metrics)
		const stateOnlyReport: DeviceStateReport = {
			[deviceInfo.uuid]: {
				apps: currentState.apps,
				is_online: true,
			},
		};
		
		// Calculate diff - only compare app state (no metrics)
		const diff = this.calculateStateDiff(this.lastReport, stateOnlyReport);
		
		// If there are changes OR we need to send metrics, send the full report (with metrics if applicable)
		const shouldReport = Object.keys(diff).length > 0 || includeMetrics;
		
		if (!shouldReport) {
			// No changes to report
			return;
		}
		
		// Prepare report to send (include metrics if needed)
		const reportToSend = includeMetrics ? stateReport : stateOnlyReport;
		
		// Send report to cloud
		const endpoint = `${this.config.cloudApiEndpoint}/api/v1/device/state`;
		
		try {
			const response = await fetch(endpoint, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(reportToSend),
				signal: AbortSignal.timeout(this.config.apiTimeout),
			});
			
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			
			// Update last report (state only, no metrics)
			this.lastReport = stateOnlyReport;
			this.lastReportTime = now;
			
			console.log(`📤 Reported current state to cloud ${includeMetrics ? '(with metrics)' : ''}`);
			
		} catch (error) {
			if ((error as Error).name === 'AbortError') {
				throw new Error('State report timeout');
			}
			throw error;
		}
	}
	
	/**
	 * Calculate diff between two state reports
	 * 
	 * Compares only app state and non-metrics fields.
	 * Both states should NOT contain metrics fields.
	 */
	private calculateStateDiff(
		oldState: DeviceStateReport,
		newState: DeviceStateReport,
	): Partial<DeviceStateReport> {
		const diff: any = {};
		
		for (const uuid in newState) {
			const oldDevice = oldState[uuid] || {};
			const newDevice = newState[uuid];
			const deviceDiff: any = {};
			
			// Compare each field in newDevice
			for (const key in newDevice) {
				const oldValue = (oldDevice as any)[key];
				const newValue = (newDevice as any)[key];
				
				// Deep comparison for apps object
				if (key === 'apps') {
					if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
						deviceDiff[key] = newValue;
					}
				}
				// Shallow comparison for other primitives (is_online, local_ip, etc.)
				else {
					if (oldValue !== newValue) {
						deviceDiff[key] = newValue;
					}
				}
			}
			
			// Only include device if there are changes
			if (Object.keys(deviceDiff).length > 0) {
				diff[uuid] = deviceDiff;
			}
		}
		
		return diff;
	}
}
