# Device API for Standalone Application Manager

Adapted from balena-supervisor device API, simplified for standalone use without balena-specific dependencies.

## Features

- ✅ Application management (start, stop, restart)
- ✅ Device information
- ✅ Health checks
- ✅ Service-level control
- ✅ V1 and V2 API endpoints
- ✅ Optional authentication
- ✅ Request logging
- ✅ Error handling

## Quick Start

### 1. Basic Integration

```typescript
import { startDeviceAPI } from './device-api-integration';
import ContainerManager from './container-manager';
import { DeviceManager } from './provisioning';

// Initialize managers
const containerManager = new ContainerManager(true);
await containerManager.init();

const deviceManager = new DeviceManager();
await deviceManager.initialize();

// Start device API on port 48484
const deviceAPI = await startDeviceAPI(
	containerManager,
	deviceManager,
	48484
);

console.log('Device API running on http://localhost:48484');
```

### 2. Manual Integration

```typescript
import { DeviceAPI } from './device-api';
import { router as v1Router } from './device-api/v1';
import { router as v2Router } from './device-api/v2';
import * as actions from './device-api/actions';

// Initialize actions
actions.initialize(containerManager, deviceManager);

// Create API
const deviceAPI = new DeviceAPI({
	routers: [v1Router, v2Router],
	healthchecks: [
		async () => true, // Your health check logic
	],
});

await deviceAPI.listen(48484);
```

## API Endpoints

### V1 API (Legacy/Simple)

#### GET /v1/healthy
Health check endpoint.

```bash
curl http://localhost:48484/v1/healthy
# Returns: 200 OK or 500 Unhealthy
```

#### GET /ping
Simple ping endpoint.

```bash
curl http://localhost:48484/ping
# Returns: OK
```

#### GET /v1/device
Get device information.

```bash
curl http://localhost:48484/v1/device
```

Response:
```json
{
	"uuid": "...",
	"deviceId": "...",
	"deviceName": "my-device",
	"provisioned": true,
	"apps": 2,
	"status": "Idle"
}
```

#### GET /v1/apps/:appId
Get application information.

```bash
curl http://localhost:48484/v1/apps/1001
```

Response:
```json
{
	"appId": 1001,
	"appName": "My App",
	"containerId": "abc123",
	"serviceName": "web",
	"imageName": "nginx:latest",
	"status": "running"
}
```

#### POST /v1/restart
Restart an application.

```bash
curl -X POST http://localhost:48484/v1/restart \
	-H "Content-Type: application/json" \
	-d '{"appId": 1001, "force": false}'
```

#### POST /v1/apps/:appId/stop
Stop a service.

```bash
curl -X POST http://localhost:48484/v1/apps/1001/stop \
	-H "Content-Type: application/json" \
	-d '{"force": false}'
```

Response:
```json
{
	"containerId": "abc123",
	"status": "stopped"
}
```

#### POST /v1/apps/:appId/start
Start a service.

```bash
curl -X POST http://localhost:48484/v1/apps/1001/start \
	-H "Content-Type: application/json" \
	-d '{"force": false}'
```

#### POST /v1/purge
Purge application data (volumes).

```bash
curl -X POST http://localhost:48484/v1/purge \
	-H "Content-Type: application/json" \
	-d '{"appId": 1001, "force": false}'
```

#### POST /v1/reboot
Reboot the device (placeholder).

```bash
curl -X POST http://localhost:48484/v1/reboot
```

#### POST /v1/shutdown
Shutdown the device (placeholder).

```bash
curl -X POST http://localhost:48484/v1/shutdown
```

### V2 API (Extended)

#### GET /v2/version
Get API version.

```bash
curl http://localhost:48484/v2/version
```

Response:
```json
{
	"status": "success",
	"version": "2.0.0",
	"api_version": "v2"
}
```

#### GET /v2/device/name
Get device name.

```bash
curl http://localhost:48484/v2/device/name
```

Response:
```json
{
	"deviceName": "my-device"
}
```

#### GET /v2/applications/state
Get current state of all applications.

```bash
curl http://localhost:48484/v2/applications/state
```

#### POST /v2/applications/:appId/restart
Restart an application.

```bash
curl -X POST http://localhost:48484/v2/applications/1001/restart \
	-H "Content-Type: application/json" \
	-d '{"force": false}'
```

#### POST /v2/applications/:appId/restart-service
Restart a specific service.

```bash
curl -X POST http://localhost:48484/v2/applications/1001/restart-service \
	-H "Content-Type: application/json" \
	-d '{"serviceName": "web", "force": false}'
```

#### POST /v2/applications/:appId/stop-service
Stop a specific service.

```bash
curl -X POST http://localhost:48484/v2/applications/1001/stop-service \
	-H "Content-Type: application/json" \
	-d '{"serviceName": "web", "force": false}'
```

#### POST /v2/applications/:appId/start-service
Start a specific service.

```bash
curl -X POST http://localhost:48484/v2/applications/1001/start-service \
	-H "Content-Type: application/json" \
	-d '{"serviceName": "web", "force": false}'
```

#### POST /v2/applications/:appId/purge
Purge application data.

```bash
curl -X POST http://localhost:48484/v2/applications/1001/purge \
	-H "Content-Type: application/json" \
	-d '{"force": false}'
```

## Configuration

### Environment Variables

```bash
# Enable authentication (optional)
ENABLE_AUTH=true
API_KEY=your-secret-key

# Device API port
DEVICE_API_PORT=48484
```

### Authentication

When `ENABLE_AUTH=true`, include API key in requests:

```bash
# Via header
curl -H "X-API-Key: your-secret-key" http://localhost:48484/v1/device

# Via query parameter
curl http://localhost:48484/v1/device?apiKey=your-secret-key
```

## Architecture

```
device-api/
├── index.ts              # Main DeviceAPI class
├── actions.ts            # Action implementations
├── v1.ts                 # V1 API router
├── v2.ts                 # V2 API router
└── middleware/
    ├── index.ts          # Middleware exports
    ├── logging.ts        # Request logging
    ├── auth.ts           # Authentication
    └── errors.ts         # Error handling
```

## Differences from Balena Supervisor

1. **No balena-cloud integration** - Works standalone
2. **Simplified authentication** - Optional API key instead of complex JWT
3. **No commit/release tracking** - Simpler state management
4. **No VPN management** - Device-only features removed
5. **No host config** - Platform-specific features removed
6. **Simplified error handling** - Standard HTTP status codes

## Testing

```bash
# Start device API
npm run start

# Test health check
curl http://localhost:48484/v1/healthy

# Test device info
curl http://localhost:48484/v1/device

# Test app info
curl http://localhost:48484/v1/apps/1001

# Restart app
curl -X POST http://localhost:48484/v1/restart \
	-H "Content-Type: application/json" \
	-d '{"appId": 1001}'
```

## Integration Example

```typescript
// app.ts
import express from 'express';
import { startDeviceAPI } from './device-api-integration';
import ContainerManager from './container-manager';
import { DeviceManager } from './provisioning';

async function main() {
	// Initialize managers
	const containerManager = new ContainerManager(true);
	await containerManager.init();
	
	const deviceManager = new DeviceManager();
	await deviceManager.initialize();
	
	// Start device API on separate port
	await startDeviceAPI(containerManager, deviceManager, 48484);
	
	// Start your main API on port 3000
	const app = express();
	// ... your main API setup ...
	app.listen(3000);
	
	console.log('Main API: http://localhost:3000');
	console.log('Device API: http://localhost:48484');
}

main();
```

## Security Considerations

1. **Enable authentication** in production (`ENABLE_AUTH=true`)
2. **Use HTTPS** in production
3. **Restrict access** using firewall rules
4. **Rotate API keys** regularly
5. **Monitor access logs**

## Future Enhancements

- [ ] Rate limiting
- [ ] JWT authentication
- [ ] WebSocket support for real-time updates
- [ ] Metrics collection
- [ ] Audit logging
- [ ] Role-based access control

## Compatibility

Compatible with most balena-supervisor v1 API clients with minor modifications:
- Remove balena-cloud specific headers
- Use API key instead of JWT
- Adjust endpoint URLs as needed
