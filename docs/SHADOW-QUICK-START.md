# Shadow Feature - Quick Start Guide

## 🚀 Get Started in 3 Steps

### 1. Enable the Feature

Add to your `.env` file or docker-compose.yml:

```bash
ENABLE_SHADOW=true
SHADOW_NAME=device-state
```

### 2. Start the Agent

```bash
cd agent
npm run dev
```

You should see in the logs:

```
🔮 Initializing Shadow Feature...
✅ Shadow Feature initialized
   Shadow name: device-state
   Device UUID: your-device-uuid
   Auto-sync on delta: true
```

### 3. Test It!

The shadow feature will automatically:
- Publish initial state to shadow
- Listen for delta events from cloud
- Write shadow documents to `/app/data/shadow-document.json`

## 📋 Common Use Cases

### Use Case 1: Device Configuration Shadow

Store device configuration in the cloud, update remotely.

```bash
ENABLE_SHADOW=true
SHADOW_NAME=device-config
SHADOW_INPUT_FILE=/app/data/config.json
SHADOW_SYNC_ON_DELTA=true
```

**`/app/data/config.json`:**
```json
{
  "updateInterval": 60,
  "logLevel": "info",
  "features": {
    "sensors": true,
    "telemetry": true
  }
}
```

**From cloud:**
Change desired state via AWS IoT Console or API:
```json
{
  "state": {
    "desired": {
      "updateInterval": 30,
      "logLevel": "debug"
    }
  }
}
```

Device automatically receives delta and syncs!

### Use Case 2: Real-Time Telemetry Shadow

Publish sensor data periodically to shadow.

```bash
ENABLE_SHADOW=true
SHADOW_NAME=telemetry
SHADOW_INPUT_FILE=/app/data/telemetry.json
SHADOW_PUBLISH_INTERVAL=30000
```

**`/app/data/telemetry.json`:**
```json
{
  "temperature": 25.5,
  "humidity": 60,
  "pressure": 1013.25,
  "timestamp": "2025-10-14T21:00:00Z"
}
```

Shadow publishes every 30 seconds automatically.

### Use Case 3: Dynamic Configuration with File Monitoring

Update configuration file, shadow updates automatically.

```bash
ENABLE_SHADOW=true
SHADOW_NAME=live-config
SHADOW_INPUT_FILE=/app/data/settings.json
SHADOW_FILE_MONITOR=true
```

Edit `/app/data/settings.json` → Shadow updates immediately!

## 🔧 Advanced Configuration

### Multiple Shadows (Future Feature)

You can run multiple shadow instances by:
1. Creating multiple agent instances
2. Each with different `SHADOW_NAME`
3. Or wait for multi-shadow support (coming soon)

### Debug Mode

See exactly what's happening:

```bash
ENABLE_SHADOW=true
SHADOW_NAME=device-state
SHADOW_DEBUG=true
```

Logs will show:
- All MQTT publish/subscribe operations
- Delta events received
- Update accepted/rejected responses
- Shadow document changes

### Production Configuration

```bash
# Enable with explicit configuration
ENABLE_SHADOW=true
SHADOW_NAME=production-device-state

# Read from persistent storage
SHADOW_INPUT_FILE=/app/data/device-state.json

# Write shadow documents for backup
SHADOW_OUTPUT_FILE=/app/data/shadows/device-state.json

# Auto-sync on cloud changes
SHADOW_SYNC_ON_DELTA=true

# Publish every 5 minutes
SHADOW_PUBLISH_INTERVAL=300000

# No debug logging in production
SHADOW_DEBUG=false
```

## 🧪 Testing Locally

### 1. Create Test Input File

```bash
mkdir -p agent/data
cat > agent/data/shadow-test.json << EOF
{
  "status": "online",
  "version": "1.0.0",
  "lastBoot": "2025-10-14T20:00:00Z"
}
EOF
```

### 2. Configure Environment

```bash
export ENABLE_SHADOW=true
export SHADOW_NAME=test-shadow
export SHADOW_INPUT_FILE=./data/shadow-test.json
export SHADOW_OUTPUT_FILE=./data/shadow-output.json
export SHADOW_DEBUG=true
```

### 3. Run Agent

```bash
cd agent
npm run dev
```

### 4. Check Output

```bash
cat agent/data/shadow-output.json
```

Should see complete shadow document with version, timestamp, metadata.

## 🐳 Docker Compose Example

```yaml
version: '3.8'

services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto/config:/mosquitto/config

  agent:
    build: ./agent
    depends_on:
      - mosquitto
    environment:
      # Shadow Feature
      - ENABLE_SHADOW=true
      - SHADOW_NAME=device-state
      - SHADOW_INPUT_FILE=/app/data/device-state.json
      - SHADOW_OUTPUT_FILE=/app/data/shadow-document.json
      - SHADOW_SYNC_ON_DELTA=true
      - SHADOW_FILE_MONITOR=true
      - SHADOW_DEBUG=false
      
      # MQTT Connection
      - MQTT_BROKER=mqtt://mosquitto:1883
      
      # Device Config
      - DEVICE_API_PORT=48484
      - DATA_DIR=/app/data
      
    volumes:
      - ./agent/data:/app/data
    ports:
      - "48484:48484"
```

## 📊 Monitoring Shadow Operations

### Check Shadow Statistics

Shadow feature tracks statistics. Access via device info or logs:

- Updates published
- Updates accepted/rejected
- Delta events received
- Document events received
- Last update time
- Last delta time
- Last error (if any)

### Log Output Examples

**Successful initialization:**
```
🔮 Initializing Shadow Feature...
[Shadow] ShadowFeature: Subscribing to shadow topics
[Shadow] ShadowFeature: Subscribed to $aws/things/.../update/accepted
✅ Shadow Feature started
✅ Shadow Feature initialized
   Shadow name: device-state
   Thing name: abc-123-def-456
   Auto-sync on delta: true
   File monitor: Enabled
   Input file: /app/data/device-state.json
   Output file: /app/data/shadow-document.json
```

**Update accepted:**
```
[Shadow] ShadowFeature: Publishing shadow update (token: 12345678-1234...)
[Shadow] ShadowFeature: Shadow update accepted (version: 5, token: 12345678...)
[Shadow] ShadowFeature: Stored the latest device-state shadow document to local successfully
```

**Delta received (with auto-sync):**
```
[Shadow] Shadow delta received (version: 6)
[Shadow] Auto-syncing shadow (reporting delta as current state)
```

**Error handling:**
```
[Shadow] Shadow update rejected: Version conflict (code: 409)
```

## 🔐 AWS IoT Integration

### Required IAM Policy

Your device must have these permissions in its IoT policy:

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

### View Shadow in AWS Console

1. Go to AWS IoT Console
2. Navigate to **Manage** → **Things**
3. Select your device (thing name = device UUID)
4. Click **Device Shadows** tab
5. Find your shadow by name (e.g., "device-state")
6. View current state, update desired state

## ❓ FAQ

### Q: Can I have multiple shadows per device?
**A:** Currently one shadow per agent instance. Run multiple agents with different `SHADOW_NAME` for multiple shadows, or wait for multi-shadow support.

### Q: What if MQTT is not available?
**A:** Shadow feature logs warnings and continues without publishing. Ensure MQTT backend is configured.

### Q: Does it work with local MQTT (not AWS IoT)?
**A:** Yes! Uses standard MQTT topics. Works with Mosquitto, AWS IoT, or any MQTT broker.

### Q: How do I update shadow from my application?
**A:** Update the input JSON file (if `SHADOW_FILE_MONITOR=true`) or use the Device API to trigger manual updates.

### Q: What's the difference between desired and reported state?
- **Desired**: What the cloud/application wants the device state to be
- **Reported**: What the device actually reports as its current state
- **Delta**: When desired ≠ reported, device gets delta event

### Q: How do I disable auto-sync?
**A:** Set `SHADOW_SYNC_ON_DELTA=false`. Device will receive delta events but won't automatically update reported state.

## 🆘 Troubleshooting

See [SHADOW-ENV-VARS.md](./SHADOW-ENV-VARS.md#troubleshooting) for detailed troubleshooting guide.

## 📚 Next Steps

- Read [Shadow Feature README](../agent/src/shadow/README.md) for API details
- Review [Environment Variables Reference](./SHADOW-ENV-VARS.md)
- Check [Implementation Summary](./SHADOW-IMPLEMENTATION.md) for technical details
- Explore [AWS IoT Device Shadow Documentation](https://docs.aws.amazon.com/iot/latest/developerguide/iot-device-shadows.html)

Happy shadowing! 🌟
