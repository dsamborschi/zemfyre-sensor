/**
 * Device Configuration Loader
 * ============================
 * Loads configuration from multiple sources with priority:
 * 1. CLI config file (device-config.json) - highest priority
 * 2. Environment variables
 * 3. Default values
 */

import * as fs from 'fs';
import * as path from 'path';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/data';
const CONFIG_FILE = path.join(CONFIG_DIR, 'device-config.json');

export interface DeviceConfig {
	// Cloud API
	cloudApiEndpoint?: string;
	pollInterval?: number; // ms
	reportInterval?: number; // ms
	metricsInterval?: number; // ms
	apiTimeout?: number; // ms
	
	// Device
	deviceName?: string;
	deviceType?: string;
	
	// Remote Access
	enableRemoteAccess?: boolean;
	cloudHost?: string;
	sshTunnelUser?: string;
	sshKeyPath?: string;
	
	// Logging
	logLevel?: 'debug' | 'info' | 'warn' | 'error';
	enableMqttLogging?: boolean;
	mqttBroker?: string;
	
	// Features
	enableAutoUpdate?: boolean;
	enableMetrics?: boolean;
	
	// Custom settings
	[key: string]: any;
}

export class ConfigLoader {
	private cliConfig: DeviceConfig = {};
	private envConfig: DeviceConfig = {};
	
	constructor() {
		this.loadCliConfig();
		this.loadEnvConfig();
	}
	
	/**
	 * Load configuration from CLI config file
	 */
	private loadCliConfig(): void {
		try {
			if (fs.existsSync(CONFIG_FILE)) {
				const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
				this.cliConfig = JSON.parse(content);
				console.log(`📋 Loaded CLI config from ${CONFIG_FILE}`);
			}
		} catch (error) {
			console.error('⚠️  Failed to load CLI config:', error);
		}
	}
	
	/**
	 * Load configuration from environment variables
	 */
	private loadEnvConfig(): void {
		this.envConfig = {
			// Cloud API
			cloudApiEndpoint: process.env.CLOUD_API_ENDPOINT,
			pollInterval: this.parseNumber(process.env.POLL_INTERVAL),
			reportInterval: this.parseNumber(process.env.REPORT_INTERVAL),
			metricsInterval: this.parseNumber(process.env.METRICS_INTERVAL),
			apiTimeout: this.parseNumber(process.env.API_TIMEOUT),
			
			// Device
			deviceName: process.env.DEVICE_NAME,
			deviceType: process.env.DEVICE_TYPE,
			
			// Remote Access
			enableRemoteAccess: this.parseBoolean(process.env.ENABLE_REMOTE_ACCESS),
			cloudHost: process.env.CLOUD_HOST,
			sshTunnelUser: process.env.SSH_TUNNEL_USER,
			sshKeyPath: process.env.SSH_KEY_PATH,
			
			// Logging
			logLevel: process.env.LOG_LEVEL as any,
			enableMqttLogging: this.parseBoolean(process.env.ENABLE_MQTT_LOGGING),
			mqttBroker: process.env.MQTT_BROKER,
			
			// Features
			enableAutoUpdate: this.parseBoolean(process.env.ENABLE_AUTO_UPDATE),
			enableMetrics: this.parseBoolean(process.env.ENABLE_METRICS),
		};
		
		// Remove undefined values
		Object.keys(this.envConfig).forEach(key => {
			if (this.envConfig[key] === undefined) {
				delete this.envConfig[key];
			}
		});
	}
	
	/**
	 * Get merged configuration (CLI overrides ENV overrides defaults)
	 */
	public getConfig(): DeviceConfig {
		const defaults: DeviceConfig = {
			pollInterval: 60000, // 60s
			reportInterval: 10000, // 10s
			metricsInterval: 300000, // 5min
			apiTimeout: 30000, // 30s
			logLevel: 'info',
			enableMetrics: true,
			enableAutoUpdate: false,
		};
		
		return {
			...defaults,
			...this.envConfig,
			...this.cliConfig, // CLI has highest priority
		};
	}
	
	/**
	 * Get specific config value
	 */
	public get<K extends keyof DeviceConfig>(key: K): DeviceConfig[K] {
		const config = this.getConfig();
		return config[key];
	}
	
	/**
	 * Reload configuration from disk
	 */
	public reload(): void {
		this.loadCliConfig();
		this.loadEnvConfig();
	}
	
	/**
	 * Watch config file for changes
	 */
	public watchConfig(callback: (config: DeviceConfig) => void): void {
		if (!fs.existsSync(CONFIG_DIR)) {
			return;
		}
		
		fs.watch(CONFIG_FILE, (eventType) => {
			if (eventType === 'change') {
				console.log('📋 Config file changed, reloading...');
				this.reload();
				callback(this.getConfig());
			}
		});
	}
	
	// ========================================================================
	// Helpers
	// ========================================================================
	
	private parseNumber(value: string | undefined): number | undefined {
		if (value === undefined) return undefined;
		const num = parseInt(value, 10);
		return isNaN(num) ? undefined : num;
	}
	
	private parseBoolean(value: string | undefined): boolean | undefined {
		if (value === undefined) return undefined;
		return value === 'true' || value === '1' || value === 'yes';
	}
}

// Singleton instance
let configLoader: ConfigLoader | null = null;

export function getConfigLoader(): ConfigLoader {
	if (!configLoader) {
		configLoader = new ConfigLoader();
	}
	return configLoader;
}
