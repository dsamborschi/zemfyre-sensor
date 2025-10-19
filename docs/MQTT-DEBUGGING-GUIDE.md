# MQTT Manager Debugging Guide

## Problem

API's MQTT Manager is not receiving messages in `handleMessage()` even though device is publishing.

## Debug Logs Added

Added comprehensive logging to track message flow:

### 1. Connection Logs
```typescript
console.log('✅ Connected to MQTT broker');
console.log('📋 Client ID:', this.config.clientId);
console.log('🔧 QoS:', this.config.qos);
```

### 2. Subscription Logs
```typescript
console.log('🔍 Attempting to subscribe to:', pattern);
console.log(`✅ Subscribed to ${pattern} (QoS: ${this.config.qos})`);
```

### 3. Message Receipt Logs
```typescript
console.log('📨 Raw MQTT message event fired:', topic);
console.log('🔔 MQTT Message received:', { topic, payloadSize, preview });
```

## Debugging Steps

### Step 1: Check API is Starting MQTT

```bash
cd api
npm run dev

# Look for these logs:
🔌 Initializing MQTT service...
📡 Connecting to MQTT broker: mqtt://localhost:1883
✅ Connected to MQTT broker
📋 Client ID: api-server (or similar)
🔧 QoS: 1
📡 Subscribing to all device topics...
🔍 Attempting to subscribe to: device/*/sensor/+/data
✅ Subscribed to device/*/sensor/+/data (QoS: 1)
🔍 Attempting to subscribe to: $iot/device/*/shadow/name/+/update/accepted
✅ Subscribed to $iot/device/*/shadow/name/+/update/accepted (QoS: 1)
🔍 Attempting to subscribe to: $iot/device/*/shadow/name/+/update/delta
✅ Subscribed to $iot/device/*/shadow/name/+/update/delta (QoS: 1)
✅ MQTT service initialized
```

**If you DON'T see these**: Check environment variables.

### Step 2: Check Environment Variables

```bash
# Required for API MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_SUBSCRIBE_ALL=true  # Default is true, but verify
```

**Common Issues**:
- `MQTT_BROKER_URL` not set → MQTT service won't initialize
- Wrong port (1883 vs 5883 vs 51883)
- `MQTT_SUBSCRIBE_ALL=false` → Won't subscribe to topics

### Step 3: Test MQTT Broker is Working

```bash
# Terminal 1: Subscribe to test topic
mosquitto_sub -h localhost -p 1883 -t 'test/topic' -v

# Terminal 2: Publish to test topic
mosquitto_pub -h localhost -p 1883 -t 'test/topic' -m 'hello'

# Terminal 1 should show:
test/topic hello
```

**If this DOESN'T work**: MQTT broker is not running or wrong port.

### Step 4: Monitor ALL MQTT Traffic

```bash
# Subscribe to ALL topics (# is multi-level wildcard)
mosquitto_sub -h localhost -p 1883 -t '#' -v

# You should see:
# - Device publishing shadow updates
# - API's subscriptions (if broker logs them)
```

### Step 5: Check What Device is Publishing

```bash
# In device agent logs, look for:
[Shadow] Publishing shadow update (token: abc-123...)

# Monitor specific shadow topics
mosquitto_sub -h localhost -p 1883 -t '$iot/device/+/shadow/#' -v

# You should see messages like:
$iot/device/YOUR-UUID/shadow/name/sensor-config/update {"state":{"reported":{...}}}
$iot/device/YOUR-UUID/shadow/name/sensor-config/update/accepted {"state":{...}}
```

### Step 6: Check API Client ID Conflict

**Issue**: If API and Device use the same client ID, one disconnects the other.

```bash
# Device agent uses:
device_{deviceUuid}

# API uses:
api-server (or api-{hostname})
```

**Check API logs for**:
```
⚠️  MQTT client offline
🔄 Reconnecting to MQTT broker...
```

**If you see reconnection loops**: Client ID conflict!

### Step 7: Check Topic Wildcards

**Device publishes to**:
```
$iot/device/abc-123-456/shadow/name/sensor-config/update
```

**MQTT broker responds with**:
```
$iot/device/abc-123-456/shadow/name/sensor-config/update/accepted
```

**API subscribes to**:
```
$iot/device/*/shadow/name/+/update/accepted
```

**Wildcards**:
- `*` = matches ONE level (device UUID)
- `+` = matches ONE level (shadow name)

**Test subscription match**:
```bash
# This SHOULD match
Topic:        $iot/device/abc-123/shadow/name/sensor-config/update/accepted
Subscription: $iot/device/*/shadow/name/+/update/accepted
Result:       ✅ MATCH

# This should NOT match
Topic:        device/abc-123/shadow/reported
Subscription: $iot/device/*/shadow/name/+/update/accepted
Result:       ❌ NO MATCH (different prefix)
```

## Common Problems & Solutions

### Problem 1: No MQTT logs at all

**Symptom**:
```
⚠️  MQTT broker not configured. Set MQTT_BROKER_URL to enable MQTT features.
```

**Solution**:
```bash
export MQTT_BROKER_URL=mqtt://localhost:1883
# or in .env file:
MQTT_BROKER_URL=mqtt://localhost:1883
```

### Problem 2: Connected but no subscriptions

**Symptom**:
```
✅ Connected to MQTT broker
⚠️  MQTT subscription disabled. Set MQTT_SUBSCRIBE_ALL=true to enable.
```

**Solution**:
```bash
export MQTT_SUBSCRIBE_ALL=true
# or in .env file:
MQTT_SUBSCRIBE_ALL=true
```

### Problem 3: Wrong MQTT port

**Symptom**:
```
❌ MQTT connection error: connect ECONNREFUSED 127.0.0.1:1883
```

**Solution**: Check which port MQTT broker is running on:
```bash
# Check if mosquitto is running
docker ps | grep mosquitto

# or if running locally
netstat -an | grep 1883

# Common ports:
# 1883 - Standard MQTT
# 5883 - Custom (your docker-compose might use this)
# 51883 - External mapping
```

### Problem 4: Client ID conflict

**Symptom**:
```
✅ Connected to MQTT broker
⚠️  MQTT client offline
🔄 Reconnecting to MQTT broker...
✅ Connected to MQTT broker
⚠️  MQTT client offline
(repeats)
```

**Solution**: Ensure unique client IDs
```bash
# Device agent
MQTT client: device_{uuid}

# API
MQTT client: api-server

# Check in logs:
📋 Client ID: api-server  ← Should be different from device
```

### Problem 5: Topic doesn't match subscription

**Symptom**:
```
# Device publishes, mosquitto_sub receives, but API doesn't
```

**Debug**:
```bash
# Subscribe with exact same pattern as API
mosquitto_sub -h localhost -p 1883 -t '$iot/device/*/shadow/name/+/update/accepted' -v

# If mosquitto_sub receives but API doesn't → API subscription issue
# If mosquitto_sub doesn't receive → Topic pattern mismatch
```

**Solution**: Verify topic format matches exactly:
```typescript
// Device publishes to:
$iot/device/{uuid}/shadow/name/{shadowName}/update

// Broker responds on:
$iot/device/{uuid}/shadow/name/{shadowName}/update/accepted

// API subscribes to:
$iot/device/*/shadow/name/+/update/accepted  ✅ Should match
```

### Problem 6: QoS Mismatch

**Symptom**: Messages intermittently not received

**Check**:
```bash
# Device publishes with QoS 1 (default)
# API subscribes with QoS 1 (default)
```

**Solution**: Ensure both use same QoS
```bash
# API
MQTT_QOS=1

# Device (in MQTT backend config)
MQTT_QOS=1
```

## Expected Behavior

### When API Starts

```bash
🔌 Initializing MQTT service...
📡 Connecting to MQTT broker: mqtt://localhost:1883
✅ Connected to MQTT broker
📋 Client ID: api-server
🔧 QoS: 1
📡 Subscribing to all device topics...
🔍 Attempting to subscribe to: device/*/sensor/+/data
✅ Subscribed to device/*/sensor/+/data (QoS: 1)
🔍 Attempting to subscribe to: $iot/device/*/shadow/name/+/update/accepted
✅ Subscribed to $iot/device/*/shadow/name/+/update/accepted (QoS: 1)
🔍 Attempting to subscribe to: $iot/device/*/shadow/name/+/update/delta
✅ Subscribed to $iot/device/*/shadow/name/+/update/delta (QoS: 1)
🔍 Attempting to subscribe to: device/*/logs/+
✅ Subscribed to device/*/logs/+ (QoS: 1)
🔍 Attempting to subscribe to: device/*/metrics
✅ Subscribed to device/*/metrics (QoS: 1)
🔍 Attempting to subscribe to: device/*/status
✅ Subscribed to device/*/status (QoS: 1)
✅ MQTT service initialized
```

### When Device Publishes Shadow Update

```bash
# Device log:
[Shadow] Publishing shadow update (token: abc-123...)

# API log (NEW with debug):
📨 Raw MQTT message event fired: $iot/device/abc-123.../shadow/name/sensor-config/update/accepted
🔔 MQTT Message received: {
  topic: '$iot/device/abc-123.../shadow/name/sensor-config/update/accepted',
  payloadSize: 234,
  preview: '{"state":{"reported":{"sensors":...'
}
✅ Detected AWS IoT Shadow topic
🌓 Shadow reported from abc-123.../sensor-config
✅ Updated shadow reported state: abc-123...
```

## Quick Diagnostic Checklist

- [ ] MQTT broker running and accessible
- [ ] `MQTT_BROKER_URL` environment variable set
- [ ] `MQTT_SUBSCRIBE_ALL=true` (or not set to false)
- [ ] Correct port (1883, 5883, or 51883)
- [ ] Unique client IDs (device vs API)
- [ ] Topic patterns match (AWS IoT format)
- [ ] QoS levels compatible (both using 1)
- [ ] No firewall blocking MQTT traffic
- [ ] Device actually publishing (check device logs)
- [ ] MQTT broker receiving messages (check with mosquitto_sub)

## Next Steps

1. **Restart API with debug logs**: `npm run dev`
2. **Check what you see**: Compare with "Expected Behavior" above
3. **If no subscriptions**: Check `MQTT_BROKER_URL` and `MQTT_SUBSCRIBE_ALL`
4. **If no messages**: Test with `mosquitto_sub` to verify broker receiving
5. **If mosquitto_sub works but API doesn't**: Check client ID conflict

---

**After fixing, you should see `📨 Raw MQTT message event fired` in API logs when device publishes!**
