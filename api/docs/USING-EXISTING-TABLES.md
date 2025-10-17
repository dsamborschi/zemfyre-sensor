# Using Existing Tables for App/Service IDs - Implementation Guide

## Overview

You already have `applications` and `device_services` tables! Let's use them instead of sequences.

---

## Current Schema (Already Exists!)

```sql
-- Applications table
CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,              -- ← Use this!
    app_name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    is_host BOOLEAN DEFAULT false,
    should_track_latest_release BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Device services table
CREATE TABLE IF NOT EXISTS device_services (
    id SERIAL PRIMARY KEY,              -- ← Use this!
    device_uuid UUID NOT NULL REFERENCES devices(uuid) ON DELETE CASCADE,
    service_name VARCHAR(255) NOT NULL,
    image_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Running',
    install_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_uuid, service_name)
);
```

---

## Implementation Strategy

### Option A: Apps in Table, Services in JSONB (RECOMMENDED) ⭐

**Why:** 
- Apps are shared across devices (catalog)
- Services are device-specific (different per device)

```
applications table (global catalog)
    ↓
device_target_state.apps (JSONB - device-specific)
    ↓
  Services defined per device in JSONB
```

**Workflow:**

1. **Define app in `applications` table** (once, global)
2. **Deploy app to device** → Copy to `device_target_state.apps` JSONB
3. **Services defined in JSONB** (each device can have different services)

---

### Option B: Both in Tables (Traditional)

**Why:**
- Strict data integrity
- Complex cross-device queries
- Traditional RDBMS approach

**Drawback:**
- Less flexible
- Need JOINs to get data
- Device-specific configs harder

---

## Option A: Hybrid Approach (RECOMMENDED)

### Step 1: Create App Catalog Endpoints

```typescript
// api/src/routes/cloud.ts

/**
 * Create new application (catalog entry)
 * POST /api/v1/applications
 */
router.post('/api/v1/applications', async (req, res) => {
  try {
    const { appName, slug, description, defaultConfig } = req.body;

    if (!appName) {
      return res.status(400).json({ 
        error: 'appName is required' 
      });
    }

    const result = await query(
      `INSERT INTO applications (app_name, slug, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [appName, slug || appName.toLowerCase().replace(/\s+/g, '-'), description]
    );

    const app = result.rows[0];

    res.json({
      id: app.id,
      appName: app.app_name,
      slug: app.slug,
      description: app.description,
      createdAt: app.created_at
    });

  } catch (error: any) {
    console.error('Error creating application:', error);
    res.status(500).json({ 
      error: 'Failed to create application',
      message: error.message 
    });
  }
});

/**
 * Get all applications (catalog)
 * GET /api/v1/applications
 */
router.get('/api/v1/applications', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM applications ORDER BY created_at DESC'
    );

    res.json({
      count: result.rows.length,
      applications: result.rows.map(app => ({
        id: app.id,
        appName: app.app_name,
        slug: app.slug,
        description: app.description,
        createdAt: app.created_at
      }))
    });

  } catch (error: any) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ 
      error: 'Failed to fetch applications',
      message: error.message 
    });
  }
});

/**
 * Get specific application
 * GET /api/v1/applications/:id
 */
router.get('/api/v1/applications/:id', async (req, res) => {
  try {
    const appId = parseInt(req.params.id);

    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid app ID' });
    }

    const result = await query(
      'SELECT * FROM applications WHERE id = $1',
      [appId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = result.rows[0];

    res.json({
      id: app.id,
      appName: app.app_name,
      slug: app.slug,
      description: app.description,
      createdAt: app.created_at
    });

  } catch (error: any) {
    console.error('Error fetching application:', error);
    res.status(500).json({ 
      error: 'Failed to fetch application',
      message: error.message 
    });
  }
});
```

### Step 2: Deploy App to Device (Copy to JSONB)

```typescript
/**
 * Deploy application to device
 * POST /api/v1/devices/:uuid/apps
 * 
 * Body: {
 *   appId: number,
 *   services: [
 *     {
 *       serviceName: string,
 *       imageName: string,
 *       config: { ports, environment, etc. }
 *     }
 *   ]
 * }
 */
router.post('/api/v1/devices/:uuid/apps', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { appId, services } = req.body;

    if (!appId || !Array.isArray(services)) {
      return res.status(400).json({ 
        error: 'appId and services array are required' 
      });
    }

    // 1. Get app from catalog
    const appResult = await query(
      'SELECT * FROM applications WHERE id = $1',
      [appId]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found in catalog' });
    }

    const app = appResult.rows[0];

    // 2. Build app state with services
    const appState = {
      appId: app.id,
      appName: app.app_name,
      description: app.description,
      services: services.map((service, index) => ({
        serviceId: index + 1, // Or generate from sequence
        serviceName: service.serviceName,
        imageName: service.imageName,
        appName: app.app_name,
        config: service.config || {}
      }))
    };

    // 3. Get current target state
    let targetState = await DeviceTargetStateModel.get(uuid);
    
    if (!targetState) {
      // Create if doesn't exist
      await DeviceTargetStateModel.update(uuid, {}, {});
      targetState = await DeviceTargetStateModel.get(uuid);
    }

    // 4. Update with new app
    const newApps = {
      ...targetState.apps,
      [appId]: appState
    };

    await DeviceTargetStateModel.update(uuid, newApps, targetState.config);

    console.log(`✅ Deployed app ${app.app_name} (ID: ${appId}) to device ${uuid.substring(0, 8)}`);

    res.json({
      status: 'ok',
      app: appState,
      targetState: newApps
    });

  } catch (error: any) {
    console.error('Error deploying app to device:', error);
    res.status(500).json({ 
      error: 'Failed to deploy app',
      message: error.message 
    });
  }
});
```

### Step 3: Frontend Usage

```typescript
// admin/src/services/api.ts

/**
 * Get all available apps from catalog
 */
export async function getApplicationCatalog() {
  const response = await fetch('/api/v1/applications');
  const data = await response.json();
  return data.applications;
}

/**
 * Create new app in catalog
 */
export async function createApplication(appName: string, description?: string) {
  const response = await fetch('/api/v1/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appName, description })
  });
  
  if (!response.ok) {
    throw new Error('Failed to create application');
  }
  
  return await response.json();
}

/**
 * Deploy app to specific device
 */
export async function deployAppToDevice(
  deviceUuid: string,
  appId: number,
  services: {
    serviceName: string;
    imageName: string;
    config: {
      ports?: string[];
      environment?: Record<string, string>;
    };
  }[]
) {
  const response = await fetch(`/api/v1/devices/${deviceUuid}/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, services })
  });
  
  if (!response.ok) {
    throw new Error('Failed to deploy app');
  }
  
  return await response.json();
}
```

### Step 4: React Component

```typescript
// admin/src/components/AppDeployer.tsx

import React, { useState, useEffect } from 'react';
import { getApplicationCatalog, deployAppToDevice } from '../services/api';

export function AppDeployer({ deviceUuid }: { deviceUuid: string }) {
  const [apps, setApps] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [services, setServices] = useState([
    { serviceName: '', imageName: '', config: { ports: [], environment: {} } }
  ]);

  useEffect(() => {
    loadApps();
  }, []);

  async function loadApps() {
    const catalog = await getApplicationCatalog();
    setApps(catalog);
  }

  async function handleDeploy() {
    if (!selectedApp) {
      alert('Please select an app');
      return;
    }

    try {
      await deployAppToDevice(deviceUuid, selectedApp.id, services);
      alert('App deployed successfully!');
    } catch (error) {
      alert('Failed to deploy app');
    }
  }

  return (
    <div>
      <h2>Deploy App to Device</h2>

      {/* App selection */}
      <select onChange={(e) => setSelectedApp(apps.find(a => a.id === parseInt(e.target.value)))}>
        <option value="">Select app...</option>
        {apps.map(app => (
          <option key={app.id} value={app.id}>
            {app.appName}
          </option>
        ))}
      </select>

      {/* Service configuration */}
      <div>
        <h3>Services</h3>
        {services.map((service, index) => (
          <div key={index}>
            <input
              placeholder="Service name"
              value={service.serviceName}
              onChange={(e) => {
                const newServices = [...services];
                newServices[index].serviceName = e.target.value;
                setServices(newServices);
              }}
            />
            <input
              placeholder="Image (e.g., nginx:alpine)"
              value={service.imageName}
              onChange={(e) => {
                const newServices = [...services];
                newServices[index].imageName = e.target.value;
                setServices(newServices);
              }}
            />
          </div>
        ))}
        
        <button onClick={() => setServices([...services, { serviceName: '', imageName: '', config: {} }])}>
          Add Service
        </button>
      </div>

      <button onClick={handleDeploy}>Deploy to Device</button>
    </div>
  );
}
```

---

## Result: Device Target State

After deploying, `device_target_state.apps` will look like:

```json
{
  "1": {
    "appId": 1,
    "appName": "monitoring",
    "description": "Monitoring application",
    "services": [
      {
        "serviceId": 1,
        "serviceName": "nginx",
        "imageName": "nginx:alpine",
        "appName": "monitoring",
        "config": {
          "ports": ["8097:80"],
          "environment": {
            "ENV": "production"
          }
        }
      }
    ]
  }
}
```

**Note:** `appId: 1` references `applications.id = 1`

---

## Querying

### Get all apps in catalog
```sql
SELECT * FROM applications;
```

### Get devices using specific app
```sql
SELECT device_uuid 
FROM device_target_state 
WHERE apps::jsonb ? '1';  -- App ID 1
```

### Get app catalog with usage stats
```sql
SELECT 
  a.id,
  a.app_name,
  COUNT(dts.device_uuid) as device_count
FROM applications a
LEFT JOIN device_target_state dts 
  ON dts.apps::jsonb ? a.id::text
GROUP BY a.id, a.app_name
ORDER BY device_count DESC;
```

---

## Benefits of This Approach

### ✅ Uses Your Existing Tables
- No need for new sequences
- `applications.id` is your app ID
- Familiar SERIAL auto-increment

### ✅ App Catalog
- Master list of all apps
- Easy to query: "What apps exist?"
- Single place to update app info

### ✅ Device Flexibility
- Each device has its own copy in JSONB
- Can customize per device
- Fast queries (single SELECT)

### ✅ Clean Separation
- **Catalog** (`applications` table) - What apps are available?
- **Deployment** (`device_target_state` JSONB) - What's running on each device?

---

## Do You Need device_services Table?

### Option 1: Don't Use It (Services in JSONB Only)
```
applications table (catalog)
    ↓
device_target_state.apps.services (JSONB - all service data)
```

**When:** Services are defined per-device in JSON

### Option 2: Use It (Hybrid)
```
applications table (catalog)
    ↓
device_services table (running services)
    ↓
device_target_state.apps.services (references device_services.id)
```

**When:** You want to track service status separately

**Recommendation:** Start with Option 1 (services in JSONB). Simpler and matches your current design.

---

## Summary

### You Asked:
> "Why can't I just use the applications table id field?"

### Answer:
**You absolutely can and should!** ✅

### What to Do:

1. ✅ Use `applications` table for app catalog
2. ✅ `applications.id` becomes your `appId`
3. ✅ Deploy apps to devices → copy to `device_target_state.apps` JSONB
4. ✅ Services defined in JSONB (device-specific)
5. ✅ Keep the sequences we added as backup (or remove them)

### Simple Flow:

```
1. Create app in catalog:
   INSERT INTO applications (app_name) VALUES ('monitoring') RETURNING id;
   → Returns id: 1

2. Deploy to device:
   POST /api/v1/devices/{uuid}/apps
   Body: { appId: 1, services: [...] }

3. Result in device_target_state.apps:
   { "1": { "appId": 1, "appName": "monitoring", "services": [...] } }
```

**This is cleaner than sequences because you already have the tables!** 🎯

Would you like me to add these endpoints to your API?
