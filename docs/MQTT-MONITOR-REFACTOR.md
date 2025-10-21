# MQTT Monitor Service Refactoring

**Date**: October 21, 2025  
**Status**: ✅ Complete

## Problem

The MQTT Monitor service had poor separation of concerns:

1. **Service initialization in router** - The router file (`mqtt-monitor.ts`) was responsible for creating and starting the MQTT Monitor service
2. **Environment variable coupling** - Broker configuration was hardcoded in the router using `process.env` instead of being configured centrally
3. **Module-level auto-start** - Service started on module import, not during application initialization
4. **Lifecycle management scattered** - No proper shutdown handling in main application

## Solution

Refactored to follow proper service architecture patterns:

### Before (Anti-pattern)

```
routes/mqtt-monitor.ts:
  - Initialize MQTTMonitorService
  - Read env vars for broker config
  - Start service on module load
  - Export router with embedded service logic
  
index.ts:
  - Import mqtt-monitor routes
  - No knowledge of service lifecycle
  - No shutdown handling
```

### After (Correct pattern)

```
index.ts (Service orchestration):
  - Create MQTTMonitorService with broker config from env
  - Start service during app initialization
  - Inject service instance into routes via setMonitorInstance()
  - Stop service on SIGTERM/SIGINT
  
routes/mqtt-monitor.ts (Pure API layer):
  - Receive monitor instance via setMonitorInstance()
  - Only contain HTTP endpoint handlers
  - No service creation or lifecycle management
```

## Changes Made

### 1. `api/src/routes/mqtt-monitor.ts`

**Removed**:
- `initializeMonitor()` function
- Module-level service initialization
- Direct access to `poolWrapper` and database connection
- Auto-start on module import

**Added**:
- `setMonitorInstance()` export function to receive service from index.ts
- Updated `/start` endpoint to return error if monitor not initialized

**Result**: Router is now a pure API layer with no business logic or service lifecycle management.

### 2. `api/src/index.ts`

**Added**:
- Import `MQTTMonitorService` and `MQTTDatabaseService`
- Import `setMonitorInstance` from routes
- MQTT Monitor initialization in `startServer()`:
  - Read broker config from environment variables
  - Create `MQTTDatabaseService` if persistence enabled
  - Create `MQTTMonitorService` with proper configuration
  - Set up event handlers for logging
  - Start the service
  - Inject instance into routes via `setMonitorInstance()`
- MQTT Monitor cleanup in shutdown handlers (SIGTERM/SIGINT)

**Result**: All service lifecycle is managed centrally in the main application entry point.

## Configuration

### Environment Variables

```bash
# Enable/disable MQTT Monitor
MQTT_MONITOR_ENABLED=true           # Set to 'false' to disable

# Broker connection
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=admin                 # Optional
MQTT_PASSWORD=secret                # Optional

# Database persistence
MQTT_PERSIST_TO_DB=true             # Enable database storage
MQTT_DB_SYNC_INTERVAL=30000         # Sync interval in ms (default: 30s)
```

### Service Lifecycle

**Startup sequence**:
1. Database initialization
2. Heartbeat monitor
3. Rollout monitor
4. Image monitor
5. Job scheduler
6. MQTT manager (device messages)
7. API key rotation schedulers
8. Shadow retention scheduler
9. **MQTT Monitor Service** ← New addition
10. HTTP server start

**Shutdown sequence** (SIGTERM/SIGINT):
1. Stop MQTT Monitor
2. Stop MQTT manager
3. Stop rotation schedulers
4. Stop shadow retention
5. Stop heartbeat monitor
6. Stop image monitor
7. Stop job scheduler
8. Close HTTP server

## Benefits

✅ **Separation of concerns** - Router only handles HTTP, service managed by index.ts  
✅ **Centralized configuration** - All env vars read in one place  
✅ **Proper lifecycle** - Service starts/stops with application  
✅ **Testability** - Service can be mocked/injected for testing  
✅ **Consistency** - Follows same pattern as other services (heartbeat, rollout, image monitor)  
✅ **Error handling** - Proper try/catch around initialization and shutdown  
✅ **Logging** - Startup/shutdown logged consistently with other services  

## Migration Notes

**No API changes** - All endpoints remain the same:
- `GET /api/v1/mqtt-monitor/status`
- `POST /api/v1/mqtt-monitor/start`
- `POST /api/v1/mqtt-monitor/stop`
- `GET /api/v1/mqtt-monitor/topic-tree`
- `GET /api/v1/mqtt-monitor/topics`
- `GET /api/v1/mqtt-monitor/metrics`
- etc.

**Behavior changes**:
- Service now respects `MQTT_MONITOR_ENABLED=false` environment variable
- Service starts during app initialization instead of module import
- Service properly stops on graceful shutdown
- `/start` endpoint returns error if service not initialized (instead of creating service)

## Testing

```bash
# Start API server
cd api
npm run dev

# Service should auto-start if MQTT_MONITOR_ENABLED != 'false'
# Check logs for:
✅ MQTT Monitor database persistence enabled (if MQTT_PERSIST_TO_DB=true)
✅ MQTT Monitor connected to broker at mqtt://localhost:1883
✅ MQTT Monitor Service started

# Test endpoint
curl http://localhost:3002/api/v1/mqtt-monitor/status

# Graceful shutdown (Ctrl+C)
# Check logs for:
✅ MQTT Monitor stopped
```

## Related Files

- `api/src/index.ts` - Main application entry point (service orchestration)
- `api/src/routes/mqtt-monitor.ts` - API endpoints (pure HTTP layer)
- `api/src/services/mqtt-monitor.ts` - MQTT Monitor Service implementation
- `api/src/services/mqtt-database.service.ts` - Database persistence layer

## See Also

- [MQTT Services Comparison](./MQTT-SERVICES-COMPARISON.md) - Analysis of mqtt-monitor vs mqtt-schema-agent redundancy
- [MQTT Usage](../api/docs/MQTT-USAGE.md) - MQTT broker configuration and usage patterns
