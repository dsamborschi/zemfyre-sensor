# Dashboard API Configuration - Implementation Summary

## Problem Statement

The dashboard web application had hardcoded API endpoints (`http://localhost:4002`) that worked locally but failed in Kubernetes deployments where the API is accessible via the same ingress at `/api` path.

## Solution

Implemented a flexible API configuration system that automatically detects the environment and uses appropriate defaults, with override capabilities for custom deployments.

## Changes Made

### 1. Configuration Module (`dashboard/src/config/api.ts`)
**NEW FILE**

Created centralized API configuration with:
- **Automatic detection**: Uses `window.location.origin` in production, `localhost:4002` in development
- **Environment override**: Respects `VITE_API_URL` if set
- **Helper functions**: `getApiUrl()` and `buildApiUrl(path)` for consistent usage
- **Debug logging**: Outputs configuration in development mode

### 2. Component Updates

Updated **5 components** to use the new configuration:

#### `dashboard/src/components/MqttMetricsCard.tsx`
- ✅ Replaced: `'http://localhost:4002/api/v1/mqtt-monitor/stats'`
- ✅ With: `buildApiUrl('/api/v1/mqtt-monitor/stats')`

#### `dashboard/src/components/MqttBrokerCard.tsx`
- ✅ Replaced: `'http://localhost:4002/api/v1/mqtt-monitor/topics'`
- ✅ With: `buildApiUrl('/api/v1/mqtt-monitor/topics')`

#### `dashboard/src/components/SystemMetrics.tsx`
- ✅ Replaced: `\`http://localhost:4002/api/v1/devices/${deviceUuid}/processes\``
- ✅ With: `buildApiUrl(\`/api/v1/devices/${device.deviceUuid}/processes\`)`

#### `dashboard/src/components/TimelineCard.tsx`
- ✅ Replaced: `\`http://localhost:4002/api/v1/events/device/${deviceId}?limit=${limit}\``
- ✅ With: `buildApiUrl(\`/api/v1/events/device/${deviceId}?limit=${limit}\`)`

#### `dashboard/src/components/AnalyticsCard.tsx`
- ✅ Replaced: `\`http://localhost:4002/api/v1/devices/${deviceId}/processes/history?hours=${hours}&limit=50\``
- ✅ With: `buildApiUrl(\`/api/v1/devices/${deviceId}/processes/history?hours=${hours}&limit=50\`)`

### 3. Build Configuration (`dashboard/vite.config.ts`)

Added environment variable support:
```typescript
define: {
  'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL),
}
```

### 4. Dockerfile (`dashboard/Dockerfile`)

Added build argument support:
```dockerfile
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
```

This allows injecting API URL at build time:
```bash
docker build --build-arg VITE_API_URL=https://api.example.com .
```

### 5. Helm Chart (`charts/customer-instance/`)

#### `values.yaml`
Added dashboard configuration:
```yaml
dashboard:
  apiUrl: ""  # Empty = automatic detection
```

#### `templates/dashboard.yaml`
- ✅ Removed runtime environment variables (`API_URL`, `MQTT_URL`)
- ✅ Added annotation for documentation
- API URL now handled at build time, not runtime

### 6. Documentation

#### `dashboard/docs/API_CONFIGURATION.md` (NEW)
Comprehensive 400+ line guide covering:
- Architecture overview
- Configuration methods (3 approaches)
- Deployment scenarios (5 scenarios)
- Debugging guide
- Common issues and fixes
- Migration guide
- Best practices

#### `dashboard/.env.example` (NEW)
Template for local environment configuration

## How It Works

### Local Development
```typescript
// Automatic detection in dev mode
getApiUrl() → "http://localhost:4002"
buildApiUrl('/api/v1/stats') → "http://localhost:4002/api/v1/stats"
```

### Kubernetes Deployment
```typescript
// Automatic detection in production
getApiUrl() → "https://customer-xyz.iotistic.local" (window.location.origin)
buildApiUrl('/api/v1/stats') → "https://customer-xyz.iotistic.local/api/v1/stats"
```

Ingress routes:
- `https://customer-xyz.iotistic.local/` → Dashboard
- `https://customer-xyz.iotistic.local/api` → API

**Same origin = No CORS issues!** ✅

### Custom Override
```bash
# .env.local
VITE_API_URL=https://api.staging.iotistic.com

# Now all API calls go to staging
getApiUrl() → "https://api.staging.iotistic.com"
```

## Benefits

1. **✅ Works locally**: Auto-detects `localhost:4002` in development
2. **✅ Works in K8s**: Uses relative paths via same ingress
3. **✅ Flexible**: Override with `VITE_API_URL` for custom deployments
4. **✅ No CORS issues**: Same-origin requests in production
5. **✅ Centralized**: All API calls go through one configuration point
6. **✅ Type-safe**: TypeScript support throughout
7. **✅ Debuggable**: Logs configuration in development mode

## Testing Checklist

### ✅ Local Development
```bash
cd dashboard
npm run dev
# Verify: API calls go to localhost:4002
```

### ✅ Production Build
```bash
cd dashboard
npm run build
npx serve -s build
# Verify: API calls use relative paths
```

### ✅ Kubernetes Deployment
```bash
helm install test-customer ./charts/customer-instance \
  --set customer.id=test-customer
  
kubectl get ingress
# Verify: Ingress has both / and /api paths

curl https://test-customer.iotistic.local/api/v1/mqtt-monitor/stats
# Verify: API accessible via ingress
```

### ✅ Custom API URL
```bash
docker build --build-arg VITE_API_URL=https://custom-api.com .
# Verify: Compiled code contains custom-api.com
```

## Migration for Other Components

If you find more hardcoded API URLs:

1. **Import the utility**:
   ```typescript
   import { buildApiUrl } from '@/config/api';
   ```

2. **Replace hardcoded URL**:
   ```typescript
   // Before
   fetch('http://localhost:4002/api/...')
   
   // After
   fetch(buildApiUrl('/api/...'))
   ```

3. **Test both environments**

## Configuration Priority

The API URL is determined in this order (first match wins):

1. **`VITE_API_URL` environment variable** (explicit override)
2. **Production mode**: `window.location.origin` (automatic for K8s)
3. **Development mode**: `http://localhost:4002` (automatic for local)

## Files Changed

```
dashboard/
├── src/
│   ├── config/
│   │   └── api.ts                          [NEW] Configuration module
│   └── components/
│       ├── MqttMetricsCard.tsx             [MODIFIED] Use buildApiUrl()
│       ├── MqttBrokerCard.tsx              [MODIFIED] Use buildApiUrl()
│       ├── SystemMetrics.tsx               [MODIFIED] Use buildApiUrl()
│       ├── TimelineCard.tsx                [MODIFIED] Use buildApiUrl()
│       └── AnalyticsCard.tsx               [MODIFIED] Use buildApiUrl()
├── docs/
│   └── API_CONFIGURATION.md                [NEW] Comprehensive guide
├── .env.example                            [NEW] Environment template
├── Dockerfile                              [MODIFIED] Add VITE_API_URL support
└── vite.config.ts                          [MODIFIED] Environment variable injection

charts/customer-instance/
├── values.yaml                             [MODIFIED] Add dashboard.apiUrl
└── templates/
    └── dashboard.yaml                      [MODIFIED] Remove runtime env vars
```

## Breaking Changes

**None!** This is a backward-compatible enhancement:
- Existing deployments continue to work (automatic detection)
- Local development works out of the box
- Optional override available if needed

## Next Steps

1. **Rebuild dashboard image**:
   ```bash
   cd dashboard
   docker build -t iotistic/dashboard:latest .
   docker push iotistic/dashboard:latest
   ```

2. **Redeploy customer instances** (optional - only if you want the fix):
   ```bash
   helm upgrade customer-xyz ./charts/customer-instance
   ```

3. **Update documentation** for new customers (already done!)

## Troubleshooting

See `dashboard/docs/API_CONFIGURATION.md` for:
- Common issues and fixes
- Debugging techniques
- Network tab inspection
- CORS error resolution
- 404 error resolution

## Summary

The dashboard now automatically adapts to its deployment environment while maintaining the flexibility to override when needed. No more hardcoded URLs! 🎉
