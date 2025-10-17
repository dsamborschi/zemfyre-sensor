# Hybrid Application Management - Visual Guide

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          APPLICATION CATALOG                                │
│                       (applications table)                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  ID: 1001 (from global_app_id_seq starting at 1000)                 │  │
│  │  App Name: "monitoring"                                              │  │
│  │  Slug: "monitoring-stack"                                            │  │
│  │  Default Config (Template):                                          │  │
│  │  {                                                                   │  │
│  │    "services": [                                                     │  │
│  │      {                                                               │  │
│  │        "serviceName": "prometheus",                                  │  │
│  │        "image": "prom/prometheus:latest",                            │  │
│  │        "defaultPorts": ["9090:9090"],                                │  │
│  │        "defaultEnvironment": { "RETENTION": "30d" }                  │  │
│  │      },                                                              │  │
│  │      {                                                               │  │
│  │        "serviceName": "grafana",                                     │  │
│  │        "image": "grafana/grafana:latest",                            │  │
│  │        "defaultPorts": ["3000:3000"]                                 │  │
│  │      }                                                               │  │
│  │    ]                                                                 │  │
│  │  }                                                                   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Think of this as: "Docker Hub" - where you store reusable images/stacks   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Deploy with customization
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEVICE DEPLOYMENT                                    │
│                  (device_target_state.apps JSONB)                           │
│                                                                             │
│  ┌──────────────────────────────┐    ┌──────────────────────────────┐     │
│  │  Device A (Pi in Office)     │    │  Device B (Pi in Factory)    │     │
│  │  UUID: abc123...             │    │  UUID: xyz789...             │     │
│  │                              │    │                              │     │
│  │  {                           │    │  {                           │     │
│  │    "1001": {                 │    │    "1001": {                 │     │
│  │      appId: 1001,            │    │      appId: 1001,            │     │
│  │      appName: "monitoring",  │    │      appName: "monitoring",  │     │
│  │      services: [             │    │      services: [             │     │
│  │        {                     │    │        {                     │     │
│  │          serviceId: 1,       │    │          serviceId: 3,       │     │
│  │          serviceName: "prom",│    │          serviceName: "prom",│     │
│  │          image: "prom:latest"│    │          image: "prom:latest"│     │
│  │          config: {           │    │          config: {           │     │
│  │            ports: [          │    │            ports: [          │     │
│  │              "9090:9090" ◄───┼────┼───────────  "8097:9090" ◄───┼─┐   │
│  │            ],                │    │            ],                │ │   │
│  │            environment: {    │    │            environment: {    │ │   │
│  │              RETENTION: "30d"│    │              RETENTION: "7d" │ │   │
│  │            }                 │    │            }                 │ │   │
│  │          }                   │    │          }                   │ │   │
│  │        },                    │    │        },                    │ │   │
│  │        {                     │    │        {                     │ │   │
│  │          serviceId: 2,       │    │          serviceId: 4,       │ │   │
│  │          serviceName: "graf",│    │          serviceName: "graf",│ │   │
│  │          config: {           │    │          config: {           │ │   │
│  │            ports: [          │    │            ports: [          │ │   │
│  │              "3000:3000"     │    │              "8098:3000"     │ │   │
│  │            ]                 │    │            ]                 │ │   │
│  │          }                   │    │          }                   │ │   │
│  │        }                     │    │        }                     │ │   │
│  │      ]                       │    │      ]                       │ │   │
│  │    }                         │    │    }                         │ │   │
│  │  }                           │    │  }                           │ │   │
│  └──────────────────────────────┘    └──────────────────────────────┘ │   │
│                                                                        │   │
│  Same app (1001), different configs! ─────────────────────────────────┘   │
│  Notice: Different ports (9090 vs 8097), different retention (30d vs 7d)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Flow Diagram

```
┌──────────────┐
│ Admin/User   │
└──────┬───────┘
       │
       │ 1. Create application template
       ↓
┌──────────────────────────────────────┐
│ POST /api/v1/applications            │
│                                      │
│ {                                    │
│   appName: "monitoring",             │
│   slug: "monitoring-stack",          │
│   defaultConfig: { services: [...] } │
│ }                                    │
└──────┬───────────────────────────────┘
       │
       │ 2. Generate app ID from sequence
       ↓
┌──────────────────────────────────────┐
│ SELECT nextval('global_app_id_seq')  │
│ → Returns: 1001                      │
└──────┬───────────────────────────────┘
       │
       │ 3. Store in applications table
       ↓
┌──────────────────────────────────────┐
│ INSERT INTO applications             │
│   (id, app_name, slug, default_config)
│ VALUES (1001, 'monitoring', ...)     │
└──────┬───────────────────────────────┘
       │
       │ 4. Deploy to device
       ↓
┌──────────────────────────────────────┐
│ POST /api/v1/devices/{uuid}/apps    │
│                                      │
│ {                                    │
│   appId: 1001,                       │
│   services: [                        │
│     {                                │
│       serviceName: "prometheus",     │
│       image: "prom:latest",          │
│       ports: ["8097:9090"],  ◄───────┼─── Custom port!
│       environment: {                 │
│         RETENTION: "14d"     ◄───────┼─── Custom config!
│       }                              │
│     }                                │
│   ]                                  │
│ }                                    │
└──────┬───────────────────────────────┘
       │
       │ 5. Generate service IDs
       ↓
┌──────────────────────────────────────┐
│ For each service:                    │
│   SELECT nextval('global_service...')│
│   → Returns: 1, 2, 3...              │
└──────┬───────────────────────────────┘
       │
       │ 6. Store in device_target_state
       ↓
┌──────────────────────────────────────┐
│ UPDATE device_target_state           │
│ SET apps = {                         │
│   "1001": {                          │
│     appId: 1001,                     │
│     appName: "monitoring",           │
│     services: [                      │
│       { serviceId: 1, ... },         │
│       { serviceId: 2, ... }          │
│     ]                                │
│   }                                  │
│ }                                    │
└──────┬───────────────────────────────┘
       │
       │ 7. Device polls for state
       ↓
┌──────────────────────────────────────┐
│ GET /api/v1/device/{uuid}/state      │
│ → Returns full apps JSONB            │
└──────┬───────────────────────────────┘
       │
       │ 8. Device applies configuration
       ↓
┌──────────────────────────────────────┐
│ Device Agent:                        │
│  - Reads services array              │
│  - Pulls Docker images               │
│  - Creates containers                │
│  - Applies ports, env, volumes       │
└──────────────────────────────────────┘
```

## Comparison: Docker Analogy

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker World                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Docker Hub                                                     │
│  └── nginx:latest (image registry)                             │
│                                                                 │
│  docker-compose.yml (template)                                 │
│  services:                                                      │
│    web:                                                         │
│      image: nginx:latest                                        │
│      ports: ["80:80"]                                           │
│                                                                 │
│  docker-compose.override.yml (customization)                   │
│  services:                                                      │
│    web:                                                         │
│      ports: ["8080:80"]  ◄── Override default!                 │
│                                                                 │
│  docker ps (running containers)                                │
│  nginx:latest → running on port 8080                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                          ↕ Equivalent
┌─────────────────────────────────────────────────────────────────┐
│                  Our Hybrid Approach                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  applications table (catalog)                                   │
│  └── monitoring:1001 (template registry)                       │
│                                                                 │
│  default_config (template)                                     │
│  services: [                                                    │
│    {                                                            │
│      serviceName: "nginx",                                      │
│      image: "nginx:latest",                                     │
│      defaultPorts: ["80:80"]                                    │
│    }                                                            │
│  ]                                                              │
│                                                                 │
│  POST /devices/{uuid}/apps (customization)                     │
│  services: [                                                    │
│    {                                                            │
│      serviceName: "nginx",                                      │
│      ports: ["8080:80"]  ◄── Override default!                 │
│    }                                                            │
│  ]                                                              │
│                                                                 │
│  device_target_state.apps (deployed state)                     │
│  { "1001": { services: [...] } } → deployed on device          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts Visualized

### 1. Same App, Different Devices

```
Application Template (ID: 1001)
        │
        ├───────────────────┬───────────────────┐
        │                   │                   │
        ↓                   ↓                   ↓
   Device A           Device B           Device C
   
   Port: 9090         Port: 8097         Port: 7070
   Retention: 30d     Retention: 7d      Retention: 90d
   Password: abc      Password: xyz      Password: 123
```

### 2. App Hierarchy

```
Application (1001: "monitoring")
    │
    ├── Service 1 (serviceId: 1, "prometheus")
    │   ├── Image: prom/prometheus:latest
    │   ├── Ports: ["9090:9090"]
    │   └── Environment: { RETENTION: "30d" }
    │
    └── Service 2 (serviceId: 2, "grafana")
        ├── Image: grafana/grafana:latest
        ├── Ports: ["3000:3000"]
        └── Environment: { GF_... }
```

### 3. ID Generation

```
global_app_id_seq
    │
    ├── 1000 (first user app)
    ├── 1001 (monitoring)
    ├── 1002 (web-server)
    └── 1003 (database)

global_service_id_seq
    │
    ├── 1 (prometheus on device A)
    ├── 2 (grafana on device A)
    ├── 3 (prometheus on device B)
    └── 4 (grafana on device B)
```

### 4. Data Flow

```
User Input → Template → Customization → Deployment → Device State

1. Create:
   appName: "monitoring"
   defaultConfig: { ... }

2. Store:
   applications.id = 1001
   applications.default_config = { ... }

3. Deploy:
   appId: 1001
   services: [custom config]

4. Generate:
   serviceId: 1, 2, 3...

5. Store:
   device_target_state.apps = {
     "1001": { services: [...] }
   }

6. Poll:
   GET /device/{uuid}/state
   → Returns apps JSONB

7. Apply:
   Device reads JSONB
   → Creates containers
```

## Benefits Visualized

```
┌─────────────────────────────────────────────────────────────┐
│ WITHOUT Hybrid Approach (Pure JSONB)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Device A:           Device B:           Device C:         │
│  { apps: {           { apps: {           { apps: {         │
│    "monitoring": {     "monitoring": {     "monitoring": { │
│      services: [...]    services: [...]     services: [...] │
│    }                   }                   }               │
│  }}                  }}                  }}                │
│                                                             │
│  ❌ No reusability - copy-paste everywhere                 │
│  ❌ Can't query "what apps exist?"                          │
│  ❌ No central management                                   │
│  ❌ Inconsistent naming                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ WITH Hybrid Approach (Catalog + JSONB)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Catalog:                                                   │
│  ┌────────────────────────────────┐                        │
│  │ 1001: monitoring (template)    │                        │
│  │ 1002: web-server (template)    │                        │
│  │ 1003: database (template)      │                        │
│  └────────────────────────────────┘                        │
│         ↓            ↓            ↓                         │
│    Device A      Device B      Device C                    │
│    {1001}        {1001}        {1001, 1002}                │
│    custom        custom        custom                      │
│                                                             │
│  ✅ Reusable templates                                      │
│  ✅ Central catalog: SELECT * FROM applications            │
│  ✅ Device-specific configs                                 │
│  ✅ Consistent IDs and naming                               │
└─────────────────────────────────────────────────────────────┘
```

---

**Think of it as:**
- **Application Catalog** = Your private Docker Hub
- **Default Config** = docker-compose.yml template
- **Device Deployment** = docker-compose up with overrides
- **Device State** = docker ps (what's running)

**Perfect for multi-device IoT deployments!** 🚀
