# What AWS IoT Device Client Reports via Shadows

## Overview

The AWS IoT Device Client uses shadows for **two different purposes** with **two different shadow implementations**:

1. **Sample Shadow** - Generic data synchronization from file
2. **Config Shadow** - Device Client feature configuration management

---

## 1. Sample Shadow (Generic Use Case)

### Purpose
Store and sync **custom user data** between device and cloud. The shadow acts as a mirror of a local file.

### What It Reports to Cloud

**Source**: Any JSON file specified in config (`shadow-input-file`)

**Reported State Structure**: Whatever JSON is in the input file

```json
{
  "state": {
    "reported": {
      // ENTIRE contents of shadow-input-file.json
      // Can be ANY valid JSON structure
      
      // Example (if file is empty/not configured):
      "welcome": "aws-iot"
      
      // Example (custom sensor data):
      "temperature": 25.3,
      "humidity": 60,
      "pressure": 1013.25,
      "timestamp": "2025-10-14T12:00:00Z"
      
      // Example (device status):
      "deviceId": "sensor-001",
      "location": "warehouse-A",
      "batteryLevel": 87,
      "signalStrength": -65
    }
  }
}
```

### How It Works

```cpp
// From SampleShadowFeature.cpp line 386-396
void SampleShadowFeature::readAndUpdateShadowFromFile()
{
    // Read JSON file
    std::string contents = readFile(inputFile);
    Crt::JsonObject jsonObj(contents.c_str());
    
    // Publish ENTIRE file contents as "reported" state
    UpdateNamedShadowRequest request;
    ShadowState state;
    state.Reported = jsonObj;  // <-- ENTIRE file becomes reported state
    request.State = state;
    
    shadowClient->PublishUpdateNamedShadow(request);
}
```

### Key Features

1. **File Monitoring**: Uses `inotify` to watch input file for changes
2. **Auto-Sync**: When file changes, automatically updates shadow
3. **Bi-Directional Sync**: 
   - **Device → Cloud**: Reports file contents via `reported` state
   - **Cloud → Device**: Receives `delta` events and syncs back to file
4. **Output File**: Writes latest shadow document to local file

### Delta Handling

When cloud updates `desired` state, device receives delta and **automatically syncs**:

```cpp
// From SampleShadowFeature.cpp line 129-143
void updateNamedShadowDeltaHandler(ShadowDeltaUpdatedEvent *event)
{
    // Receive delta from cloud
    ShadowState state;
    state.Reported = event->State.value();  // <-- Set reported = desired
    
    // Publish update to eliminate delta
    shadowClient->PublishUpdateNamedShadow(updateRequest);
}
```

**Pattern**: Device always makes `reported` match `desired` to eliminate delta.

---

## 2. Config Shadow (Device Client Configuration)

### Purpose
Store and remotely manage **AWS IoT Device Client feature configurations**. Acts as cloud-based configuration management.

### What It Reports to Cloud

**Shadow Name**: `DeviceClientConfigShadow` (hardcoded)

**Reported State Structure**: Device Client feature configuration

```json
{
  "state": {
    "reported": {
      "jobs": {
        "enabled": true
      },
      "tunneling": {
        "enabled": false
      },
      "device-defender": {
        "enabled": true,
        "interval": 300
      },
      "sample-shadow": {
        "enabled": true,
        "shadow-name": "my-sensor-shadow",
        "shadow-input-file": "/tmp/sensor-data.json",
        "shadow-output-file": "/tmp/shadow-output.json"
      },
      "pubsub": {
        "enabled": false
      }
    },
    "desired": {
      // Cloud can set desired config here
      "jobs": {
        "enabled": true
      },
      "device-defender": {
        "enabled": true,
        "interval": 600  // <-- Changed from 300
      }
    }
  }
}
```

### How It Works

```cpp
// From ConfigShadow.cpp line 437-446
void updateShadowWithLocalConfig(IotShadowClient client, PlainConfig &config)
{
    JsonObject jsonObj;
    loadFeatureConfigIntoJsonObject(config, jsonObj);  // <-- Extract feature configs
    
    ShadowState state;
    state.Reported = jsonObj;  // <-- Report current local config
    state.Desired = jsonObj;   // <-- Also set desired to match
    
    shadowClient->PublishUpdateNamedShadow(request);
}
```

### Configuration Flow

**Startup Flow**:
```
1. Device starts with local config file
2. Fetches ConfigShadow from cloud (GET request)
3. If shadow exists and has delta:
   → Apply delta to local config
   → Update reported state to match
4. If shadow doesn't exist:
   → Create shadow with current local config
```

**Remote Update Flow**:
```
1. Cloud updates ConfigShadow desired state (via AWS Console/API)
2. Device receives delta notification
3. Device validates new configuration
4. If valid:
   → Applies config locally
   → Updates reported state
   → If persistent-update=true: writes to config file
5. If invalid:
   → Keeps old config
   → Logs error
   → Reported state remains unchanged
```

### What Gets Reported

**Included Features**:
- Jobs configuration
- Tunneling configuration  
- Device Defender configuration
- Sample Shadow configuration
- PubSub configuration

**Excluded (for security)**:
- Endpoints
- Thing name
- Private keys
- Certificates
- Root CA
- Fleet Provisioning credentials

### Persistent Updates

```cpp
// From ConfigShadow.cpp line 401-426
if (config.configShadow.persistentUpdate.value()) {
    // Update user config file
    updateLocalConfigFile(config, "~/.aws-iot-device-client/config");
    
    // Update system config file
    updateLocalConfigFile(config, "/etc/aws-iot-device-client/config");
}
```

When `persistent-update: true`, shadow changes are written to disk permanently.

---

## Comparison: Sample Shadow vs Config Shadow

```
┌─────────────────────┬──────────────────────────┬──────────────────────────┐
│                     │    Sample Shadow         │     Config Shadow        │
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│ Purpose             │ Generic data sync        │ Device Client config     │
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│ Shadow Name         │ User-defined             │ "DeviceClientConfigShadow"│
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│ Reported Data       │ Any JSON from file       │ Feature configurations   │
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│ Data Source         │ shadow-input-file        │ Local config file        │
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│ File Monitoring     │ Yes (inotify)            │ No (manual restart)      │
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│ Delta Handling      │ Auto-sync (report=desired)│ Validate + Apply + Report│
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│ Output File         │ shadow-output-file       │ Optional: config file    │
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│ Persistent          │ No                       │ Optional (persistent-update)│
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│ Validation          │ None (any JSON)          │ Config schema validation │
└─────────────────────┴──────────────────────────┴──────────────────────────┘
```

---

## Message Flow Examples

### Sample Shadow Update Flow

```
Device                                      AWS IoT Shadow Service
  |                                                |
  ├─ File monitor detects change                  |
  ├─ Read /tmp/sensor-data.json                   |
  │  { "temp": 25.3, "humidity": 60 }             |
  │                                                |
  ├─ Publish UpdateNamedShadow ──────────────────>│
  │  Topic: $aws/things/device-001/shadow/        │
  │         name/sensor-shadow/update             │
  │  {                                             │
  │    "state": {                                  │
  │      "reported": {                             ├─ Store shadow
  │        "temp": 25.3,                           ├─ Version: 42
  │        "humidity": 60                          │
  │      }                                         │
  │    }                                           │
  │  }                                             │
  │                                                │
  │<────────── Publish update/accepted ───────────┤
  │  { "version": 42, "timestamp": ... }          │
  │                                                |
  ├─ Write shadow to output file                  |
  │  /tmp/shadow-output.json                      |
```

### Config Shadow Delta Flow

```
AWS Console                Device                     Shadow Service
     |                       |                              |
     ├─ Update desired ──────────────────────────────────>  │
     │  {                                                    ├─ Compute delta
     │    "device-defender": {                              │
     │      "interval": 600                                 │
     │    }                                                 │
     │  }                                                   │
     |                       |                              |
     |                       │<────── Publish delta ────────┤
     |                       │  Topic: .../shadow/delta     │
     |                       │  {                           │
     |                       │    "state": {                │
     |                       │      "device-defender": {    │
     |                       │        "interval": 600       │
     |                       │      }                       │
     |                       │    }                         │
     |                       │  }                           │
     |                       │                              |
     |                       ├─ Validate config             |
     |                       ├─ Apply to local config       |
     |                       ├─ Write to config file        |
     |                       │   (if persistent-update)     |
     |                       │                              |
     |                       ├─ Publish UpdateShadow ───────>│
     |                       │  {                            │
     |                       │    "state": {                 ├─ Update shadow
     |                       │      "reported": {            ├─ Delta cleared
     |                       │        "device-defender": {   │
     |                       │          "interval": 600      │
     |                       │        }                      │
     |                       │      }                        │
     |                       │    }                          │
     |                       │  }                            │
     |                       │                              |
     |                       │<──── Publish accepted ────────┤
     |                       │                              |
```

---

## Key Patterns Observed

### 1. Reported State Always Mirrors Reality

Both shadows report **actual current state**, not desired state:
- Sample Shadow: Reports file contents as-is
- Config Shadow: Reports actual applied configuration

### 2. Delta Auto-Sync Pattern

When cloud updates `desired`, device:
1. Receives `delta` event
2. Applies changes locally
3. Updates `reported` to match `desired`
4. Delta becomes empty

### 3. Validation Before Reporting

Config Shadow validates changes before reporting:
```cpp
if (configIsValid(newConfig)) {
    applyConfig(newConfig);
    reportedState = newConfig;  // <-- Only report valid config
} else {
    logError("Invalid config");
    // Keep old reported state
}
```

### 4. File-Based Persistence

Both use files as source of truth:
- Sample Shadow: Reads/writes data files
- Config Shadow: Reads/writes config files

### 5. Bi-Directional Sync

```
Cloud Shadow ←────→ Device Shadow ←────→ Local File
             MQTT                fs.watch() / manual
```

---

## Implications for Your Implementation

### What You Should Report

Based on AWS patterns, your agent should report:

**Device Status Shadow** (like Sample Shadow):
```json
{
  "state": {
    "reported": {
      "containerStatus": {
        "nginx": "running",
        "nodered": "running",
        "influxdb": "stopped"
      },
      "systemMetrics": {
        "cpuUsage": 45,
        "memoryUsage": 1024,
        "diskUsage": 5120
      },
      "connectivity": {
        "online": true,
        "lastSeen": "2025-10-14T12:00:00Z",
        "ipAddress": "192.168.1.100"
      },
      "sensorData": {
        "temperature": 25.3,
        "humidity": 60,
        "pressure": 1013.25
      }
    }
  }
}
```

**Agent Config Shadow** (like Config Shadow):
```json
{
  "state": {
    "reported": {
      "features": {
        "sensorPublish": {
          "enabled": true,
          "interval": 30
        },
        "jobEngine": {
          "enabled": true,
          "maxConcurrent": 5
        },
        "shadow": {
          "enabled": true,
          "syncInterval": 60
        }
      },
      "logging": {
        "level": "info",
        "compression": true
      },
      "mqtt": {
        "broker": "mqtt://mosquitto:1883",
        "qos": 1
      }
    }
  }
}
```

### Key Recommendations

1. **Separate Concerns**: Use different shadows for different purposes
   - Status/telemetry shadow (frequently updated)
   - Configuration shadow (infrequently updated)

2. **Report Actual State**: Always report what IS, not what SHOULD BE
   - Reported = current reality on device
   - Desired = what cloud wants
   - Delta = changes to apply

3. **Validate Before Applying**: Like Config Shadow
   - Receive delta
   - Validate changes
   - Apply if valid
   - Report back actual applied state

4. **Use File Persistence**: Like Sample Shadow
   - Write shadow to file for persistence across restarts
   - Optional: Monitor file for manual changes

5. **Handle Conflicts**: AWS pattern is device wins
   - If config invalid: keep old, report error
   - If can't apply: keep old, report status

---

## Summary

**AWS IoT Device Client reports TWO types of data via shadows:**

1. **Sample Shadow**: Arbitrary JSON data from files (sensor readings, status, etc.)
   - Pattern: File → Reported State → Cloud
   - Use case: Telemetry, status updates, generic data sync

2. **Config Shadow**: Device Client feature configuration
   - Pattern: Local Config → Reported State → Cloud
   - Use case: Remote configuration management

**Common Pattern**: 
- Device reports `reported` state = actual current state
- Cloud sets `desired` state = intended state  
- AWS computes `delta` = difference
- Device receives delta, applies changes, updates reported

**Your Implementation**: Should follow same patterns
- Report actual system state (containers, metrics, sensors)
- Receive desired state (config changes)
- Apply and report back confirmation
