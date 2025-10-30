/**
 * Device Agent
 * 
 * Orchestrates all device-side operations:
 * - Container management
 * - Device provisioning
 * - System monitoring
 * - Device API server
 * - Logging
 */

import { createOrchestratorDriver } from './orchestrator/driver-factory.js';
import type { IOrchestratorDriver } from './orchestrator/driver-interface.js';
import ContainerManager from './compose/container-manager.js';
import { DeviceManager } from './provisioning/index.js';
import type { DeviceInfo } from './provisioning/types.js';
import { DeviceAPI } from './device-api/index.js';
import { router as v1Router } from './device-api/v1.js';
import { router as v2Router } from './device-api/v2.js';
import * as deviceActions from './device-api/actions.js';
import { ApiBinder } from './sync-state.js';
import * as db from './db.js';
import { LocalLogBackend } from './logging/local-backend.js';
import { MqttLogBackend } from './logging/mqtt-backend.js';
import { CloudLogBackend } from './logging/cloud-backend.js';
import { ContainerLogMonitor } from './logging/monitor.js';
import { AgentLogger } from './logging/agent-logger.js';
import type { LogBackend } from './logging/types.js';
import { SSHTunnelManager } from './features/remote-access/ssh-tunnel.js';
import { JobsFeature } from './features/jobs/src/jobs-feature.js';
import { SensorPublishFeature } from './features/sensor-publish/index.js';
import { SensorConfigHandler } from './features/sensor-publish/config-handler.js';
import { MqttManager } from './mqtt/mqtt-manager.js';
import { ProtocolAdaptersFeature, ProtocolAdaptersConfig } from './features/protocol-adapters/index.js';

export default class DeviceAgent {
	private orchestratorDriver!: IOrchestratorDriver;
	private containerManager!: ContainerManager;  // Keep for backward compatibility with DeviceAPI
	private deviceManager!: DeviceManager;
	private deviceInfo!: DeviceInfo;  // Cache device info after initialization
	private deviceAPI!: DeviceAPI;
	private apiBinder?: ApiBinder;
	private logBackend!: LocalLogBackend;
	private logBackends: LogBackend[] = [];
	private logMonitor?: ContainerLogMonitor;
	private agentLogger!: AgentLogger;  // Structured logging for agent-level events
	private sshTunnel?: SSHTunnelManager;
	private jobs?: JobsFeature;
	private sensorPublish?: SensorPublishFeature;
	private protocolAdapters?: ProtocolAdaptersFeature;
	private sensorConfigHandler?: SensorConfigHandler;

	// Cached target state (updated when target state changes)
	private cachedTargetState: any = null;
	
	// System settings (config-driven with env var defaults)
	private reconciliationIntervalMs: number;
	
	private readonly DEVICE_API_PORT = parseInt(process.env.DEVICE_API_PORT || '48484', 10);
	private readonly RECONCILIATION_INTERVAL = parseInt(
		process.env.RECONCILIATION_INTERVAL_MS || '30000',
		10
	);
	private readonly CLOUD_API_ENDPOINT = process.env.CLOUD_API_ENDPOINT || 'https://90bd9cd2-1a3d-44d4-8625-ec5fb7411bfb.mock.pstmn.io';

	constructor() {
		// Initialize with default from env var
		this.reconciliationIntervalMs = this.RECONCILIATION_INTERVAL;
	}

	public async init(): Promise<void> {

		try {
			// 1. Initialize logging FIRST (so all other components can use agentLogger)
			await this.initializeLogging();

			// 2. Initialize database
			await this.initializeDatabase();

			// 3. Initialize device provisioning
			await this.initializeDeviceManager();

			// 4. Initialize MQTT Manager (before any features that use MQTT)
			await this.initializeMqttManager();

			// 5. Initialize container manager
			await this.initializeContainerManager();

			// 6. Initialize device API
			await this.initializeDeviceAPI();

		// 7. Load config from cached target state (set during container manager init)
		//    Config-driven feature management with env var fallbacks for local dev
		const configFeatures = this.getConfigFeatures();
		const configSettings = this.getConfigSettings();
		const configLogging = this.getConfigLogging();
		
		// Get feature flags from config with environment variable fallbacks for local development
		const enableRemoteAccess = configFeatures.enableRemoteAccess ?? (process.env.ENABLE_REMOTE_ACCESS === 'true');
		const enableJobEngine = configFeatures.enableJobEngine ?? (process.env.ENABLE_JOB_ENGINE === 'true');
		const enableCloudJobs = configFeatures.enableCloudJobs ?? (process.env.ENABLE_CLOUD_JOBS === 'true');
		const enableSensorPublish = configFeatures.enableSensorPublish ?? (process.env.ENABLE_SENSOR_PUBLISH === 'true');
		const enableProtocolAdapters = configFeatures.enableProtocolAdapters ?? (process.env.ENABLE_PROTOCOL_ADAPTERS === 'true');
		const enableShadow = configFeatures.enableShadow ?? (process.env.ENABLE_SHADOW === 'true');
		
		// Get system settings from config (with defaults)
		const reconciliationIntervalMs = configSettings.reconciliationIntervalMs || this.RECONCILIATION_INTERVAL;
		const targetStatePollIntervalMs = configSettings.targetStatePollIntervalMs || parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
		const deviceReportIntervalMs = configSettings.deviceReportIntervalMs || parseInt(process.env.REPORT_INTERVAL_MS || '60000', 10);
		const metricsIntervalMs = configSettings.metricsIntervalMs || parseInt(process.env.METRICS_INTERVAL_MS || '300000', 10);
		
		// Get logging settings from config
		const logLevel = configLogging.level || 'info';
		
		// Apply log level if configured
		if (this.agentLogger && ['debug', 'info', 'warn', 'error'].includes(logLevel)) {
			this.agentLogger.setLogLevel(logLevel as 'debug' | 'info' | 'warn' | 'error');
		}
		
		// Update instance variable with config value
		this.reconciliationIntervalMs = reconciliationIntervalMs;

		this.agentLogger.infoSync('Loading configuration from target state', {
			component: 'Agent',
			features: {
				remoteAccess: enableRemoteAccess,
				jobEngine: enableJobEngine,
				cloudJobs: enableCloudJobs,
				sensorPublish: enableSensorPublish,
				protocolAdapters: enableProtocolAdapters,
				shadow: enableShadow
			},
			settings: {
				reconciliationIntervalMs,
				targetStatePollIntervalMs: configSettings.targetStatePollIntervalMs || parseInt(process.env.POLL_INTERVAL_MS || '60000', 10),
				deviceReportIntervalMs: configSettings.deviceReportIntervalMs || parseInt(process.env.REPORT_INTERVAL_MS || '60000', 10),
				metricsIntervalMs: configSettings.metricsIntervalMs || parseInt(process.env.METRICS_INTERVAL_MS || '300000', 10),
				cloudJobsPollingIntervalMs: configSettings.cloudJobsPollingIntervalMs || parseInt(process.env.CLOUD_JOBS_POLLING_INTERVAL || '30000', 10),
				shadowPublishIntervalMs: configSettings.shadowPublishIntervalMs || (process.env.SHADOW_PUBLISH_INTERVAL ? parseInt(process.env.SHADOW_PUBLISH_INTERVAL, 10) : undefined)
			},
			logging: {
				level: logLevel
			}
		});
		
	    // 9. Initialize SSH Reverse Tunnel (if enabled by config)
		    if (enableRemoteAccess) {
				await this.initializeRemoteAccess();
			}			
			
		// 10. Initialize Jobs Feature (MQTT primary + HTTP fallback)
		if (enableCloudJobs && enableJobEngine) {
			await this.initializeJobs(configSettings);
		}

		// 11. Initialize Sensor Publish Feature (if enabled by config)
		if (enableSensorPublish) {
			await this.initializeSensorPublish();
		}

		// 12. Initialize Protocol Adapters Feature (if enabled by config)
		if (enableProtocolAdapters) {
			await this.initializeProtocolAdapters(configFeatures);
		}

		// 13. Initialize API Binder (AFTER features are initialized so it can access sensor health)
		await this.initializeApiBinder(configSettings);

		// 14. Initialize Sensor Config Handler (if Sensor Publish enabled)
		await this.initializeSensorConfigHandler();

		// 16. Start auto-reconciliation
		this.startAutoReconciliation();		
		
		//Final words
		this.agentLogger.infoSync('Device Agent initialized successfully', {
				component: 'Agent',
				deviceApiPort: this.DEVICE_API_PORT,
				reconciliationInterval: this.reconciliationIntervalMs,
				cloudApiEndpoint: this.CLOUD_API_ENDPOINT || 'Not configured'
			});
	
		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize Device Agent', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent'
			});
			throw error;
		}
	}

	private async initializeLogging(): Promise<void> {

		// Local backend (always enabled)
		const enableFilePersistence = process.env.ENABLE_FILE_LOGGING !== 'false';
		this.logBackend = new LocalLogBackend({
			maxLogs: parseInt(process.env.MAX_LOGS || '1000', 10),
			maxAge: parseInt(process.env.LOG_MAX_AGE || '3600000', 10), // 1 hour
			enableFilePersistence,
			logDir: process.env.LOG_DIR || './data/logs',
			maxFileSize: parseInt(process.env.MAX_LOG_FILE_SIZE || '5242880', 10), // 5MB
		});
		await this.logBackend.initialize();
		this.logBackends.push(this.logBackend);
	
		// Create AgentLogger for structured agent-level logging

		this.agentLogger = new AgentLogger(this.logBackends);
		
		// We'll set device ID after device manager initialization
		this.agentLogger.infoSync('Agent logger initialized', {
			component: 'Agent',
			backendCount: this.logBackends.length
		});
	}

	private async initializeDatabase(): Promise<void> {
		await db.initialized();
		this.agentLogger.infoSync('Database initialized', { component: 'Agent' });
		
		// Import protocol adapter config from JSON files (one-time migration)
		try {
			const { importProtocolAdapterConfig } = await import('./config/import-protocol-config.js');
			await importProtocolAdapterConfig();
		} catch (error: any) {
			this.agentLogger.warnSync('Protocol adapter config import skipped', {
				component: 'Agent',
				error: error.message
			});
		}
	}

	private async initializeDeviceManager(): Promise<void> {
		this.deviceManager = new DeviceManager();
		await this.deviceManager.initialize();

		let deviceInfo = this.deviceManager.getDeviceInfo();
		
		// Auto-provision if not yet provisioned, cloud endpoint is set, AND provisioning key is available
		const provisioningApiKey = process.env.PROVISIONING_API_KEY;
		if (!deviceInfo.provisioned && provisioningApiKey && this.CLOUD_API_ENDPOINT) {
			this.agentLogger.infoSync('Auto-provisioning device with two-phase authentication', { 
				component: 'Agent' 
			});
			try {
				// Auto-detect system information if not provided via env vars
				const { getMacAddress, getOsVersion } = await import('./system-metrics.js');
				const macAddress = process.env.MAC_ADDRESS || await getMacAddress();
				const osVersion = process.env.OS_VERSION || await getOsVersion();
				
				this.agentLogger.infoSync('System information detected', {
					component: 'Agent',
					macAddress: macAddress ? `${macAddress.substring(0, 8)}...` : 'unknown',
					osVersion: osVersion || 'unknown'
				});
				
				await this.deviceManager.provision({
					provisioningApiKey, // Required for two-phase auth
					deviceName: process.env.DEVICE_NAME || `device-${deviceInfo.uuid.slice(0, 8)}`,
					deviceType: process.env.DEVICE_TYPE || 'standalone',
					apiEndpoint: this.CLOUD_API_ENDPOINT,
					applicationId: process.env.APPLICATION_ID ? parseInt(process.env.APPLICATION_ID, 10) : undefined,
					macAddress,
					osVersion,
					agentVersion: process.env.AGENT_VERSION || '1.0.0',
				});
				deviceInfo = this.deviceManager.getDeviceInfo();
				this.agentLogger.infoSync('Device auto-provisioned successfully', { component: 'Agent' });
			} catch (error: any) {
				this.agentLogger.errorSync('Auto-provisioning failed', error instanceof Error ? error : new Error(error.message), {
					component: 'Agent',
					note: 'Device will remain unprovisioned. Set PROVISIONING_API_KEY to retry.'
				});
			}
		} else if (!deviceInfo.provisioned && this.CLOUD_API_ENDPOINT && !provisioningApiKey) {
			this.agentLogger.warnSync('Device not provisioned', {
				component: 'Agent',
				note: 'Set PROVISIONING_API_KEY environment variable to enable auto-provisioning'
			});
		}
		
		// Cache device info for reuse across all methods
		this.deviceInfo = deviceInfo;
		
		// Now set the device ID on the logger
		this.agentLogger.setDeviceId(this.deviceInfo.uuid);
		
		this.agentLogger.infoSync('Device manager initialized', {
			component: 'Agent',
			uuid: this.deviceInfo.uuid,
			name: this.deviceInfo.deviceName || 'Not set',
			provisioned: this.deviceInfo.provisioned,
			hasApiKey: !!this.deviceInfo.deviceApiKey
		});
	}

	/**
	 * Initialize centralized MQTT Manager
	 * 
	 * This must be called BEFORE any features that use MQTT (logging, shadow, jobs).
	 * The MqttManager provides a single shared connection for all MQTT operations.
	 * 
	 * Uses MQTT credentials from device provisioning (mqttBrokerUrl, mqttUsername, mqttPassword).
	 * Falls back to environment variables (MQTT_BROKER, MQTT_USERNAME, MQTT_PASSWORD) if not provisioned.
	 */
	private async initializeMqttManager(): Promise<void> {
		this.agentLogger.infoSync('Initializing MQTT Manager', { component: 'Agent' });
		
		try {
			// Use MQTT credentials from provisioning if available, otherwise fall back to env vars
			const mqttBrokerUrl = this.deviceInfo.mqttBrokerUrl || process.env.MQTT_BROKER;
			const mqttUsername = this.deviceInfo.mqttUsername || process.env.MQTT_USERNAME;
			const mqttPassword = this.deviceInfo.mqttPassword || process.env.MQTT_PASSWORD;
			
			// Debug: Log broker URL being used
			this.agentLogger.infoSync(`🔍 MQTT Broker URL: ${mqttBrokerUrl}`, {
				component: 'Agent',
				source: this.deviceInfo.mqttBrokerUrl ? 'provisioning' : 'environment',
				hasUsername: !!mqttUsername
			});
			
			if (!mqttBrokerUrl) {
				this.agentLogger.infoSync('MQTT disabled - no broker URL provided', {
					component: 'Agent',
					note: 'Provision device or set MQTT_BROKER env var to enable'
				});
				return;
			}
			
			const mqttManager = MqttManager.getInstance();
			
			// Connect to MQTT broker with provisioned credentials
			await mqttManager.connect(mqttBrokerUrl, {
				clientId: `device_${this.deviceInfo.uuid}`,
				clean: true,
				reconnectPeriod: 5000,
				username: mqttUsername,
				password: mqttPassword,
			});
			
			// Enable debug mode if requested
			if (process.env.MQTT_DEBUG === 'true') {
				mqttManager.setDebug(true);
			}
			
			// Add MQTT backend to logging
			const enableCloudLogging = process.env.ENABLE_CLOUD_LOGGING !== 'false';
			if (enableCloudLogging) {
				try {
					const mqttLogBackend = new MqttLogBackend({
						brokerUrl: mqttBrokerUrl,
						baseTopic: `iot/device/${this.deviceInfo.uuid}/logs`,
						qos: 1,
						enableBatching: true,
						debug: process.env.MQTT_DEBUG === 'true'
					});
					await mqttLogBackend.connect();
					this.logBackends.push(mqttLogBackend);
					
					// Update agentLogger with new backend
					(this.agentLogger as any).logBackends = this.logBackends;
					
					this.agentLogger.infoSync('MQTT log backend initialized', {
						component: 'Agent'
					});
				} catch (error) {
					this.agentLogger.warnSync('Failed to initialize MQTT log backend', {
						component: 'Agent',
						error: error instanceof Error ? error.message : String(error),
						note: 'Continuing without MQTT logging'
					});
				}
			}
			
			// Add Cloud backend if configured
			if (this.CLOUD_API_ENDPOINT && enableCloudLogging) {
				try {
					const cloudLogBackend = new CloudLogBackend({
						cloudEndpoint: this.CLOUD_API_ENDPOINT,
						deviceUuid: this.deviceInfo.uuid,
						deviceApiKey: this.deviceInfo.apiKey,
						compression: process.env.LOG_COMPRESSION !== 'false',
					});
					await cloudLogBackend.initialize();
					this.logBackends.push(cloudLogBackend);
					
					// Update agentLogger with new backend
					(this.agentLogger as any).logBackends = this.logBackends;
					
					this.agentLogger.infoSync('Cloud log backend initialized', {
						component: 'Agent',
						cloudEndpoint: this.CLOUD_API_ENDPOINT
					});
				} catch (error) {
					this.agentLogger.warnSync('Failed to initialize cloud log backend', {
						component: 'Agent',
						error: error instanceof Error ? error.message : String(error),
						note: 'Continuing without cloud logging'
					});
				}
			}
			
			this.agentLogger.infoSync('MQTT Manager connected', {
				component: 'Agent',
				brokerUrl: mqttBrokerUrl,
				clientId: `device_${this.deviceInfo.uuid}`,
				username: mqttUsername || '(none)',
				credentialsSource: this.deviceInfo.mqttUsername ? 'provisioning' : 'environment',
				debugMode: process.env.MQTT_DEBUG === 'true',
				totalLogBackends: this.logBackends.length
			});
		} catch (error) {
			this.agentLogger.errorSync('Failed to initialize MQTT Manager', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'MQTT features will be unavailable'
			});
			// Don't throw - allow agent to continue without MQTT
		}
	}

	private async initializeContainerManager(): Promise<void> {
		this.agentLogger?.infoSync('Initializing orchestrator driver', { component: 'Agent' });
		
		// Get orchestrator type from env var (config can override after initialization via target state)
		const orchestratorType = (process.env.ORCHESTRATOR_TYPE as 'docker' | 'k3s') || 'docker';
		
		this.agentLogger?.infoSync('Creating orchestrator driver', {
			component: 'Agent',
			type: orchestratorType
		});

		// Create and initialize orchestrator driver
		this.orchestratorDriver = await createOrchestratorDriver({
			orchestrator: orchestratorType,
			logger: this.agentLogger
		});

		// For backward compatibility, keep ContainerManager reference for DeviceAPI
		// The DockerDriver wraps ContainerManager internally
		if (orchestratorType === 'docker') {
			const dockerDriver = this.orchestratorDriver as any;
			if (dockerDriver.containerManager) {
				this.containerManager = dockerDriver.containerManager;
			}
		}

		// Set up log monitor if using Docker
		if (this.containerManager) {
			const docker = this.containerManager.getDocker();
			if (docker) {
				// Use all configured log backends
				this.logMonitor = new ContainerLogMonitor(docker, this.logBackends);
				this.containerManager.setLogMonitor(this.logMonitor);
				await this.containerManager.attachLogsToAllContainers();
				this.agentLogger?.infoSync('Log monitor attached to container manager', {
					component: 'Agent',
					backendCount: this.logBackends.length
				});
			}
		}

		// Watch for target state changes to dynamically update config and cache
		this.orchestratorDriver.on('target-state-changed', (newState: any) => {
			// Update cached target state
			this.updateCachedTargetState();
			
			// Handle config updates
			if (newState.config) {
				this.handleConfigUpdate(newState.config);
			}
		});

		// Initialize cache with current target state
		this.updateCachedTargetState();

		this.agentLogger?.infoSync('Orchestrator driver initialized', {
			component: 'Agent',
			driver: this.orchestratorDriver.name,
			version: this.orchestratorDriver.version
		});
	}

	private async initializeDeviceAPI(): Promise<void> {
		this.agentLogger?.infoSync('Initializing device API', { component: 'Agent' });

		// Initialize device actions with managers
		deviceActions.initialize(this.containerManager, this.deviceManager);

		// Health checks
		const healthchecks = [
			async () => {
				try {
					this.containerManager.getStatus();
					return true;
				} catch {
					return false;
				}
			},
		];

		// Create device API with routers
		this.deviceAPI = new DeviceAPI({
			routers: [v1Router, v2Router],
			healthchecks,
		});

		// Start listening
		await this.deviceAPI.listen(this.DEVICE_API_PORT);
		this.agentLogger?.infoSync('Device API started', {
			component: 'Agent',
			port: this.DEVICE_API_PORT
		});
	}

	private async initializeApiBinder(configSettings: Record<string, any>): Promise<void> {
		if (!this.CLOUD_API_ENDPOINT) {
			this.agentLogger?.warnSync('Cloud API endpoint not configured - running in standalone mode', {
				component: 'Agent',
				note: 'Set CLOUD_API_ENDPOINT env var to enable cloud features'
			});
			return;
		}

		this.agentLogger?.infoSync('Initializing API Binder', {
			component: 'Agent',
			cloudApiEndpoint: this.CLOUD_API_ENDPOINT
		});
		
		// Get intervals from config (passed as parameter during init)
		const targetStatePollIntervalMs = configSettings.targetStatePollIntervalMs || parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
		const deviceReportIntervalMs = configSettings.deviceReportIntervalMs || parseInt(process.env.REPORT_INTERVAL_MS || '60000', 10);
		const metricsIntervalMs = configSettings.metricsIntervalMs || parseInt(process.env.METRICS_INTERVAL_MS || '300000', 10);
		
		this.apiBinder = new ApiBinder(
			this.containerManager,
			this.deviceManager,
			{
				cloudApiEndpoint: this.CLOUD_API_ENDPOINT,
				pollInterval: targetStatePollIntervalMs, // Use config value or default 60s
				reportInterval: deviceReportIntervalMs, // Use config value or default 60s
				metricsInterval: metricsIntervalMs, // Use config value or default 5min
			},
			this.agentLogger,  // Pass the agent logger
			this.sensorPublish,  // Pass sensor-publish for health reporting
			this.protocolAdapters  // Pass protocol-adapters for health reporting
		);
		
		// Reinitialize device actions with apiBinder for connection health endpoint
		deviceActions.initialize(this.containerManager, this.deviceManager, this.apiBinder);

		// Listen for target state changes to handle config updates
		this.containerManager.on('target-state-changed', async (targetState) => {
			if (targetState.config) {
				this.agentLogger?.infoSync('Processing config from target state update', {
					component: 'Agent'
				});
				await this.handleConfigUpdate(targetState.config);
			}
		});

		// Start polling for target state
		await this.apiBinder.startPoll();

		// Start reporting current state
		await this.apiBinder.startReporting();

	}

	private async initializeRemoteAccess(): Promise<void> {
		const cloudHost = process.env.CLOUD_HOST;
		if (!cloudHost) {
			this.agentLogger?.errorSync('CLOUD_HOST environment variable required for remote access', undefined, {
				component: 'Agent',
				feature: 'RemoteAccess'
			});
			return;
		}

		this.agentLogger?.infoSync('Initializing SSH reverse tunnel', {
			component: 'Agent',
			cloudHost,
			localPort: this.DEVICE_API_PORT
		});

		try {
			this.sshTunnel = new SSHTunnelManager({
				cloudHost,
				cloudPort: parseInt(process.env.CLOUD_SSH_PORT || '22', 10),
				localPort: this.DEVICE_API_PORT,
				sshUser: process.env.SSH_TUNNEL_USER || 'tunnel',
				sshKeyPath: process.env.SSH_KEY_PATH || '/data/ssh/id_rsa',
				autoReconnect: process.env.SSH_AUTO_RECONNECT !== 'false',
				reconnectDelay: parseInt(process.env.SSH_RECONNECT_DELAY || '5000', 10),
			});

			await this.sshTunnel.connect();
			this.agentLogger?.infoSync('Remote access enabled via SSH tunnel', {
				component: 'Agent',
				accessEndpoint: `${cloudHost}:${this.DEVICE_API_PORT}`
			});
		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize SSH tunnel', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'Continuing without remote access'
			});
			this.sshTunnel = undefined;
		}
	}

	private async initializeJobs(configSettings: Record<string, any>): Promise<void> {
		try {
			// Get cloud API URL from environment
			const cloudApiUrl = process.env.CLOUD_API_URL || this.CLOUD_API_ENDPOINT;
			if (!cloudApiUrl) {
				this.agentLogger?.errorSync('CLOUD_API_URL not configured', undefined, {
					component: 'Agent',
					note: 'Set CLOUD_API_URL environment variable (e.g., http://your-cloud-server:4002/api/v1)'
				});
				return;
			}

			// Get polling interval from config (passed as parameter during init)
			const pollingIntervalMs = configSettings.cloudJobsPollingIntervalMs || 
				parseInt(process.env.CLOUD_JOBS_POLLING_INTERVAL || '30000', 10);

			// Create and start Jobs Feature
			this.jobs = new JobsFeature(
				{
					enabled: true,
					cloudApiUrl,
					deviceApiKey: this.deviceInfo.apiKey,
					pollingIntervalMs,
					maxRetries: 3,
					handlerDirectory: process.env.JOB_HANDLER_DIR || '/app/data/job-handlers',
					maxConcurrentJobs: 1,
					defaultHandlerTimeout: 60000
				},
				this.agentLogger,
				this.deviceInfo.uuid
			);

			await this.jobs.start();

			this.agentLogger?.infoSync('Jobs Feature initialized', {
				component: 'Agent',
				mode: this.jobs.getCurrentMode(),
				mqttActive: this.jobs.isMqttActive(),
				httpActive: this.jobs.isHttpActive()
			});

		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize Jobs Feature', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'Continuing without Jobs'
			});
			this.jobs = undefined;
		}
	}

	private async initializeSensorPublish(): Promise<void> {
		this.agentLogger?.infoSync('Initializing Sensor Publish Feature', { component: 'Agent' });

		try {
			// Parse sensor configuration from environment (fallback)
			let envSensors: any[] = [];
			const sensorConfigStr = process.env.SENSOR_PUBLISH_CONFIG;
			if (sensorConfigStr) {
				try {
					const envConfig = JSON.parse(sensorConfigStr);
					envSensors = envConfig.sensors || [];
					this.agentLogger?.debugSync('Loaded sensor config from environment variable', {
						component: 'Agent',
						sensorCount: envSensors.length
					});
				} catch (error) {
					this.agentLogger?.errorSync('Failed to parse SENSOR_PUBLISH_CONFIG', error instanceof Error ? error : new Error(String(error)), {
						component: 'Agent'
					});
				}
			}

			// Get sensor configuration from target state (takes precedence)
			let targetStateSensors: any[] = [];
			try {
				const targetState = this.containerManager?.getTargetState();
				if (targetState?.config?.sensors && Array.isArray(targetState.config.sensors)) {
					targetStateSensors = targetState.config.sensors;
					this.agentLogger?.debugSync('Loaded sensor config from target state', {
						component: 'Agent',
						sensorCount: targetStateSensors.length
					});
				}
			} catch (error) {
				this.agentLogger?.debugSync('Could not load sensors from target state', {
					component: 'Agent',
					error: error instanceof Error ? error.message : String(error)
				});
			}

			// Merge configurations: env sensors as base, target state sensors override/add
			const mergedSensors = [...envSensors];
			for (const targetSensor of targetStateSensors) {
				const existingIndex = mergedSensors.findIndex((s: any) => s.name === targetSensor.name);
				if (existingIndex >= 0) {
					// Override existing sensor from env with target state config
					mergedSensors[existingIndex] = targetSensor;
				} else {
					// Add new sensor from target state
					mergedSensors.push(targetSensor);
				}
			}

			// If no sensors configured at all, log warning and skip initialization
			if (mergedSensors.length === 0) {
				this.agentLogger?.warnSync('No sensor configurations found', {
					component: 'Agent',
					note: 'Add sensors via dashboard or set SENSOR_PUBLISH_CONFIG environment variable'
				});
				return;
			}

			// Build final configuration
			const sensorConfig = {
				enabled: true,
				sensors: mergedSensors
			};

			// Create and start sensor publish feature
			this.sensorPublish = new SensorPublishFeature(
				sensorConfig as any,
				this.agentLogger!,
				this.deviceInfo.uuid
			);

			await this.sensorPublish.start();
			
			this.agentLogger?.infoSync('Sensor Publish Feature initialized', {
				component: 'Agent',
				sensorsConfigured: mergedSensors.length,
				fromEnv: envSensors.length,
				fromTargetState: targetStateSensors.length,
				mqttTopicPattern: 'iot/device/{deviceUuid}/sensor/{topic}'
			});
		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize Sensor Publish', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'Continuing without Sensor Publish'
			});
			this.sensorPublish = undefined;
		}
	}

	private async initializeProtocolAdapters(configFeatures: Record<string, any>): Promise<void> {
		try {
			// Get protocol adapters configuration (passed as parameter during init)
			const protocolAdaptersConfig: ProtocolAdaptersConfig = {
				enabled: true,
				...configFeatures.protocolAdapters
			};

			// Check environment variable for config override
			const envConfigStr = process.env.PROTOCOL_ADAPTERS_CONFIG;
			if (envConfigStr) {
				try {
					const envConfig = JSON.parse(envConfigStr);
					Object.assign(protocolAdaptersConfig, envConfig);
					this.agentLogger?.debugSync('Loaded protocol adapters config from PROTOCOL_ADAPTERS_CONFIG', {
						component: 'Agent'
					});
				} catch (error) {
					this.agentLogger?.warnSync('Failed to parse PROTOCOL_ADAPTERS_CONFIG, using target state config', {
						component: 'Agent'
					});
				}
			}

			// Check if any adapters are enabled
			const hasEnabledAdapters = 
				protocolAdaptersConfig.modbus?.enabled ||
				protocolAdaptersConfig.can?.enabled ||
				protocolAdaptersConfig.opcua?.enabled;

			if (!hasEnabledAdapters) {
				this.agentLogger?.warnSync('Protocol adapters feature enabled but no adapters configured', {
					component: 'Agent',
					note: 'Configure adapters in target state features.protocolAdapters or PROTOCOL_ADAPTERS_CONFIG env var'
				});
				return;
			}

			// Create and start protocol adapters feature using BaseFeature pattern
			this.protocolAdapters = new ProtocolAdaptersFeature(
				protocolAdaptersConfig,
				this.agentLogger,
				this.deviceInfo.uuid
			);
			await this.protocolAdapters.start();

		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize Protocol Adapters', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'Continuing without Protocol Adapters'
			});
			this.protocolAdapters = undefined;
		}
	}


	private async initializeSensorConfigHandler(): Promise<void> {
		// Only initialize if Sensor Publish is enabled
		if (!this.sensorPublish) {
			return;
		}

		this.agentLogger?.infoSync('Initializing Sensor Config Handler', { component: 'Agent' });

		try {
			// Create sensor config handler
			this.sensorConfigHandler = new SensorConfigHandler(
				this.sensorPublish
			);

			// Start listening for delta events
			this.sensorConfigHandler.start();

			// Report initial sensor state
			try {
				const sensors = this.sensorPublish.getSensors();
				const sensorStates: Record<string, any> = {};
				
				// Add sensor-publish sensors
				sensors.forEach(sensor => {
					sensorStates[sensor.name] = {
						enabled: sensor.enabled,
						addr: sensor.addr,
						publishInterval: sensor.publishInterval
					};
				});
				
				// Add protocol adapter device statuses (modbus, can, opcua, etc.)
				if (this.protocolAdapters) {
					const allDeviceStatuses = this.protocolAdapters.getAllDeviceStatuses();
					
					// Iterate through each protocol type (modbus, can, opcua, etc.)
					allDeviceStatuses.forEach((devices, protocolType) => {
						devices.forEach(device => {
							// Create unique key: {protocol}-{deviceName}
							const sensorKey = `${protocolType}-${device.deviceName}`;
							sensorStates[sensorKey] = {
								type: protocolType,
								deviceName: device.deviceName,
								connected: device.connected,
								lastPoll: device.lastPoll?.toISOString() || null,
								errorCount: device.errorCount,
								lastError: device.lastError
							};
						});
					});
				}
			} catch (error) {
				this.agentLogger?.errorSync('Failed to report initial sensor state', error instanceof Error ? error : new Error(String(error)), {
					component: 'Agent'
				});
			}
				
		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize Sensor Config Handler', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'Continuing without remote sensor configuration'
			});
			this.sensorConfigHandler = undefined;
		}
	}


	private startAutoReconciliation(): void {
		this.containerManager.startAutoReconciliation(this.reconciliationIntervalMs);
		this.agentLogger?.infoSync('Auto-reconciliation started', {
			component: 'Agent',
			intervalMs: this.reconciliationIntervalMs
		});
	}

	/**
	 * Handle configuration updates from target state
	 * This is called whenever config changes in device_target_state
	 */
	private async handleConfigUpdate(config: Record<string, any>): Promise<void> {
		this.agentLogger?.info('📋 Processing configuration update', {
			category: 'Agent',
			configKeys: Object.keys(config).length,
			keys: Object.keys(config),
			hasProtocolAdapterDevices: !!config.protocolAdapterDevices,
			protocolDeviceCount: config.protocolAdapterDevices?.length || 0
		});

		try {
			// Logging Config - Update log level dynamically
			if (config.logging) {
				this.agentLogger?.debug('Logging configuration detected', { category: 'Agent' });
				const logging = config.logging;
				
				// Update log level
				if (logging.level !== undefined) {
					const validLevels = ['debug', 'info', 'warn', 'error'];
					const newLevel = logging.level;
					
					if (validLevels.includes(newLevel)) {
						const currentLevel = this.agentLogger?.getLogLevel();
						
						if (newLevel !== currentLevel) {
							this.agentLogger?.debug('Updating log level', {
								category: 'Agent',
								from: currentLevel,
								to: newLevel
							});
							this.agentLogger?.setLogLevel(newLevel as 'debug' | 'info' | 'warn' | 'error');
							this.agentLogger?.debug('Log level updated successfully', {
								category: 'Agent',
								newLevel
							});
						} else {
							this.agentLogger?.debug('Log level already set', {
								category: 'Agent',
								level: currentLevel
							});
						}
					} else {
						this.agentLogger?.warn('Invalid log level', {
							category: 'Agent',
							invalidLevel: newLevel,
							validLevels
						});
					}
				}
			}
			
			// Settings Config - Update system settings dynamically
			if (config.settings) {
				this.agentLogger?.debug('Settings configuration detected', { category: 'Agent' });
				const settings = config.settings;
				
				// Update reconciliation interval
				if (settings.reconciliationIntervalMs !== undefined) {
					const newInterval = settings.reconciliationIntervalMs;
					const currentInterval = this.reconciliationIntervalMs;
					
					if (newInterval !== currentInterval) {
						this.agentLogger?.debug('Updating reconciliation interval', {
							category: 'Agent',
							fromMs: currentInterval,
							toMs: newInterval
						});
						this.reconciliationIntervalMs = newInterval;
						
						// Restart auto-reconciliation with new interval
						this.containerManager.stopAutoReconciliation();
						this.containerManager.startAutoReconciliation(newInterval);
						this.agentLogger?.debug('Reconciliation interval updated successfully', {
							category: 'Agent',
							intervalMs: newInterval
						});
					} else {
						this.agentLogger?.debug('Reconciliation interval already set', {
							category: 'Agent',
							intervalMs: currentInterval
						});
					}
				}
				
				// Update device report interval
				if (settings.deviceReportIntervalMs !== undefined) {
					const newInterval = settings.deviceReportIntervalMs;
					const currentInterval = this.apiBinder?.['config']?.reportInterval;
					
					if (currentInterval && newInterval !== currentInterval) {
						this.agentLogger?.debug('Updating device report interval', {
							category: 'Agent',
							fromMs: currentInterval,
							toMs: newInterval
						});
						
						// Update the API binder's report interval
						if (this.apiBinder) {
							(this.apiBinder as any).config.reportInterval = newInterval;
							this.agentLogger?.debug('Device report interval updated successfully', {
								category: 'Agent',
								intervalMs: newInterval
							});
						}
					}
				}
				
				// Update target state poll interval
				if (settings.targetStatePollIntervalMs !== undefined) {
					const newInterval = settings.targetStatePollIntervalMs;
					const currentInterval = this.apiBinder?.['config']?.pollInterval;
					
					if (currentInterval && newInterval !== currentInterval) {
						this.agentLogger?.debug('Updating target state poll interval', {
							category: 'Agent',
							fromMs: currentInterval,
							toMs: newInterval
						});
						
						// Update the API binder's poll interval
						if (this.apiBinder) {
							(this.apiBinder as any).config.pollInterval = newInterval;
							this.agentLogger?.debug('Target state poll interval updated successfully', {
								category: 'Agent',
								intervalMs: newInterval
							});
						}
					}
				}
				
				// Update metrics interval
				if (settings.metricsIntervalMs !== undefined) {
					const newInterval = settings.metricsIntervalMs;
					const currentInterval = this.apiBinder?.['config']?.metricsInterval;
					
					if (currentInterval && newInterval !== currentInterval) {
						this.agentLogger?.debug('Updating metrics interval', {
							category: 'Agent',
							fromMs: currentInterval,
							toMs: newInterval
						});
						
						// Update the API binder's metrics interval
						if (this.apiBinder) {
							(this.apiBinder as any).config.metricsInterval = newInterval;
							this.agentLogger?.debug('Metrics interval updated successfully', {
								category: 'Agent',
								intervalMs: newInterval
							});
						}
					}
				}
				
			// Update cloud jobs polling interval
			if (settings.cloudJobsPollingIntervalMs !== undefined && this.jobs) {
				const newInterval = settings.cloudJobsPollingIntervalMs;
				const currentInterval = (this.jobs as any).config?.pollingIntervalMs;
				
				if (currentInterval && newInterval !== currentInterval) {
					this.agentLogger?.debug('Updating cloud jobs polling interval', {
						category: 'Agent',
						fromMs: currentInterval,
						toMs: newInterval
					});
					
					// Update the Jobs's polling interval
					(this.jobs as any).config.pollingIntervalMs = newInterval;
					
					// Restart Jobs with new interval
					await this.jobs.stop();
					await this.jobs.start();
					
					this.agentLogger?.debug('Cloud jobs polling interval updated successfully', {
						category: 'Agent',
						intervalMs: newInterval
					});
				}
			}
			
			}
			
			// Features Config - Enable/disable features dynamically
			if (config.features) {
				this.agentLogger?.debug('Features configuration detected', { category: 'Agent' });
				const features = config.features;
				
				// Enable/disable Remote Access dynamically
				if (features.enableRemoteAccess !== undefined) {
					const isCurrentlyEnabled = !!this.sshTunnel;
					const shouldBeEnabled = features.enableRemoteAccess;
					
					if (shouldBeEnabled === isCurrentlyEnabled) {
						this.agentLogger?.debug('Remote Access already in desired state', {
							category: 'Agent',
							enabled: shouldBeEnabled
						});
					} else if (shouldBeEnabled && !isCurrentlyEnabled) {
						this.agentLogger?.debug('Enabling Remote Access', { category: 'Agent' });
						await this.initializeRemoteAccess();
					} else if (!shouldBeEnabled && isCurrentlyEnabled) {
						this.agentLogger?.debug('Disabling Remote Access', { category: 'Agent' });
						await this.sshTunnel!.disconnect();
						this.sshTunnel = undefined;
						this.agentLogger?.debug('Remote Access disabled successfully', { category: 'Agent' });
					}
				}
				
				// Enable/disable Jobs dynamically
				if (features.enableJobEngine !== undefined || features.enableCloudJobs !== undefined) {
					const isCurrentlyEnabled = !!this.jobs;
					const shouldBeEnabled = (features.enableCloudJobs ?? !!this.jobs) && 
					                       (features.enableJobEngine ?? !!this.jobs);
					
					if (shouldBeEnabled === isCurrentlyEnabled) {
						this.agentLogger?.debug('Jobs already in desired state', {
							category: 'Agent',
							enabled: shouldBeEnabled
						});
					} else if (shouldBeEnabled && !isCurrentlyEnabled) {
						this.agentLogger?.debug('Enabling Jobs', { category: 'Agent' });
						await this.initializeJobs(this.getConfigSettings());
					} else if (!shouldBeEnabled && isCurrentlyEnabled) {
						this.agentLogger?.debug('Disabling Jobs', { category: 'Agent' });
						await this.jobs!.stop();
						this.jobs = undefined;
						this.agentLogger?.debug('Jobs disabled successfully', { category: 'Agent' });
					}
				}				// Enable/disable Sensor Publish dynamically
				if (features.enableSensorPublish !== undefined) {
					const isCurrentlyEnabled = !!this.sensorPublish;
					const shouldBeEnabled = features.enableSensorPublish;
					
					if (shouldBeEnabled === isCurrentlyEnabled) {
						this.agentLogger?.debugSync('Sensor Publish already in desired state', {
							category: 'Agent',
							enabled: shouldBeEnabled
						});
					} else if (shouldBeEnabled && !isCurrentlyEnabled) {
						this.agentLogger?.infoSync('Enabling Sensor Publish', { category: 'Agent' });
						await this.initializeSensorPublish();
					} else if (!shouldBeEnabled && isCurrentlyEnabled) {
						this.agentLogger?.infoSync('Disabling Sensor Publish', { category: 'Agent' });
						await this.sensorPublish!.stop();
						this.sensorPublish = undefined;
						this.agentLogger?.infoSync('Sensor Publish disabled successfully', { category: 'Agent' });
					}
				}

				// Enable/disable Protocol Adapters dynamically
				if (features.enableProtocolAdapters !== undefined) {
					const isCurrentlyEnabled = !!this.protocolAdapters;
					const shouldBeEnabled = features.enableProtocolAdapters;
					
					if (shouldBeEnabled === isCurrentlyEnabled) {
						this.agentLogger?.debugSync('Protocol Adapters already in desired state', {
							category: 'Agent',
							enabled: shouldBeEnabled
						});
					} else if (shouldBeEnabled && !isCurrentlyEnabled) {
						this.agentLogger?.infoSync('Enabling Protocol Adapters', { category: 'Agent' });
						await this.initializeProtocolAdapters(this.getConfigFeatures());
					} else if (!shouldBeEnabled && isCurrentlyEnabled) {
						this.agentLogger?.infoSync('Disabling Protocol Adapters', { category: 'Agent' });
						await this.protocolAdapters!.stop();
						this.protocolAdapters = undefined;
						this.agentLogger?.infoSync('Protocol Adapters disabled successfully', { category: 'Agent' });
					}
				}


				// Log other feature flags for future implementation
				if (features.pollingIntervalMs !== undefined) {
					this.agentLogger?.debugSync('Polling interval configured', {
						category: 'Agent',
						pollingIntervalMs: features.pollingIntervalMs
					});
				}
				if (features.enableHealthChecks !== undefined) {
					this.agentLogger?.debugSync('Health checks configured', {
						category: 'Agent',
						enabled: features.enableHealthChecks
					});
				}
			}

			// Sensors Config - Update sensor configurations dynamically
			if (config.sensors && Array.isArray(config.sensors) && this.sensorPublish) {
				this.agentLogger?.debug('Sensor configuration detected', { 
					category: 'Agent',
					sensorCount: config.sensors.length
				});
				
				try {
					// Get current sensor config
					const currentConfig = (this.sensorPublish as any).config;
					
					// Merge target state sensors with existing sensors from env var
					// Target state sensors take precedence
					const existingSensors: any[] = currentConfig.sensors || [];
					const targetSensors: any[] = config.sensors;
					
					// Combine: start with existing, then add/override with target state
					const mergedSensors = [...existingSensors];
					
					// Add or update sensors from target state
					for (const targetSensor of targetSensors) {
						const existingIndex = mergedSensors.findIndex((s: any) => s.name === targetSensor.name);
						if (existingIndex >= 0) {
							// Update existing sensor
							mergedSensors[existingIndex] = targetSensor;
							this.agentLogger?.debug('Updated sensor configuration', {
								category: 'Agent',
								sensorName: targetSensor.name
							});
						} else {
							// Add new sensor
							mergedSensors.push(targetSensor);
							this.agentLogger?.info('Added new sensor configuration', {
								category: 'Agent',
								sensorName: targetSensor.name,
								addr: targetSensor.addr
							});
						}
					}
					
					// Update the sensor publish feature configuration
					currentConfig.sensors = mergedSensors;
					
					// Restart sensor publish to apply changes
					await this.sensorPublish.stop();
					await this.sensorPublish.start();
					
					this.agentLogger?.info('Sensor configuration updated successfully', {
						category: 'Agent',
						totalSensors: mergedSensors.length,
						targetStateSensors: targetSensors.length
					});
				} catch (error) {
					this.agentLogger?.errorSync('Failed to update sensor configuration', error instanceof Error ? error : new Error(String(error)), {
						category: 'Agent'
					});
				}
			}

			// Protocol Adapter Devices - Update device configurations dynamically
			if (config.protocolAdapterDevices && Array.isArray(config.protocolAdapterDevices)) {
				this.agentLogger?.info('📥 Protocol adapter device configuration detected', { 
					category: 'Agent',
					deviceCount: config.protocolAdapterDevices.length,
					devices: config.protocolAdapterDevices.map((d: any) => `${d.name} (${d.protocol})`).join(', ')
				});
				
				try {
					const { ProtocolAdapterDeviceModel } = await import('./models/protocol-adapter-device.model.js');
					
					// Get current devices from SQLite to detect deletions
					const currentDevices = await ProtocolAdapterDeviceModel.getAll();
					const targetDeviceNames = new Set(config.protocolAdapterDevices.map(d => d.name));
					
					// Sync each device to SQLite
					for (const device of config.protocolAdapterDevices) {
						const existing = await ProtocolAdapterDeviceModel.getByName(device.name);
						
						if (existing) {
							await ProtocolAdapterDeviceModel.update(device.name, device);
							this.agentLogger?.info('Updated protocol adapter device', {
								category: 'Agent',
								deviceName: device.name,
								protocol: device.protocol
							});
						} else {
							await ProtocolAdapterDeviceModel.create(device);
							this.agentLogger?.info('Added protocol adapter device', {
								category: 'Agent',
								deviceName: device.name,
								protocol: device.protocol
							});
						}
					}
					
					// Delete devices that are no longer in target state
					for (const currentDevice of currentDevices) {
						if (!targetDeviceNames.has(currentDevice.name)) {
							await ProtocolAdapterDeviceModel.delete(currentDevice.name);
							this.agentLogger?.info('Removed protocol adapter device', {
								category: 'Agent',
								deviceName: currentDevice.name,
								protocol: currentDevice.protocol
							});
						}
					}
					
					// Restart protocol adapters to apply changes
					if (this.protocolAdapters) {
						this.agentLogger?.info('Restarting protocol adapters to apply configuration changes', {
							category: 'Agent'
						});
						await this.protocolAdapters.stop();
						await this.initializeProtocolAdapters(this.getConfigFeatures());
					}
					
				} catch (error) {
					this.agentLogger?.errorSync('Failed to sync protocol adapter devices', error instanceof Error ? error : new Error(String(error)), {
						category: 'Agent'
					});
				}
			}

			this.agentLogger?.infoSync('Configuration update processed successfully', {
				category: 'Agent'
			});
		} catch (error) {
			this.agentLogger?.errorSync('Failed to process config update', error instanceof Error ? error : new Error(String(error)), {
				category: 'Agent'
			});
		}
	}

	public async stop(): Promise<void> {
		this.agentLogger?.infoSync('Stopping Device Agent', { component: 'Agent' });

		try {
		
			// Stop Sensor Publish
			if (this.sensorPublish) {
				await this.sensorPublish.stop();
				this.agentLogger?.infoSync('Sensor Publish stopped', { component: 'Agent' });
			}

			// Stop Protocol Adapters
			if (this.protocolAdapters) {
				await this.protocolAdapters.stop();
				this.agentLogger?.infoSync('Protocol Adapters stopped', { component: 'Agent' });
			}

			// Stop Sensor Config Handler
			if (this.sensorConfigHandler) {
				// No explicit stop method, just clear reference
				this.agentLogger?.infoSync('Sensor Config Handler cleanup', { component: 'Agent' });
			}

		// Stop Jobs Feature (handles both MQTT and HTTP)
		if (this.jobs) {
			await this.jobs.stop();
			this.agentLogger?.infoSync('Jobs Feature stopped', { component: 'Agent' });
		}			// Stop SSH tunnel
			if (this.sshTunnel) {
				await this.sshTunnel.disconnect();
				this.agentLogger?.infoSync('SSH tunnel stopped', { component: 'Agent' });
			}

			// Stop API binder
			if (this.apiBinder) {
				await this.apiBinder.stop();
				this.agentLogger?.infoSync('API Binder stopped', { component: 'Agent' });
			}

			// Stop log backends (flush buffers, clear timers)
			this.agentLogger?.infoSync('Stopping log backends', { component: 'Agent' });
			for (const backend of this.logBackends) {
				try {
					if ('disconnect' in backend && typeof backend.disconnect === 'function') {
						await backend.disconnect();
					} else if ('stop' in backend && typeof backend.stop === 'function') {
						await (backend as any).stop();
					}
				} catch (error) {
					this.agentLogger?.warnSync('Error stopping log backend', {
						component: 'Agent',
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
			this.agentLogger?.infoSync('Log backends stopped', { component: 'Agent' });

			// Stop MQTT Manager (shared singleton - do this after all MQTT-dependent features)
			const mqttManager = MqttManager.getInstance();
			if (mqttManager.isConnected()) {
				await mqttManager.disconnect();
				this.agentLogger?.infoSync('MQTT Manager disconnected', { component: 'Agent' });
			}

			// Stop device API
			if (this.deviceAPI) {
				await this.deviceAPI.stop();
				this.agentLogger?.infoSync('Device API stopped', { component: 'Agent' });
			}

			// Stop container manager
			if (this.containerManager) {
				this.containerManager.stopAutoReconciliation();
				this.agentLogger?.infoSync('Container manager stopped', { component: 'Agent' });
			}

			this.agentLogger?.infoSync('Device Agent stopped successfully', { component: 'Agent' });
		} catch (error) {
			this.agentLogger?.errorSync('Error stopping Device Agent', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent'
			});
			throw error;
		}
	}

	/**
	 * Update cached target state
	 * Called when target state changes to keep cache in sync
	 */
	private updateCachedTargetState(): void {
		this.cachedTargetState = this.containerManager.getTargetState();
	}

	/**
	 * Get config features from cached target state
	 */
	private getConfigFeatures(): Record<string, any> {
		return this.cachedTargetState?.config?.features || {};
	}

	/**
	 * Get config settings from cached target state
	 */
	private getConfigSettings(): Record<string, any> {
		return this.cachedTargetState?.config?.settings || {};
	}

	/**
	 * Get config logging from cached target state
	 */
	private getConfigLogging(): Record<string, any> {
		return this.cachedTargetState?.config?.logging || {};
	}

	// Getters for external access (if needed)
	public getContainerManager(): ContainerManager {
		return this.containerManager;
	}

	public getDeviceManager(): DeviceManager {
		return this.deviceManager;
	}

	public getDeviceAPI(): DeviceAPI {
		return this.deviceAPI;
	}

	public getJobEngine() {
		return this.jobs?.getJobEngine();
	}
}
