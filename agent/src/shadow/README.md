# Shadow Feature

AWS IoT Device Shadow support for Zemfyre Agent.

Ported from [AWS IoT Device Client](https://github.com/awslabs/aws-iot-device-client) shadow implementation.

## Overview

The Shadow feature enables your device to:
- Store device state in the cloud (reported state)
- Receive desired state from cloud applications
- Automatically sync when desired != reported (delta events)
- Persist shadow documents locally
- Monitor input files for automatic updates

## Architecture

### Shadow Topics

The feature uses the Zemfyre IoT device topic convention (same as sensor-publish):

- `$iot/device/{deviceUuid}/shadow/name/{shadowName}/update` - Publish updates
- `$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/accepted` - Update succeeded
- `$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/rejected` - Update failed
- `$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/documents` - Shadow changed
- `$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/delta` - Desired != reported
- `$iot/device/{deviceUuid}/shadow/name/{shadowName}/get` - Request shadow
- `$iot/device/{deviceUuid}/shadow/name/{shadowName}/get/accepted` - Get succeeded
- `$iot/device/{deviceUuid}/shadow/name/{shadowName}/get/rejected` - Get failed

**Note**: Uses device UUID instead of AWS thing name for consistency with other agent features.

### Configuration

```typescript
{
  enabled: true,
  shadowName: "device-state",           // Required: Name of shadow
  inputFile: "~/shadow-input.json",     // Optional: File to read state from
  outputFile: "~/shadow-output.json",   // Optional: File to write shadow documents to
  syncOnDelta: true,                    // Optional: Auto-sync on delta events
  enableFileMonitor: false,             // Optional: Watch inputFile for changes
  publishInterval: 60000                // Optional: Periodic publish interval (ms)
}
```

### Usage Example

```typescript
import { ShadowFeature, ShadowConfig } from './shadow';
import { DeviceManager } from './provisioning';

// Initialize
const config: ShadowConfig = {
  enabled: true,
  shadowName: 'device-config',
  inputFile: '~/device-state.json',
  outputFile: '~/shadow-document.json',
  syncOnDelta: true,
};

const shadow = new ShadowFeature(
  config,
  mqttConnection,
  logger,
  deviceUuid  // Device UUID from DeviceManager
);

// Event handlers
shadow.on('started', () => {
  console.log('Shadow feature started');
});

shadow.on('update-accepted', (response) => {
  console.log('Shadow updated:', response.version);
});

shadow.on('delta-updated', (event) => {
  console.log('Delta received:', event.state);
  // Auto-sync will update reported state to match desired
});

shadow.on('shadow-updated', (event) => {
  console.log('Shadow document changed');
  // Document written to outputFile automatically
});

// Start the feature
await shadow.start();

// Manually update shadow
await shadow.updateShadow({ temperature: 25.5, humidity: 60 });

// Get current shadow from cloud
await shadow.getShadow();

// Get statistics
const stats = shadow.getStats();
console.log('Updates published:', stats.updatesPublished);
console.log('Delta events:', stats.deltaEventsReceived);

// Stop when done
await shadow.stop();
```

### Integration with Supervisor

Add to `supervisor.ts`:

```typescript
import { ShadowFeature } from './shadow';

export default class DeviceSupervisor {
  private shadowFeature?: ShadowFeature;
  
  private async initializeShadowFeature(): Promise<void> {
    if (!process.env.ENABLE_SHADOW || process.env.ENABLE_SHADOW !== 'true') {
      console.log('⏭️  Shadow feature disabled');
      return;
    }

    const config: ShadowConfig = {
      enabled: true,
      shadowName: process.env.SHADOW_NAME || 'device-state',
      inputFile: process.env.SHADOW_INPUT_FILE,
      outputFile: process.env.SHADOW_OUTPUT_FILE,
      syncOnDelta: process.env.SHADOW_SYNC_ON_DELTA !== 'false',
      enableFileMonitor: process.env.SHADOW_FILE_MONITOR === 'true',
      publishInterval: process.env.SHADOW_PUBLISH_INTERVAL 
        ? parseInt(process.env.SHADOW_PUBLISH_INTERVAL, 10) 
        : undefined,
    };

    const mqttConnection = this.getMqttConnection(); // Your MQTT implementation
    const logger = this.getLogger(); // Your logger
    const thingName = await this.deviceManager.getDeviceUuid();

    this.shadowFeature = new ShadowFeature(
      config,
      mqttConnection,
      logger,
      thingName
    );

    this.shadowFeature.on('error', (error) => {
      console.error('❌ Shadow feature error:', error.message);
    });

    await this.shadowFeature.start();
    console.log('✅ Shadow feature initialized');
  }
}
```

### Environment Variables

```bash
# Enable/disable shadow feature
ENABLE_SHADOW=true

# Shadow configuration
SHADOW_NAME=device-state
SHADOW_INPUT_FILE=/app/data/shadow-input.json
SHADOW_OUTPUT_FILE=/app/data/shadow-output.json
SHADOW_SYNC_ON_DELTA=true
SHADOW_FILE_MONITOR=false
SHADOW_PUBLISH_INTERVAL=60000
```

## Features

### 1. Reported State

Publish device state to the cloud:

```typescript
await shadow.updateShadow({
  temperature: 25.5,
  humidity: 60,
  status: 'online'
}, true); // true = reported state
```

Cloud receives:
```json
{
  "state": {
    "reported": {
      "temperature": 25.5,
      "humidity": 60,
      "status": "online"
    }
  }
}
```

### 2. Desired State

Cloud applications can set desired state:

```json
{
  "state": {
    "desired": {
      "mode": "eco",
      "targetTemp": 22
    }
  }
}
```

Device receives delta event and auto-syncs (if `syncOnDelta: true`):

```typescript
shadow.on('delta-updated', (event) => {
  // event.state = { mode: "eco", targetTemp: 22 }
  // Auto-sync will report these values
});
```

### 3. File-Based Updates

Create `shadow-input.json`:
```json
{
  "deviceId": "sensor-001",
  "location": "warehouse-a",
  "sensors": {
    "temperature": true,
    "humidity": true
  }
}
```

Shadow feature reads and publishes automatically:
- On startup
- When file changes (if `enableFileMonitor: true`)
- Periodically (if `publishInterval` set)

### 4. Shadow Document Persistence

Every shadow update is written to `outputFile`:

```json
{
  "state": {
    "desired": { "mode": "eco" },
    "reported": { "mode": "eco", "temp": 25.5 }
  },
  "metadata": {
    "desired": { "mode": { "timestamp": 1634567890 } },
    "reported": { ... }
  },
  "version": 42,
  "timestamp": 1634567890
}
```

## AWS IoT Policy Requirements

Your device must have permissions for shadow operations:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "iot:Connect",
      "Resource": "arn:aws:iot:region:account:client/${iot:Connection.Thing.ThingName}"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Publish",
      "Resource": [
        "arn:aws:iot:region:account:topic/$aws/things/${iot:Connection.Thing.ThingName}/shadow/name/*/get",
        "arn:aws:iot:region:account:topic/$aws/things/${iot:Connection.Thing.ThingName}/shadow/name/*/update"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "iot:Subscribe",
      "Resource": [
        "arn:aws:iot:region:account:topicfilter/$aws/things/${iot:Connection.Thing.ThingName}/shadow/name/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "iot:Receive",
      "Resource": [
        "arn:aws:iot:region:account:topic/$aws/things/${iot:Connection.Thing.ThingName}/shadow/name/*"
      ]
    }
  ]
}
```

## Events

The ShadowFeature emits the following events:

- `started` - Feature started successfully
- `stopped` - Feature stopped
- `error` - Error occurred
- `update-accepted` - Shadow update was accepted (includes response)
- `update-rejected` - Shadow update was rejected (includes error)
- `delta-updated` - Desired state differs from reported (includes delta)
- `shadow-updated` - Complete shadow document changed (includes event)
- `get-accepted` - Get shadow request succeeded (includes document)
- `get-rejected` - Get shadow request failed (includes error)

## Statistics

```typescript
const stats = shadow.getStats();
console.log(stats);
// {
//   updatesPublished: 15,
//   updatesAccepted: 14,
//   updatesRejected: 1,
//   deltaEventsReceived: 3,
//   documentEventsReceived: 14,
//   getRequestsSent: 2,
//   lastUpdateTime: Date,
//   lastDeltaTime: Date,
//   lastErrorCode: 409,
//   lastErrorMessage: "Version conflict"
// }
```

## Differences from AWS IoT Device Client

1. **Language**: TypeScript instead of C++
2. **MQTT Client**: Abstracted via `MqttConnection` interface (not AWS SDK)
3. **File Monitoring**: Uses Node.js `fs.watch()` instead of `inotify`
4. **Promises**: Async/await instead of promises with callbacks
5. **Event Emitter**: Standard Node.js EventEmitter pattern
6. **No Config Shadow**: Only implements Sample Shadow (data shadow), not Config Shadow
7. **Simplified**: Removed some AWS-specific abstractions

## Future Enhancements

- [ ] Add Cloud API integration (cloud shadow service)
- [ ] Support multiple shadows per device
- [ ] Add shadow versioning conflict resolution
- [ ] Implement shadow delete operation
- [ ] Add metrics and monitoring integration
- [ ] Support shadow document size validation (8KB AWS limit)
- [ ] Add retry logic for failed updates
- [ ] Implement exponential backoff

## Testing

```bash
cd agent
npm run test:unit -- shadow
```

## References

- [AWS IoT Device Shadow Service](https://docs.aws.amazon.com/iot/latest/developerguide/iot-device-shadows.html)
- [AWS IoT Device Client](https://github.com/awslabs/aws-iot-device-client)
- [Shadow MQTT Topics](https://docs.aws.amazon.com/iot/latest/developerguide/device-shadow-mqtt.html)
