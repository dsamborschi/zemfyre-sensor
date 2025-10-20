# Shadow Desired State Handler - Implementation Guide

## Overview

This document describes how the device handles **desired state updates** from the cloud via Shadow delta events, enabling remote configuration management.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloud / Dashboard                       │
│                                                              │
│  User Updates Shadow Desired State:                         │
│  {                                                           │
│    "desired": {                                              │
│      "features": {                                           │
│        "sensorPublish": { "enabled": true, "interval": 60 }, │
│        "logging": { "level": "debug" }                       │
│      }                                                       │
│    }                                                         │
│  }                                                           │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         │ MQTT: $iot/device/{uuid}/shadow/name/device-config/update/delta
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                         Device Agent                         │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │           Shadow Feature (delta handler)            │    │
│  └─────────────────────┬───────────────────────────────┘    │
│                        │ emit('delta-updated', event)       │
│                        ↓                                     │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Supervisor (orchestrator)              │    │
│  │                                                     │    │
│  │  1. Validate configuration                          │    │
│  │  2. Apply to features                               │    │
│  │  3. Report back actual state                        │    │
│  └─────────┬───────────────────────────────┬──────────┘    │
│            │                               │                │
│            ↓                               ↓                │
│  ┌──────────────────┐          ┌──────────────────┐       │
│  │ SensorPublish    │          │   Logger         │       │
│  │  .updateConfig() │          │   .setLevel()    │       │
│  └──────────────────┘          └──────────────────┘       │
│                                                              │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       │ MQTT: $iot/device/{uuid}/shadow/name/device-config/update
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                      Cloud Shadow Service                    │
│                                                              │
│  Shadow Updated:                                            │
│  {                                                           │
│    "state": {                                                │
│      "desired": { ... },                                     │
│      "reported": { ... },  ← Device confirmed               │
│      "delta": {}           ← Delta eliminated               │
│    }                                                         │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Create Desired State Handler

**File**: `agent/src/shadow/desired-state-handler.ts`

```typescript
import { Logger } from '../logging/types';
import { ShadowFeature } from './shadow-feature';

export interface DesiredFeatureConfig {
  sensorPublish?: {
    enabled: boolean;
    interval?: number;
    sensors?: string[];
  };
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    compression?: boolean;
  };
  shadow?: {
    enabled: boolean;
    syncInterval?: number;
  };
}

export interface DesiredStateHandlerDeps {
  shadowFeature: ShadowFeature;
  logger: Logger;
  sensorPublishFeature?: any; // Replace with actual type
  // Add other features as needed
}

/**
 * Handles desired state updates from cloud via Shadow delta events
 */
export class DesiredStateHandler {
  private deps: DesiredStateHandlerDeps;
  
  constructor(deps: DesiredStateHandlerDeps) {
    this.deps = deps;
  }
  
  /**
   * Initialize and start listening for delta events
   */
  public start(): void {
    this.deps.shadowFeature.on('delta-updated', (event) => {
      this.handleDeltaUpdate(event.state);
    });
    
    this.deps.logger.info('DesiredStateHandler: Started listening for delta events');
  }
  
  /**
   * Handle delta update from cloud
   */
  private async handleDeltaUpdate(delta: any): Promise<void> {
    this.deps.logger.info('☁️  Received desired state update from cloud');
    
    try {
      // Extract features configuration
      if (delta.features) {
        await this.applyFeatureConfiguration(delta.features);
      }
      
      // Report success
      await this.deps.shadowFeature.updateShadow(delta, true); // reported = applied
      this.deps.logger.info('✅ Configuration applied and reported');
      
    } catch (error) {
      this.deps.logger.error('❌ Failed to apply configuration:', error);
      
      // Report error back to cloud
      await this.deps.shadowFeature.updateShadow({
        error: {
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        }
      }, true);
    }
  }
  
  /**
   * Apply feature configuration changes
   */
  private async applyFeatureConfiguration(features: DesiredFeatureConfig): Promise<void> {
    // Apply sensor publish configuration
    if (features.sensorPublish) {
      this.validateSensorPublishConfig(features.sensorPublish);
      
      if (this.deps.sensorPublishFeature) {
        await this.deps.sensorPublishFeature.updateConfig(features.sensorPublish);
        this.deps.logger.info('✅ Applied sensor publish configuration');
      } else {
        this.deps.logger.warn('⚠️  Sensor publish feature not available');
      }
    }
    
    // Apply logging configuration
    if (features.logging) {
      this.validateLoggingConfig(features.logging);
      this.deps.logger.setLevel(features.logging.level);
      this.deps.logger.info(`✅ Applied logging level: ${features.logging.level}`);
    }
    
    // Add more feature configurations as needed
  }
  
  /**
   * Validate sensor publish configuration
   */
  private validateSensorPublishConfig(config: DesiredFeatureConfig['sensorPublish']): void {
    if (config?.interval && config.interval < 1000) {
      throw new Error('Sensor publish interval must be at least 1000ms');
    }
    
    if (config?.interval && config.interval > 3600000) {
      throw new Error('Sensor publish interval cannot exceed 1 hour');
    }
  }
  
  /**
   * Validate logging configuration
   */
  private validateLoggingConfig(config: DesiredFeatureConfig['logging']): void {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (config?.level && !validLevels.includes(config.level)) {
      throw new Error(`Invalid logging level: ${config.level}. Must be one of: ${validLevels.join(', ')}`);
    }
  }
}
```

---

### 2. Integrate with Supervisor

**File**: `agent/src/supervisor.ts`

```typescript
import { DesiredStateHandler } from './shadow/desired-state-handler';

export default class DeviceSupervisor {
  private shadowFeature?: ShadowFeature;
  private desiredStateHandler?: DesiredStateHandler;
  
  // ... existing code ...
  
  private async initializeShadowFeature(): Promise<void> {
    if (!this.ENABLE_SHADOW) {
      console.log('⏭️  Shadow Feature disabled');
      return;
    }

    console.log('🔮 Initializing Shadow Feature...');
    
    try {
      const deviceInfo = this.deviceManager.getDeviceInfo();
      if (!deviceInfo || !deviceInfo.uuid) {
        console.error('❌ Device UUID not available');
        return;
      }

      // Create MQTT wrapper for shadow
      const mqttWrapper = this.createMqttConnectionWrapper();
      
      // Shadow configuration
      const shadowConfig: ShadowConfig = {
        enabled: true,
        shadowName: process.env.SHADOW_NAME || 'device-config',
        inputFile: process.env.SHADOW_INPUT_FILE,
        outputFile: process.env.SHADOW_OUTPUT_FILE,
        syncOnDelta: false, // ← DON'T auto-sync, we handle manually
        enableFileMonitor: process.env.SHADOW_FILE_MONITOR === 'true',
        publishInterval: process.env.SHADOW_PUBLISH_INTERVAL 
          ? parseInt(process.env.SHADOW_PUBLISH_INTERVAL, 10) 
          : undefined,
      };

      // Create shadow feature
      this.shadowFeature = new ShadowFeature(
        shadowConfig,
        mqttWrapper,
        this.getLogger(),
        deviceInfo.uuid
      );

      // Start shadow feature
      await this.shadowFeature.start();
      console.log('✅ Shadow feature started');

      // Create desired state handler
      this.desiredStateHandler = new DesiredStateHandler({
        shadowFeature: this.shadowFeature,
        logger: this.getLogger(),
        sensorPublishFeature: this.sensorPublishFeature,
      });
      
      this.desiredStateHandler.start();
      console.log('✅ Desired state handler started');
      
      // Report initial state
      await this.reportCurrentStateToShadow();
      
    } catch (error) {
      console.error('❌ Failed to initialize Shadow feature:', error);
    }
  }
  
  /**
   * Report current feature configuration to shadow
   */
  private async reportCurrentStateToShadow(): Promise<void> {
    if (!this.shadowFeature) return;
    
    try {
      const currentConfig = {
        features: {
          sensorPublish: this.sensorPublishFeature?.getConfig() || { enabled: false },
          logging: {
            level: this.getLogger().getLevel(),
          },
          shadow: {
            enabled: true,
          },
        },
        system: {
          uptime: process.uptime(),
          version: process.env.npm_package_version,
        },
        timestamp: new Date().toISOString(),
      };
      
      await this.shadowFeature.updateShadow(currentConfig, true);
      console.log('📊 Reported current state to shadow');
      
    } catch (error) {
      console.error('❌ Failed to report state to shadow:', error);
    }
  }
}
```

---

### 3. Update Shadow Configuration

**File**: `.env` or environment variables

```bash
# Enable shadow feature
ENABLE_SHADOW=true

# Shadow configuration
SHADOW_NAME=device-config
SHADOW_INPUT_FILE=  # Leave empty - use programmatic updates
SHADOW_OUTPUT_FILE=/app/data/shadow-output.json
SHADOW_SYNC_ON_DELTA=false  # DON'T auto-sync, we handle manually
SHADOW_FILE_MONITOR=false
SHADOW_PUBLISH_INTERVAL=  # Leave empty - report on changes only
```

---

## Usage Examples

### Example 1: Change Sensor Publish Interval

**Cloud Dashboard** (or API):

```bash
# Update shadow desired state
curl -X POST http://cloud-api/devices/{deviceUuid}/shadow \
  -H "Content-Type: application/json" \
  -d '{
    "desired": {
      "features": {
        "sensorPublish": {
          "enabled": true,
          "interval": 120000
        }
      }
    }
  }'
```

**Device Behavior**:

1. Receives delta via MQTT
2. Validates: `interval >= 1000` ✅
3. Applies: `sensorPublishFeature.updateConfig({ interval: 120000 })`
4. Reports: Updates shadow reported state
5. Cloud sees: Delta eliminated, reported = desired

---

### Example 2: Enable Debug Logging

**Cloud Dashboard**:

```json
{
  "desired": {
    "features": {
      "logging": {
        "level": "debug"
      }
    }
  }
}
```

**Device Behavior**:

1. Receives delta
2. Validates: `level` is valid ✅
3. Applies: `logger.setLevel('debug')`
4. Reports: Updates shadow
5. Device now logs at debug level

---

### Example 3: Invalid Configuration

**Cloud Dashboard** (sends invalid config):

```json
{
  "desired": {
    "features": {
      "sensorPublish": {
        "interval": 500  // TOO LOW! Min is 1000ms
      }
    }
  }
}
```

**Device Behavior**:

1. Receives delta
2. Validates: `interval < 1000` ❌
3. Throws error: "Sensor publish interval must be at least 1000ms"
4. Reports error to shadow:
   ```json
   {
     "reported": {
       "error": {
         "message": "Sensor publish interval must be at least 1000ms",
         "timestamp": "2025-10-18T10:30:00Z"
       }
     }
   }
   ```
5. Cloud dashboard shows error, admin fixes configuration

---

## Testing

### 1. Enable Shadow Feature

```bash
cd agent
export ENABLE_SHADOW=true
export SHADOW_NAME=device-config
export SHADOW_SYNC_ON_DELTA=false
npm run dev
```

### 2. Publish Desired State via MQTT

```bash
# Simulate cloud updating desired state
mosquitto_pub -h localhost -p 1883 \
  -t '$iot/device/{your-device-uuid}/shadow/name/device-config/update' \
  -m '{
    "state": {
      "desired": {
        "features": {
          "logging": {
            "level": "debug"
          }
        }
      }
    }
  }'
```

### 3. Verify Device Logs

```
☁️  Received desired state update from cloud
✅ Applied logging level: debug
✅ Configuration applied and reported
```

### 4. Check Shadow State

```bash
# Subscribe to shadow updates
mosquitto_sub -h localhost -p 1883 \
  -t '$iot/device/{your-device-uuid}/shadow/name/device-config/update/documents'
```

Should show:
```json
{
  "current": {
    "state": {
      "desired": { "features": { "logging": { "level": "debug" } } },
      "reported": { "features": { "logging": { "level": "debug" } } }
    }
  }
}
```

Notice: `desired` = `reported` (delta eliminated)

---

## Benefits

1. **Remote Configuration**: Change device behavior without SSH/manual updates
2. **Real-Time**: MQTT delivers updates instantly
3. **Validation**: Device rejects invalid configurations
4. **Confirmation**: Cloud knows when device applied changes
5. **Error Reporting**: Device reports failures back to cloud
6. **Offline Support**: Device can apply changes when reconnected
7. **Consistent Pattern**: Matches Container Manager's target state pattern

---

## Security Considerations

1. **Validation**: Always validate desired state before applying
2. **Rate Limiting**: Limit frequency of configuration changes
3. **Rollback**: Keep previous config for rollback on failure
4. **Audit Logging**: Log all configuration changes
5. **Authorization**: Verify cloud API has permission to update shadow

---

## Future Enhancements

- [ ] Add configuration rollback on failure
- [ ] Implement gradual rollout (canary deployments)
- [ ] Add configuration history tracking
- [ ] Support partial configuration updates
- [ ] Add configuration templates/presets
- [ ] Implement A/B testing for configurations
