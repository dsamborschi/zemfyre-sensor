# Application Manager Integration Guide

## Overview

This document provides a comprehensive guide for developing features that integrate with the **Application Manager API**. The Application Manager is a container orchestration system that manages Docker-based applications and their services.

### Key Terminology

- **Application**: A logical grouping of related services (e.g., "Web Stack", "Database Cluster")
- **Service**: A Docker container running specific software (e.g., nginx, postgres, redis)
- **State**: The system maintains both "current" (what's running) and "target" (what should be running) states
- **Reconciliation**: The process of applying changes to make current state match target state

---

## 📁 Project Structure

```
src/
├── services/
│   ├── api.ts                           # Legacy API endpoints
│   └── application-manager-api.ts       # Application Manager API endpoints ✨ NEW
├── data/pages/
│   ├── users.ts                         # User data operations
│   ├── projects.ts                      # Project data operations
│   └── applications.ts                  # Application data operations ✨ NEW
├── stores/
│   ├── global-store.ts                  # Global app state
│   ├── user-store.ts                    # User authentication
│   ├── projects.ts                      # Projects management
│   ├── application-manager.ts           # Application management ✨ NEW
│   └── index.ts                         # Store exports
├── pages/
│   ├── admin/dashboard/                 # Main dashboard
│   ├── users/                           # User management
│   ├── projects/                        # Project management
│   └── applications/                    # Application management ✨ NEW
│       └── ApplicationsPage.vue
└── router/
    └── index.ts                         # Route definitions
```

---

## 🔌 API Integration Architecture

### Data Flow

```
┌─────────────────┐
│  Vue Component  │  (ApplicationsPage.vue)
└────────┬────────┘
         │ 1. useApplicationManagerStore()
         ▼
┌─────────────────┐
│  Pinia Store    │  (application-manager.ts)
│  • State        │  • applications: Application[]
│  • Getters      │  • systemMetrics: SystemMetrics
│  • Actions      │  • isLoading: boolean
└────────┬────────┘
         │ 2. Call data layer functions
         ▼
┌─────────────────┐
│   Data Layer    │  (applications.ts)
│  • getApplications()
│  • deployApplication()
│  • updateApplication()
│  • removeApplication()
└────────┬────────┘
         │ 3. fetch() using endpoint from API service
         ▼
┌─────────────────┐
│  API Service    │  (application-manager-api.ts)
│  • getAllApps()
│  • getApp()
│  • setTargetState()
│  • applyState()
└────────┬────────┘
         │ 4. HTTP Request
         ▼
┌─────────────────┐
│ Application     │  http://localhost:3002/api/v1
│ Manager API     │
└─────────────────┘
```

---

## 🚀 Quick Start Guide

### 1. Environment Configuration

Create or update `.env` file:

```bash
# Application Manager API
VITE_APP_MANAGER_API=http://localhost:3002/api/v1

# Other Services (Optional)
VITE_GRAFANA_API=http://localhost:53000/api
VITE_INFLUXDB_API=http://localhost:58086/api
VITE_MQTT_BROKER=ws://localhost:59001
VITE_ZEMFYRE_API=http://localhost:53001
```

### 2. Using the Application Manager Store

```typescript
<script setup lang="ts">
import { onMounted } from 'vue'
import { useApplicationManagerStore } from '@/stores'

const appStore = useApplicationManagerStore()

onMounted(async () => {
  // Initialize: fetches applications and device info
  await appStore.initialize()
  
  // Or fetch specific data
  await appStore.fetchApplications()
  await appStore.fetchSystemMetrics()
})

// Deploy a new application
const deployNginx = async () => {
  await appStore.deployNewApplication({
    appId: 1001,
    appName: 'web-server',
    services: [{
      serviceId: 1,
      serviceName: 'nginx',
      imageName: 'nginx:alpine',
      appId: 1001,
      appName: 'web-server',
      config: {
        image: 'nginx:alpine',
        ports: ['8080:80'],
        environment: {
          NGINX_HOST: 'localhost'
        }
      }
    }]
  })
}

// Remove an application
const removeApp = async (appId: number) => {
  await appStore.removeExistingApplication(appId)
}
</script>

<template>
  <!-- Display applications -->
  <div v-for="app in appStore.applications" :key="app.appId">
    <h3>{{ app.appName }}</h3>
    <p>Services: {{ app.services.length }}</p>
  </div>
  
  <!-- Show loading state -->
  <VaProgressCircle v-if="appStore.isLoading" indeterminate />
  
  <!-- Show errors -->
  <VaAlert v-if="appStore.error" color="danger">
    {{ appStore.error }}
  </VaAlert>
</template>
```

---

## 📚 API Reference

### Application Manager API Endpoints

All endpoints are prefixed with `http://localhost:3002/api/v1`

#### State Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/state` | Get current and target state |
| POST | `/state/target` | Set target state (what to deploy) |
| POST | `/state/apply` | Apply target state (trigger deployment) |

#### Application Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/apps` | Get all deployed applications |
| GET | `/apps/:appId` | Get specific application |
| POST | `/apps/:appId` | Create/update application |
| DELETE | `/apps/:appId` | Remove application and services |

#### Device Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/device` | Get device info (UUID, name, etc.) |
| GET | `/device/provisioned` | Check if device is provisioned |
| POST | `/device/provision` | Provision device locally |
| PATCH | `/device` | Update device information |
| POST | `/device/reset` | Reset device (unprovision) |

#### Metrics & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metrics/system` | System metrics (CPU, memory, disk) |
| GET | `/metrics/docker` | Docker-specific metrics |
| GET | `/logs?limit=100` | Application manager logs |
| GET | `/status` | Manager status and health |

---

## 🏗️ Creating New Features

### Example: Add System Metrics to Dashboard

**1. Create a Metrics Card Component**

```vue
<!-- src/pages/admin/dashboard/cards/SystemMetricsCard.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useApplicationManagerStore } from '@/stores'

const appStore = useApplicationManagerStore()

onMounted(async () => {
  await appStore.fetchSystemMetrics()
  
  // Auto-refresh every 5 seconds
  setInterval(() => {
    appStore.fetchSystemMetrics()
  }, 5000)
})
</script>

<template>
  <VaCard>
    <VaCardTitle>System Metrics</VaCardTitle>
    <VaCardContent v-if="appStore.systemMetrics">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-gray-600">CPU Usage</p>
          <VaProgressBar 
            :model-value="appStore.systemMetrics.cpu.usage" 
            color="primary"
          >
            {{ appStore.systemMetrics.cpu.usage.toFixed(1) }}%
          </VaProgressBar>
        </div>
        <div>
          <p class="text-sm text-gray-600">Memory Usage</p>
          <VaProgressBar 
            :model-value="appStore.systemMetrics.memory.usedPercent" 
            color="info"
          >
            {{ appStore.systemMetrics.memory.usedPercent.toFixed(1) }}%
          </VaProgressBar>
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>
```

**2. Add to Dashboard**

```vue
<!-- src/pages/admin/dashboard/Dashboard.vue -->
<script setup>
import SystemMetricsCard from './cards/SystemMetricsCard.vue'
</script>

<template>
  <SystemMetricsCard class="mb-4" />
  <!-- ... other dashboard cards ... -->
</template>
```

### Example: Add Service Management to Application Page

**1. Extend the Data Layer**

```typescript
// src/data/pages/applications.ts

export const restartService = async (
  appId: number, 
  serviceId: number
): Promise<void> => {
  // Get current application
  const app = await getApplication(appId)
  
  // Find the service
  const service = app.services.find(s => s.serviceId === serviceId)
  if (!service) throw new Error('Service not found')
  
  // Add restart: always policy
  service.config.restart = 'always'
  
  // Update application
  await updateApplication(app)
}

export const scaleService = async (
  appId: number,
  serviceName: string,
  replicas: number
): Promise<void> => {
  const app = await getApplication(appId)
  
  // Create multiple service instances
  const baseService = app.services.find(s => s.serviceName === serviceName)
  if (!baseService) throw new Error('Service not found')
  
  const newServices = []
  for (let i = 0; i < replicas; i++) {
    newServices.push({
      ...baseService,
      serviceId: baseService.serviceId + i,
      serviceName: `${serviceName}-${i}`
    })
  }
  
  app.services = newServices
  await updateApplication(app)
}
```

**2. Add to Store Actions**

```typescript
// src/stores/application-manager.ts

async restartService(appId: number, serviceId: number) {
  this.isDeploying = true
  try {
    await restartService(appId, serviceId)
    await this.fetchApplications()
  } catch (error: any) {
    this.error = error.message
    throw error
  } finally {
    this.isDeploying = false
  }
}
```

---

## 🎨 UI Component Best Practices

### Using Vuestic UI Components

The project uses [Vuestic UI](https://ui.vuestic.dev) component library. Key components for this use case:

```vue
<!-- Cards for sections -->
<VaCard>
  <VaCardTitle>Title</VaCardTitle>
  <VaCardContent>Content</VaCardContent>
</VaCard>

<!-- Buttons -->
<VaButton @click="deploy">Deploy</VaButton>
<VaButton preset="secondary">Cancel</VaButton>
<VaButton :loading="isLoading">Submit</VaButton>

<!-- Status indicators -->
<VaBadge text="Running" color="success" />
<VaChip closeable>nginx:alpine</VaChip>

<!-- Progress -->
<VaProgressBar :model-value="75" />
<VaProgressCircle indeterminate />

<!-- Forms -->
<VaInput v-model="name" label="Application Name" />
<VaSelect v-model="selected" :options="options" />

<!-- Modals -->
<VaModal v-model="showDialog" title="Deploy App">
  <template #footer>
    <VaButton @click="deploy">Deploy</VaButton>
  </template>
</VaModal>

<!-- Alerts -->
<VaAlert color="danger" closeable>
  Error message here
</VaAlert>
```

---

## 🔍 TypeScript Types Reference

### Core Types

```typescript
// Service Configuration
interface ServiceConfig {
  serviceId: number
  serviceName: string
  imageName: string
  appId: number
  appName: string
  config: {
    image: string
    ports?: string[]                  // e.g., ["8080:80"]
    environment?: Record<string, string>
    volumes?: string[]
    networks?: string[]
    restart?: string                  // "always", "unless-stopped", etc.
    command?: string[]
    labels?: Record<string, string>
  }
}

// Application
interface Application {
  appId: number
  appName: string
  services: ServiceConfig[]
  createdAt?: string
  status?: 'running' | 'stopped' | 'deploying' | 'error'
}

// System Metrics
interface SystemMetrics {
  cpu: {
    usage: number
    cores: number
  }
  memory: {
    total: number
    used: number
    free: number
    usedPercent: number
  }
  disk: {
    total: number
    used: number
    free: number
    usedPercent: number
  }
  network: {
    bytesReceived: number
    bytesSent: number
  }
}

// Device Info
interface DeviceInfo {
  uuid: string
  deviceId?: string
  deviceName?: string
  deviceType?: string
  provisioned: boolean
  apiEndpoint?: string
  registeredAt?: string
}
```

---

## 🔐 Security Considerations

### Current State (Development)
- ✅ Environment-based API endpoints
- ✅ CORS enabled for local development
- ⚠️ No authentication on API endpoints
- ⚠️ No request encryption

### Production Recommendations

**1. Add Authentication**

```typescript
// src/services/http-client.ts
import axios from 'axios'

const httpClient = axios.create({
  baseURL: import.meta.env.VITE_APP_MANAGER_API,
  timeout: 10000,
})

// Add auth token to requests
httpClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors
httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login
      router.push('/auth/login')
    }
    return Promise.reject(error)
  }
)

export default httpClient
```

**2. Use HTTPS**

```bash
# .env
VITE_APP_MANAGER_API=https://your-domain.com/api/v1
```

**3. Input Validation**

```typescript
// Validate before deployment
const validateApplication = (app: Application): boolean => {
  if (!app.appName || app.appName.length < 3) return false
  if (app.services.length === 0) return false
  
  for (const service of app.services) {
    if (!service.imageName || !service.serviceName) return false
    // Validate image name format
    if (!/^[\w\-\.\/]+:[\w\-\.]+$/.test(service.imageName)) return false
  }
  
  return true
}
```

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] Deploy a simple application (e.g., nginx)
- [ ] View deployed applications list
- [ ] Check system metrics display
- [ ] Update an application's service
- [ ] Remove an application
- [ ] Handle API errors gracefully
- [ ] Test loading states
- [ ] Verify responsive design

### Example Manual Test Script

```bash
# 1. Start dev server
cd admin
npm run dev

# 2. Start application-manager
cd ../application-manager
USE_REAL_DOCKER=true npm run dev

# 3. Open browser
# Navigate to http://localhost:5173/applications

# 4. Deploy test application
# - Click "Deploy Application"
# - Name: test-nginx
# - Service: nginx
# - Image: nginx:alpine
# - Port: 8080:80
# - Click Deploy

# 5. Verify deployment
# - Check Docker: docker ps
# - Should see nginx container
# - Access: http://localhost:8080

# 6. Remove application
# - Click delete button
# - Confirm removal
# - Verify container stopped
```

---

## 🐛 Troubleshooting

### Common Issues

**1. "Failed to fetch applications"**
- Check if application-manager is running: `docker logs application-manager`
- Verify API URL in `.env`
- Check network connectivity: `curl http://localhost:3002/api/v1/apps`

**2. "CORS Error"**
- Application-manager needs CORS headers enabled
- Check application-manager configuration

**3. "Cannot deploy application"**
- Check Docker daemon is running
- Verify application-manager has Docker socket access
- Check logs: `docker logs -f application-manager`

**4. Line Ending Errors (CRLF vs LF)**
- Run: `npm run format` to auto-fix
- Or configure git: `git config core.autocrlf true`

---

## 📖 Additional Resources

### Official Documentation
- [Vuestic UI Components](https://ui.vuestic.dev/ui-elements/button)
- [Vue 3 Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Pinia State Management](https://pinia.vuejs.org/)
- [Vite Configuration](https://vitejs.dev/config/)

### Application Manager Docs
- `application-manager/README.md` - Main documentation
- `application-manager/docs/` - Feature-specific guides

### Project Documentation
- `.github/copilot-instructions.md` - AI coding agent guide
- `SENSOR.md` - Hardware and sensor setup
- `README.md` - Project overview

---

## 🎯 Next Steps

### Suggested Enhancements

1. **Real-time Updates via MQTT**
   - Subscribe to `container-manager/logs` topic
   - Display live deployment progress
   - Show service health changes in real-time

2. **Service Logs Viewer**
   - Add logs tab to application details
   - Stream logs from running services
   - Search and filter log entries

3. **Application Templates**
   - Pre-configured application stacks
   - One-click deployment for common setups
   - Template library (LAMP, MEAN, etc.)

4. **Resource Monitoring**
   - Per-application resource usage
   - Historical metrics charts
   - Alert thresholds and notifications

5. **Service Discovery**
   - Automatic service endpoint detection
   - Health check integration
   - Service dependency visualization

---

## 💡 Tips & Best Practices

1. **Always use TypeScript types** - Prevents runtime errors
2. **Handle loading states** - Show progress indicators
3. **Implement error boundaries** - Graceful error handling
4. **Test with real Docker** - Use actual containers, not mocks
5. **Keep stores focused** - One store per domain (applications, users, etc.)
6. **Use computed properties** - For derived state (totalServices, runningApps)
7. **Implement optimistic updates** - Update UI before API confirms
8. **Add confirmation dialogs** - For destructive actions (delete, restart)
9. **Use environment variables** - Never hardcode API URLs
10. **Follow Vue 3 patterns** - Use Composition API with `<script setup>`

---

## 📝 Summary

You now have a complete integration with the Application Manager API! The system follows Vue 3 best practices with:

✅ **Service Layer** - Centralized API endpoints  
✅ **Data Layer** - Type-safe CRUD operations  
✅ **State Management** - Pinia store with getters and actions  
✅ **UI Components** - Full-featured application management page  
✅ **Routing** - Integrated into navigation  
✅ **Types** - Complete TypeScript definitions  

**Access the Application Manager** at: http://localhost:5173/applications

Happy coding! 🚀
