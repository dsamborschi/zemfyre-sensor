/**
 * Device Supervisor
 * 
 * Orchestrates all device-side operations:
 * - Container management
 * - Device provisioning
 * - System monitoring
 * - Device API server
 * - Logging
 */

import ContainerManager from './compose/container-manager';
import { DeviceManager } from './provisioning';
import { DeviceAPI } from './device-api';
import { router as v1Router } from './device-api/v1';
import { router as v2Router } from './device-api/v2';
import * as deviceActions from './device-api/actions';
import { ApiBinder } from './api-binder';
import * as db from './db';
import { LocalLogBackend } from './logging/local-backend';
import { MqttLogBackend } from './logging/mqtt-backend';
import { CloudLogBackend } from './logging/cloud-backend';
import { ContainerLogMonitor } from './logging/monitor';
import type { LogBackend } from './logging/types';
import { SSHTunnelManager } from './remote-access/ssh-tunnel';
import { EnhancedJobEngine } from './jobs/src/enhanced-job-engine';
import { CloudJobsAdapter } from './jobs/cloud-jobs-adapter';
import { SensorPublishFeature } from './sensor-publish';
import { SensorConfigHandler } from './sensor-publish/config-handler';
import { ShadowFeature, ShadowConfig } from './shadow';
import { MqttShadowAdapter } from './shadow/mqtt-shadow-adapter';
import { TwinStateManager } from './digital-twin/twin-state-manager';
import { MqttManager } from './mqtt/mqtt-manager';

export default class DeviceSupervisor {
	private containerManager!: ContainerManager;
	private deviceManager!: DeviceManager;
	private deviceAPI!: DeviceAPI;
	private apiBinder?: ApiBinder;
	private logBackend!: LocalLogBackend;
	private logBackends: LogBackend[] = [];
	private logMonitor?: ContainerLogMonitor;
	private sshTunnel?: SSHTunnelManager;
	private jobEngine?: EnhancedJobEngine;
	private cloudJobsAdapter?: CloudJobsAdapter;
	private sensorPublish?: SensorPublishFeature;
	private shadowFeature?: ShadowFeature;
	private sensorConfigHandler?: SensorConfigHandler;
	private twinStateManager?: TwinStateManager;
	
	private readonly ENABLE_JOB_ENGINE = process.env.ENABLE_JOB_ENGINE === 'true';
	private readonly ENABLE_CLOUD_JOBS = process.env.ENABLE_CLOUD_JOBS === 'true';
	private readonly ENABLE_SENSOR_PUBLISH = process.env.ENABLE_SENSOR_PUBLISH === 'true';
	private readonly ENABLE_SHADOW = process.env.ENABLE_SHADOW === 'true';
	private readonly ENABLE_DIGITAL_TWIN = process.env.ENABLE_DIGITAL_TWIN !== 'false'; // Default: enabled
	private readonly DEVICE_API_PORT = parseInt(process.env.DEVICE_API_PORT || '48484', 10);
	private readonly RECONCILIATION_INTERVAL = parseInt(
		process.env.RECONCILIATION_INTERVAL_MS || '30000',
		10
	);
	private readonly CLOUD_API_ENDPOINT = process.env.CLOUD_API_ENDPOINT || 'https://90bd9cd2-1a3d-44d4-8625-ec5fb7411bfb.mock.pstmn.io';

	public async init(): Promise<void> {
		console.log('🚀 Initializing Device Supervisor...');
		console.log('='.repeat(80));

		try {
			// 1. Initialize database
			await this.initializeDatabase();

			// 2. Initialize device provisioning
			await this.initializeDeviceManager();

			// 3. Initialize MQTT Manager (before any features that use MQTT)
			await this.initializeMqttManager();

			// 4. Initialize logging
			await this.initializeLogging();

			// 5. Initialize container manager
			await this.initializeContainerManager();

			// 6. Initialize device API
			await this.initializeDeviceAPI();

			// 7. Initialize API Binder (if cloud endpoint configured)
			await this.initializeApiBinder();

			// 8. Initialize SSH Reverse Tunnel (if remote access enabled)
			await this.initializeRemoteAccess();

			// 9. Initialize Job Engine (if enabled)
			await this.initializeJobEngine();

			// 10. Initialize Cloud Jobs Adapter (if enabled)
			await this.initializeCloudJobsAdapter();

			// 11. Initialize Sensor Publish Feature (if enabled)
			await this.initializeSensorPublish();

			// 12. Initialize Shadow Feature (if enabled)
			await this.initializeShadowFeature();

			// 13. Initialize Sensor Config Handler (if both Shadow and Sensor Publish enabled)
			await this.initializeSensorConfigHandler();

			// 14. Initialize Digital Twin State Manager (if Shadow enabled)
			await this.initializeDigitalTwin();

			// 15. Start auto-reconciliation
			this.startAutoReconciliation();

			console.log('='.repeat(80));
			console.log('✅ Device Supervisor initialized successfully!');
			console.log('='.repeat(80));
			console.log(`Device API: http://localhost:${this.DEVICE_API_PORT}`);
			console.log(`Auto-reconciliation: ${this.RECONCILIATION_INTERVAL}ms`);
			console.log(`Cloud API: ${this.CLOUD_API_ENDPOINT || 'Not configured'}`);
			console.log('='.repeat(80));
		} catch (error) {
			console.error('❌ Failed to initialize Device Supervisor:', error);
			throw error;
		}
	}

	private async initializeDatabase(): Promise<void> {
		console.log('📦 Initializing database...');
		await db.initialized();
		console.log('✅ Database initialized');
	}

	private async initializeDeviceManager(): Promise<void> {
		console.log('🔐 Initializing device manager...');
		this.deviceManager = new DeviceManager();
		await this.deviceManager.initialize();

		let deviceInfo = this.deviceManager.getDeviceInfo();
		
		// Auto-provision if not yet provisioned, cloud endpoint is set, AND provisioning key is available
		const provisioningApiKey = process.env.PROVISIONING_API_KEY;
		if (!deviceInfo.provisioned && provisioningApiKey && this.CLOUD_API_ENDPOINT) {
			console.log('⚙️  Auto-provisioning device with two-phase authentication...');
			try {
				// Auto-detect system information if not provided via env vars
				const { getMacAddress, getOsVersion } = await import('./system-metrics.js');
				const macAddress = process.env.MAC_ADDRESS || await getMacAddress();
				const osVersion = process.env.OS_VERSION || await getOsVersion();
				
				console.log('📊 System information detected:', {
					macAddress: macAddress ? `${macAddress.substring(0, 8)}...` : 'unknown',
					osVersion: osVersion || 'unknown',
				});
				
				await this.deviceManager.provision({
					provisioningApiKey, // Required for two-phase auth
					deviceName: process.env.DEVICE_NAME || `device-${deviceInfo.uuid.slice(0, 8)}`,
					deviceType: process.env.DEVICE_TYPE || 'standalone',
					apiEndpoint: this.CLOUD_API_ENDPOINT,
					applicationId: process.env.APPLICATION_ID ? parseInt(process.env.APPLICATION_ID, 10) : undefined,
					macAddress,
					osVersion,
					supervisorVersion: process.env.SUPERVISOR_VERSION || '1.0.0',
				});
				deviceInfo = this.deviceManager.getDeviceInfo();
				console.log('✅ Device auto-provisioned successfully');
			} catch (error: any) {
				console.error('❌ Auto-provisioning failed:', error.message);
				console.error('   Device will remain unprovisioned. Set PROVISIONING_API_KEY to retry.');
			}
		} else if (!deviceInfo.provisioned && this.CLOUD_API_ENDPOINT && !provisioningApiKey) {
			console.warn('⚠️  Device not provisioned. Set PROVISIONING_API_KEY environment variable to enable auto-provisioning.');
		}
		
		console.log(`✅ Device manager initialized`);
		console.log(`   UUID: ${deviceInfo.uuid}`);
		console.log(`   Name: ${deviceInfo.deviceName || 'Not set'}`);
		console.log(`   Provisioned: ${deviceInfo.provisioned ? 'Yes' : 'No'}`);
		if (deviceInfo.deviceApiKey) {
			console.log(`   Device API Key: ${deviceInfo.deviceApiKey.substring(0, 16)}...`);
		}
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
		console.log('🔌 Initializing MQTT Manager...');
		
		try {
			const deviceInfo = this.deviceManager.getDeviceInfo();
			
			// Use MQTT credentials from provisioning if available, otherwise fall back to env vars
			const mqttBrokerUrl = deviceInfo.mqttBrokerUrl || process.env.MQTT_BROKER;
			const mqttUsername = deviceInfo.mqttUsername || process.env.MQTT_USERNAME;
			const mqttPassword = deviceInfo.mqttPassword || process.env.MQTT_PASSWORD;
			
			if (!mqttBrokerUrl) {
				console.log('⏭️  MQTT disabled - no broker URL provided');
				console.log('   Provision device or set MQTT_BROKER env var to enable');
				return;
			}
			
			const mqttManager = MqttManager.getInstance();
			
			// Connect to MQTT broker with provisioned credentials
			await mqttManager.connect(mqttBrokerUrl, {
				clientId: `device_${deviceInfo.uuid}`,
				clean: true,
				reconnectPeriod: 5000,
				username: mqttUsername,
				password: mqttPassword,
			});
			
			// Enable debug mode if requested
			if (process.env.MQTT_DEBUG === 'true') {
				mqttManager.setDebug(true);
				console.log('   Debug mode: enabled');
			}
			
			console.log(`✅ MQTT Manager connected: ${mqttBrokerUrl}`);
			console.log(`   Client ID: device_${deviceInfo.uuid}`);
			console.log(`   Username: ${mqttUsername || '(none)'}`);
			console.log(`   Credentials: ${deviceInfo.mqttUsername ? 'From provisioning' : 'From environment'}`);
			console.log(`   All features will share this connection`);
		} catch (error) {
			console.error('❌ Failed to initialize MQTT Manager:', error);
			console.warn('   MQTT features will be unavailable');
			// Don't throw - allow supervisor to continue without MQTT
		}
	}

	private async initializeLogging(): Promise<void> {
		console.log('📝 Initializing logging...');

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
		console.log(`✅ Local log backend initialized (file logging: ${enableFilePersistence})`);

		// Cloud log streaming backend (optional - if CLOUD_API_ENDPOINT is set and ENABLE_CLOUD_LOGGING is true)
		const enableCloudLogging = process.env.ENABLE_CLOUD_LOGGING !== 'false';
		if (this.CLOUD_API_ENDPOINT && enableCloudLogging) {
			try {
				const deviceInfo = this.deviceManager.getDeviceInfo();
				const cloudLogBackend = new CloudLogBackend({
					cloudEndpoint: this.CLOUD_API_ENDPOINT,
					deviceUuid: deviceInfo.uuid,
					deviceApiKey: deviceInfo.apiKey,
					compression: process.env.LOG_COMPRESSION !== 'false', // Default: true
				});
				await cloudLogBackend.initialize();
				this.logBackends.push(cloudLogBackend);
				console.log(`✅ Cloud log backend initialized: ${this.CLOUD_API_ENDPOINT}`);
			} catch (error) {
				console.error('⚠️  Failed to initialize cloud log backend:', error);
				console.log('   Continuing without cloud logging');
			}
		} else if (this.CLOUD_API_ENDPOINT && !enableCloudLogging) {
			console.log('⚠️  Cloud logging disabled (set ENABLE_CLOUD_LOGGING=true to enable)');
		}

		// MQTT backend (optional)
		if (process.env.MQTT_BROKER) {
			try {
				// Note: MqttLogBackend uses centralized MqttManager
				// Connection is already established in initializeMqttManager()
				const mqttBackend = new MqttLogBackend({
					brokerUrl: process.env.MQTT_BROKER,
					clientOptions: {
						// clientId is already set in initializeMqttManager() as device_${uuid}
						// No need to pass it again - these options are ignored
					},
					baseTopic: process.env.MQTT_TOPIC || 'device/logs',
					qos: (process.env.MQTT_QOS ? parseInt(process.env.MQTT_QOS) : 1) as 0 | 1 | 2,
					enableBatching: process.env.MQTT_BATCH !== 'false',
					batchInterval: parseInt(process.env.MQTT_BATCH_INTERVAL || '1000'),
					maxBatchSize: parseInt(process.env.MQTT_BATCH_SIZE || '50'),
					debug: process.env.MQTT_DEBUG === 'true',
				});
				await mqttBackend.connect();
				this.logBackends.push(mqttBackend);
				const deviceInfo = this.deviceManager.getDeviceInfo();
				console.log(`✅ MQTT log backend connected: ${process.env.MQTT_BROKER} (client: device_${deviceInfo.uuid})`);
			} catch (error) {
				console.error('⚠️  Failed to connect to MQTT broker:', error);
				console.log('   Continuing without cloud logging');
			}
		}

		// Log summary
		console.log(`✅ Logging initialized with ${this.logBackends.length} backend(s)`);
	}

	private async initializeContainerManager(): Promise<void> {
		console.log('🐳 Initializing container manager...');
		this.containerManager = new ContainerManager();
		await this.containerManager.init();

		// Set up log monitor
		const docker = this.containerManager.getDocker();
		if (docker) {
			// Use all configured log backends
			this.logMonitor = new ContainerLogMonitor(docker, this.logBackends);
			this.containerManager.setLogMonitor(this.logMonitor);
			await this.containerManager.attachLogsToAllContainers();
			console.log(`✅ Log monitor attached to container manager (${this.logBackends.length} backend(s))`);
		}

		console.log('✅ Container manager initialized');
	}

	private async initializeDeviceAPI(): Promise<void> {
		console.log('🌐 Initializing device API...');

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
		console.log(`✅ Device API started on port ${this.DEVICE_API_PORT}`);
	}

	private async initializeApiBinder(): Promise<void> {
		if (!this.CLOUD_API_ENDPOINT) {
			console.log('⚠️  Cloud API endpoint not configured (set CLOUD_API_ENDPOINT env var)');
			console.log('   Device will run in standalone mode');
			return;
		}

		console.log('☁️  Initializing API Binder...');
		
		this.apiBinder = new ApiBinder(
			this.containerManager,
			this.deviceManager,
			{
				cloudApiEndpoint: this.CLOUD_API_ENDPOINT,
				pollInterval: parseInt(process.env.POLL_INTERVAL_MS || '60000', 10), // 60s
				reportInterval: parseInt(process.env.REPORT_INTERVAL_MS || '10000', 10), // 10s
				metricsInterval: parseInt(process.env.METRICS_INTERVAL_MS || '300000', 10), // 5min
			}
		);

		// Start polling for target state
		await this.apiBinder.startPoll();

		// Start reporting current state
		await this.apiBinder.startReporting();

		console.log('✅ API Binder initialized');
	}

	private async initializeRemoteAccess(): Promise<void> {
		if (process.env.ENABLE_REMOTE_ACCESS !== 'true') {
			console.log('⚠️  Remote access disabled (set ENABLE_REMOTE_ACCESS=true to enable)');
			return;
		}

		const cloudHost = process.env.CLOUD_HOST;
		if (!cloudHost) {
			console.error('❌ CLOUD_HOST environment variable required for remote access');
			return;
		}

		console.log('🔌 Initializing SSH reverse tunnel...');

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
			console.log('✅ Remote access enabled via SSH tunnel');
			console.log(`   Device API accessible at: ${cloudHost}:${this.DEVICE_API_PORT}`);
		} catch (error) {
			console.error('❌ Failed to initialize SSH tunnel:', error);
			console.log('   Continuing without remote access');
			this.sshTunnel = undefined;
		}
	}

	private async initializeJobEngine(): Promise<void> {
		if (!this.ENABLE_JOB_ENGINE) {
			console.log('⚠️  Job Engine disabled (set ENABLE_JOB_ENGINE=true to enable)');
			return;
		}

		console.log('⚙️  Initializing Enhanced Job Engine...');

		try {
			// Create a simple logger that wraps console
			const jobLogger = {
				info: (message: string) => console.log(`[JobEngine] ${message}`),
				warn: (message: string) => console.warn(`[JobEngine] ${message}`),
				error: (message: string) => console.error(`[JobEngine] ${message}`),
				debug: (message: string) => {
					if (process.env.JOB_ENGINE_DEBUG === 'true') {
						console.log(`[JobEngine][DEBUG] ${message}`);
					}
				},
			};

			this.jobEngine = new EnhancedJobEngine(jobLogger);

			// Log job engine capabilities
			console.log('✅ Enhanced Job Engine initialized');
			console.log('   Supports: ONE_TIME, RECURRING, CONTINUOUS job types');
			console.log('   Execution Types: Sequential, Parallel');
			console.log('   Job Handler Directory: ./data/job-handlers (default)');
			
			// Example: Register a simple test job (optional - can be removed)
			if (process.env.JOB_ENGINE_TEST === 'true') {
				console.log('🧪 Testing Job Engine with sample job...');
				const testJobId = 'test-job-' + Date.now();
				jobLogger.info(`Test job ID generated: ${testJobId}`);
				jobLogger.info('Job Engine is ready to process jobs!');
			}
		} catch (error) {
			console.error('❌ Failed to initialize Job Engine:', error);
			console.log('   Continuing without Job Engine');
			this.jobEngine = undefined;
		}
	}

	private async initializeCloudJobsAdapter(): Promise<void> {
		if (!this.ENABLE_CLOUD_JOBS) {
			console.log('⚠️  Cloud Jobs disabled (set ENABLE_CLOUD_JOBS=true to enable)');
			return;
		}

		// Cloud jobs requires job engine
		if (!this.jobEngine) {
			console.error('❌ Cloud Jobs requires Job Engine to be enabled');
			console.log('   Set ENABLE_JOB_ENGINE=true to enable Cloud Jobs');
			return;
		}

		console.log('☁️  Initializing Cloud Jobs Adapter...');

		try {
			// Get device UUID
			const deviceInfo = await this.deviceManager.getDeviceInfo();
			if (!deviceInfo || !deviceInfo.uuid) {
				console.error('❌ Device UUID not available, cannot initialize Cloud Jobs');
				return;
			}

			// Get cloud API URL from environment
			const cloudApiUrl = process.env.CLOUD_API_URL || this.CLOUD_API_ENDPOINT;
			if (!cloudApiUrl) {
				console.error('❌ CLOUD_API_URL not configured');
				console.log('   Set CLOUD_API_URL environment variable (e.g., http://your-cloud-server:4002/api/v1)');
				return;
			}

			// Get polling interval (default: 30 seconds)
			const pollingIntervalMs = parseInt(
				process.env.CLOUD_JOBS_POLLING_INTERVAL || '30000',
				10
			);

			// Debug: Check device info
			console.log('🔍 Device Info for Cloud Jobs:', {
				uuid: deviceInfo.uuid,
				hasApiKey: !!deviceInfo.apiKey,
				apiKeyLength: deviceInfo.apiKey?.length || 0,
				apiKeyPreview: deviceInfo.apiKey ? `${deviceInfo.apiKey.substring(0, 8)}...` : 'MISSING'
			});

			// Create CloudJobsAdapter
			this.cloudJobsAdapter = new CloudJobsAdapter(
				{
					cloudApiUrl,
					deviceUuid: deviceInfo.uuid,
					deviceApiKey: deviceInfo.apiKey,
					pollingIntervalMs,
					maxRetries: 3,
					enableLogging: true
				},
				this.jobEngine
			);

			// Start polling for jobs
			this.cloudJobsAdapter.start();

			console.log('✅ Cloud Jobs Adapter initialized');
			console.log(`   Cloud API: ${cloudApiUrl}`);
			console.log(`   Device UUID: ${deviceInfo.uuid}`);
			console.log(`   Polling interval: ${pollingIntervalMs}ms (${pollingIntervalMs / 1000}s)`);
			console.log('   Status: Polling for jobs...');
		} catch (error) {
			console.error('❌ Failed to initialize Cloud Jobs Adapter:', error);
			console.log('   Continuing without Cloud Jobs');
			this.cloudJobsAdapter = undefined;
		}
	}

	private async initializeSensorPublish(): Promise<void> {
		if (!this.ENABLE_SENSOR_PUBLISH) {
			console.log('⚠️  Sensor Publish disabled (set ENABLE_SENSOR_PUBLISH=true to enable)');
			return;
		}

		console.log('📡 Initializing Sensor Publish Feature...');

		try {
			// Get device UUID
			const deviceInfo = await this.deviceManager.getDeviceInfo();
			if (!deviceInfo || !deviceInfo.uuid) {
				console.error('❌ Device UUID not available, cannot initialize Sensor Publish');
				return;
			}

			// Parse sensor configuration from environment
			const sensorConfigStr = process.env.SENSOR_PUBLISH_CONFIG;
			if (!sensorConfigStr) {
				console.warn('⚠️  No SENSOR_PUBLISH_CONFIG environment variable found');
				console.log('   Set SENSOR_PUBLISH_CONFIG with JSON configuration');
				return;
			}

			let sensorConfig;
			try {
				sensorConfig = JSON.parse(sensorConfigStr);
			} catch (error) {
				console.error('❌ Failed to parse SENSOR_PUBLISH_CONFIG:', error);
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
						console.warn('⚠️  MQTT backend not available, sensor data not published');
					}
				},
				isConnected: () => {
					const mqttBackend = this.logBackends.find(b => b.constructor.name === 'MqttLogBackend') as any;
					return mqttBackend ? mqttBackend.isConnected() : false;
				}
			};

			// Create simple logger
			const sensorLogger = {
				info: (message: string) => console.log(`[SensorPublish] ${message}`),
				warn: (message: string) => console.warn(`[SensorPublish] ${message}`),
				error: (message: string) => console.error(`[SensorPublish] ${message}`),
				debug: (message: string) => {
					if (process.env.SENSOR_PUBLISH_DEBUG === 'true') {
						console.log(`[SensorPublish][DEBUG] ${message}`);
					}
				}
			};

			this.sensorPublish = new SensorPublishFeature(
				sensorConfig,
				mqttConnection,
				sensorLogger,
				deviceInfo.uuid
			);

			await this.sensorPublish.start();

			console.log('✅ Sensor Publish Feature initialized');
			console.log(`   Sensors configured: ${sensorConfig.sensors?.length || 0}`);
			console.log('   MQTT Topic pattern: $iot/device/{deviceUuid}/sensor/{topic}');
		} catch (error) {
			console.error('❌ Failed to initialize Sensor Publish:', error);
			console.log('   Continuing without Sensor Publish');
			this.sensorPublish = undefined;
		}
	}

	private async initializeShadowFeature(): Promise<void> {
		if (!this.ENABLE_SHADOW) {
			console.log('⏭️  Shadow Feature disabled (set ENABLE_SHADOW=true to enable)');
			return;
		}

		console.log('🔮 Initializing Shadow Feature...');

		try {
			// Get device UUID (thing name)
			const deviceInfo = await this.deviceManager.getDeviceInfo();
			if (!deviceInfo || !deviceInfo.uuid) {
				console.error('❌ Device UUID not available, cannot initialize Shadow Feature');
				return;
			}

			// Parse shadow configuration from environment
			const shadowConfig: ShadowConfig = {
				enabled: true,
				shadowName: process.env.SHADOW_NAME || 'device-state',
				inputFile: process.env.SHADOW_INPUT_FILE,
				outputFile: process.env.SHADOW_OUTPUT_FILE || `${process.env.DATA_DIR || '/app/data'}/shadow-document.json`,
				syncOnDelta: process.env.SHADOW_SYNC_ON_DELTA !== 'false',
				enableFileMonitor: process.env.SHADOW_FILE_MONITOR === 'true',
				publishInterval: process.env.SHADOW_PUBLISH_INTERVAL 
					? parseInt(process.env.SHADOW_PUBLISH_INTERVAL, 10) 
					: undefined,
			};

			// Create MQTT adapter using centralized MqttManager
			// Note: MqttShadowAdapter reuses the existing MQTT connection established in initializeMqttManager()
			// The clientId, username, and password were already set there, so we don't need to pass them again
			let mqttConnection;
			if (process.env.MQTT_BROKER) {
				mqttConnection = new MqttShadowAdapter(
					process.env.MQTT_BROKER,
					{
						// Options are ignored since MqttManager is already connected
						// If this was called before initializeMqttManager(), these would be used
					}
				);
				console.log('   Using centralized MQTT Manager for shadow operations');
			} else {
				console.warn('⚠️  MQTT_BROKER not set, shadow feature will not publish updates');
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
				info: (message: string) => console.log(`[Shadow] ${message}`),
				warn: (message: string) => console.warn(`[Shadow] ${message}`),
				error: (message: string) => console.error(`[Shadow] ${message}`),
				debug: (message: string) => {
					if (process.env.SHADOW_DEBUG === 'true') {
						console.log(`[Shadow][DEBUG] ${message}`);
					}
				}
			};

			this.shadowFeature = new ShadowFeature(
				shadowConfig,
				mqttConnection,
				shadowLogger,
				deviceInfo.uuid
			);

			// Set up event handlers
			this.shadowFeature.on('started', () => {
				console.log('✅ Shadow Feature started');
			});

			this.shadowFeature.on('update-accepted', (response) => {
				if (process.env.SHADOW_DEBUG === 'true') {
					console.log(`[Shadow] Update accepted (version: ${response.version})`);
				}
			});

			this.shadowFeature.on('update-rejected', (error) => {
				console.error(`[Shadow] Update rejected: ${error.message} (code: ${error.code})`);
			});

			this.shadowFeature.on('delta-updated', (event) => {
				console.log(`[Shadow] Delta received (version: ${event.version})`);
				if (process.env.SHADOW_DEBUG === 'true') {
					console.log(`[Shadow] Delta state:`, event.state);
				}
			});

			this.shadowFeature.on('error', (error) => {
				console.error(`[Shadow] Error: ${error.message}`);
			});

			await this.shadowFeature.start();

			console.log('✅ Shadow Feature initialized');
			console.log(`   Shadow name: ${shadowConfig.shadowName}`);
			console.log(`   Device id: ${deviceInfo.uuid}`);
			console.log(`   Auto-sync on delta: ${shadowConfig.syncOnDelta}`);
			console.log(`   File monitor: ${shadowConfig.enableFileMonitor ? 'Enabled' : 'Disabled'}`);
			if (shadowConfig.inputFile) {
				console.log(`   Input file: ${shadowConfig.inputFile}`);
			}
			if (shadowConfig.outputFile) {
				console.log(`   Output file: ${shadowConfig.outputFile}`);
			}
			if (shadowConfig.publishInterval) {
				console.log(`   Publish interval: ${shadowConfig.publishInterval}ms`);
			}
		} catch (error) {
			console.error('❌ Failed to initialize Shadow Feature:', error);
			console.log('   Continuing without Shadow Feature');
			this.shadowFeature = undefined;
		}
	}

	private async initializeSensorConfigHandler(): Promise<void> {
		// Only initialize if both Shadow and Sensor Publish are enabled
		if (!this.shadowFeature || !this.sensorPublish) {
			if (this.ENABLE_SHADOW && this.ENABLE_SENSOR_PUBLISH) {
				console.log('⏭️  Sensor Config Handler disabled (requires both Shadow and Sensor Publish features)');
			}
			return;
		}

		console.log('🔧 Initializing Sensor Config Handler...');

		try {
			// Create simple logger
			const configLogger = {
				info: (message: string) => console.log(`[SensorConfig] ${message}`),
				warn: (message: string) => console.warn(`[SensorConfig] ${message}`),
				error: (message: string, error?: any) => console.error(`[SensorConfig] ${message}`, error || ''),
				debug: (message: string, ...args: any[]) => {
					if (process.env.SENSOR_CONFIG_DEBUG === 'true') {
						console.log(`[SensorConfig][DEBUG] ${message}`, ...args);
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
				configLogger.info(`Reported initial state for ${sensors.length} sensor(s) to shadow`);
			} catch (error) {
				configLogger.error('Failed to report initial sensor state to shadow', error);
				// Don't fail initialization if this fails
			}

			console.log('✅ Sensor Config Handler initialized');
			console.log('   Remote sensor configuration: Enabled');
			console.log('   Shadow name: ' + process.env.SHADOW_NAME || 'device-config');
		} catch (error) {
			console.error('❌ Failed to initialize Sensor Config Handler:', error);
			console.log('   Continuing without remote sensor configuration');
			this.sensorConfigHandler = undefined;
		}
	}

	private async initializeDigitalTwin(): Promise<void> {
		if (!this.ENABLE_DIGITAL_TWIN) {
			console.log('⚠️  Digital Twin disabled (set ENABLE_DIGITAL_TWIN=true to enable)');
			return;
		}

		if (!this.ENABLE_SHADOW) {
			console.log('⚠️  Digital Twin requires Shadow Feature to be enabled');
			return;
		}

		if (!this.shadowFeature) {
			console.log('⚠️  Shadow Feature not available, cannot initialize Digital Twin');
			return;
		}

		console.log('🤖 Initializing Digital Twin State Manager...');

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

			console.log('✅ Digital Twin State Manager initialized');
			console.log(`   Update interval: ${updateInterval}ms (${updateInterval / 1000}s)`);
			console.log(`   Features: ${[
				enableReadings && 'readings',
				enableHealth && 'health',
				enableSystem && 'system',
				enableConnectivity && 'connectivity'
			].filter(Boolean).join(', ')}`);
		} catch (error) {
			console.error('❌ Failed to initialize Digital Twin:', error);
			console.log('   Continuing without Digital Twin state updates');
			this.twinStateManager = undefined;
		}
	}

	private startAutoReconciliation(): void {
		this.containerManager.startAutoReconciliation(this.RECONCILIATION_INTERVAL);
		console.log(`✅ Auto-reconciliation started (${this.RECONCILIATION_INTERVAL}ms)`);
	}

	public async stop(): Promise<void> {
		console.log('🛑 Stopping Device Supervisor...');

		try {
			// Stop Digital Twin State Manager
			if (this.twinStateManager) {
				this.twinStateManager.stop();
				console.log('✅ Digital Twin State Manager stopped');
			}

			// Stop Shadow Feature
			if (this.shadowFeature) {
				await this.shadowFeature.stop();
				console.log('✅ Shadow Feature stopped');
			}

			// Stop Sensor Publish
			if (this.sensorPublish) {
				await this.sensorPublish.stop();
				console.log('✅ Sensor Publish stopped');
			}

			// Stop Sensor Config Handler
			if (this.sensorConfigHandler) {
				// No explicit stop method, just clear reference
				console.log('✅ Sensor Config Handler cleanup');
			}

			// Stop Job Engine
			if (this.jobEngine) {
				// Clean up any scheduled or running jobs
				console.log('✅ Job Engine cleanup');
			}

			// Stop Cloud Jobs Adapter
			if (this.cloudJobsAdapter) {
				this.cloudJobsAdapter.stop();
				console.log('✅ Cloud Jobs Adapter stopped');
			}

			// Stop SSH tunnel
			if (this.sshTunnel) {
				await this.sshTunnel.disconnect();
				console.log('✅ SSH tunnel stopped');
			}

			// Stop API binder
			if (this.apiBinder) {
				await this.apiBinder.stop();
				console.log('✅ API Binder stopped');
			}

			// Stop log backends (flush buffers, clear timers)
			console.log('🔄 Stopping log backends...');
			for (const backend of this.logBackends) {
				try {
					if ('disconnect' in backend && typeof backend.disconnect === 'function') {
						await backend.disconnect();
					} else if ('stop' in backend && typeof backend.stop === 'function') {
						await (backend as any).stop();
					}
				} catch (error) {
					console.warn(`⚠️  Error stopping log backend: ${error}`);
				}
			}
			console.log('✅ Log backends stopped');

			// Stop MQTT Manager (shared singleton - do this after all MQTT-dependent features)
			const mqttManager = MqttManager.getInstance();
			if (mqttManager.isConnected()) {
				await mqttManager.disconnect();
				console.log('✅ MQTT Manager disconnected');
			}

			// Stop device API
			if (this.deviceAPI) {
				await this.deviceAPI.stop();
				console.log('✅ Device API stopped');
			}

			// Stop container manager
			if (this.containerManager) {
				this.containerManager.stopAutoReconciliation();
				console.log('✅ Container manager stopped');
			}

			console.log('✅ Device Supervisor stopped');
		} catch (error) {
			console.error('❌ Error stopping Device Supervisor:', error);
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

	public getJobEngine(): EnhancedJobEngine | undefined {
		return this.jobEngine;
	}
}
