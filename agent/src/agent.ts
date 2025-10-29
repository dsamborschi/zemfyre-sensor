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
import { ApiBinder } from './api-binder.js';
import * as db from './db.js';
import { LocalLogBackend } from './logging/local-backend.js';
import { MqttLogBackend } from './logging/mqtt-backend.js';
import { CloudLogBackend } from './logging/cloud-backend.js';
import { ContainerLogMonitor } from './logging/monitor.js';
import { AgentLogger } from './logging/agent-logger.js';
import type { LogBackend } from './logging/types.js';
import { SSHTunnelManager } from './remote-access/ssh-tunnel.js';
import { JobEngine } from './jobs/src/job-engine.js';
import { CloudJobsAdapter } from './jobs/cloud-jobs-adapter.js';
import { createJobsFeature, JobsFeature } from './jobs/src/index.js';
import { JobsMqttConnectionAdapter } from './mqtt/mqtt-connection-adapter.js';
import { SensorPublishFeature } from './sensor-publish/index.js';
import { SensorConfigHandler } from './sensor-publish/config-handler.js';
import { ShadowFeature, ShadowConfig } from './shadow/index.js';
import { MqttShadowAdapter } from './shadow/mqtt-shadow-adapter.js';
import { MqttManager } from './mqtt/mqtt-manager.js';
import { TwinStateManager } from './digital-twin/twin-state-manager.js';

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
	private jobEngine?: JobEngine;
	private cloudJobsAdapter?: CloudJobsAdapter;
	private mqttJobsFeature?: JobsFeature;
	private sensorPublish?: SensorPublishFeature;
	private shadowFeature?: ShadowFeature;
	private sensorConfigHandler?: SensorConfigHandler;
	private twinStateManager?: TwinStateManager;
	private mqttConnectionMonitor?: NodeJS.Timeout; // For coordinating MQTT/HTTP fallback
	
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

			this.agentLogger.infoSync('Initializing Device Agent', { component: 'Agent' });

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

			// 7. Initialize API Binder (if cloud endpoint configured)
			await this.initializeApiBinder();

		// 8. Check config from target state BEFORE initializing features
		//    Config-driven feature management with env var fallbacks for local dev
		const targetState = this.containerManager.getTargetState();
		const configFeatures = targetState?.config?.features || {};
		const configSettings = targetState?.config?.settings || {};
		const configLogging = targetState?.config?.logging || {};
		
		// Get feature flags from config with environment variable fallbacks for local development
		const enableRemoteAccess = configFeatures.enableRemoteAccess ?? (process.env.ENABLE_REMOTE_ACCESS === 'true');
		const enableJobEngine = configFeatures.enableJobEngine ?? (process.env.ENABLE_JOB_ENGINE === 'true');
		const enableCloudJobs = configFeatures.enableCloudJobs ?? (process.env.ENABLE_CLOUD_JOBS === 'true');
		const enableSensorPublish = configFeatures.enableSensorPublish ?? (process.env.ENABLE_SENSOR_PUBLISH === 'true');
		const enableShadow = configFeatures.enableShadow ?? (process.env.ENABLE_SHADOW === 'true');
		
		// Get system settings from config (with defaults)
		const reconciliationIntervalMs = configSettings.reconciliationIntervalMs || this.RECONCILIATION_INTERVAL;
		
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
			
			// 10. Initialize Job Engine (if enabled by config)
			if (enableJobEngine) {
				await this.initializeJobEngine();
			}

			// 11. Initialize Cloud Jobs Adapter (HTTP fallback - if enabled by config)
			if (enableCloudJobs) {
				await this.initializeCloudJobsAdapter();
				
				// 11b. Initialize MQTT Jobs Feature (primary - if MQTT available)
				await this.initializeMqttJobsFeature();
				
				// 11c. Start MQTT/HTTP coordination monitor
				if (this.mqttJobsFeature && this.cloudJobsAdapter) {
					this.startJobsCoordinator();
				}
			}

			// 12. Initialize Sensor Publish Feature (if enabled by config)
			if (enableSensorPublish) {
				await this.initializeSensorPublish();
			}

			// 13. Initialize Shadow Feature (if enabled by config)
			if (enableShadow) {
				await this.initializeShadowFeature();
			}

			// 14. Initialize Sensor Config Handler (if both Shadow and Sensor Publish enabled)
			await this.initializeSensorConfigHandler();

			// 15. Initialize Digital Twin State Manager (if Shadow enabled)
			if (enableShadow) {
	     		await this.initializeDigitalTwin();
			}

			// 16. Start auto-reconciliation
			this.startAutoReconciliation();

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
		// Note: We create this BEFORE other backends so all initialization can use it
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
						baseTopic: `$iot/device/${this.deviceInfo.uuid}/logs`,
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

		// Watch for target state changes to dynamically update config
		this.orchestratorDriver.on('target-state-changed', (newState: any) => {
			if (newState.config) {
				this.handleConfigUpdate(newState.config);
			}
		});

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

	private async initializeApiBinder(): Promise<void> {
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
		
		// Get intervals from config if available
		const targetState = this.containerManager.getTargetState();
		const configSettings = targetState?.config?.settings || {};
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
			this.agentLogger  // Pass the agent logger
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

	private async initializeJobEngine(): Promise<void> {
		this.agentLogger?.infoSync('Initializing Enhanced Job Engine', { component: 'Agent' });

		try {
			// Create a simple logger that wraps agentLogger
			const jobLogger = {
				info: (message: string) => this.agentLogger?.infoSync(message, { component: 'JobEngine' }),
				warn: (message: string) => this.agentLogger?.warnSync(message, { component: 'JobEngine' }),
				error: (message: string) => this.agentLogger?.errorSync(message, new Error(message), { component: 'JobEngine' }),
				debug: (message: string) => {
					if (process.env.JOB_ENGINE_DEBUG === 'true') {
						this.agentLogger?.debugSync(message, { component: 'JobEngine' });
					}
				},
			};

			this.jobEngine = new JobEngine(jobLogger);

			// Log job engine capabilities
			this.agentLogger?.infoSync('Job Engine initialized', {
				component: 'Agent',
				supportedTypes: 'ONE_TIME',
				executionTypes: 'Sequential',
				handlerDirectory: './data/job-handlers (default)'
			});
			
			// Example: Register a simple test job (optional - can be removed)
			if (process.env.JOB_ENGINE_TEST === 'true') {
				this.agentLogger?.infoSync('Testing Job Engine with sample job', { component: 'Agent' });
				const testJobId = 'test-job-' + Date.now();
				this.agentLogger?.debugSync(`Test job ID generated: ${testJobId}`, { component: 'Agent' });
				this.agentLogger?.infoSync('Job Engine is ready to process jobs', { component: 'Agent' });
			}
		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize Job Engine', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'Continuing without Job Engine'
			});
			this.jobEngine = undefined;
		}
	}

	private async initializeCloudJobsAdapter(): Promise<void> {
		// Cloud jobs requires job engine
		if (!this.jobEngine) {
			this.agentLogger?.errorSync('Cloud Jobs requires Job Engine to be enabled', undefined, {
				component: 'Agent',
				note: 'Enable Job Engine in config: { features: { enableJobEngine: true } }'
			});
			return;
		}

		this.agentLogger?.infoSync('Initializing Cloud Jobs Adapter', { component: 'Agent' });

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

			// Get polling interval from config or environment (default: 30 seconds)
			const targetState = this.containerManager.getTargetState();
			const configSettings = targetState?.config?.settings || {};
			const pollingIntervalMs = configSettings.cloudJobsPollingIntervalMs || 
				parseInt(process.env.CLOUD_JOBS_POLLING_INTERVAL || '30000', 10);


			// Create CloudJobsAdapter
			this.cloudJobsAdapter = new CloudJobsAdapter(
				{
					cloudApiUrl,
					deviceUuid: this.deviceInfo.uuid,
					deviceApiKey: this.deviceInfo.apiKey,
					pollingIntervalMs,
					maxRetries: 3,
					enableLogging: true
				},
				this.jobEngine
			);

			// Start polling for jobs
			this.cloudJobsAdapter.start();

			this.agentLogger?.infoSync('Cloud Jobs Adapter initialized', {
				component: 'Agent',
				cloudApiUrl,
				deviceUuid: this.deviceInfo.uuid,
				pollingIntervalMs,
				pollingIntervalSec: pollingIntervalMs / 1000,
				status: 'Polling for jobs'
			});
		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize Cloud Jobs Adapter', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'Continuing without Cloud Jobs'
			});
			this.cloudJobsAdapter = undefined;
		}
	}

	private async initializeMqttJobsFeature(): Promise<void> {
		this.agentLogger?.infoSync('Initializing MQTT Jobs Feature', { component: 'Agent' });

		try {
			// Check if MQTT is available
			const mqttManager = MqttManager.getInstance();
			if (!mqttManager.isConnected()) {
				this.agentLogger?.warnSync('MQTT not connected, skipping MQTT Jobs (will use HTTP fallback)', {
					component: 'Agent',
					note: 'HTTP polling will be used as fallback'
				});
				return;
			}

			// Check if job engine is available
			if (!this.jobEngine) {
				this.agentLogger?.warnSync('Job Engine not available, cannot initialize MQTT Jobs', {
					component: 'Agent'
				});
				return;
			}

			// Create MQTT connection adapter
			const mqttAdapter = new JobsMqttConnectionAdapter();

			// Create logger wrapper
			const jobLogger = {
				info: (message: string) => this.agentLogger?.infoSync(message, { component: 'MqttJobs' }),
				warn: (message: string) => this.agentLogger?.warnSync(message, { component: 'MqttJobs' }),
				error: (message: string) => this.agentLogger?.errorSync(message, new Error(message), { component: 'MqttJobs' }),
				debug: (message: string) => {
					if (process.env.DEBUG === 'true') {
						this.agentLogger?.debugSync(message, { component: 'MqttJobs' });
					}
				},
			};

			// Create notifier
			const notifier = {
				onEvent: (feature: string, event: string) => {
					this.agentLogger?.infoSync(`${feature}: ${event}`, { component: 'MqttJobs' });
				},
				onError: (feature: string, code: string, message: string) => {
					this.agentLogger?.errorSync(`${feature}: ${code} - ${message}`, new Error(message), { component: 'MqttJobs' });
				}
			};

			// Create Jobs Feature
			this.mqttJobsFeature = createJobsFeature(mqttAdapter as any, {
				deviceUuid: this.deviceInfo.uuid,
				enabled: true,
				handlerDirectory: process.env.JOB_HANDLER_DIR || '/app/data/job-handlers',
				maxConcurrentJobs: 1,
				defaultHandlerTimeout: 60000
			});

			// Start the feature
			await this.mqttJobsFeature.start();

			this.agentLogger?.infoSync('MQTT Jobs Feature initialized successfully', {
				component: 'Agent',
				deviceUuid: this.deviceInfo.uuid,
				mode: 'MQTT-primary with HTTP fallback coordination'
			});

		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize MQTT Jobs Feature', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'HTTP polling will be used as fallback'
			});
			this.mqttJobsFeature = undefined;
		}
	}

	/**
	 * Start MQTT/HTTP Jobs Coordinator
	 * 
	 * Monitors MQTT connection and coordinates between MQTT Jobs (primary) and HTTP polling (fallback):
	 * - When MQTT connected: MQTT Jobs executes, HTTP polling paused
	 * - When MQTT disconnects: HTTP polling resumes as fallback
	 * - When MQTT reconnects: HTTP polling paused again
	 */
	private startJobsCoordinator(): void {
		this.agentLogger?.infoSync('Starting Jobs Coordinator (MQTT primary, HTTP fallback)', {
			component: 'Agent',
			note: 'Will automatically switch between MQTT and HTTP based on connection'
		});

		const mqttManager = MqttManager.getInstance();
		let lastMqttState = mqttManager.isConnected();

		// Initially pause HTTP if MQTT is connected
		if (lastMqttState && this.cloudJobsAdapter) {
			this.cloudJobsAdapter.pause();
			this.agentLogger?.infoSync('MQTT connected - HTTP polling paused', {
				component: 'JobsCoordinator',
				mode: 'MQTT-primary'
			});
		}

		// Monitor MQTT connection every 5 seconds
		this.mqttConnectionMonitor = setInterval(() => {
			const currentMqttState = mqttManager.isConnected();

			// MQTT state changed
			if (currentMqttState !== lastMqttState) {
				if (currentMqttState) {
					// MQTT reconnected - pause HTTP polling
					if (this.cloudJobsAdapter && !this.cloudJobsAdapter.isPaused()) {
						this.cloudJobsAdapter.pause();
						this.agentLogger?.infoSync('MQTT reconnected - switching to MQTT Jobs', {
							component: 'JobsCoordinator',
							mode: 'MQTT-primary'
						});
					}
				} else {
					// MQTT disconnected - resume HTTP polling
					if (this.cloudJobsAdapter && this.cloudJobsAdapter.isPaused()) {
						this.cloudJobsAdapter.resume();
						this.agentLogger?.warnSync('MQTT disconnected - falling back to HTTP polling', {
							component: 'JobsCoordinator',
							mode: 'HTTP-fallback'
						});
					}
				}

				lastMqttState = currentMqttState;
			}
		}, 5000); // Check every 5 seconds

		this.agentLogger?.infoSync('Jobs Coordinator started', {
			component: 'Agent',
			checkInterval: '5 seconds',
			initialMode: lastMqttState ? 'MQTT-primary' : 'HTTP-fallback'
		});
	}

	private async initializeSensorPublish(): Promise<void> {
		this.agentLogger?.infoSync('Initializing Sensor Publish Feature', { component: 'Agent' });

		try {
			// Parse sensor configuration from environment
			const sensorConfigStr = process.env.SENSOR_PUBLISH_CONFIG;
			if (!sensorConfigStr) {
				this.agentLogger?.warnSync('No SENSOR_PUBLISH_CONFIG environment variable found', {
					component: 'Agent',
					note: 'Set SENSOR_PUBLISH_CONFIG with JSON configuration'
				});
				return;
			}

			let sensorConfig;
			try {
				sensorConfig = JSON.parse(sensorConfigStr);
			} catch (error) {
				this.agentLogger?.errorSync('Failed to parse SENSOR_PUBLISH_CONFIG', error instanceof Error ? error : new Error(String(error)), {
					component: 'Agent'
				});
				return;
			}

			// Create MQTT connection wrapper (assuming you have MQTT backend available)
			const mqttConnection = {
				publish: async (topic: string, payload: string | Buffer, qos?: 0 | 1 | 2) => {
					// If MQTT backend is available, use it
					if (this.logBackends.find(b => b.constructor.name === 'MqttLogBackend')) {
						const mqttBackend = this.logBackends.find(b => b.constructor.name === 'MqttLogBackend') as any;
						if (mqttBackend && mqttBackend.publish) {
							await mqttBackend.publish(topic, payload.toString(), qos);
						}
					} else {
						this.agentLogger?.warnSync('MQTT backend not available, sensor data not published', {
							component: 'SensorPublish'
						});
					}
				},
				isConnected: () => {
					const mqttBackend = this.logBackends.find(b => b.constructor.name === 'MqttLogBackend') as any;
					return mqttBackend ? mqttBackend.isConnected() : false;
				}
			};

			// Create simple logger
			const sensorLogger = {
				info: (message: string) => this.agentLogger?.infoSync(message, { component: 'SensorPublish' }),
				warn: (message: string) => this.agentLogger?.warnSync(message, { component: 'SensorPublish' }),
				error: (message: string) => this.agentLogger?.errorSync(message, new Error(message), { component: 'SensorPublish' }),
				debug: (message: string) => {
					if (process.env.SENSOR_PUBLISH_DEBUG === 'true') {
						this.agentLogger?.debugSync(message, { component: 'SensorPublish' });
					}
				}
			};

			this.sensorPublish = new SensorPublishFeature(
				sensorConfig,
				mqttConnection,
				sensorLogger,
				this.deviceInfo.uuid
			);

			await this.sensorPublish.start();

			this.agentLogger?.infoSync('Sensor Publish Feature initialized', {
				component: 'Agent',
				sensorsConfigured: sensorConfig.sensors?.length || 0,
				mqttTopicPattern: '$iot/device/{deviceUuid}/sensor/{topic}'
			});
		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize Sensor Publish', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'Continuing without Sensor Publish'
			});
			this.sensorPublish = undefined;
		}
	}

	private async initializeShadowFeature(): Promise<void> {
		this.agentLogger?.infoSync('Initializing Shadow Feature', { component: 'Agent' });

		try {
			// Get shadow publish interval from config or environment
			const targetState = this.containerManager.getTargetState();
			const configSettings = targetState?.config?.settings || {};
			const shadowPublishIntervalMs = configSettings.shadowPublishIntervalMs !== undefined
				? configSettings.shadowPublishIntervalMs
				: (process.env.SHADOW_PUBLISH_INTERVAL 
					? parseInt(process.env.SHADOW_PUBLISH_INTERVAL, 10) 
					: undefined);
			
			// Parse shadow configuration from environment
			const shadowConfig: ShadowConfig = {
				enabled: true,
				shadowName: process.env.SHADOW_NAME || 'device-state',
				inputFile: process.env.SHADOW_INPUT_FILE,
				outputFile: process.env.SHADOW_OUTPUT_FILE || `${process.env.DATA_DIR || '/app/data'}/shadow-document.json`,
				syncOnDelta: process.env.SHADOW_SYNC_ON_DELTA !== 'false',
				enableFileMonitor: process.env.SHADOW_FILE_MONITOR === 'true',
				publishInterval: shadowPublishIntervalMs,
			};

			// Create MQTT adapter using centralized MqttManager
			// Note: MqttShadowAdapter reuses the existing MQTT connection established in initializeMqttManager()
			// The clientId, username, and password were already set there, so we don't need to pass them again
			let mqttConnection;
			
			// Get MQTT broker URL from provisioned device info (or fallback to env var)
			const mqttBrokerUrl = this.deviceInfo.mqttBrokerUrl || process.env.MQTT_BROKER;
			
			if (mqttBrokerUrl) {
				// Check if MqttManager is connected before creating adapter
				const mqttManager = MqttManager.getInstance();
				if (!mqttManager.isConnected()) {
					this.agentLogger?.warnSync('MQTT Manager not connected yet, waiting...', {
						component: 'Agent'
					});
					// Wait up to 5 seconds for connection
					const maxWait = 5000;
					const checkInterval = 100;
					let waited = 0;
					while (!mqttManager.isConnected() && waited < maxWait) {
						await new Promise(resolve => setTimeout(resolve, checkInterval));
						waited += checkInterval;
					}
					if (!mqttManager.isConnected()) {
						throw new Error('MQTT Manager connection timeout - Shadow feature requires MQTT');
					}
					this.agentLogger?.infoSync('MQTT Manager connected after waiting', {
						component: 'Agent'
					});
				}
				
				mqttConnection = new MqttShadowAdapter(
					mqttBrokerUrl,
					{
						// Options are ignored since MqttManager is already connected
						// If this was called before initializeMqttManager(), these would be used
					}
				);
				this.agentLogger?.infoSync('Using centralized MQTT Manager for shadow operations', {
					component: 'Agent',
					mqttBrokerUrl
				});
			} else {
				this.agentLogger?.warnSync('MQTT broker URL not available', {
					component: 'Agent',
					note: 'Device not provisioned and MQTT_BROKER not set. Shadow feature will not publish updates'
				});
				// Create a no-op connection
				mqttConnection = {
					publish: async () => {},
					subscribe: async () => {},
					unsubscribe: async () => {},
					isConnected: () => false,
				};
			}

			// Create simple logger
			const shadowLogger = {
				info: (message: string) => this.agentLogger?.infoSync(message, { component: 'Shadow' }),
				warn: (message: string) => this.agentLogger?.warnSync(message, { component: 'Shadow' }),
				error: (message: string) => this.agentLogger?.errorSync(message, new Error(message), { component: 'Shadow' }),
				debug: (message: string) => {
					if (process.env.SHADOW_DEBUG === 'true') {
						this.agentLogger?.debugSync(message, { component: 'Shadow' });
					}
				}
			};

			this.shadowFeature = new ShadowFeature(
				shadowConfig,
				mqttConnection,
				shadowLogger,
				this.deviceInfo.uuid
			);

			// Set up event handlers
			this.shadowFeature.on('started', () => {
				this.agentLogger?.infoSync('Shadow Feature started', { component: 'Agent' });
			});

			this.shadowFeature.on('update-accepted', (response) => {
				if (process.env.SHADOW_DEBUG === 'true') {
					this.agentLogger?.debugSync(`Update accepted (version: ${response.version})`, { component: 'Shadow' });
				}
			});

			this.shadowFeature.on('update-rejected', (error) => {
				this.agentLogger?.errorSync(`Update rejected: ${error.message} (code: ${error.code})`, new Error(error.message), {
					component: 'Shadow',
					errorCode: error.code
				});
			});

			this.shadowFeature.on('delta-updated', (event) => {
				this.agentLogger?.infoSync(`Delta received (version: ${event.version})`, {
					component: 'Shadow',
					version: event.version
				});
				if (process.env.SHADOW_DEBUG === 'true') {
					this.agentLogger?.debugSync('Delta state', {
						component: 'Shadow',
						state: event.state
					});
				}
			});

			this.shadowFeature.on('error', (error) => {
				this.agentLogger?.errorSync(`Shadow error: ${error.message}`, error instanceof Error ? error : new Error(String(error)), {
					component: 'Shadow'
				});
			});

			await this.shadowFeature.start();

			this.agentLogger?.infoSync('Shadow Feature initialized', {
				component: 'Agent',
				shadowName: shadowConfig.shadowName,
				deviceId: this.deviceInfo.uuid,
				autoSyncOnDelta: shadowConfig.syncOnDelta,
				fileMonitor: shadowConfig.enableFileMonitor ? 'Enabled' : 'Disabled',
				inputFile: shadowConfig.inputFile || 'None',
				outputFile: shadowConfig.outputFile || 'None',
				publishInterval: shadowConfig.publishInterval ? `${shadowConfig.publishInterval}ms` : 'None'
			});
		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize Shadow Feature', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'Continuing without Shadow Feature'
			});
			this.shadowFeature = undefined;
		}
	}

	private async initializeSensorConfigHandler(): Promise<void> {
		// Only initialize if both Shadow and Sensor Publish are enabled
		if (!this.shadowFeature || !this.sensorPublish) {
			return;
		}

		this.agentLogger?.infoSync('Initializing Sensor Config Handler', { component: 'Agent' });

		try {
			// Create simple logger
			const configLogger = {
				info: (message: string) => this.agentLogger?.infoSync(message, { component: 'SensorConfig' }),
				warn: (message: string) => this.agentLogger?.warnSync(message, { component: 'SensorConfig' }),
				error: (message: string, error?: any) => this.agentLogger?.errorSync(message, error instanceof Error ? error : new Error(String(error)), { component: 'SensorConfig' }),
				debug: (message: string, ...args: any[]) => {
					if (process.env.SENSOR_CONFIG_DEBUG === 'true') {
						this.agentLogger?.debugSync(message, { component: 'SensorConfig', args });
					}
				}
			};

			// Create sensor config handler
			this.sensorConfigHandler = new SensorConfigHandler(
				this.shadowFeature,
				this.sensorPublish
			);

			// Start listening for delta events
			this.sensorConfigHandler.start();

			// Report initial sensor state to shadow
			try {
				const sensors = this.sensorPublish.getSensors();
				const initialState = {
					sensors: sensors.reduce((acc, sensor) => {
						acc[sensor.name] = {
							enabled: sensor.enabled,
							addr: sensor.addr,
							publishInterval: sensor.publishInterval
						};
						return acc;
					}, {} as Record<string, any>),
					metrics: {
						totalSensors: sensors.length,
						enabledSensors: sensors.filter(s => s.enabled).length,
						mqttConnected: this.sensorPublish.isMqttConnected()
					}
				};

				await this.shadowFeature.updateShadow(initialState, true);
				this.agentLogger?.infoSync('Reported initial sensor state to shadow', {
					component: 'SensorConfig',
					sensorCount: sensors.length
				});
			} catch (error) {
				this.agentLogger?.errorSync('Failed to report initial sensor state to shadow', error instanceof Error ? error : new Error(String(error)), {
					component: 'SensorConfig'
				});
				// Don't fail initialization if this fails
			}

			this.agentLogger?.infoSync('Sensor Config Handler initialized', {
				component: 'Agent',
				remoteConfiguration: 'Enabled',
				shadowName: process.env.SHADOW_NAME || 'device-config'
			});
		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize Sensor Config Handler', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'Continuing without remote sensor configuration'
			});
			this.sensorConfigHandler = undefined;
		}
	}

	private async initializeDigitalTwin(): Promise<void> {
		if (!this.shadowFeature) {
			this.agentLogger?.warnSync('Shadow Feature not available, cannot initialize Digital Twin', {
				component: 'Agent'
			});
			return;
		}

		try {
			// Get configuration from environment
			const updateInterval = parseInt(process.env.TWIN_UPDATE_INTERVAL || '60000', 10);
			const enableReadings = process.env.TWIN_ENABLE_READINGS !== 'false';
			const enableHealth = process.env.TWIN_ENABLE_HEALTH !== 'false';
			const enableSystem = process.env.TWIN_ENABLE_SYSTEM !== 'false';
			const enableConnectivity = process.env.TWIN_ENABLE_CONNECTIVITY !== 'false';

			// Create twin state manager
			this.twinStateManager = new TwinStateManager(
				this.shadowFeature,
				this.deviceManager,
				{
					updateInterval,
					enableReadings,
					enableHealth,
					enableSystem,
					enableConnectivity,
				}
			);

			// Set references to other features
			if (this.sensorPublish) {
				this.twinStateManager.setSensorPublish(this.sensorPublish);
			}

			// Find MQTT backend if available
			const mqttBackend = this.logBackends.find(b => b.constructor.name === 'MqttLogBackend');
			if (mqttBackend) {
				this.twinStateManager.setMqttBackend(mqttBackend);
			}

			// Start periodic updates
			this.twinStateManager.start();

			const enabledFeatures = [
				enableReadings && 'readings',
				enableHealth && 'health',
				enableSystem && 'system',
				enableConnectivity && 'connectivity'
			].filter(Boolean).join(', ');

			this.agentLogger?.infoSync('Digital Twin State Manager initialized', {
				component: 'Agent',
				updateIntervalMs: updateInterval,
				updateIntervalSec: updateInterval / 1000,
				features: enabledFeatures
			});
		} catch (error) {
			this.agentLogger?.errorSync('Failed to initialize Digital Twin', error instanceof Error ? error : new Error(String(error)), {
				component: 'Agent',
				note: 'Continuing without Digital Twin state updates'
			});
			this.twinStateManager = undefined;
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
	 * Load initial configuration from target state at startup
	 */
	private async loadInitialConfig(): Promise<void> {
		try {
			this.agentLogger?.infoSync('Loading initial configuration from target state', {
				component: 'Agent'
			});
			
			// Get current target state from container manager
			const targetState = this.containerManager.getTargetState();
			
			if (targetState && targetState.config && Object.keys(targetState.config).length > 0) {
				this.agentLogger?.infoSync('Found config in target state', {
					component: 'Agent',
					sectionCount: Object.keys(targetState.config).length
				});
				await this.handleConfigUpdate(targetState.config);
			} else {
				this.agentLogger?.infoSync('No config found in target state', {
					component: 'Agent'
				});
			}
		} catch (error) {
			this.agentLogger?.warnSync('Failed to load initial config', {
				component: 'Agent',
				error: error instanceof Error ? error.message : String(error),
				note: 'Continuing with default configuration'
			});
		}
	}

	/**
	 * Handle configuration updates from target state
	 * This is called whenever config changes in device_target_state
	 */
	private async handleConfigUpdate(config: Record<string, any>): Promise<void> {
		this.agentLogger?.debug('Processing configuration update', {
			category: 'Agent',
			configKeys: Object.keys(config).length,
			keys: Object.keys(config)
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
				if (settings.cloudJobsPollingIntervalMs !== undefined && this.cloudJobsAdapter) {
					const newInterval = settings.cloudJobsPollingIntervalMs;
					const currentInterval = (this.cloudJobsAdapter as any).config?.pollingIntervalMs;
					
					if (currentInterval && newInterval !== currentInterval) {
						this.agentLogger?.debug('Updating cloud jobs polling interval', {
							category: 'Agent',
							fromMs: currentInterval,
							toMs: newInterval
						});
						
						// Update the cloud jobs adapter's polling interval
						(this.cloudJobsAdapter as any).config.pollingIntervalMs = newInterval;
						
						// Restart polling with new interval
						this.cloudJobsAdapter.stop();
						this.cloudJobsAdapter.start();
						
						this.agentLogger?.debug('Cloud jobs polling interval updated successfully', {
							category: 'Agent',
							intervalMs: newInterval
						});
					}
				}
				
				// Update shadow publish interval
				if (settings.shadowPublishIntervalMs !== undefined && this.shadowFeature) {
					const newInterval = settings.shadowPublishIntervalMs;
					const currentInterval = (this.shadowFeature as any).config?.publishInterval;
					
					if (newInterval !== currentInterval) {
						this.agentLogger?.debug('Updating shadow publish interval', {
							category: 'Agent',
							fromMs: currentInterval,
							toMs: newInterval
						});
						
						// Update the shadow feature's publish interval
						(this.shadowFeature as any).config.publishInterval = newInterval;
						
						// Restart shadow to apply new interval
						await this.shadowFeature.stop();
						await this.shadowFeature.start();
						
						this.agentLogger?.debug('Shadow publish interval updated successfully', {
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
				
				// Enable/disable Cloud Jobs dynamically
				if (features.enableCloudJobs !== undefined) {
					const isCurrentlyEnabled = !!this.cloudJobsAdapter;
					const shouldBeEnabled = features.enableCloudJobs;
					
					if (shouldBeEnabled === isCurrentlyEnabled) {
						this.agentLogger?.debug('Cloud Jobs already in desired state', {
							category: 'Agent',
							enabled: shouldBeEnabled
						});
					} else if (shouldBeEnabled && !isCurrentlyEnabled && this.jobEngine) {
						this.agentLogger?.debug('Enabling Cloud Jobs Adapter', { category: 'Agent' });
						await this.initializeCloudJobsAdapter();
					} else if (!shouldBeEnabled && isCurrentlyEnabled) {
						this.agentLogger?.debug('Disabling Cloud Jobs Adapter', { category: 'Agent' });
						this.cloudJobsAdapter!.stop();
						this.cloudJobsAdapter = undefined;
						this.agentLogger?.debug('Cloud Jobs Adapter disabled successfully', { category: 'Agent' });
					}
				}

				// Enable/disable Job Engine dynamically
				if (features.enableJobEngine !== undefined) {
					const isCurrentlyEnabled = !!this.jobEngine;
					const shouldBeEnabled = features.enableJobEngine;
					
					if (shouldBeEnabled === isCurrentlyEnabled) {
						this.agentLogger?.debug('Job Engine already in desired state', {
							category: 'Agent',
							enabled: shouldBeEnabled
						});
					} else if (shouldBeEnabled && !isCurrentlyEnabled) {
						this.agentLogger?.debug('Enabling Job Engine', { category: 'Agent' });
						await this.initializeJobEngine();
					} else if (!shouldBeEnabled && isCurrentlyEnabled) {
						this.agentLogger?.debug('Disabling Job Engine', { category: 'Agent' });
						// Stop dependent features first
						if (this.cloudJobsAdapter) {
							this.cloudJobsAdapter.stop();
							this.cloudJobsAdapter = undefined;
						}
						this.jobEngine = undefined;
						this.agentLogger?.debug('Job Engine disabled successfully', { category: 'Agent' });
					}
				}

				// Enable/disable Sensor Publish dynamically
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

				// Enable/disable Shadow Feature dynamically
				if (features.enableShadow !== undefined) {
					const isCurrentlyEnabled = !!this.shadowFeature;
					const shouldBeEnabled = features.enableShadow;
					
					if (shouldBeEnabled === isCurrentlyEnabled) {
						this.agentLogger?.debugSync('Shadow Feature already in desired state', {
							category: 'Agent',
							enabled: shouldBeEnabled
						});
					} else if (shouldBeEnabled && !isCurrentlyEnabled) {
						this.agentLogger?.infoSync('Enabling Shadow Feature', { category: 'Agent' });
						await this.initializeShadowFeature();
					} else if (!shouldBeEnabled && isCurrentlyEnabled) {
						this.agentLogger?.infoSync('Disabling Shadow Feature', { category: 'Agent' });
						await this.shadowFeature!.stop();
						this.shadowFeature = undefined;
						this.agentLogger?.infoSync('Shadow Feature disabled successfully', { category: 'Agent' });
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
			// Stop Digital Twin State Manager
			if (this.twinStateManager) {
				this.twinStateManager.stop();
				this.agentLogger?.infoSync('Digital Twin State Manager stopped', { component: 'Agent' });
			}

			// Stop Shadow Feature
			if (this.shadowFeature) {
				await this.shadowFeature.stop();
				this.agentLogger?.infoSync('Shadow Feature stopped', { component: 'Agent' });
			}

			// Stop Sensor Publish
			if (this.sensorPublish) {
				await this.sensorPublish.stop();
				this.agentLogger?.infoSync('Sensor Publish stopped', { component: 'Agent' });
			}

			// Stop Sensor Config Handler
			if (this.sensorConfigHandler) {
				// No explicit stop method, just clear reference
				this.agentLogger?.infoSync('Sensor Config Handler cleanup', { component: 'Agent' });
			}

			// Stop Job Engine
			if (this.jobEngine) {
				// Clean up any scheduled or running jobs
				this.agentLogger?.infoSync('Job Engine cleanup', { component: 'Agent' });
			}

			// Stop Jobs Coordinator
			if (this.mqttConnectionMonitor) {
				clearInterval(this.mqttConnectionMonitor);
				this.mqttConnectionMonitor = undefined;
				this.agentLogger?.infoSync('Jobs Coordinator stopped', { component: 'Agent' });
			}

			// Stop MQTT Jobs Feature
			if (this.mqttJobsFeature) {
				await this.mqttJobsFeature.stop();
				this.agentLogger?.infoSync('MQTT Jobs Feature stopped', { component: 'Agent' });
			}

			// Stop Cloud Jobs Adapter (HTTP fallback)
			if (this.cloudJobsAdapter) {
				this.cloudJobsAdapter.stop();
				this.agentLogger?.infoSync('Cloud Jobs Adapter stopped', { component: 'Agent' });
			}

			// Stop SSH tunnel
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

	public getJobEngine(): JobEngine | undefined {
		return this.jobEngine;
	}
}
