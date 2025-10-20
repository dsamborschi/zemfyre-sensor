# Shadow Feature Refactoring - Topic Convention Update

## Summary

The Shadow feature has been refactored to use the Zemfyre IoT device topic convention, matching the sensor-publish feature for consistency.

## Changes Made

### 1. Topic Convention

**Old (AWS IoT style):**
```
$aws/things/{thingName}/shadow/name/{shadowName}/update
$aws/things/{thingName}/shadow/name/{shadowName}/update/accepted
$aws/things/{thingName}/shadow/name/{shadowName}/update/rejected
$aws/things/{thingName}/shadow/name/{shadowName}/update/delta
$aws/things/{thingName}/shadow/name/{shadowName}/update/documents
$aws/things/{thingName}/shadow/name/{shadowName}/get
...
```

**New (Zemfyre IoT style):**
```
$iot/device/{deviceUuid}/shadow/name/{shadowName}/update
$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/accepted
$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/rejected
$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/delta
$iot/device/{deviceUuid}/shadow/name/{shadowName}/update/documents
$iot/device/{deviceUuid}/shadow/name/{shadowName}/get
...
```

### 2. Parameter Naming

**Constructor signature changed:**

```typescript
// Old
constructor(
  config: ShadowConfig,
  mqttConnection: MqttConnection,
  logger: Logger,
  thingName: string  // AWS IoT thing name
)

// New
constructor(
  config: ShadowConfig,
  mqttConnection: MqttConnection,
  logger: Logger,
  deviceUuid: string  // Zemfyre device UUID
)
```

### 3. Files Modified

1. **`agent/src/shadow/types.ts`**
   - Updated `ShadowTopics` class
   - Changed constructor parameter from `thingName` to `deviceUuid`
   - Updated all topic generation methods

2. **`agent/src/shadow/shadow-feature.ts`**
   - Changed constructor parameter from `thingName` to `deviceUuid`
   - Updated internal property name

3. **`agent/src/shadow/README.md`**
   - Updated topic documentation
   - Added note about device UUID usage
   - Updated code examples

4. **`agent/test/unit/shadow-feature.unit.spec.ts`**
   - Updated all test cases to use `deviceUuid`
   - Updated topic assertions to match new pattern

5. **`docs/SHADOW-ENV-VARS.md`**
   - Updated topic pattern documentation

6. **`docs/SHADOW-IMPLEMENTATION.md`**
   - Updated code examples

7. **`docs/SHADOW-QUICK-START.md`**
   - Updated log output examples
   - Updated security/permissions section

## Benefits

### 1. Consistency Across Features

All agent features now use the same topic convention:

**Sensor Publish:**
```
$iot/device/{deviceUuid}/sensor/{sensorTopic}
$iot/device/{deviceUuid}/sensor/{heartbeatTopic}
```

**Shadow:**
```
$iot/device/{deviceUuid}/shadow/name/{shadowName}/*
```

**Future features** will follow the same pattern: `$iot/device/{deviceUuid}/{feature}/...`

### 2. Cloud API Integration

The cloud API can now easily:
- Route messages by device UUID
- Apply consistent ACLs
- Track device activity by UUID prefix
- Build dashboards grouped by device

### 3. Simplified Security

MQTT ACLs can use pattern matching:
```conf
# Mosquitto ACL - single rule for all device features
pattern readwrite $iot/device/%u/#
```

## Migration Notes

### For Existing Deployments

If you have existing shadow data on AWS IoT or another MQTT broker:

1. **Option A: Topic Bridge**
   - Set up an MQTT bridge to forward between old and new topics
   - Example with Mosquitto:
   ```conf
   connection bridge-aws-to-zemfyre
   topic $aws/things/+/shadow/# both 0 "" $iot/device/
   ```

2. **Option B: Update Shadow Names**
   - Use new shadow names to start fresh
   - Old shadows remain available on old topics

3. **Option C: Dual Subscribe**
   - Subscribe to both topic patterns temporarily
   - Gradually migrate cloud applications to new pattern

### For New Deployments

No migration needed! Just use the new topic convention from the start.

## Testing

All unit tests pass with the new convention:

```bash
cd agent
npm test -- shadow-feature.unit.spec.ts
```

Expected output:
```
 PASS  test/unit/shadow-feature.unit.spec.ts
  ShadowFeature
    ✓ should initialize with valid config
    ✓ should subscribe to shadow topics on start
    ✓ should publish shadow updates
    ✓ should handle delta events
    ...
```

## Example Usage

```typescript
import { ShadowFeature, ShadowConfig } from './shadow';

const config: ShadowConfig = {
  enabled: true,
  shadowName: 'device-state',
  syncOnDelta: true,
};

// Get device UUID from DeviceManager
const deviceInfo = await deviceManager.getDeviceInfo();

const shadow = new ShadowFeature(
  config,
  mqttConnection,
  logger,
  deviceInfo.uuid  // Device UUID, not thing name
);

await shadow.start();
```

## MQTT Topic Examples

With device UUID `abc-123-def`:

**Update Shadow:**
```
Topic: $iot/device/abc-123-def/shadow/name/device-state/update
Payload: {"state": {"reported": {"temperature": 25.5}}}
```

**Subscribe to Delta:**
```
Topic: $iot/device/abc-123-def/shadow/name/device-state/update/delta
```

**Get Shadow:**
```
Topic: $iot/device/abc-123-def/shadow/name/device-state/get
Payload: {}
```

## Documentation

For full documentation, see:
- `agent/src/shadow/README.md` - API reference
- `docs/SHADOW-QUICK-START.md` - Quick start guide
- `docs/SHADOW-ENV-VARS.md` - Environment variables
- `docs/SHADOW-IMPLEMENTATION.md` - Implementation details

## Questions?

- **Q: Why change from AWS thing names?**
  - A: For consistency with other agent features and to work with any MQTT broker

- **Q: Does this break AWS IoT compatibility?**
  - A: No! You can still use AWS IoT, just configure topic mapping in IoT Core

- **Q: What about existing shadows?**
  - A: Use topic bridges or create new shadows with new names

---

**Last Updated**: October 14, 2025
**Version**: 2.0.0
