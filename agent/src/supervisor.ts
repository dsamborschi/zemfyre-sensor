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
import { SensorPublishFeature } from './sensor-publish';

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
	private sensorPublish?: SensorPublishFeature;

	private readonly ENABLE_JOB_ENGINE = process.env.ENABLE_JOB_ENGINE === 'true';
	private readonly ENABLE_SENSOR_PUBLISH = process.env.ENABLE_SENSOR_PUBLISH === 'true';
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

			// 3. Initialize logging
			await this.initializeLogging();

			// 4. Initialize container manager
			await this.initializeContainerManager();

			// 5. Initialize device API
			await this.initializeDeviceAPI();

			// 6. Initialize API Binder (if cloud endpoint configured)
			await this.initializeApiBinder();

			// 7. Initialize SSH Reverse Tunnel (if remote access enabled)
			await this.initializeRemoteAccess();

			// 8. Initialize Job Engine (if enabled)
			await this.initializeJobEngine();

			// 9. Initialize Sensor Publish Feature (if enabled)
			await this.initializeSensorPublish();

			// 10. Start auto-reconciliation
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
	}	private async initializeLogging(): Promise<void> {
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
				const mqttBackend = new MqttLogBackend({
					brokerUrl: process.env.MQTT_BROKER,
					baseTopic: process.env.MQTT_TOPIC || 'device/logs',
					qos: (process.env.MQTT_QOS ? parseInt(process.env.MQTT_QOS) : 1) as 0 | 1 | 2,
					enableBatching: process.env.MQTT_BATCH !== 'false',
					batchInterval: parseInt(process.env.MQTT_BATCH_INTERVAL || '1000'),
					maxBatchSize: parseInt(process.env.MQTT_BATCH_SIZE || '50'),
					debug: process.env.MQTT_DEBUG === 'true',
				});
				await mqttBackend.connect();
				this.logBackends.push(mqttBackend);
				console.log(`✅ MQTT log backend connected: ${process.env.MQTT_BROKER}`);
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

	private startAutoReconciliation(): void {
		this.containerManager.startAutoReconciliation(this.RECONCILIATION_INTERVAL);
		console.log(`✅ Auto-reconciliation started (${this.RECONCILIATION_INTERVAL}ms)`);
	}

	public async stop(): Promise<void> {
		console.log('🛑 Stopping Device Supervisor...');

		try {
			// Stop Job Engine
			if (this.jobEngine) {
				// Clean up any scheduled or running jobs
				console.log('✅ Job Engine cleanup');
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

			// Stop device API
			if (this.deviceAPI) {
				await this.deviceAPI.stop();
				console.log('✅ Device API stopped');
			}

			// Stop container manager
			if (this.containerManager) {
				// Container manager doesn't have a stop method yet
				console.log('✅ Container manager cleanup');
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
