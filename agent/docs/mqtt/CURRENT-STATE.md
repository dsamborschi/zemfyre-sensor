# MQTT Initialization - Current State & Next Steps

## 📍 Where MQTT is Currently Initialized

**File**: `agent/src/supervisor.ts`  
**Method**: `initializeLogging()` (line ~176)  
**Condition**: Only if `MQTT_BROKER` environment variable is set

### Current Initialization Flow

```
DeviceSupervisor.init()
  │
  ├─ 1. initializeDatabase()
  ├─ 2. initializeDeviceManager()
  │
  ├─ 3. initializeLogging() ← MQTT INITIALIZED HERE
  │   │
  │   └─ if (process.env.MQTT_BROKER) {
  │        const mqttBackend = new MqttLogBackend({
  │          brokerUrl: process.env.MQTT_BROKER,
  │          clientOptions: { clientId: `device_${uuid}` },
  │          ...
  │        });
  │        await mqttBackend.connect();  // ← Creates MQTT connection
  │        this.logBackends.push(mqttBackend);
  │      }
  │
  ├─ 4. initializeContainerManager()
  ├─ 5. initializeDeviceAPI()
  │
  └─ 6. initializeShadowFeature() (line ~553)
       │
       └─ Reuses MqttLogBackend connection:
            const mqttConnection = {
              publish: async (topic, payload, qos) => {
                const mqttBackend = this.logBackends
                  .find(b => b.constructor.name === 'MqttLogBackend');
                if (mqttBackend) {
                  await mqttBackend.publish(topic, payload, qos);
                }
              },
              ...
            };
```

## ⚠️ Current Issues

### 1. **Not Using Centralized MqttManager**
- MQTT connection created directly by `MqttLogBackend`
- Shadow feature finds and reuses `MqttLogBackend` connection
- Not using the new `MqttManager` singleton

### 2. **Tight Coupling**
- Shadow feature tightly coupled to `MqttLogBackend`
- Searches through `logBackends` array to find MQTT backend
- Breaks if MQTT logging is disabled

### 3. **Incomplete Refactor**
- Created `MqttManager` but not integrated into supervisor
- `MqttLogBackend` refactored to use `MqttManager`, but supervisor doesn't initialize it
- The centralized manager is available but not used

## ✅ What Should Happen (Recommended Fix)

### New Initialization Flow

```
DeviceSupervisor.init()
  │
  ├─ 1. initializeDatabase()
  ├─ 2. initializeDeviceManager()
  │
  ├─ 3. initializeMqttManager() ← NEW: Initialize FIRST
  │   │
  │   └─ if (process.env.MQTT_BROKER) {
  │        const mqttManager = MqttManager.getInstance();
  │        await mqttManager.connect(process.env.MQTT_BROKER, {
  │          clientId: `device_${uuid}`,
  │          ...
  │        });
  │        mqttManager.setDebug(process.env.MQTT_DEBUG === 'true');
  │      }
  │
  ├─ 4. initializeLogging()
  │   │
  │   └─ if (process.env.MQTT_BROKER) {
  │        const mqttBackend = new MqttLogBackend({...});
  │        await mqttBackend.connect();  // ← Uses existing MqttManager
  │        this.logBackends.push(mqttBackend);
  │      }
  │
  ├─ 5. initializeContainerManager()
  ├─ 6. initializeDeviceAPI()
  │
  └─ 7. initializeShadowFeature()
       │
       └─ const shadowAdapter = new MqttShadowAdapter(
            process.env.MQTT_BROKER,
            { clientId: `shadow-${uuid}` }
          );  // ← Uses MqttManager automatically
```

## 🔧 Implementation Steps

### Step 1: Add `initializeMqttManager()` Method

Add to `supervisor.ts` (around line 175, before `initializeLogging()`):

```typescript
private async initializeMqttManager(): Promise<void> {
  if (!process.env.MQTT_BROKER) {
    console.log('⏭️  MQTT disabled (set MQTT_BROKER to enable)');
    return;
  }

  console.log('🔌 Initializing MQTT Manager...');
  
  try {
    const deviceInfo = this.deviceManager.getDeviceInfo();
    const mqttManager = MqttManager.getInstance();
    
    await mqttManager.connect(process.env.MQTT_BROKER, {
      clientId: `device_${deviceInfo.uuid}`,
      clean: true,
      reconnectPeriod: 5000,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    });
    
    // Enable debug mode if requested
    if (process.env.MQTT_DEBUG === 'true') {
      mqttManager.setDebug(true);
    }
    
    console.log(`✅ MQTT Manager connected: ${process.env.MQTT_BROKER}`);
  } catch (error) {
    console.error('❌ Failed to initialize MQTT Manager:', error);
    throw error;
  }
}
```

### Step 2: Update Imports

Add to imports at top of `supervisor.ts`:

```typescript
import { MqttManager } from './mqtt/mqtt-manager';
import { MqttShadowAdapter } from './shadow/mqtt-shadow-adapter';
```

### Step 3: Call in `init()` Method

Update the `init()` method (around line 64):

```typescript
public async init(): Promise<void> {
  console.log('🚀 Initializing Device Supervisor...');
  console.log('='.repeat(80));

  try {
    // 1. Initialize database
    await this.initializeDatabase();

    // 2. Initialize device provisioning
    await this.initializeDeviceManager();

    // 3. Initialize MQTT Manager (NEW - before logging)
    await this.initializeMqttManager();

    // 4. Initialize logging
    await this.initializeLogging();
    
    // ... rest of initialization
  }
}
```

### Step 4: Simplify `initializeShadowFeature()`

Replace the `mqttConnection` object (lines ~583-612) with:

```typescript
// Use centralized MQTT adapter
const shadowAdapter = new MqttShadowAdapter(
  process.env.MQTT_BROKER!,
  { clientId: `shadow-${deviceInfo.uuid}` }
);

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
  shadowAdapter,  // ← Use adapter instead of manual connection
  shadowLogger,
  deviceInfo.uuid
);
```

## 📊 Benefits of This Change

### Before
- ❌ MQTT connection hidden inside `MqttLogBackend`
- ❌ Shadow feature searches for MQTT backend
- ❌ Tight coupling between features
- ❌ Not using centralized manager

### After
- ✅ MQTT initialized explicitly and early
- ✅ All features use `MqttManager` singleton
- ✅ Loose coupling via adapters
- ✅ Single connection shared across all features
- ✅ Easy to debug with centralized logging
- ✅ Consistent reconnection behavior

## 🧪 Testing After Implementation

### 1. Verify Single Connection

```bash
# Start supervisor
cd agent
npm run dev

# Check MQTT connections (should see only 1)
docker exec -it mosquitto netstat -tn | grep :1883
```

### 2. Enable Debug Mode

```bash
export MQTT_DEBUG=true
npm run dev

# Look for logs:
# [MqttManager] Connecting to MQTT broker: mqtt://mosquitto:1883
# [MqttManager] ✅ Connected to MQTT broker
# [MqttManager] 📥 Subscribed to topic: shadow/...
```

### 3. Test Features

```bash
# Test shadow updates
mosquitto_sub -h localhost -t 'shadow/#' -v

# Test logging
mosquitto_sub -h localhost -t 'device/logs/#' -v
```

## 📝 Summary

**Current State**:
- ✅ `MqttManager` created and working
- ✅ `MqttLogBackend` refactored to use `MqttManager`
- ✅ `MqttShadowAdapter` refactored to use `MqttManager`
- ❌ **NOT integrated into supervisor yet**

**Required Action**:
1. Add `initializeMqttManager()` method to supervisor
2. Call it before `initializeLogging()`
3. Update `initializeShadowFeature()` to use `MqttShadowAdapter`
4. Test all features

**Impact**:
- ~30 lines of code to add/modify in supervisor
- No breaking changes to other components
- Immediate benefit: single MQTT connection

---

**Files to Modify**:
- `agent/src/supervisor.ts` (main integration)

**Documentation**:
- See `agent/docs/mqtt/README.md` for full details
- See `agent/docs/mqtt/INTEGRATION-CHECKLIST.md` for testing
