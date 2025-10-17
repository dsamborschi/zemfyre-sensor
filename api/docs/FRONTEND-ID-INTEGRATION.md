# Frontend API Integration - App/Service ID Management

## Quick Start Guide for Admin Panel

### Overview

The API now provides centralized ID generation for apps and services. Instead of generating IDs in the frontend, request them from the backend to ensure uniqueness across all devices.

---

## API Endpoints

### 1. Generate New App ID

**POST** `/api/v1/apps/next-id`

**Request:**
```json
{
  "appName": "monitoring",
  "metadata": {
    "description": "Monitoring application",
    "owner": "admin"
  }
}
```

**Response:**
```json
{
  "appId": 1001,
  "appName": "monitoring",
  "metadata": {
    "description": "Monitoring application",
    "owner": "admin"
  }
}
```

---

### 2. Generate New Service ID

**POST** `/api/v1/services/next-id`

**Request:**
```json
{
  "serviceName": "nginx",
  "appId": 1001,
  "imageName": "nginx:alpine",
  "metadata": {
    "ports": ["8097:80"],
    "environment": {
      "ENV": "production"
    }
  }
}
```

**Response:**
```json
{
  "serviceId": 1,
  "serviceName": "nginx",
  "appId": 1001,
  "imageName": "nginx:alpine",
  "metadata": {
    "appId": 1001,
    "imageName": "nginx:alpine",
    "ports": ["8097:80"],
    "environment": {
      "ENV": "production"
    }
  }
}
```

---

### 3. Get All Registered Apps/Services

**GET** `/api/v1/apps-services/registry`

**Query Parameters:**
- `type` (optional): `app` or `service`

**Examples:**
```bash
# Get all apps
GET /api/v1/apps-services/registry?type=app

# Get all services
GET /api/v1/apps-services/registry?type=service

# Get everything
GET /api/v1/apps-services/registry
```

**Response:**
```json
{
  "count": 5,
  "items": [
    {
      "id": 1,
      "type": "app",
      "entityId": 1001,
      "name": "monitoring",
      "metadata": {},
      "createdBy": "admin",
      "createdAt": "2025-10-16T10:00:00.000Z"
    },
    {
      "id": 2,
      "type": "service",
      "entityId": 1,
      "name": "nginx",
      "metadata": {
        "appId": 1001,
        "imageName": "nginx:alpine"
      },
      "createdBy": "admin",
      "createdAt": "2025-10-16T10:05:00.000Z"
    }
  ]
}
```

---

### 4. Get Specific App or Service

**GET** `/api/v1/apps-services/:type/:id`

**Examples:**
```bash
# Get app 1001
GET /api/v1/apps-services/app/1001

# Get service 1
GET /api/v1/apps-services/service/1
```

**Response:**
```json
{
  "id": 1,
  "type": "app",
  "entityId": 1001,
  "name": "monitoring",
  "metadata": {},
  "createdBy": "admin",
  "createdAt": "2025-10-16T10:00:00.000Z"
}
```

---

## React/TypeScript Implementation

### API Service (`admin/src/services/api.ts`)

```typescript
const API_BASE_URL = 'http://localhost:4002';

export interface App {
  appId: number;
  appName: string;
  services: Service[];
}

export interface Service {
  serviceId: number;
  serviceName: string;
  appId: number;
  imageName: string;
  config: {
    image: string;
    ports?: string[];
    environment?: Record<string, string>;
  };
}

/**
 * Generate new app ID
 */
export async function createNewApp(
  appName: string, 
  metadata?: Record<string, any>
): Promise<App> {
  const response = await fetch(`${API_BASE_URL}/api/v1/apps/next-id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appName, metadata })
  });

  if (!response.ok) {
    throw new Error(`Failed to create app: ${response.statusText}`);
  }

  const data = await response.json();
  
  return {
    appId: data.appId,
    appName: data.appName,
    services: []
  };
}

/**
 * Generate new service ID
 */
export async function createNewService(
  appId: number,
  serviceName: string,
  imageName: string,
  config?: Partial<Service['config']>
): Promise<Service> {
  const response = await fetch(`${API_BASE_URL}/api/v1/services/next-id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      serviceName, 
      appId,
      imageName,
      metadata: config
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to create service: ${response.statusText}`);
  }

  const data = await response.json();
  
  return {
    serviceId: data.serviceId,
    serviceName: data.serviceName,
    appId: data.appId,
    imageName: data.imageName,
    config: {
      image: data.imageName,
      ...(config || {})
    }
  };
}

/**
 * Get all registered apps
 */
export async function getAllApps(): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/apps-services/registry?type=app`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch apps: ${response.statusText}`);
  }

  const data = await response.json();
  return data.items;
}

/**
 * Get all registered services
 */
export async function getAllServices(): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/apps-services/registry?type=service`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch services: ${response.statusText}`);
  }

  const data = await response.json();
  return data.items;
}
```

---

## React Component Example

### Creating an App with Services

```typescript
// admin/src/components/AppCreator.tsx

import React, { useState } from 'react';
import { createNewApp, createNewService } from '../services/api';

interface AppFormData {
  appName: string;
  services: {
    serviceName: string;
    imageName: string;
    ports: string[];
    environment: Record<string, string>;
  }[];
}

export function AppCreator() {
  const [formData, setFormData] = useState<AppFormData>({
    appName: '',
    services: []
  });

  const handleCreateApp = async () => {
    try {
      // 1. Create app and get ID
      const app = await createNewApp(formData.appName);
      console.log('✅ App created with ID:', app.appId);

      // 2. Create services and get IDs
      const services = [];
      for (const serviceData of formData.services) {
        const service = await createNewService(
          app.appId,
          serviceData.serviceName,
          serviceData.imageName,
          {
            ports: serviceData.ports,
            environment: serviceData.environment
          }
        );
        services.push(service);
        console.log('✅ Service created with ID:', service.serviceId);
      }

      // 3. Build target state JSON
      const targetState = {
        [app.appId]: {
          appId: app.appId,
          appName: app.appName,
          services: services.map(service => ({
            appId: service.appId,
            serviceId: service.serviceId,
            serviceName: service.serviceName,
            imageName: service.imageName,
            appName: app.appName,
            config: service.config
          }))
        }
      };

      console.log('✅ Target state:', targetState);
      
      // 4. Send to device (your existing function)
      await updateDeviceTargetState(selectedDeviceUuid, targetState);

      alert('App and services created successfully!');

    } catch (error) {
      console.error('❌ Error creating app:', error);
      alert('Failed to create app');
    }
  };

  return (
    <div>
      <h2>Create New Application</h2>
      
      <input
        type="text"
        placeholder="App Name"
        value={formData.appName}
        onChange={(e) => setFormData({...formData, appName: e.target.value})}
      />

      {/* Add service form here */}

      <button onClick={handleCreateApp}>
        Create App & Services
      </button>
    </div>
  );
}
```

---

## Complete Workflow Example

### User Creates "Monitoring" App with "Nginx" Service

```typescript
// 1. User enters app name "monitoring"
const app = await createNewApp('monitoring');
// Returns: { appId: 1001, appName: 'monitoring', services: [] }

// 2. User adds "nginx" service
const service = await createNewService(
  1001, // appId
  'nginx', // serviceName
  'nginx:alpine', // imageName
  {
    ports: ['8097:80'],
    environment: { ENV: 'production1' }
  }
);
// Returns: { serviceId: 1, serviceName: 'nginx', appId: 1001, ... }

// 3. Build target state (this is what you already have)
const targetState = {
  "1001": {
    "appId": 1001,
    "appName": "monitoring",
    "services": [
      {
        "appId": 1001,
        "serviceId": 1,
        "serviceName": "nginx",
        "imageName": "nginx:alpine",
        "appName": "monitoring",
        "config": {
          "image": "nginx:alpine",
          "ports": ["8097:80"],
          "environment": { "ENV": "production1" }
        }
      }
    ]
  }
};

// 4. Send to device
await fetch(`/api/v1/devices/${deviceUuid}/target-state`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ apps: targetState })
});
```

---

## Benefits for Frontend

### ✅ Unique IDs
- No collisions between users
- Backend ensures uniqueness
- Thread-safe generation

### ✅ Simple Integration
- Just 2 API calls: create app → create service(s)
- IDs returned immediately
- No complex logic in frontend

### ✅ Auditability
- Can query all apps: `GET /api/v1/apps-services/registry?type=app`
- See who created what
- Track when IDs were assigned

### ✅ No State Management
- Don't need to track "next ID" in frontend
- Backend manages sequences
- Always correct

---

## Testing with curl

```bash
# Create app
curl -X POST http://localhost:4002/api/v1/apps/next-id \
  -H "Content-Type: application/json" \
  -d '{"appName": "monitoring"}'

# Returns: {"appId":1001,"appName":"monitoring","metadata":{}}

# Create service
curl -X POST http://localhost:4002/api/v1/services/next-id \
  -H "Content-Type: application/json" \
  -d '{
    "serviceName": "nginx",
    "appId": 1001,
    "imageName": "nginx:alpine"
  }'

# Returns: {"serviceId":1,"serviceName":"nginx","appId":1001,"imageName":"nginx:alpine",...}

# Get all apps
curl http://localhost:4002/api/v1/apps-services/registry?type=app

# Get all services
curl http://localhost:4002/api/v1/apps-services/registry?type=service
```

---

## Migration Path

### If You Have Existing Apps

```typescript
// Optional: Register existing apps/services
async function registerExistingApp(appId: number, appName: string) {
  await fetch('/api/v1/apps/next-id', {
    method: 'POST',
    body: JSON.stringify({ appName })
  });
  
  // Note: This will generate a NEW ID
  // If you want to keep existing IDs, insert directly into database:
  // INSERT INTO app_service_ids (entity_type, entity_id, entity_name)
  // VALUES ('app', 1001, 'monitoring');
}
```

---

## Summary

### Before (Frontend Generates IDs) ❌
```typescript
const appId = Date.now(); // ❌ Can collide
const serviceId = Math.random(); // ❌ Not tracked
```

### After (Backend Generates IDs) ✅
```typescript
const { appId } = await createNewApp('monitoring'); // ✅ Unique
const { serviceId } = await createNewService(appId, 'nginx', 'nginx:alpine'); // ✅ Tracked
```

**Result:** Your JSONB state stays the same, but IDs are now guaranteed unique and centrally managed! 🎯
