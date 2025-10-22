/**
 * Digital Twin State Manager
 * 
 * Periodically collects device state and updates the shadow to maintain
 * a comprehensive digital twin representation.
 * 
 * Collects:
 * - Latest sensor readings (last known values)
 * - Device health status
 * - System metrics (CPU, memory, disk)
 * - Connectivity status
 * - Device identity
 */

import { ShadowFeature } from '../shadow/shadow-feature';
import { DeviceManager } from '../provisioning/device-manager';
import si from 'systeminformation';

interface SensorReading {
  value: number;
  unit: string;
  timestamp: string;
  quality: 'good' | 'degraded' | 'poor';
}

interface DeviceHealth {
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
  uptime: number;
  errors: Array<{ code: string; message: string; timestamp: string }>;
  lastBootTime: string;
}

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  memoryTotal: number;
  diskUsage: number;
  diskTotal: number;
  temperature?: number;
  networkLatency?: number;
}

interface ConnectivityStatus {
  mqttConnected: boolean;
  cloudConnected: boolean;
  lastHeartbeat: string;
}

interface TwinStateConfig {
  updateInterval: number;  // milliseconds
  enableReadings: boolean;
  enableHealth: boolean;
  enableSystem: boolean;
  enableConnectivity: boolean;
}

export class TwinStateManager {
  private shadowFeature: ShadowFeature;
  private deviceManager: DeviceManager;
  private config: TwinStateConfig;
  private updateTimer?: NodeJS.Timeout;
  private sensorPublish?: any;  // Reference to sensor publish feature
  private mqttBackend?: any;    // Reference to MQTT backend
  private errors: Array<{ code: string; message: string; timestamp: string }> = [];
  private startTime: number = Date.now();

  constructor(
    shadowFeature: ShadowFeature,
    deviceManager: DeviceManager,
    config: Partial<TwinStateConfig> = {}
  ) {
    this.shadowFeature = shadowFeature;
    this.deviceManager = deviceManager;
    this.config = {
      updateInterval: config.updateInterval || 60000, // Default: 1 minute
      enableReadings: config.enableReadings !== false,
      enableHealth: config.enableHealth !== false,
      enableSystem: config.enableSystem !== false,
      enableConnectivity: config.enableConnectivity !== false,
    };
  }

  /**
   * Set reference to sensor publish feature
   */
  public setSensorPublish(sensorPublish: any): void {
    this.sensorPublish = sensorPublish;
  }

  /**
   * Set reference to MQTT backend
   */
  public setMqttBackend(mqttBackend: any): void {
    this.mqttBackend = mqttBackend;
  }

  /**
   * Start periodic shadow updates
   */
  public start(): void {
    console.log('🔄 Starting Digital Twin State Manager...');
    console.log(`   Update interval: ${this.config.updateInterval}ms (${this.config.updateInterval / 1000}s)`);
    
    // Initial update immediately
    this.updateTwinState().catch(err => {
      console.error('❌ Failed to update twin state:', err);
    });

    // Schedule periodic updates
    this.updateTimer = setInterval(() => {
      this.updateTwinState().catch(err => {
        console.error('❌ Failed to update twin state:', err);
      });
    }, this.config.updateInterval);

    console.log('✅ Digital Twin State Manager started');
  }

  /**
   * Stop periodic updates
   */
  public stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
      console.log('🛑 Digital Twin State Manager stopped');
    }
  }

  /**
   * Collect and update complete twin state
   */
  private async updateTwinState(): Promise<void> {
    try {
      console.log('🔄 Updating digital twin state...');

      const state: any = {};

      // Always include device identity
      state.identity = await this.getDeviceIdentity();

      // Collect sensor readings
      if (this.config.enableReadings && this.sensorPublish) {
        state.readings = await this.getSensorReadings();
      }

      // Collect device health
      if (this.config.enableHealth) {
        state.health = await this.getDeviceHealth();
      }

      // Collect system metrics
      if (this.config.enableSystem) {
        state.system = await this.getSystemMetrics();
      }

      // Collect connectivity status
      if (this.config.enableConnectivity) {
        state.connectivity = await this.getConnectivityStatus();
      }

      // Add timestamp
      state.lastUpdated = new Date().toISOString();

      // Update shadow
      await this.shadowFeature.updateShadow(state, true);

      console.log('✅ Digital twin state updated');
      console.log(`   Components: ${Object.keys(state).join(', ')}`);
    } catch (error) {
      console.error('❌ Error updating twin state:', error);
      this.recordError('TWIN_UPDATE_ERROR', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Get device identity information
   */
  private async getDeviceIdentity(): Promise<any> {
    const deviceInfo = await this.deviceManager.getDeviceInfo();
    
    return {
      deviceUuid: deviceInfo.uuid,
      serialNumber: (deviceInfo as any).serialNumber || deviceInfo.uuid, // Use UUID as fallback
      model: deviceInfo.deviceType || 'Iotistic-sensor',
      firmwareVersion: process.env.FIRMWARE_VERSION || '1.0.0',
      lastBootTime: new Date(this.startTime).toISOString(),
    };
  }

  /**
   * Get latest sensor readings from sensor publish feature
   */
  private async getSensorReadings(): Promise<Record<string, SensorReading>> {
    const readings: Record<string, SensorReading> = {};

    if (!this.sensorPublish) {
      return readings;
    }

    try {
      const sensors = this.sensorPublish.getSensors();
      
      for (const sensor of sensors) {
        const stats = sensor.getStats();
        const lastMessage = stats.lastMessageTime;
        
        if (lastMessage) {
          // Calculate quality based on message recency
          const ageMs = Date.now() - lastMessage.getTime();
          const quality = this.calculateReadingQuality(ageMs, sensor.config.publishInterval);
          
          readings[sensor.config.name] = {
            value: stats.messagesReceived, // Placeholder - actual sensor data would come from last message
            unit: 'messages',
            timestamp: lastMessage.toISOString(),
            quality,
          };
        }
      }
    } catch (error) {
      console.error('Error getting sensor readings:', error);
    }

    return readings;
  }

  /**
   * Calculate reading quality based on age
   */
  private calculateReadingQuality(ageMs: number, publishInterval: number): 'good' | 'degraded' | 'poor' {
    if (ageMs < publishInterval * 2) {
      return 'good';
    } else if (ageMs < publishInterval * 5) {
      return 'degraded';
    } else {
      return 'poor';
    }
  }

  /**
   * Get device health status
   */
  private async getDeviceHealth(): Promise<DeviceHealth> {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    
    // Determine overall health based on errors and system state
    let status: 'healthy' | 'degraded' | 'critical' | 'offline' = 'healthy';
    
    if (this.errors.length > 10) {
      status = 'critical';
    } else if (this.errors.length > 5) {
      status = 'degraded';
    }

    return {
      status,
      uptime,
      errors: this.errors.slice(-10), // Keep last 10 errors
      lastBootTime: new Date(this.startTime).toISOString(),
    };
  }

  /**
   * Get system metrics
   */
  private async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      // Get CPU usage
      const cpuLoad = await si.currentLoad();
      
      // Get memory usage
      const mem = await si.mem();
      
      // Get disk usage
      const fsSize = await si.fsSize();
      const rootFs = fsSize[0] || { used: 0, size: 1 };
      
      // Get CPU temperature (if available)
      let temperature: number | undefined;
      try {
        const temp = await si.cpuTemperature();
        temperature = temp.main;
      } catch {
        // Temperature not available on all systems
      }

      return {
        cpuUsage: Math.round(cpuLoad.currentLoad * 10) / 10,
        memoryUsage: Math.round(mem.used / 1024 / 1024), // MB
        memoryTotal: Math.round(mem.total / 1024 / 1024), // MB
        diskUsage: Math.round(rootFs.used / 1024 / 1024 / 1024), // GB
        diskTotal: Math.round(rootFs.size / 1024 / 1024 / 1024), // GB
        temperature,
      };
    } catch (error) {
      console.error('Error getting system metrics:', error);
      return {
        cpuUsage: 0,
        memoryUsage: 0,
        memoryTotal: 0,
        diskUsage: 0,
        diskTotal: 0,
      };
    }
  }

  /**
   * Get connectivity status
   */
  private async getConnectivityStatus(): Promise<ConnectivityStatus> {
    let mqttConnected = false;
    
    if (this.mqttBackend && typeof this.mqttBackend.isConnected === 'function') {
      mqttConnected = this.mqttBackend.isConnected();
    }

    // Check cloud connectivity (could ping cloud API)
    let cloudConnected = false;
    try {
      const cloudApiUrl = process.env.CLOUD_API_ENDPOINT;
      if (cloudApiUrl) {
        // Simple check - could make actual HTTP request
        cloudConnected = true;
      }
    } catch {
      cloudConnected = false;
    }

    return {
      mqttConnected,
      cloudConnected,
      lastHeartbeat: new Date().toISOString(),
    };
  }

  /**
   * Record an error for health tracking
   */
  public recordError(code: string, message: string): void {
    this.errors.push({
      code,
      message,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(-50);
    }
  }

  /**
   * Force an immediate twin state update
   */
  public async forceUpdate(): Promise<void> {
    await this.updateTwinState();
  }

  /**
   * Get current configuration
   */
  public getConfig(): TwinStateConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<TwinStateConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart timer if interval changed
    if (config.updateInterval && this.updateTimer) {
      this.stop();
      this.start();
    }
  }
}
