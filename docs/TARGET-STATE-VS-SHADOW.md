# Target State Logic vs AWS IoT Shadow - Comparison

## TL;DR - Are They Different?

**Yes and No:**
- **Same Concept**: Both use desired/reported/delta pattern for state synchronization
- **Different Purpose**: Your target state is for **container orchestration**, AWS Shadow is for **generic device state**
- **Different Scope**: Target state is containers-specific, Shadow is any JSON data
- **Can Coexist**: They solve different problems and complement each other!

---

## Your Current Target State Logic

### Architecture (Balena-Inspired)

```
Cloud API (PostgreSQL)
       ↓ (poll every 60s)
   [Target State]
       ↓
  Container Manager
       ↓ (reconcile)
  [Current State]
       ↓ (report every 10s)
   Cloud API
```

### Key Components

**1. Target State** (`targetState`)
- **What**: JSON defining which containers SHOULD be running
- **Source**: Polled from Cloud API (`/api/v1/device/target-state`)
- **Storage**: Persisted in local SQLite (`state_snapshots` table)
- **Structure**:
```typescript
{
  apps: {
    1: {  // appId
      appId: 1,
      appName: "my-app",
      services: [
        {
          serviceId: 101,
          serviceName: "web",
          imageName: "nginx:latest",
          config: {
            image: "nginx:latest",
            ports: ["80:80"],
            environment: { "KEY": "value" },
            volumes: ["data:/var/lib/data"],
            networks: ["frontend"]
          }
        }
      ]
    }
  }
}
```

**2. Current State** (`currentState`)
- **What**: JSON representing containers currently running on device
- **Source**: Read from Docker daemon via `dockerode`
- **Reported**: Sent to Cloud API (`/api/v1/device/state`) every 10s
- **Structure**: Same as target state + runtime info (containerId, status)

**3. Reconciliation Loop**
```typescript
// Every 30s (RECONCILIATION_INTERVAL):
1. currentState = read from Docker
2. targetState = read from Cloud API (with ETag caching)
3. diff = compare(targetState, currentState)
4. steps = generateSteps(diff)
5. execute(steps)  // start/stop/update containers
6. report(currentState) to Cloud
```

### Flow Example

**Cloud sets target state:**
```json
POST /api/v1/device/{uuid}/target-state
{
  "apps": {
    "1": {
      "services": [
        {
          "serviceName": "nginx",
          "config": { "image": "nginx:latest" }
        }
      ]
    }
  }
}
```

**Device polls and applies:**
1. `ApiBinder.pollLoop()` fetches target state
2. `ContainerManager.setTarget()` updates internal target state
3. `ContainerManager.applyTargetState()` reconciles:
   - Downloads `nginx:latest` image
   - Creates container
   - Starts container
4. `ApiBinder.reportLoop()` sends current state back to cloud

**Cloud receives current state:**
```json
PATCH /api/v1/device/state
{
  "device-uuid-123": {
    "apps": {
      "1": {
        "services": [
          {
            "serviceName": "nginx",
            "containerId": "abc123",
            "status": "Running"
          }
        ]
      }
    },
    "is_online": true
  }
}
```

---

## AWS IoT Shadow Pattern

### Architecture

```
AWS IoT Core
       ↓ (MQTT)
  $aws/things/{thingName}/shadow/name/{shadowName}/update/delta
       ↓
  Shadow Feature
       ↓ (auto-sync)
  [Reported State]
       ↓ (MQTT)
  AWS IoT Core
```

### Key Components

**1. Desired State** (`state.desired`)
- **What**: JSON defining what cloud/applications WANT the device state to be
- **Source**: Set by cloud applications via AWS IoT API or MQTT
- **Storage**: Stored in AWS IoT Shadow service (cloud-side)
- **Structure**: Any JSON (completely flexible)

**2. Reported State** (`state.reported`)
- **What**: JSON defining device's ACTUAL current state
- **Source**: Published by device via MQTT
- **Storage**: Stored in AWS IoT Shadow service + optionally persisted locally
- **Structure**: Any JSON (matches desired structure when synced)

**3. Delta State** (`state.delta`)
- **What**: Differences between desired and reported
- **Source**: Automatically computed by AWS IoT Shadow service
- **Structure**: Only the fields that differ

### Shadow Document Structure

```json
{
  "state": {
    "desired": {
      "mode": "eco",
      "targetTemp": 22,
      "features": {
        "wifi": true,
        "bluetooth": false
      }
    },
    "reported": {
      "mode": "normal",
      "targetTemp": 20,
      "features": {
        "wifi": true,
        "bluetooth": false
      }
    },
    "delta": {
      "mode": "eco",
      "targetTemp": 22
    }
  },
  "metadata": {
    "desired": {
      "mode": { "timestamp": 1634567890 }
    },
    "reported": { ... }
  },
  "version": 42,
  "timestamp": 1634567890
}
```

### Flow Example

**Cloud sets desired state:**
```
MQTT Publish to:
$aws/things/device-123/shadow/name/config/update
{
  "state": {
    "desired": {
      "logLevel": "debug",
      "updateInterval": 30
    }
  }
}
```

**AWS IoT computes delta and sends to device:**
```
MQTT Publish to:
$aws/things/device-123/shadow/name/config/update/delta
{
  "state": {
    "logLevel": "debug",
    "updateInterval": 30
  },
  "version": 43
}
```

**Device receives delta and auto-syncs:**
```typescript
shadowFeature.on('delta-updated', (event) => {
  // event.state = { logLevel: "debug", updateInterval: 30 }
  // If syncOnDelta=true, automatically publishes:
  
  MQTT Publish to:
  $aws/things/device-123/shadow/name/config/update
  {
    "state": {
      "reported": {
        "logLevel": "debug",
        "updateInterval": 30
      }
    }
  }
});
```

---

## Side-by-Side Comparison

| Feature | Your Target State | AWS IoT Shadow |
|---------|------------------|----------------|
| **Purpose** | Container orchestration | Generic device state sync |
| **Scope** | Docker containers only | Any JSON data |
| **Protocol** | HTTP REST (polling) | MQTT (pub/sub) |
| **Direction** | Cloud → Device (pull) | Cloud ↔ Device (push/pull) |
| **Frequency** | Poll every 60s | Real-time (MQTT events) |
| **Storage** | Cloud: PostgreSQL<br>Device: SQLite | Cloud: AWS IoT Shadow Service<br>Device: Optional file |
| **Desired State** | Called "target state" | Called "desired state" |
| **Current State** | Called "current state" | Called "reported state" |
| **Delta** | Computed locally by comparing target vs current | Computed in cloud by AWS IoT |
| **Reconciliation** | Container lifecycle (start/stop) | User-defined (app logic) |
| **Versioning** | Hash-based (stateHash) | Version number (incremental) |
| **Metadata** | No built-in metadata | Timestamps per field |
| **Structure** | Fixed (apps, services, config) | Flexible (any JSON) |
| **Offline Support** | Yes (persisted in SQLite) | Yes (last known shadow) |
| **Conflict Resolution** | Last-write-wins (via stateHash) | Version-based (409 on conflict) |

---

## Key Differences

### 1. **Protocol: HTTP Polling vs MQTT Push**

**Your Approach:**
```typescript
// Device polls cloud every 60s
async pollLoop() {
  while (isPolling) {
    const response = await fetch(`${cloudApi}/target-state`, {
      headers: { 'If-None-Match': etag }  // ETag caching
    });
    if (response.status === 200) {
      targetState = await response.json();
      await containerManager.setTarget(targetState);
    }
    await sleep(60000);  // Wait 60s
  }
}
```

**AWS Shadow:**
```typescript
// Device subscribes to MQTT delta topic (real-time push)
await mqttConnection.subscribe(
  '$aws/things/device-123/shadow/name/config/update/delta',
  (topic, payload) => {
    const delta = JSON.parse(payload);
    // Immediately react to changes (no polling delay)
    handleDelta(delta.state);
  }
);
```

**Trade-offs:**
- HTTP Polling: Simpler, works anywhere, but has delay (up to 60s)
- MQTT Push: Real-time, efficient, but requires persistent connection

### 2. **Scope: Container-Specific vs Generic**

**Your Target State:**
- **Fixed schema**: Must be apps → services → config
- **Docker-specific**: Tied to container lifecycle
- **Orchestration logic**: Built-in (knows how to start/stop containers)

**AWS Shadow:**
- **Flexible schema**: Any JSON structure
- **Application-agnostic**: Works for any device state
- **No built-in logic**: You define what happens on delta

**Example - What each can represent:**

Your Target State:
```json
{
  "apps": {
    "1": {
      "services": [{
        "serviceName": "nginx",
        "config": { "image": "nginx:latest", "ports": ["80:80"] }
      }]
    }
  }
}
```

AWS Shadow (can be ANYTHING):
```json
{
  "config": { "logLevel": "debug" },
  "telemetry": { "temp": 25.5 },
  "features": { "wifi": true },
  "customData": { "foo": "bar" }
}
```

### 3. **Delta Computation: Local vs Cloud**

**Your Approach (Local Delta):**
```typescript
// ContainerManager computes diff locally
generateSteps(targetState, currentState) {
  const steps = [];
  
  // Find services to stop (in current but not in target)
  for (const service of currentState.services) {
    if (!targetState.services.includes(service)) {
      steps.push({ action: 'stopContainer', serviceId: service.id });
    }
  }
  
  // Find services to start (in target but not in current)
  for (const service of targetState.services) {
    if (!currentState.services.includes(service)) {
      steps.push({ action: 'startContainer', service });
    }
  }
  
  return steps;
}
```

**AWS Shadow (Cloud Delta):**
```typescript
// AWS IoT computes delta in cloud and sends to device
// Device just receives the diff:
{
  "state": {
    "mode": "eco",      // Only fields that differ
    "targetTemp": 22
  }
}
```

**Trade-offs:**
- Local: More control, works offline, but you maintain diff logic
- Cloud: Simpler device code, but requires cloud connection

### 4. **State Reporting: Periodic vs Event-Driven**

**Your Approach:**
```typescript
// Report current state every 10s (periodic)
async reportLoop() {
  while (isReporting) {
    const currentState = await containerManager.getCurrentState();
    await fetch(`${cloudApi}/device/state`, {
      method: 'PATCH',
      body: JSON.stringify(currentState)
    });
    await sleep(10000);  // Every 10s
  }
}
```

**AWS Shadow:**
```typescript
// Publish reported state on change (event-driven)
shadowFeature.on('delta-updated', async (event) => {
  // Only publish when state actually changes
  await shadowFeature.updateShadow(event.state, true);
});
```

---

## When to Use Each

### Use Target State For:
✅ **Container orchestration**
- Deploying/updating Docker containers
- Managing multi-container applications
- Rolling updates and rollbacks
- Container lifecycle management

✅ **Balena-style device management**
- Fleet management
- OTA updates
- Container registries

### Use AWS Shadow For:
✅ **Configuration management**
- Device settings (log level, intervals, features)
- Application configuration
- Remote configuration updates

✅ **Device state synchronization**
- Sensor states (on/off, calibration)
- Feature flags
- Device metadata

✅ **Telemetry reporting**
- Periodic metrics (temperature, humidity)
- Device health status
- Operational data

---

## Can They Work Together? YES!

### Recommended Architecture

```
                    Cloud
                      |
         +------------+------------+
         |                         |
   PostgreSQL DB            AWS IoT Shadow
   (Target State)           (Device Config)
         |                         |
         | HTTP Poll              | MQTT Push
         | (60s)                  | (real-time)
         ↓                         ↓
    +---------+           +----------------+
    |  API    |           | Shadow Feature |
    | Binder  |           |                |
    +---------+           +----------------+
         |                         |
         ↓                         ↓
    Container Manager      Application Logic
         |                         |
         ↓                         ↓
    Docker Containers      Device Config Files
```

### Example: Using Both Together

**Target State manages containers:**
```json
// Cloud sets via API
{
  "apps": {
    "1": {
      "services": [{
        "serviceName": "app",
        "config": {
          "image": "myapp:v2.0",
          "environment": {
            "CONFIG_FILE": "/app/config.json"
          }
        }
      }]
    }
  }
}
```

**Shadow manages application config:**
```json
// Cloud sets via MQTT
{
  "state": {
    "desired": {
      "logLevel": "debug",
      "features": {
        "telemetry": true,
        "analytics": false
      },
      "updateInterval": 30
    }
  }
}
```

**Device applies both:**
1. Container Manager deploys `myapp:v2.0` container
2. Shadow Feature receives delta and writes config to `/app/config.json`
3. Application reads config and adjusts behavior
4. Both systems work independently but complement each other

### Real-World Example

```typescript
// supervisor.ts

// 1. Container orchestration via Target State
await apiBinder.startPoll();  // Poll for container updates
await apiBinder.startReporting();  // Report container status

// 2. Configuration management via Shadow
shadowFeature.on('delta-updated', async (event) => {
  // Update device configuration file
  await fs.writeFile('/app/config.json', JSON.stringify(event.state));
  
  // Optionally restart containers to pick up new config
  if (event.state.requiresRestart) {
    await containerManager.restartApp(1);
  }
});

await shadowFeature.start();
```

---

## Summary

### Your Target State Logic
- **Perfect for**: Container orchestration, fleet management, OTA updates
- **Pattern**: Balena Supervisor-inspired
- **Strength**: Built-in container lifecycle management
- **Limitation**: Fixed schema, containers only

### AWS IoT Shadow
- **Perfect for**: Device configuration, generic state sync, flexible data
- **Pattern**: AWS IoT standard
- **Strength**: Flexible JSON, real-time MQTT, well-documented
- **Limitation**: No built-in orchestration logic

### Best Practice: Use Both!
- **Target State** → Manage **what containers run**
- **Shadow** → Manage **how containers behave**

They solve different problems and complement each other beautifully! 🎯
