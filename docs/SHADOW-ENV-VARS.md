# Shadow Feature - Environment Variables Reference

## Quick Start

Enable the Shadow feature by setting:

```bash
ENABLE_SHADOW=true
```

## Required Environment Variables

### `ENABLE_SHADOW`
- **Type**: Boolean (true/false)
- **Default**: `false`
- **Description**: Enable or disable the Shadow feature
- **Example**: `ENABLE_SHADOW=true`

### `SHADOW_NAME`
- **Type**: String
- **Default**: `device-state`
- **Description**: Name of the shadow (must be unique per device)
- **Example**: `SHADOW_NAME=device-config`
- **MQTT Topic**: `$iot/device/{deviceUuid}/shadow/name/{shadowName}/...`
- **Note**: Uses device UUID instead of AWS thing name for consistency with agent's sensor-publish feature

## Optional Environment Variables

### Input/Output Files

#### `SHADOW_INPUT_FILE`
- **Type**: String (file path)
- **Default**: None (uses default data: `{ "welcome": "aws-iot" }`)
- **Description**: Path to JSON file containing shadow state to publish
- **Example**: `SHADOW_INPUT_FILE=/app/data/shadow-input.json`
- **Supports**: `~/` expansion for home directory

**Input file format:**
```json
{
  "temperature": 25.5,
  "humidity": 60,
  "status": "online",
  "config": {
    "mode": "eco",
    "interval": 60
  }
}
```

#### `SHADOW_OUTPUT_FILE`
- **Type**: String (file path)
- **Default**: `{DATA_DIR}/shadow-document.json` (e.g., `/app/data/shadow-document.json`)
- **Description**: Path where complete shadow documents will be written
- **Example**: `SHADOW_OUTPUT_FILE=/app/data/shadows/device-shadow.json`
- **Supports**: `~/` expansion

**Output file format:**
```json
{
  "state": {
    "desired": { "mode": "eco" },
    "reported": { "mode": "eco", "temperature": 25.5 }
  },
  "metadata": {
    "desired": { "mode": { "timestamp": 1634567890 } },
    "reported": { ... }
  },
  "version": 42,
  "timestamp": 1634567890
}
```

### Behavior Configuration

#### `SHADOW_SYNC_ON_DELTA`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Automatically update reported state to match desired state when delta events occur
- **Example**: `SHADOW_SYNC_ON_DELTA=false`
- **When true**: Device automatically syncs to match cloud's desired state
- **When false**: Device receives delta events but doesn't auto-sync

#### `SHADOW_FILE_MONITOR`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable file system monitoring of `SHADOW_INPUT_FILE` for automatic shadow updates
- **Example**: `SHADOW_FILE_MONITOR=true`
- **Requires**: `SHADOW_INPUT_FILE` must be set
- **Behavior**: When input file changes, shadow is automatically updated

#### `SHADOW_PUBLISH_INTERVAL`
- **Type**: Integer (milliseconds)
- **Default**: None (disabled)
- **Minimum**: `1000` (1 second)
- **Description**: Interval for periodic shadow updates from input file
- **Example**: `SHADOW_PUBLISH_INTERVAL=60000` (publish every 60 seconds)

### Debugging

#### `SHADOW_DEBUG`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable verbose debug logging for shadow operations
- **Example**: `SHADOW_DEBUG=true`
- **Logs**: Delta events, update responses, MQTT messages

## MQTT Backend Requirements

The Shadow feature requires an MQTT backend to be configured. It uses the same MQTT connection as other features (logging, sensor publish).

### MQTT Environment Variables (if not already configured)

```bash
MQTT_BROKER=mqtt://mosquitto:1883
MQTT_USERNAME=device-user
MQTT_PASSWORD=device-password
```

The Shadow feature automatically uses the MQTT backend if available, otherwise logs warnings.

## Complete Example Configurations

### Minimal Configuration (Default behavior)

```bash
ENABLE_SHADOW=true
SHADOW_NAME=device-state
```

This will:
- Create a shadow named "device-state"
- Publish default data: `{ "welcome": "aws-iot" }`
- Auto-sync on delta events
- Write shadow documents to `/app/data/shadow-document.json`

### File-Based Configuration

```bash
ENABLE_SHADOW=true
SHADOW_NAME=telemetry
SHADOW_INPUT_FILE=/app/data/telemetry.json
SHADOW_OUTPUT_FILE=/app/data/shadow-telemetry.json
SHADOW_FILE_MONITOR=true
```

This will:
- Read shadow state from `/app/data/telemetry.json`
- Monitor file for changes and auto-update shadow
- Write complete shadow documents to `/app/data/shadow-telemetry.json`

### Periodic Publishing Configuration

```bash
ENABLE_SHADOW=true
SHADOW_NAME=metrics
SHADOW_INPUT_FILE=/app/data/current-metrics.json
SHADOW_PUBLISH_INTERVAL=30000
SHADOW_SYNC_ON_DELTA=true
```

This will:
- Read metrics from file every 30 seconds
- Publish to shadow automatically
- Auto-sync when cloud changes desired state

### Debug Configuration

```bash
ENABLE_SHADOW=true
SHADOW_NAME=device-debug
SHADOW_DEBUG=true
```

This will:
- Enable verbose logging
- Show all MQTT messages
- Log delta events and state changes

## Docker Compose Example

```yaml
services:
  agent:
    image: iotistic/agent:latest
    environment:
      # Shadow Feature
      - ENABLE_SHADOW=true
      - SHADOW_NAME=device-config
      - SHADOW_INPUT_FILE=/app/data/device-state.json
      - SHADOW_OUTPUT_FILE=/app/data/shadow-document.json
      - SHADOW_SYNC_ON_DELTA=true
      - SHADOW_FILE_MONITOR=false
      - SHADOW_PUBLISH_INTERVAL=60000
      - SHADOW_DEBUG=false
      
      # MQTT (required for Shadow)
      - MQTT_BROKER=mqtt://mosquitto:1883
      - MQTT_USERNAME=${MQTT_USERNAME}
      - MQTT_PASSWORD=${MQTT_PASSWORD}
      
      # Other agent config...
    volumes:
      - ./data:/app/data
```

## AWS IoT Shadow Topics

When `SHADOW_NAME=device-state` and device UUID is `abc123`, the following topics are used:

**Publish (device → cloud):**
- `$aws/things/abc123/shadow/name/device-state/update` - Publish state updates
- `$aws/things/abc123/shadow/name/device-state/get` - Request current shadow

**Subscribe (cloud → device):**
- `$aws/things/abc123/shadow/name/device-state/update/accepted` - Update succeeded
- `$aws/things/abc123/shadow/name/device-state/update/rejected` - Update failed
- `$aws/things/abc123/shadow/name/device-state/update/documents` - Shadow changed
- `$aws/things/abc123/shadow/name/device-state/update/delta` - Desired ≠ reported
- `$aws/things/abc123/shadow/name/device-state/get/accepted` - Get succeeded
- `$aws/things/abc123/shadow/name/device-state/get/rejected` - Get failed

## Verifying Shadow Feature is Running

Check the agent logs on startup:

```
🔮 Initializing Shadow Feature...
✅ Shadow Feature initialized
   Shadow name: device-state
   Thing name: abc123-def456-ghi789
   Auto-sync on delta: true
   File monitor: Disabled
   Output file: /app/data/shadow-document.json
```

If disabled:
```
⏭️  Shadow Feature disabled (set ENABLE_SHADOW=true to enable)
```

## Troubleshooting

### "MQTT backend not available"

**Problem**: Shadow updates not being published

**Solution**: Ensure MQTT logging backend is configured:
```bash
MQTT_BROKER=mqtt://mosquitto:1883
```

### "Device UUID not available"

**Problem**: Shadow feature can't start without thing name

**Solution**: Ensure device is provisioned:
```bash
PROVISIONING_API_KEY=your_key_here
CLOUD_API_ENDPOINT=https://your-api.example.com
```

### "Failed to read input file"

**Problem**: `SHADOW_INPUT_FILE` path is incorrect or file doesn't exist

**Solution**: 
1. Check file path is correct
2. Ensure file exists: `ls -la /app/data/shadow-input.json`
3. Check file permissions
4. Use absolute paths or `~/` for home directory

### Delta events not triggering auto-sync

**Problem**: Device receives delta but doesn't update reported state

**Solution**: Ensure `SHADOW_SYNC_ON_DELTA=true` (default)

### File monitor not detecting changes

**Problem**: Editing input file doesn't trigger shadow update

**Solution**: 
1. Ensure `SHADOW_FILE_MONITOR=true`
2. Check `SHADOW_INPUT_FILE` is set
3. File system must support `fs.watch()` (most do)
4. Try saving/writing the file (not just appending)

## Performance Considerations

### Publish Interval

- **Too frequent**: May exceed AWS IoT rate limits (100 msg/sec)
- **Recommended**: Minimum 5 seconds (`SHADOW_PUBLISH_INTERVAL=5000`)
- **Telemetry**: 30-60 seconds
- **Configuration**: On-demand only (no interval)

### File Monitoring

- **Pros**: Instant updates when file changes
- **Cons**: Uses file system watchers (limited by OS)
- **Best for**: Configuration files updated by external tools

### Shadow Document Size

- **AWS Limit**: 8 KB per shadow document
- **Best practice**: Keep reported/desired state minimal
- **Large data**: Use separate MQTT topics or S3 for blobs

## Related Documentation

- [Shadow Feature README](../agent/src/shadow/README.md) - Complete API documentation
- [Shadow Implementation Summary](./SHADOW-IMPLEMENTATION.md) - Technical details
- [AWS IoT Device Shadow Service](https://docs.aws.amazon.com/iot/latest/developerguide/iot-device-shadows.html) - AWS official docs
