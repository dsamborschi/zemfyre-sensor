# Shadow Feature: Sensor Configuration Management

## Overview

Use the **Shadow feature** to remotely manage **sensor configurations** while **Container Manager** handles Docker infrastructure.

**Pattern**: Balena Supervisor for containers, AWS IoT Shadow for sensor configs

---

## Architecture

### Separation of Concerns

```
Container Manager (HTTP/Polling)     Shadow Feature (MQTT/Real-time)
         ↓                                      ↓
   Docker Containers                   Sensor Configuration
   - nginx                             - sensor1: enabled, 30s
   - nodered                           - sensor2: enabled, 60s
   - influxdb                          - sensor3: disabled
   - grafana                           - mqttBroker: localhost:1883
```

### Why This Makes Sense

| Aspect | Container Manager | Shadow (Sensors) |
|--------|------------------|------------------|
| **What** | Infrastructure | Application config |
| **Frequency** | Rare (image updates) | Frequent (tuning) |
| **Latency** | 60s poll OK | Real-time needed |
| **Protocol** | HTTP (reliable) | MQTT (lightweight) |
| **Scope** | System-wide | Per-feature |
| **Restart Required** | Yes (containers) | No (live update) |

---

## Shadow Schema for Sensors

### Reported State (Device → Cloud)

What sensors are **currently configured**:

```json
{
  "state": {
    "reported": {
      "sensors": {
        "sensor1": {
          "enabled": true,
          "addr": "/tmp/sensors/sensor1.sock",
          "publishInterval": 30000,
          "status": "connected",
          "lastPublish": "2025-10-18T10:30:00Z",
          "metrics": {
            "publishCount": 142,
            "errorCount": 0,
            "lastError": null
          }
        },
        "sensor2": {
          "enabled": true,
          "addr": "/tmp/sensors/sensor2.sock",
          "publishInterval": 60000,
          "status": "connected",
          "lastPublish": "2025-10-18T10:29:30Z",
          "metrics": {
            "publishCount": 71,
            "errorCount": 0,
            "lastError": null
          }
        },
        "sensor3": {
          "enabled": false,
          "addr": "/tmp/sensors/sensor3.sock",
          "publishInterval": 30000,
          "status": "disabled",
          "lastPublish": null,
          "metrics": {
            "publishCount": 0,
            "errorCount": 0,
            "lastError": null
          }
        }
      },
      "mqtt": {
        "broker": "mqtt://mosquitto:1883",
        "connected": true,
        "lastConnected": "2025-10-18T10:00:00Z"
      },
      "system": {
        "uptime": 3600,
        "version": "1.0.0"
      }
    }
  }
}
```

### Desired State (Cloud → Device)

What cloud **wants** sensors to be configured as:

```json
{
  "state": {
    "desired": {
      "sensors": {
        "sensor1": {
          "enabled": true,
          "publishInterval": 60000  // ← Cloud changed from 30s to 60s
        },
        "sensor2": {
          "enabled": true,
          "publishInterval": 120000  // ← Cloud changed from 60s to 120s
        },
        "sensor3": {
          "enabled": true,  // ← Cloud enabled sensor3
          "publishInterval": 30000
        }
      }
    }
  }
}
```

### Delta (Computed by Shadow Service)

What needs to **change**:

```json
{
  "state": {
    "delta": {
      "sensors": {
        "sensor1": {
          "publishInterval": 60000  // Change needed
        },
        "sensor2": {
          "publishInterval": 120000  // Change needed
        },
        "sensor3": {
          "enabled": true  // Change needed
        }
      }
    }
  }
}
```

---

## Implementation

### 1. Sensor Configuration Handler

**File**: `agent/src/sensor-publish/config-handler.ts`

```typescript
import { Logger } from '../logging/types';
import { ShadowFeature } from '../shadow';
import { SensorPublishFeature } from './sensor-publish-feature';

export interface SensorConfig {
  enabled: boolean;
  addr: string;
  publishInterval: number;
}

export interface SensorConfigUpdate {
  sensors: {
    [sensorName: string]: Partial<SensorConfig>;
  };
}

/**
 * Handles sensor configuration updates from Shadow
 */
export class SensorConfigHandler {
  constructor(
    private shadowFeature: ShadowFeature,
    private sensorPublishFeature: SensorPublishFeature,
    private logger: Logger
  ) {}
  
  /**
   * Start listening for delta events
   */
  public start(): void {
    this.shadowFeature.on('delta-updated', async (event) => {
      await this.handleDelta(event.state);
    });
    
    this.logger.info('SensorConfigHandler: Started');
  }
  
  /**
   * Handle delta from cloud
   */
  private async handleDelta(delta: any): Promise<void> {
    this.logger.info('☁️  Received sensor configuration update from cloud');
    
    try {
      if (!delta.sensors) {
        this.logger.debug('No sensor configuration changes');
        return;
      }
      
      // Validate configuration
      this.validateSensorConfig(delta.sensors);
      
      // Apply changes
      await this.applySensorConfig(delta.sensors);
      
      // Report back actual state
      const currentConfig = await this.getCurrentSensorConfig();
      await this.shadowFeature.updateShadow(currentConfig, true);
      
      this.logger.info('✅ Sensor configuration applied and reported');
      
    } catch (error) {
      this.logger.error('❌ Failed to apply sensor configuration:', error);
      
      // Report error
      await this.shadowFeature.updateShadow({
        error: {
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        }
      }, true);
    }
  }
  
  /**
   * Validate sensor configuration
   */
  private validateSensorConfig(sensors: any): void {
    for (const [sensorName, config] of Object.entries(sensors)) {
      if (typeof config !== 'object') continue;
      
      const sensorConfig = config as any;
      
      // Validate interval
      if (sensorConfig.publishInterval !== undefined) {
        if (typeof sensorConfig.publishInterval !== 'number') {
          throw new Error(`Invalid publishInterval for ${sensorName}: must be a number`);
        }
        
        if (sensorConfig.publishInterval < 1000) {
          throw new Error(`Invalid publishInterval for ${sensorName}: minimum 1000ms (1 second)`);
        }
        
        if (sensorConfig.publishInterval > 3600000) {
          throw new Error(`Invalid publishInterval for ${sensorName}: maximum 3600000ms (1 hour)`);
        }
      }
      
      // Validate enabled flag
      if (sensorConfig.enabled !== undefined && typeof sensorConfig.enabled !== 'boolean') {
        throw new Error(`Invalid enabled flag for ${sensorName}: must be boolean`);
      }
    }
  }
  
  /**
   * Apply sensor configuration changes
   */
  private async applySensorConfig(sensors: any): Promise<void> {
    for (const [sensorName, config] of Object.entries(sensors)) {
      if (typeof config !== 'object') continue;
      
      const sensorConfig = config as Partial<SensorConfig>;
      
      // Enable/disable sensor
      if (sensorConfig.enabled !== undefined) {
        if (sensorConfig.enabled) {
          await this.sensorPublishFeature.enableSensor(sensorName);
          this.logger.info(`✅ Enabled sensor: ${sensorName}`);
        } else {
          await this.sensorPublishFeature.disableSensor(sensorName);
          this.logger.info(`✅ Disabled sensor: ${sensorName}`);
        }
      }
      
      // Update publish interval
      if (sensorConfig.publishInterval !== undefined) {
        await this.sensorPublishFeature.updateInterval(sensorName, sensorConfig.publishInterval);
        this.logger.info(`✅ Updated interval for ${sensorName}: ${sensorConfig.publishInterval}ms`);
      }
    }
  }
  
  /**
   * Get current sensor configuration for reporting
   */
  private async getCurrentSensorConfig(): Promise<any> {
    const sensors = this.sensorPublishFeature.getSensors();
    const stats = this.sensorPublishFeature.getStats();
    
    const sensorConfig: any = {};
    
    for (const sensor of sensors) {
      const sensorStats = stats[sensor.name] || {};
      
      sensorConfig[sensor.name] = {
        enabled: sensor.enabled,
        addr: sensor.addr,
        publishInterval: sensor.publishInterval,
        status: sensor.enabled ? (sensorStats.connected ? 'connected' : 'disconnected') : 'disabled',
        lastPublish: sensorStats.lastPublishTime || null,
        metrics: {
          publishCount: sensorStats.publishCount || 0,
          errorCount: sensorStats.errorCount || 0,
          lastError: sensorStats.lastError || null
        }
      };
    }
    
    return {
      sensors: sensorConfig,
      mqtt: {
        broker: process.env.MQTT_BROKER || 'mqtt://mosquitto:1883',
        connected: this.sensorPublishFeature.isMqttConnected(),
        lastConnected: new Date().toISOString()
      },
      system: {
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      }
    };
  }
}
```

---

### 2. Extend SensorPublishFeature

**File**: `agent/src/sensor-publish/sensor-publish-feature.ts`

Add these methods:

```typescript
export class SensorPublishFeature extends EventEmitter {
  // ... existing code ...
  
  /**
   * Enable a sensor by name
   */
  public async enableSensor(sensorName: string): Promise<void> {
    const sensor = this.sensors.find(s => s.name === sensorName);
    if (!sensor) {
      throw new Error(`Sensor not found: ${sensorName}`);
    }
    
    if (!sensor.enabled) {
      sensor.enabled = true;
      await this.connectSensor(sensor);
      this.logger.info(`Sensor enabled: ${sensorName}`);
    }
  }
  
  /**
   * Disable a sensor by name
   */
  public async disableSensor(sensorName: string): Promise<void> {
    const sensor = this.sensors.find(s => s.name === sensorName);
    if (!sensor) {
      throw new Error(`Sensor not found: ${sensorName}`);
    }
    
    if (sensor.enabled) {
      sensor.enabled = false;
      if (sensor.client) {
        sensor.client.end();
        sensor.client = undefined;
      }
      this.logger.info(`Sensor disabled: ${sensorName}`);
    }
  }
  
  /**
   * Update publish interval for a sensor
   */
  public async updateInterval(sensorName: string, intervalMs: number): Promise<void> {
    const sensor = this.sensors.find(s => s.name === sensorName);
    if (!sensor) {
      throw new Error(`Sensor not found: ${sensorName}`);
    }
    
    sensor.publishInterval = intervalMs;
    
    // Restart interval timer if sensor is connected
    if (sensor.enabled && sensor.client) {
      // Clear old interval if exists
      if (sensor.publishTimer) {
        clearInterval(sensor.publishTimer);
      }
      
      // Start new interval
      sensor.publishTimer = setInterval(() => {
        this.requestSensorData(sensor);
      }, sensor.publishInterval);
      
      this.logger.info(`Updated publish interval for ${sensorName}: ${intervalMs}ms`);
    }
  }
  
  /**
   * Get all sensors
   */
  public getSensors(): Array<{ name: string; enabled: boolean; addr: string; publishInterval: number }> {
    return this.sensors.map(s => ({
      name: s.name,
      enabled: s.enabled,
      addr: s.addr,
      publishInterval: s.publishInterval
    }));
  }
  
  /**
   * Get statistics for all sensors
   */
  public getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const sensor of this.sensors) {
      stats[sensor.name] = {
        connected: sensor.client?.readyState === 'open',
        publishCount: sensor.publishCount || 0,
        errorCount: sensor.errorCount || 0,
        lastError: sensor.lastError || null,
        lastPublishTime: sensor.lastPublishTime || null
      };
    }
    
    return stats;
  }
  
  /**
   * Check if MQTT is connected
   */
  public isMqttConnected(): boolean {
    return this.mqttClient?.connected || false;
  }
}
```

---

### 3. Integrate with Supervisor

**File**: `agent/src/supervisor.ts`

```typescript
import { SensorConfigHandler } from './sensor-publish/config-handler';

export default class DeviceSupervisor {
  private shadowFeature?: ShadowFeature;
  private sensorConfigHandler?: SensorConfigHandler;
  
  // ... existing code ...
  
  public async init(): Promise<void> {
    // ... existing initialization ...
    
    // Initialize features
    await this.initializeSensorPublishFeature();
    await this.initializeShadowFeature();
    
    // Initialize sensor config handler (after both features exist)
    if (this.shadowFeature && this.sensorPublishFeature) {
      this.sensorConfigHandler = new SensorConfigHandler(
        this.shadowFeature,
        this.sensorPublishFeature,
        this.getLogger()
      );
      this.sensorConfigHandler.start();
      console.log('✅ Sensor config handler started');
    }
  }
  
  private async initializeShadowFeature(): Promise<void> {
    // ... existing shadow setup ...
    
    // Report initial sensor configuration
    if (this.sensorPublishFeature) {
      await this.reportSensorConfigToShadow();
    }
  }
  
  private async reportSensorConfigToShadow(): Promise<void> {
    if (!this.shadowFeature || !this.sensorPublishFeature) return;
    
    try {
      const sensors = this.sensorPublishFeature.getSensors();
      const stats = this.sensorPublishFeature.getStats();
      
      const sensorConfig: any = {};
      for (const sensor of sensors) {
        const sensorStats = stats[sensor.name] || {};
        sensorConfig[sensor.name] = {
          enabled: sensor.enabled,
          addr: sensor.addr,
          publishInterval: sensor.publishInterval,
          status: sensor.enabled ? 'ready' : 'disabled',
          metrics: {
            publishCount: 0,
            errorCount: 0
          }
        };
      }
      
      await this.shadowFeature.updateShadow({
        sensors: sensorConfig,
        mqtt: {
          broker: process.env.MQTT_BROKER || 'mqtt://mosquitto:1883',
          connected: true
        },
        system: {
          uptime: process.uptime(),
          version: process.env.npm_package_version || '1.0.0'
        }
      }, true);
      
      console.log('📊 Reported initial sensor configuration to shadow');
    } catch (error) {
      console.error('❌ Failed to report sensor config:', error);
    }
  }
}
```

---

## Usage Examples

### Example 1: Change Sensor Interval

**Cloud Dashboard**:

```bash
# Update shadow desired state
curl -X POST http://cloud-api/shadow/update \
  -H "Content-Type: application/json" \
  -d '{
    "desired": {
      "sensors": {
        "sensor1": {
          "publishInterval": 120000
        }
      }
    }
  }'
```

**Device receives delta via MQTT**:
```
☁️  Received sensor configuration update from cloud
✅ Updated interval for sensor1: 120000ms
✅ Sensor configuration applied and reported
```

**Shadow state after**:
```json
{
  "desired": { "sensors": { "sensor1": { "publishInterval": 120000 } } },
  "reported": { "sensors": { "sensor1": { "publishInterval": 120000 } } }
}
```
Delta eliminated! ✅

---

### Example 2: Enable Disabled Sensor

**Cloud Dashboard**:

```json
{
  "desired": {
    "sensors": {
      "sensor3": {
        "enabled": true
      }
    }
  }
}
```

**Device behavior**:
1. Validates: `enabled` is boolean ✅
2. Calls: `sensorPublishFeature.enableSensor('sensor3')`
3. Connects to socket: `/tmp/sensors/sensor3.sock`
4. Reports back: sensor3 now `"status": "connected"`

---

### Example 3: Bulk Update

**Cloud Dashboard** (change multiple sensors at once):

```json
{
  "desired": {
    "sensors": {
      "sensor1": {
        "publishInterval": 60000
      },
      "sensor2": {
        "publishInterval": 90000
      },
      "sensor3": {
        "enabled": false
      }
    }
  }
}
```

**Device applies all changes**, then reports:

```json
{
  "reported": {
    "sensors": {
      "sensor1": { "publishInterval": 60000, "status": "connected" },
      "sensor2": { "publishInterval": 90000, "status": "connected" },
      "sensor3": { "enabled": false, "status": "disabled" }
    }
  }
}
```

---

## Testing

### 1. Enable Shadow Feature

```bash
export ENABLE_SHADOW=true
export SHADOW_NAME=sensor-config
export ENABLE_SENSOR_PUBLISH=true
npm run dev
```

### 2. Check Initial State

Device should report initial sensor config to shadow automatically.

### 3. Update Sensor Config via MQTT

```bash
# Simulate cloud updating desired state
mosquitto_pub -h localhost -p 1883 \
  -t 'iot/device/{device-uuid}/shadow/name/sensor-config/update' \
  -m '{
    "state": {
      "desired": {
        "sensors": {
          "sensor1": {
            "publishInterval": 120000
          }
        }
      }
    }
  }'
```

### 4. Verify Device Logs

```
☁️  Received sensor configuration update from cloud
✅ Updated interval for sensor1: 120000ms
✅ Sensor configuration applied and reported
```

### 5. Subscribe to Shadow Updates

```bash
mosquitto_sub -h localhost -p 1883 \
  -t 'iot/device/{device-uuid}/shadow/name/sensor-config/update/documents'
```

Should show delta eliminated (desired = reported).

---

## Benefits

### Container Manager (Balena Pattern)
- ✅ Manages Docker containers
- ✅ HTTP polling (reliable for infrastructure)
- ✅ Infrequent updates (image releases)
- ✅ System-level changes (requires restart)

### Shadow Feature (Sensor Config)
- ✅ Manages sensor settings
- ✅ MQTT real-time (instant updates)
- ✅ Frequent tuning (optimize intervals)
- ✅ Application-level (no restart needed)

---

## Comparison

| Operation | Protocol | Latency | Restart Required |
|-----------|----------|---------|------------------|
| Deploy new container | HTTP | 60s | Yes (new container) |
| Update container image | HTTP | 60s | Yes (restart container) |
| Change sensor interval | MQTT | <1s | No (live update) |
| Enable/disable sensor | MQTT | <1s | No (live update) |

---

## Summary

**YES! Shadow feature is PERFECT for sensor management** because:

1. **Separation of concerns**: Containers vs Sensor Config
2. **Different protocols**: HTTP (infrastructure) vs MQTT (config)
3. **Different frequencies**: Rare (containers) vs Frequent (sensors)
4. **Live updates**: Sensors can be tuned without restart
5. **Real-time**: MQTT delivers config instantly
6. **Consistent pattern**: Both apply cloud-desired state, just at different layers

This is the **ideal architecture** for your IoT platform! 🎯
