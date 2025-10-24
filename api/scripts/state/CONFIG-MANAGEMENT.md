# Device Configuration Management - Quick Reference

## Why Config Was Empty

Your `device_target_state.config` column was empty because:

1. **The API accepts config**, but you never explicitly sent it
2. **When deploying apps**, the code preserves existing config: `currentTarget?.config || {}`
3. **Initially, there's no config**, so it defaults to empty object `{}`

## Solution: Use Existing Target State Endpoint

The `POST /devices/:uuid/target-state` endpoint **already accepts config** alongside apps!

### API Endpoint

```http
POST /api/v1/devices/:uuid/target-state
Content-Type: application/json

{
  "apps": { ... },
  "config": {
    "mqtt": { ... },
    "features": { ... },
    "logging": { ... }
  }
}
```

### Response

```json
{
  "status": "ok",
  "message": "Target state updated",
  "uuid": "device-uuid",
  "version": 42,
  "apps": { ... },
  "config": { ... }
}
```

## Usage Examples

### 1. Using Existing PowerShell Script

Your existing `update-target-state.ps1` already handles config! Just include it in your JSON:

```powershell
# Use existing script with config in JSON file
cd api/scripts/state
.\update-target-state.ps1 `
    -DeviceUuid "your-device-uuid" `
    -FilePath "target-state-with-config.json"
```

### 2. Using curl

```bash
curl -X POST http://localhost:4002/api/v1/devices/$UUID/target-state \
  -H "Content-Type: application/json" \
  -d '{
    "apps": { ... },
    "config": {
      "mqtt": {
        "broker": "mqtt://mosquitto:1883",
        "retryInterval": 30
      },
      "features": {
        "enableCloudJobs": true,
        "pollingIntervalMs": 30000
      }
    }
  }'
```

### 3. Using Invoke-RestMethod

```powershell
$body = @{
    apps = @{ ... }  # Your existing apps
    config = @{
        mqtt = @{
            broker = "mqtt://mosquitto:1883"
            retryInterval = 30
        }
        features = @{
            enableCloudJobs = $true
            pollingIntervalMs = 30000
        }
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
    -Uri "http://localhost:4002/api/v1/devices/$deviceUuid/target-state" `
    -Method POST `
    -Body $body `
    -ContentType "application/json"
```

## Configuration Structure

### Recommended Config Sections

```json
{
  "mqtt": {
    "broker": "mqtt://mosquitto:1883",
    "username": "admin",
    "password": "iotistic42!",
    "retryInterval": 30,
    "qos": 1
  },
  "features": {
    "enableCloudJobs": true,
    "enableJobEngine": true,
    "pollingIntervalMs": 30000,
    "enableHealthChecks": true
  },
  "logging": {
    "level": "info",
    "compression": true,
    "maxFiles": 7
  },
  "api": {
    "port": 48484,
    "timeout": 30000
  },
  "healthChecks": {
    "enabled": true,
    "defaultTimeout": 30,
    "defaultPeriod": 10
  },
  "reconciliation": {
    "intervalSeconds": 10,
    "maxRetries": 3
  }
}
```

## How Agent Uses Config

Your agent can read config from target state:

```typescript
// In supervisor.ts or any service
const targetState = await this.api.getTargetState();
const config = targetState.config || {};

// Use config values
const mqttBroker = config.mqtt?.broker || 'mqtt://localhost:1883';
const enableJobs = config.features?.enableCloudJobs || false;
const logLevel = config.logging?.level || 'info';

// Initialize services based on config
if (enableJobs && this.jobEngine) {
  await this.initializeCloudJobsAdapter();
}
```

## Event Sourcing

Config changes trigger events:

```javascript
// Event published on config change
{
  event_type: "target_state.config_changed",
  entity_type: "device",
  entity_id: "device-uuid",
  data: {
    new_config: { ... },
    old_config: { ... },
    version: 42,
    changed_keys: ["mqtt.broker", "features.enableCloudJobs"]
  }
}
```

## Database Schema

```sql
CREATE TABLE device_target_state (
    device_uuid UUID NOT NULL,
    apps JSONB NOT NULL DEFAULT '{}',
    config JSONB DEFAULT '{}',  -- Your ConfigMap!
    version INTEGER DEFAULT 1,
    updated_at TIMESTAMP
);
```

## Files Available

1. **API Endpoint**: `POST /api/v1/devices/:uuid/target-state` (existing)
   - Accepts both `apps` and `config` in same request

2. **PowerShell Script**: `api/scripts/state/update-target-state.ps1` (existing)
   - Already handles config from JSON files

3. **Example Template**: `api/scripts/state/target-state-with-config-example.json`
   - Complete target state with apps + config sections

## Next Steps

1. **Update your devices** with config using existing script:
   ```powershell
   cd api/scripts/state
   .\update-target-state.ps1 `
       -DeviceUuid "your-device-uuid" `
       -FilePath "target-state-with-config-example.json"
   ```

2. **Modify your agent** to read and use config values:
   ```typescript
   const config = targetState.config;
   const mqttUrl = config?.mqtt?.broker || defaultBroker;
   ```

3. **Add config validation** (optional):
   ```typescript
   import Joi from 'joi';
   const configSchema = Joi.object({ ... });
   ```

4. **Create config templates** for different device types:
   - Production vs Development
   - Different regions
   - Different customer requirements

## Comparison: Your System vs K8s ConfigMaps

| Feature | Kubernetes ConfigMaps | Your System |
|---------|----------------------|-------------|
| **Scope** | Namespace (shared) | Per-device (unique) |
| **Storage** | etcd | PostgreSQL JSONB |
| **Update** | `kubectl edit configmap` | `PATCH /devices/:uuid/config` |
| **Versioning** | Resource version | Integer version column |
| **Injection** | Pod env/volumes | Agent reconciliation |
| **Format** | Key-value pairs | Nested JSON object |

**Your system is BETTER for IoT** because each device can have unique configuration! 🎯

## Summary

✅ **Existing endpoint** already handles config: `POST /devices/:uuid/target-state`  
✅ **Existing script** already handles config: `update-target-state.ps1`  
✅ **Created**: Complete target state example with config section  
✅ **Events**: `target_state.updated` tracks both apps and config changes  
✅ **Versioned**: Auto-increment version on each update  

**Just include `config` in your JSON and use your existing workflow!** 🚀
