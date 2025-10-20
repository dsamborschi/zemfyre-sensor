# Centralized MQTT Management

## Overview

This refactor consolidates all MQTT connection logic into a single **`MqttManager`** singleton class. Previously, jobs, shadows, and logging each created their own MQTT connections, leading to redundant code and multiple connections to the same broker.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MqttManager (Singleton)                 │
│  - Single MQTT connection to broker                          │
│  - Message routing to multiple subscribers                   │
│  - Automatic reconnection handling                           │
│  - Wildcard topic matching (+, #)                            │
└──────────────┬──────────────────┬──────────────────┬─────────┘
               │                  │                  │
       ┌───────▼──────┐  ┌────────▼────────┐ ┌──────▼────────┐
       │ Jobs Feature │  │ Shadow Feature  │ │ Log Backend   │
       │ (Adapter)    │  │ (Adapter)       │ │               │
       └──────────────┘  └─────────────────┘ └───────────────┘
```

## Files Structure

```
agent/src/mqtt/
├── index.ts                      # Exports
├── mqtt-manager.ts               # Core singleton manager
└── mqtt-connection-adapter.ts    # Interface adapters for features
```

### Refactored Files

- **`src/shadow/mqtt-shadow-adapter.ts`** - Now uses `MqttManager` instead of creating its own client
- **`src/logging/mqtt-backend.ts`** - Now uses `MqttManager` instead of creating its own client
- **Jobs feature** - Can use `JobsMqttConnectionAdapter` to work with `MqttManager`

## Usage

### 1. Initialize MQTT Manager (Once per Application)

```typescript
import { MqttManager } from './mqtt/mqtt-manager';

const mqttManager = MqttManager.getInstance();
await mqttManager.connect('mqtt://mosquitto:1883', {
  clientId: 'device-agent',
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
});

// Enable debug logging (optional)
mqttManager.setDebug(true);
```

### 2. Use in Shadow Feature

```typescript
import { MqttShadowAdapter } from './shadow/mqtt-shadow-adapter';
import { ShadowFeature } from './shadow/shadow';

// Create adapter (will use shared MqttManager)
const mqttAdapter = new MqttShadowAdapter('mqtt://mosquitto:1883', {
  clientId: `shadow-${deviceUuid}`,
});

// Create and start shadow feature
const shadowFeature = new ShadowFeature(config, mqttAdapter, logger, deviceUuid);
await shadowFeature.start();
```

### 3. Use in Logging

```typescript
import { MqttLogBackend } from './logging/mqtt-backend';
import { Logger } from './logging/logger';

// Create MQTT log backend (will use shared MqttManager)
const mqttBackend = new MqttLogBackend({
  brokerUrl: 'mqtt://mosquitto:1883',
  baseTopic: 'device/logs',
  qos: 1,
  enableBatching: true,
  debug: true,
});

await mqttBackend.connect();

// Add to logger
const logger = new Logger();
logger.addBackend(mqttBackend);
```

### 4. Use in Jobs Feature

```typescript
import { JobsMqttConnectionAdapter } from './mqtt/mqtt-connection-adapter';
import { JobsFeature } from './jobs/src/jobs-feature';

// Create adapter (will use shared MqttManager)
const mqttConnection = new JobsMqttConnectionAdapter();

// Create and start jobs feature
const jobsFeature = new JobsFeature(
  mqttConnection,
  logger,
  notifier,
  jobsConfig
);
await jobsFeature.start();
```

### 5. Direct Usage (Advanced)

```typescript
import { MqttManager } from './mqtt/mqtt-manager';

const mqttManager = MqttManager.getInstance();

// Publish
await mqttManager.publish('sensor/temperature', '25.5', { qos: 1, retain: true });

// Subscribe with handler
await mqttManager.subscribe('sensor/#', { qos: 1 }, (topic, payload) => {
  console.log(`Received on ${topic}:`, payload.toString());
});

// Unsubscribe
await mqttManager.unsubscribe('sensor/#');

// Check connection status
if (mqttManager.isConnected()) {
  console.log('MQTT is connected');
}
```

## Key Features

### 1. **Singleton Pattern**
- Only one MQTT connection per application
- Reduces resource usage and connection overhead
- Shared across all features (jobs, shadows, logs)

### 2. **Idempotent Connection**
- Calling `connect()` multiple times is safe
- Returns existing connection if already connected
- Waits for in-progress connections

### 3. **Message Routing**
- Centralized message routing to all subscribers
- Supports MQTT wildcards (`+` and `#`)
- Each handler receives only matching messages

### 4. **Automatic Reconnection**
- Built-in reconnection logic (5s interval)
- Connection state tracking
- Graceful error handling

### 5. **Debug Mode**
- Enable verbose logging: `mqttManager.setDebug(true)`
- Track connections, subscriptions, and message routing

## Migration Guide

### Before (Old Pattern)

Each feature created its own MQTT client:

```typescript
// shadow/mqtt-shadow-adapter.ts (OLD)
import mqtt from 'mqtt';

export class MqttShadowAdapter {
  private client: mqtt.MqttClient;
  
  constructor(brokerUrl: string) {
    this.client = mqtt.connect(brokerUrl);  // ❌ Separate connection
    this.client.on('connect', () => { ... });
    this.client.on('message', (topic, payload) => { ... });
  }
}

// logging/mqtt-backend.ts (OLD)
export class MqttLogBackend {
  private client: MqttClient | null;
  
  async connect() {
    this.client = mqtt.connect(brokerUrl);  // ❌ Another separate connection
  }
}
```

### After (New Pattern)

All features use the shared `MqttManager`:

```typescript
// shadow/mqtt-shadow-adapter.ts (NEW)
import { MqttManager } from '../mqtt/mqtt-manager';

export class MqttShadowAdapter {
  private mqttManager: MqttManager;
  
  constructor(brokerUrl: string) {
    this.mqttManager = MqttManager.getInstance();  // ✅ Shared manager
    this.mqttManager.connect(brokerUrl);  // Idempotent
  }
  
  async publish(topic: string, payload: string) {
    await this.mqttManager.publish(topic, payload, { qos: 1 });
  }
}

// logging/mqtt-backend.ts (NEW)
import { MqttManager } from '../mqtt/mqtt-manager';

export class MqttLogBackend {
  private mqttManager: MqttManager;
  
  constructor(options) {
    this.mqttManager = MqttManager.getInstance();  // ✅ Same shared manager
  }
  
  async connect() {
    await this.mqttManager.connect(this.options.brokerUrl);
  }
}
```

## Benefits

### 1. **Reduced Complexity**
- ✅ Single connection to manage
- ✅ No duplicate reconnection logic
- ✅ Centralized error handling

### 2. **Resource Efficiency**
- ✅ One TCP connection instead of 3+
- ✅ Lower memory footprint
- ✅ Reduced network overhead

### 3. **Maintainability**
- ✅ MQTT logic in one place (`MqttManager`)
- ✅ Easy to add new features using MQTT
- ✅ Consistent behavior across features

### 4. **Debugging**
- ✅ Single debug flag for all MQTT traffic
- ✅ Centralized logging
- ✅ Easier to trace message flow

## Testing

### Unit Tests

```typescript
import { MqttManager } from './mqtt/mqtt-manager';

describe('MqttManager', () => {
  let manager: MqttManager;
  
  beforeEach(() => {
    manager = MqttManager.getInstance();
  });
  
  it('should be a singleton', () => {
    const instance1 = MqttManager.getInstance();
    const instance2 = MqttManager.getInstance();
    expect(instance1).toBe(instance2);
  });
  
  it('should connect to broker', async () => {
    await manager.connect('mqtt://localhost:1883');
    expect(manager.isConnected()).toBe(true);
  });
  
  it('should route messages to handlers', async () => {
    const messages: string[] = [];
    
    await manager.subscribe('test/+', { qos: 1 }, (topic, payload) => {
      messages.push(payload.toString());
    });
    
    await manager.publish('test/1', 'hello', { qos: 1 });
    
    // Wait for message
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(messages).toContain('hello');
  });
});
```

### Integration Tests

```bash
# Start MQTT broker
docker-compose up -d mosquitto

# Run tests
npm test -- mqtt-manager.test.ts
```

## Troubleshooting

### Connection Issues

```typescript
// Enable debug mode
mqttManager.setDebug(true);

// Check connection status
if (!mqttManager.isConnected()) {
  console.error('MQTT not connected');
}

// Try reconnecting
await mqttManager.disconnect();
await mqttManager.connect('mqtt://mosquitto:1883');
```

### Message Not Received

1. **Check subscription**: Ensure topic pattern matches
   ```typescript
   // Subscribe to specific topic
   await mqttManager.subscribe('sensor/temperature', { qos: 1 }, handler);
   
   // Or use wildcard
   await mqttManager.subscribe('sensor/#', { qos: 1 }, handler);
   ```

2. **Verify QoS levels**: Match publisher and subscriber QoS
   ```typescript
   await mqttManager.publish('sensor/temp', '25', { qos: 1 });  // QoS 1
   await mqttManager.subscribe('sensor/temp', { qos: 1 }, handler);  // QoS 1
   ```

3. **Check topic matching logic**: The `topicMatches()` function supports wildcards

### Multiple Connections

If you accidentally create multiple connections:

```typescript
// ❌ Wrong - creates duplicate connection
const manager1 = new MqttManager();  // Error: Constructor is private

// ✅ Correct - uses singleton
const manager = MqttManager.getInstance();
```

## Future Enhancements

- [ ] **Connection pooling** for multiple brokers
- [ ] **Metrics** for pub/sub operations
- [ ] **Message buffering** during disconnections
- [ ] **TLS/SSL support** configuration
- [ ] **Last Will and Testament (LWT)** configuration

## API Reference

### MqttManager

#### Methods

- **`getInstance(): MqttManager`** - Get singleton instance
- **`connect(brokerUrl: string, options?: IClientOptions): Promise<void>`** - Connect to broker
- **`publish(topic: string, payload: string | Buffer, options?: IClientPublishOptions): Promise<void>`** - Publish message
- **`subscribe(topic: string, options?: IClientSubscribeOptions, handler?: MessageHandler): Promise<void>`** - Subscribe to topic
- **`unsubscribe(topic: string): Promise<void>`** - Unsubscribe from topic
- **`isConnected(): boolean`** - Check connection status
- **`disconnect(): Promise<void>`** - Disconnect from broker
- **`setDebug(enabled: boolean): void`** - Enable/disable debug logging
- **`getClient(): MqttClient | null`** - Get underlying MQTT client (advanced)

### Adapters

- **`JobsMqttConnectionAdapter`** - Implements `JobsMqttConnection` interface
- **`ShadowMqttConnectionAdapter`** - Implements `ShadowMqttConnection` interface

## Related Documentation

- [MQTT Protocol](https://mqtt.org/)
- [Eclipse Mosquitto](https://mosquitto.org/)
- [Node.js MQTT Client](https://github.com/mqttjs/MQTT.js)
- [Shadow Feature Docs](../shadow/README.md)
- [Jobs Feature Docs](../jobs/README.md)
- [Logging System Docs](../logging/README.md)
