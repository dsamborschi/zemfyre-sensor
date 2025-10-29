# Feature Refactoring Plan

## Goal
Eliminate repetitive MQTT connection and logger setup code by using BaseFeature class.

## BaseFeature Benefits
- ✅ Automatic MQTT connection via MqttManager.getInstance()
- ✅ Feature-specific logger wrapper (auto-prefixes with component name)
- ✅ Wait for MQTT connection with timeout
- ✅ Lifecycle management (start/stop with validation)
- ✅ Debug mode detection (feature-specific env vars)
- ✅ Consistent error handling

## Features to Refactor

### 1. ShadowFeature ⏳
**File**: `agent/src/shadow/index.ts`
**Current**: Creates own logger, receives MqttConnection
**Change**: Extend BaseFeature, use inherited mqtt/logger
**Impact**: `agent.ts` initializeShadowFeature() simplified

### 2. SensorPublishFeature ⏳
**File**: `agent/src/sensor-publish/index.ts` (SensorPublishFeature class)
**Current**: Creates own logger, receives MQTT connection wrapper
**Change**: Extend BaseFeature
**Impact**: `agent.ts` initializeSensorPublish() simplified

### 3. ProtocolAdaptersFeature ⏳
**File**: `agent/src/adapters/index.ts`
**Current**: Creates own logger, doesn't use MQTT
**Change**: Extend BaseFeature (requiresMqtt: false)
**Impact**: `agent.ts` initializeProtocolAdapters() simplified

### 4. TwinStateManager ⏳
**File**: `agent/src/digital-twin/twin-state-manager.ts`
**Current**: Receives shadowFeature, deviceManager, creates logger
**Change**: Could extend BaseFeature, but tightly coupled to shadow
**Impact**: Consider after Shadow refactor

### 5. JobsFeature (MQTT Jobs) ⏳
**File**: `agent/src/jobs/src/index.ts`
**Current**: Uses JobsMqttConnectionAdapter
**Change**: Could extend BaseFeature
**Impact**: `agent.ts` initializeMqttJobsFeature() simplified

## Agent.ts Changes

### Before (Current Pattern):
```typescript
private async initializeShadowFeature(): Promise<void> {
  // 50+ lines of:
  // - Logger setup
  // - MQTT connection waiting
  // - Event handler setup
  // - Error handling
}
```

### After (With BaseFeature):
```typescript
private async initializeShadowFeature(): Promise<void> {
  const shadowConfig = { /* ... */ };
  this.shadowFeature = new ShadowFeature(
    shadowConfig,
    this.agentLogger,
    'Shadow',
    this.deviceInfo.uuid
  );
  await this.shadowFeature.start();
}
```

## Implementation Order

1. ✅ **BaseFeature** - Created and tested
2. **ShadowFeature** - Refactor first (most critical for current work)
3. **SensorPublishFeature** - Refactor second (uses similar pattern)
4. **ProtocolAdaptersFeature** - Refactor third (simpler, no MQTT)
5. **Update agent.ts** - Simplify all initialize methods
6. **Test Integration** - Verify all features work with new pattern
7. **Optional**: TwinStateManager, JobsFeature

## Testing Checklist

After each refactor:
- [ ] Feature starts without errors
- [ ] MQTT connection established
- [ ] Feature-specific debug logging works
- [ ] Feature can be stopped cleanly
- [ ] Integration with agent.ts works
- [ ] No breaking changes to feature API

## Notes

- Keep backward compatibility where possible
- Each feature can override `onInitialize()`, `onStart()`, `onStop()`
- Features can access `this.mqttConnection` and `this.logger` directly
- Debug env vars: SHADOW_DEBUG, SENSOR_PUBLISH_DEBUG, PROTOCOL_ADAPTERS_DEBUG, etc.
