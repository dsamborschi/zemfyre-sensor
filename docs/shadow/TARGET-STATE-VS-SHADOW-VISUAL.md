# Target State vs Shadow - Visual Architecture

## Current Architecture (Target State Only)

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLOUD API                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database                                       │  │
│  │  ┌──────────────────────┐  ┌──────────────────────────┐  │  │
│  │  │   Target State       │  │   Device State           │  │  │
│  │  │  (What SHOULD run)   │  │   (What IS running)      │  │  │
│  │  │                      │  │                          │  │  │
│  │  │  {                   │  │  {                       │  │  │
│  │  │    apps: {           │  │    apps: { ... },        │  │  │
│  │  │      1: {            │  │    is_online: true,      │  │  │
│  │  │        services: [   │  │    cpu_usage: 45,        │  │  │
│  │  │          nginx:1.0   │  │    memory_usage: 1024    │  │  │
│  │  │        ]             │  │  }                       │  │  │
│  │  │      }               │  │                          │  │  │
│  │  │    }                 │  │                          │  │  │
│  │  │  }                   │  │                          │  │  │
│  │  └──────────────────────┘  └──────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                  ▲                              ▲
                  │ GET /target-state            │ PATCH /device/state
                  │ Every 60s (polling)          │ Every 10s (reporting)
                  │                              │
┌─────────────────────────────────────────────────────────────────┐
│                    DEVICE (Raspberry Pi)                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            Device Supervisor (supervisor.ts)              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│         ┌─────────────────┴─────────────────┐                  │
│         ▼                                   ▼                   │
│  ┌──────────────┐                   ┌──────────────┐           │
│  │  API Binder  │                   │  Container   │           │
│  │              │                   │   Manager    │           │
│  │ • Poll       │───────────────────│              │           │
│  │ • Report     │                   │ • targetState│           │
│  │ • ETag cache │                   │ • currentState│          │
│  └──────────────┘                   │ • reconcile  │           │
│                                     └──────┬───────┘           │
│                                            │                    │
│                                            ▼                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Docker Engine                         │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │  │
│  │  │Container │  │Container │  │Container │             │  │
│  │  │  nginx   │  │  nodejs  │  │influxdb  │             │  │
│  │  └──────────┘  └──────────┘  └──────────┘             │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

FLOW:
1. API Binder polls cloud for target state (HTTP GET every 60s)
2. Container Manager compares target vs current state
3. Container Manager generates reconciliation steps (start/stop containers)
4. Container Manager executes steps via Docker API
5. API Binder reports current state back to cloud (HTTP PATCH every 10s)
```

## Proposed Architecture (Target State + Shadow)

```
┌───────────────────────────────────────────────────────────────────────┐
│                              CLOUD                                     │
│                                                                        │
│  ┌──────────────────────────┐      ┌────────────────────────────┐    │
│  │    PostgreSQL DB         │      │   AWS IoT Shadow Service   │    │
│  │  ┌────────────────────┐  │      │  ┌──────────────────────┐  │    │
│  │  │   Target State     │  │      │  │  Shadow: device-config│  │    │
│  │  │  (Containers)      │  │      │  │                      │  │    │
│  │  │                    │  │      │  │  desired: {          │  │    │
│  │  │  apps: {           │  │      │  │    logLevel: "debug" │  │    │
│  │  │    1: {            │  │      │  │    features: {       │  │    │
│  │  │      nginx:2.0     │  │      │  │      telemetry: true │  │    │
│  │  │    }               │  │      │  │    }                 │  │    │
│  │  │  }                 │  │      │  │  }                   │  │    │
│  │  └────────────────────┘  │      │  │  reported: {         │  │    │
│  │                          │      │  │    logLevel: "info"  │  │    │
│  │  ┌────────────────────┐  │      │  │    ...               │  │    │
│  │  │  Current State     │  │      │  │  }                   │  │    │
│  │  │  (Device Status)   │  │      │  │  delta: {            │  │    │
│  │  │                    │  │      │  │    logLevel: "debug" │  │    │
│  │  │  apps: {...},      │  │      │  │  }                   │  │    │
│  │  │  cpu: 45%,         │  │      │  └──────────────────────┘  │    │
│  │  │  memory: 1024MB    │  │      └────────────────────────────┘    │
│  │  └────────────────────┘  │                                        │
│  └──────────────────────────┘                                        │
└───────────────────────────────────────────────────────────────────────┘
            ▲            ▲                    ▲               ▲
            │ HTTP       │                    │ MQTT          │
            │ Poll       │ Report             │ Subscribe     │ Publish
            │ (60s)      │ (10s)              │ (delta)       │ (reported)
            │            │                    │               │
┌───────────────────────────────────────────────────────────────────────┐
│                    DEVICE (Raspberry Pi)                               │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              Device Supervisor (supervisor.ts)                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│              │                                         │               │
│              │                                         │               │
│  ┌───────────┴──────────┐                 ┌──────────┴────────────┐  │
│  │    API Binder        │                 │   Shadow Feature      │  │
│  │                      │                 │                       │  │
│  │  • Poll target state │                 │  • Subscribe to delta │  │
│  │  • Report current    │                 │  • Auto-sync          │  │
│  │  • ETag caching      │                 │  • Write to file      │  │
│  └───────────┬──────────┘                 └──────────┬────────────┘  │
│              │                                       │               │
│              ▼                                       ▼               │
│  ┌─────────────────────┐                  ┌─────────────────────┐  │
│  │  Container Manager  │                  │ Application Config  │  │
│  │                     │                  │                     │  │
│  │  • targetState      │                  │ /app/config.json:   │  │
│  │  • currentState     │                  │ {                   │  │
│  │  • reconcile()      │                  │   logLevel: "debug",│  │
│  │  • applyState()     │                  │   features: {       │  │
│  └──────────┬──────────┘                  │     telemetry: true │  │
│             │                             │   }                 │  │
│             ▼                             │ }                   │  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      Docker Engine                              ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        ││
│  │  │  Container   │  │  Container   │  │  Container   │        ││
│  │  │   nginx:2.0  │  │  nodejs      │  │  influxdb    │        ││
│  │  │              │  │              │  │              │        ││
│  │  │  Reads       │  │  Reads       │  │  Reads       │        ││
│  │  │  config.json │  │  config.json │  │  config.json │        ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘        ││
│  └─────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘

FLOW:
Container Management (HTTP/REST):
1. API Binder polls cloud for target state (HTTP GET every 60s)
2. Container Manager reconciles and applies changes
3. API Binder reports current state (HTTP PATCH every 10s)

Configuration Management (MQTT/Real-time):
4. Cloud updates shadow desired state (via AWS IoT Console or API)
5. Shadow Feature receives delta event instantly (MQTT)
6. Shadow Feature writes config to /app/config.json
7. Applications read config and adjust behavior
8. Shadow Feature publishes reported state (MQTT)
```

## Comparison Table

```
┌────────────────────┬──────────────────────────┬──────────────────────────┐
│                    │    Target State          │      AWS Shadow          │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Purpose            │ Container orchestration  │ Generic state sync       │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Protocol           │ HTTP REST (polling)      │ MQTT (pub/sub)           │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Update Speed       │ ~60 seconds (poll)       │ <1 second (push)         │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Data Structure     │ Fixed (apps/services)    │ Flexible (any JSON)      │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Reconciliation     │ Built-in (container)     │ User-defined (app logic) │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Storage (Cloud)    │ PostgreSQL               │ AWS IoT Shadow Service   │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Storage (Device)   │ SQLite (state_snapshots) │ Optional file            │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Delta Computation  │ Device (local)           │ Cloud (AWS IoT)          │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Best For           │ • Deploy containers      │ • Device config          │
│                    │ • OTA updates            │ • Feature flags          │
│                    │ • Fleet management       │ • Real-time settings     │
└────────────────────┴──────────────────────────┴──────────────────────────┘
```

## Message Flow Diagrams

### Target State Flow (Current)

```
Cloud API                     Device (API Binder)              Container Manager
    |                                |                                |
    |<------- GET /target-state -----|                                |
    |                                |                                |
    |------- 200 OK (ETag) --------->|                                |
    |        { apps: {...} }         |                                |
    |                                |------ setTarget() ------------->|
    |                                |                                |
    |                                |                                ├─ Compare with current
    |                                |                                ├─ Generate steps
    |                                |                                ├─ Download images
    |                                |                                ├─ Start containers
    |                                |                                |
    |                                |<----- state-applied -----------|
    |                                |                                |
    |<--- PATCH /device/state -------|                                |
    |     { apps: {...},             |                                |
    |       is_online: true }        |                                |
    |                                |                                |
    |---- 200 OK ------------------->|                                |
    |                                |                                |
    [Wait 60s]                    [Wait 60s]                          |
    |                                |                                |
    |<------- GET /target-state -----|                                |
    |                                |                                |
    |------- 304 Not Modified ------>|                                |
    |        (ETag matches)          |                                |
```

### Shadow Flow (Proposed)

```
AWS IoT Shadow           Device (Shadow Feature)           Application
    |                            |                              |
    |                            |<---- Subscribe to delta -----|
    |                            |                              |
    |<--- Update desired --------|  (from Cloud API/Console)    |
    |    { logLevel: "debug" }   |                              |
    |                            |                              |
    ├─ Compute delta             |                              |
    |                            |                              |
    |---- Publish delta -------->|                              |
    |    { logLevel: "debug" }   |                              |
    |                            ├─ Receive delta               |
    |                            ├─ Write config.json           |
    |                            |------- File updated -------->|
    |                            |                              ├─ Read config
    |                            |                              ├─ Apply new settings
    |                            |                              |
    |                            |<----- updateShadow() --------|
    |<--- Publish reported ------|                              |
    |    { logLevel: "debug" }   |                              |
    |                            |                              |
    ├─ Update shadow (version++)  |                              |
    |                            |                              |
    |---- Publish accepted ----->|                              |
    |    { version: 43 }         |                              |
```

## Combined Architecture Benefits

```
┌─────────────────────────────────────────────────────────────────┐
│                     SEPARATION OF CONCERNS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Target State (Container Orchestration)                          │
│  ├─ What containers to run                                       │
│  ├─ What versions/images                                         │
│  ├─ Network/volume configuration                                 │
│  └─ Container lifecycle (start/stop/restart)                     │
│                                                                  │
│  Shadow (Application Configuration)                              │
│  ├─ How containers behave                                        │
│  ├─ Runtime settings                                             │
│  ├─ Feature flags                                                │
│  └─ Dynamic configuration                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

EXAMPLE USE CASE:
1. Cloud sets Target State: "Run nginx:2.0 container"
   → Container Manager deploys nginx:2.0

2. Cloud sets Shadow desired: { "logLevel": "debug", "maxConnections": 1000 }
   → Shadow Feature writes config to /etc/nginx/nginx.conf
   → Nginx reads config and adjusts behavior
   → Shadow Feature reports back current config

3. Later, cloud updates Shadow: { "maxConnections": 2000 }
   → Shadow Feature updates config file
   → Nginx automatically reloads (if configured)
   → No container restart needed!

BENEFITS:
✓ Decouple "what runs" from "how it runs"
✓ Update configs without redeploying containers
✓ Real-time config changes (MQTT) vs periodic container updates (HTTP)
✓ Different update frequencies for different concerns
✓ Standard AWS IoT patterns + custom orchestration
```
