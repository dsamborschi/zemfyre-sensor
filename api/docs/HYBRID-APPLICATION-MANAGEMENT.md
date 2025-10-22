# Hybrid Application Management Implementation Guide

## Overview

This guide explains the **hybrid approach** for managing applications in the Iotistic IoT platform, combining:
- ✅ **Global ID sequences** (1000+) for unique app identification
- ✅ **Application catalog table** for reusable templates  
- ✅ **Device-specific JSONB** for deployed configurations

Think of it as: **Docker Hub (catalog) + Docker Compose (templates) + docker ps (device state)**

---

## Mental Model

```
applications table          =  Docker Hub / App Store
    ↓                           (Available apps catalog)
    
global_app_id_seq          =  Unique app IDs (1000, 1001, 1002...)
    ↓                           (Distinguishes user apps from system)
    
device_target_state.apps   =  Running containers per device
    ↓                           (Device-specific configs)
    
services array             =  Individual containers in the stack
                               (prometheus, grafana, nginx, etc.)
```

---

## Database Schema

### 1. Applications Table (Template Catalog)

```sql
CREATE TABLE applications (
    id SERIAL PRIMARY KEY,              -- Uses global_app_id_seq (1000+)
    app_name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,  -- URL-safe identifier
    description TEXT,
    default_config JSONB DEFAULT '{}',  -- Docker-compose-like template
    created_at TIMESTAMP,
    modified_at TIMESTAMP
);
```

**Example row:**
```json
{
  "id": 1001,
  "app_name": "monitoring",
  "slug": "monitoring-stack",
  "description": "Full monitoring with Prometheus and Grafana",
  "default_config": {
    "services": [
      {
        "serviceName": "prometheus",
        "image": "prom/prometheus:latest",
        "defaultPorts": ["9090:9090"],
        "defaultEnvironment": {
          "RETENTION": "30d"
        }
      },
      {
        "serviceName": "grafana",
        "image": "grafana/grafana:latest",
        "defaultPorts": ["3000:3000"]
      }
    ]
  }
}
```

### 2. Device Target State (Deployed Apps)

```sql
CREATE TABLE device_target_state (
    device_uuid UUID PRIMARY KEY,
    apps JSONB NOT NULL DEFAULT '{}',   -- Deployed apps per device
    config JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    updated_at TIMESTAMP
);
```

**Example apps JSONB (Device A):**
```json
{
  "1001": {
    "appId": 1001,
    "appName": "monitoring",
    "services": [
      {
        "serviceId": 1,
        "serviceName": "prometheus",
        "imageName": "prom/prometheus:latest",
        "config": {
          "ports": ["9090:9090"],
          "environment": {
            "RETENTION": "30d"
          }
        }
      },
      {
        "serviceId": 2,
        "serviceName": "grafana",
        "imageName": "grafana/grafana:latest",
        "config": {
          "ports": ["3000:3000"],
          "environment": {
            "GF_SECURITY_ADMIN_PASSWORD": "secret123"
          }
        }
      }
    ]
  }
}
```

**Example apps JSONB (Device B - different ports):**
```json
{
  "1001": {
    "appId": 1001,
    "appName": "monitoring",
    "services": [
      {
        "serviceId": 3,
        "serviceName": "prometheus",
        "imageName": "prom/prometheus:latest",
        "config": {
          "ports": ["8097:9090"],  // ← Different port!
          "environment": {
            "RETENTION": "7d"       // ← Different retention!
          }
        }
      },
      {
        "serviceId": 4,
        "serviceName": "grafana",
        "imageName": "grafana/grafana:latest",
        "config": {
          "ports": ["8098:3000"]   // ← Different port!
        }
      }
    ]
  }
}
```

---

## API Endpoints

### Application Template Management

#### 1. Create Application Template

**Create a reusable app template (like a docker-compose.yml)**

```bash
POST /api/v1/applications
Content-Type: application/json

{
  "appName": "monitoring",
  "slug": "monitoring-stack",
  "description": "Prometheus and Grafana monitoring",
  "defaultConfig": {
    "services": [
      {
        "serviceName": "prometheus",
        "image": "prom/prometheus:latest",
        "defaultPorts": ["9090:9090"]
      },
      {
        "serviceName": "grafana",
        "image": "grafana/grafana:latest",
        "defaultPorts": ["3000:3000"]
      }
    ]
  }
}
```

**Response:**
```json
{
  "appId": 1001,
  "appName": "monitoring",
  "slug": "monitoring-stack",
  "description": "Prometheus and Grafana monitoring",
  "defaultConfig": { ... },
  "createdAt": "2025-10-16T10:00:00Z"
}
```

**Notes:**
- `appId` is generated from `global_app_id_seq` (starts at 1000)
- Stored in `applications` table
- Also registered in `app_service_ids` registry

#### 2. List Application Templates

```bash
GET /api/v1/applications?search=monitoring
```

**Response:**
```json
{
  "count": 1,
  "applications": [
    {
      "appId": 1001,
      "appName": "monitoring",
      "slug": "monitoring-stack",
      "description": "...",
      "defaultConfig": { ... },
      "createdAt": "2025-10-16T10:00:00Z"
    }
  ]
}
```

#### 3. Get Specific Application

```bash
GET /api/v1/applications/1001
```

#### 4. Update Application Template

```bash
PATCH /api/v1/applications/1001
Content-Type: application/json

{
  "description": "Updated description",
  "defaultConfig": {
    "services": [
      {
        "serviceName": "prometheus",
        "image": "prom/prometheus:v2.50.0",  // ← Updated version
        "defaultPorts": ["9090:9090"]
      }
    ]
  }
}
```

#### 5. Delete Application Template

```bash
DELETE /api/v1/applications/1001
```

**Notes:**
- Fails if any devices are using this app
- Returns list of affected devices if blocked

---

### Device Deployment

#### 6. Deploy App to Device

**Deploy from template with device-specific customization**

```bash
POST /api/v1/devices/{uuid}/apps
Content-Type: application/json

{
  "appId": 1001,
  "services": [
    {
      "serviceName": "prometheus",
      "image": "prom/prometheus:latest",
      "ports": ["8097:9090"],           // ← Custom port
      "environment": {
        "RETENTION": "14d"              // ← Custom config
      }
    },
    {
      "serviceName": "grafana",
      "image": "grafana/grafana:latest",
      "ports": ["8098:3000"],           // ← Custom port
      "environment": {
        "GF_SECURITY_ADMIN_PASSWORD": "mypassword"
      }
    }
  ]
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Application deployed to device",
  "deviceUuid": "abc123...",
  "appId": 1001,
  "appName": "monitoring",
  "services": [
    {
      "serviceId": 1,
      "serviceName": "prometheus",
      "imageName": "prom/prometheus:latest",
      "config": { ... }
    },
    {
      "serviceId": 2,
      "serviceName": "grafana",
      "imageName": "grafana/grafana:latest",
      "config": { ... }
    }
  ]
}
```

**What happens:**
1. Validates `appId` exists in `applications` table
2. Generates unique `serviceId` for each service (from `global_service_id_seq`)
3. Merges template with device-specific config
4. Updates `device_target_state.apps` JSONB
5. Registers services in `app_service_ids` registry

#### 7. Update Deployed App

```bash
PATCH /api/v1/devices/{uuid}/apps/1001
Content-Type: application/json

{
  "services": [
    {
      "serviceName": "prometheus",
      "image": "prom/prometheus:v2.50.0",  // ← Updated version
      "ports": ["8097:9090"],
      "environment": {
        "RETENTION": "30d"                 // ← Updated config
      }
    }
  ]
}
```

#### 8. Remove App from Device

```bash
DELETE /api/v1/devices/{uuid}/apps/1001
```

---

## Frontend Integration

### React Component Example

```typescript
import React, { useState, useEffect } from 'react';

interface Application {
  appId: number;
  appName: string;
  slug: string;
  description: string;
  defaultConfig: {
    services: Array<{
      serviceName: string;
      image: string;
      defaultPorts?: string[];
      defaultEnvironment?: Record<string, string>;
    }>;
  };
}

function ApplicationCatalog() {
  const [applications, setApplications] = useState<Application[]>([]);

  useEffect(() => {
    // Load application catalog
    fetch('http://localhost:4002/api/v1/applications')
      .then(res => res.json())
      .then(data => setApplications(data.applications));
  }, []);

  return (
    <div>
      <h2>Available Applications</h2>
      {applications.map(app => (
        <div key={app.appId}>
          <h3>{app.appName}</h3>
          <p>{app.description}</p>
          <button onClick={() => deployApp(app.appId)}>
            Deploy to Device
          </button>
        </div>
      ))}
    </div>
  );
}

async function deployApp(appId: number, deviceUuid: string) {
  // Get template
  const template = await fetch(`http://localhost:4002/api/v1/applications/${appId}`)
    .then(res => res.json());

  // Customize services for this device
  const services = template.defaultConfig.services.map(service => ({
    serviceName: service.serviceName,
    image: service.image,
    ports: service.defaultPorts || [],
    environment: service.defaultEnvironment || {}
  }));

  // Deploy
  const response = await fetch(`http://localhost:4002/api/v1/devices/${deviceUuid}/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, services })
  });

  return response.json();
}
```

---

## Querying Patterns

### Find All Apps in Catalog

```sql
SELECT id, app_name, slug, description
FROM applications
ORDER BY app_name;
```

### Find Devices Using Specific App

```sql
SELECT device_uuid, apps
FROM device_target_state
WHERE apps::text LIKE '%"appId":1001%';
```

### Count Apps per Device

```sql
SELECT 
  device_uuid,
  jsonb_object_keys(apps) as app_id,
  apps->jsonb_object_keys(apps)->>'appName' as app_name
FROM device_target_state
WHERE apps != '{}';
```

### Get All Services for App Across Devices

```sql
SELECT 
  device_uuid,
  jsonb_array_elements(apps->'1001'->'services')->>'serviceName' as service_name,
  jsonb_array_elements(apps->'1001'->'services')->>'imageName' as image
FROM device_target_state
WHERE apps ? '1001';
```

---

## Benefits of Hybrid Approach

### ✅ Advantages

1. **Reusable Templates**: Create app once, deploy to many devices
2. **App Catalog**: Browse available apps, search, filter
3. **Device Customization**: Each device can have unique config
4. **Global IDs**: Distinguish user apps (1000+) from system apps (1-999)
5. **Auditability**: Track what apps exist via `applications` table
6. **Flexibility**: JSONB allows device-specific overrides
7. **Performance**: Indexed lookups on slug, app_name

### ⚠️ Trade-offs

1. **Complexity**: More tables to manage than pure JSONB
2. **Consistency**: Must keep catalog and deployed state in sync
3. **Cascading Updates**: Template changes don't auto-update devices

---

## Migration Path

If you already have apps in JSONB without catalog:

```sql
-- Extract unique apps from device state
INSERT INTO applications (id, app_name, slug, description, default_config)
SELECT DISTINCT
  (apps->appId->>'appId')::integer,
  apps->appId->>'appName',
  lower(regexp_replace(apps->appId->>'appName', '[^a-zA-Z0-9]+', '-', 'g')),
  'Migrated from device state',
  jsonb_build_object('services', apps->appId->'services')
FROM device_target_state, jsonb_object_keys(apps) as appId
WHERE apps != '{}'
ON CONFLICT (id) DO NOTHING;
```

---

## Testing

### Create Test Application

```bash
curl -X POST http://localhost:4002/api/v1/applications \
  -H "Content-Type: application/json" \
  -d '{
    "appName": "test-app",
    "slug": "test-app",
    "description": "Test application",
    "defaultConfig": {
      "services": [
        {
          "serviceName": "nginx",
          "image": "nginx:alpine",
          "defaultPorts": ["8080:80"]
        }
      ]
    }
  }'
```

### Deploy to Device

```bash
curl -X POST http://localhost:4002/api/v1/devices/abc123/apps \
  -H "Content-Type: application/json" \
  -d '{
    "appId": 1001,
    "services": [
      {
        "serviceName": "nginx",
        "image": "nginx:alpine",
        "ports": ["8097:80"]
      }
    ]
  }'
```

### Verify Deployment

```bash
# Check device target state
curl http://localhost:4002/api/v1/devices/abc123/target-state

# Device will poll and receive:
curl http://localhost:4002/api/v1/device/abc123/state
```

---

## Summary

**Use this approach when:**
- ✅ You want reusable application templates
- ✅ Multiple devices deploy similar stacks
- ✅ Need app catalog/library
- ✅ Want centralized template management
- ✅ Require device-specific customization

**Architecture:**
```
applications table (catalog)
    → Generate appId from global_app_id_seq (1000+)
    → Store template in default_config
    
Deploy to device:
    → Copy template
    → Customize per device
    → Generate serviceIds from global_service_id_seq
    → Store in device_target_state.apps JSONB
    
Device polls:
    → GET /api/v1/device/{uuid}/state
    → Receives full JSONB
    → Applies changes
```

**Perfect hybrid: Template catalog + Device flexibility!** 🎯
