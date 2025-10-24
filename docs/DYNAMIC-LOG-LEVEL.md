# Dynamic Log Level Configuration

## Overview

The agent now supports **dynamic log level configuration** via the device target state config. You can change the log verbosity (e.g., enable `debug` logging) without restarting the agent - perfect for troubleshooting live systems!

## How It Works

1. **Configuration Location**: `device_target_state.config.logging.level`
2. **Valid Levels**: `'debug'`, `'info'`, `'warn'`, `'error'`
3. **Default Level**: `'info'` (if not specified)
4. **Update Mechanism**: Agent polls for target state changes (~30 seconds), detects config changes, and applies new log level immediately
5. **No Restart Required**: Change takes effect on next poll cycle

## Log Level Hierarchy

```
debug → info → warn → error
 ↑                      ↑
most verbose       least verbose
```

| Level | What Gets Logged | Use Case |
|-------|------------------|----------|
| **debug** | Everything (debug, info, warn, error) | **Troubleshooting**, analyzing behavior, development |
| **info** | Normal operations + warnings + errors | **Production** (default), standard monitoring |
| **warn** | Warnings + errors only | Reduce noise, focus on issues |
| **error** | Errors only | Minimal logging, critical issues only |

## Usage

### Method 1: PowerShell Script (Recommended)

```powershell
# Enable debug logging for troubleshooting
cd api/scripts/state
.\set-log-level.ps1 -DeviceUuid "your-device-uuid" -LogLevel "debug"

# Restore normal logging
.\set-log-level.ps1 -DeviceUuid "your-device-uuid" -LogLevel "info"

# Only show warnings and errors
.\set-log-level.ps1 -DeviceUuid "your-device-uuid" -LogLevel "warn"
```

### Method 2: Direct API Call

```bash
# Get current state
curl http://localhost:4002/api/v1/devices/<uuid>/target-state

# Update with new log level
curl -X POST http://localhost:4002/api/v1/devices/<uuid>/target-state \
  -H "Content-Type: application/json" \
  -d '{
    "apps": { ... },
    "config": {
      "logging": {
        "level": "debug"
      },
      "features": { ... },
      "settings": { ... }
    }
  }'
```

### Method 3: Database Update (Advanced)

```sql
-- Get current config
SELECT config FROM device_target_state WHERE device_uuid = 'your-uuid';

-- Update log level
UPDATE device_target_state 
SET 
  config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{logging,level}',
    '"debug"'
  ),
  version = version + 1,
  updated_at = NOW()
WHERE device_uuid = 'your-uuid';
```

## Configuration Structure

```json
{
  "logging": {
    "level": "debug",
    "compression": true,
    "maxFiles": 7
  },
  "features": {
    "enableRemoteAccess": true,
    "enableJobEngine": true
  },
  "settings": {
    "reconciliationIntervalMs": 30000
  }
}
```

## What Happens When You Change Log Level

1. **API updates** `device_target_state.config.logging.level`
2. **Agent polls** for state (~30 seconds later)
3. **ContainerManager** emits `target-state-changed` event
4. **Supervisor** calls `handleConfigUpdate()`
5. **AgentLogger.setLogLevel()** updates minimum log level
6. **Logs message**: `Log level changed: info → debug`
7. **All subsequent logs** respect new level

## Monitored Components

With `debug` logging enabled, you'll see detailed logs from:

### Core Components
- **Supervisor** - Initialization, feature management, config updates
- **ContainerManager** - State reconciliation, container lifecycle
- **DockerManager** - Image pulls, container starts/stops, resource limits
- **ApiBinder** - State polling, API communication
- **ConnectionMonitor** - Network status, connectivity events

### Features
- **DeviceAPI** - REST endpoint handling
- **JobEngine** - Job execution, queue management
- **RemoteAccess** - SSH tunnel operations
- **SensorPublish** - MQTT publishing
- **ShadowFeature** - Device shadow updates

### Operations
- **Health Checks** - Liveness/readiness/startup probes
- **Log Monitoring** - Container log attachment
- **Network/Volume** - Docker resource creation/removal

## Examples

### Scenario 1: Debug Container Start Issues

```powershell
# Enable debug logging
.\set-log-level.ps1 -DeviceUuid "abc-123" -LogLevel "debug"

# Watch logs for detailed container start info
docker logs -f agent

# You'll see:
# [DEBUG] [DockerManager] Pulling Docker image {"imageName":"nginx:latest"}
# [DEBUG] [DockerManager] Setting CPU limit {"cpuLimit":"0.5","nanocpus":500000000}
# [DEBUG] [ContainerManager] Container start step calculated {"serviceName":"nginx"}
```

### Scenario 2: Reduce Log Noise in Production

```powershell
# Only log warnings and errors
.\set-log-level.ps1 -DeviceUuid "abc-123" -LogLevel "warn"

# Normal operation logs (info/debug) will be suppressed
# Only critical issues will appear
```

### Scenario 3: Temporary Debugging

```powershell
# 1. Enable debug logging
.\set-log-level.ps1 -DeviceUuid "abc-123" -LogLevel "debug"

# 2. Reproduce the issue (watch logs)
docker logs -f agent

# 3. Restore normal logging
.\set-log-level.ps1 -DeviceUuid "abc-123" -LogLevel "info"
```

## Log Output Format

All structured logs follow this format:

```
2025-10-24T15:30:45.123Z [DEBUG] [DockerManager] Pulling Docker image {"imageName":"nginx:latest","operation":"pullImage"}
└─── timestamp ───┘ └level┘ └component───┘ └─ message ────────┘ └────── context (JSON) ──────────┘
```

## Verification

After changing log level, check agent logs for:

```
2025-10-24T15:30:00.000Z [INFO] [AgentLogger] Log level changed: info → debug
```

If you see this message, the change was applied successfully!

## Troubleshooting

### Change Not Applied?

1. **Check agent is polling**: Look for `Polling for target state` messages
2. **Verify config syntax**: Run `SELECT config FROM device_target_state` and validate JSON
3. **Check agent connectivity**: Ensure agent can reach API endpoint
4. **Wait for poll cycle**: Default is 30 seconds

### Invalid Log Level

If you specify an invalid level, you'll see:

```
⚠️  Invalid log level: verbose. Valid levels: debug, info, warn, error
```

Config will be ignored, agent continues with current level.

## Best Practices

1. **Default to `info`** in production for balanced logging
2. **Use `debug` temporarily** for troubleshooting, then restore to `info`
3. **Use `warn`/`error`** for high-volume devices to reduce storage
4. **Document changes** when enabling debug logging (who, why, when)
5. **Monitor log volume** - debug logging can generate significant data

## Implementation Details

### Files Modified

- `agent/src/logging/agent-logger.ts`:
  - Added `minLogLevel` property and `LOG_LEVELS` hierarchy
  - Added `setLogLevel()` and `getLogLevel()` methods
  - Added `shouldLog()` filtering in `log()` method

- `agent/src/supervisor.ts`:
  - Load `config.logging.level` on startup
  - Watch `target-state-changed` event for config updates
  - Added log level handling to `handleConfigUpdate()`

### Event Flow

```
┌─────────────────┐
│ API Update      │
│ POST /target-   │
│ state           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Device Polls    │
│ GET /device/    │
│ state           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ContainerMgr    │
│ setTarget()     │
│ emit('changed') │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Supervisor      │
│ handleConfig    │
│ Update()        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AgentLogger     │
│ setLogLevel()   │
└─────────────────┘
```

## Related Documentation

- [CONFIG-MANAGEMENT.md](../api/scripts/state/CONFIG-MANAGEMENT.md) - Full config reference
- [STRUCTURED-LOGGING.md](./STRUCTURED-LOGGING.md) - Logging architecture
- [agent-logger.ts](../agent/src/logging/agent-logger.ts) - Implementation

## Status

✅ **Fully Implemented** - Ready for use in development and production
