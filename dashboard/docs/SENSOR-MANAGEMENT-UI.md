# Sensor Management UI - Implementation Guide

## Overview

Allow users to add, edit, and remove sensors directly from the dashboard instead of editing config files.

## Architecture

### 1. Storage Options

**Option A: Store in Target State (Recommended)**
- Add `sensors` field to device target state
- Agent applies changes on next sync
- Consistent with how apps are managed
- Version controlled

**Option B: Direct Config File Updates**
- API updates config files on agent filesystem
- Agent detects changes and reloads
- More immediate but less traceable

### 2. Data Structure

```typescript
interface SensorConfig {
  protocol: 'modbus' | 'can' | 'opcua';
  name: string;
  enabled: boolean;
  config: {
    // Modbus
    host?: string;
    port?: number;
    unitId?: number;
    // CAN
    interface?: string;
    bitrate?: number;
    // OPC-UA
    endpointUrl?: string;
  };
}

// In target state
{
  "apps": {...},
  "sensors": [
    {
      "protocol": "modbus",
      "name": "temperature-sensor",
      "enabled": true,
      "config": {
        "host": "192.168.1.100",
        "port": 502,
        "unitId": 1
      }
    }
  ]
}
```

## Implementation Steps

### Phase 1: Backend (API)

1. **Add API Endpoints** (`api/src/routes/sensors-config.ts`):
   ```typescript
   POST   /api/v1/devices/:uuid/sensors          // Add sensor
   PATCH  /api/v1/devices/:uuid/sensors/:name    // Edit sensor
   DELETE /api/v1/devices/:uuid/sensors/:name    // Remove sensor
   GET    /api/v1/devices/:uuid/sensors/config   // List configured sensors
   ```

2. **Update Target State Schema**:
   - Add `sensors` array field
   - Update validation
   - Handle version bumping

3. **Agent Integration**:
   - Modify protocol-adapters feature to read from target state
   - Fallback to config file if target state doesn't have sensors
   - Hot reload when sensors change

### Phase 2: Frontend (Dashboard)

1. **Add Sensor Management Card** (similar to ApplicationsCard):
   ```
   dashboard/src/components/sensors/SensorConfigCard.tsx
   ```

2. **Add Sensor Dialog**:
   ```
   dashboard/src/components/sensors/AddEditSensorDialog.tsx
   ```

3. **Integration**:
   - Add to SensorHealthDashboard or SystemMetrics
   - Wire up API calls
   - Handle deployment flow (similar to apps)

## UI Mockup

```
┌─────────────────────────────────────────────────────┐
│ Configured Sensors                           [+ Add] │
├─────────────────────────────────────────────────────┤
│ 📡 temperature-sensor          MODBUS    [Edit] [×] │
│    192.168.1.100:502 (Unit 1)                       │
│    Status: Online • 91 errors                        │
│                                                      │
│ 📡 pressure-sensor             MODBUS    [Edit] [×] │
│    192.168.1.101:502 (Unit 1)                       │
│    Status: Offline • 0 errors                        │
└─────────────────────────────────────────────────────┘
```

### Add Sensor Dialog

```
┌──────────────────────────────────────┐
│ Add Sensor                      [×]  │
├──────────────────────────────────────┤
│ Protocol:                            │
│ [Modbus TCP/RTU ▼]                   │
│                                      │
│ Name:                                │
│ [___________________________]        │
│                                      │
│ Host/IP Address:                     │
│ [___________________________]        │
│                                      │
│ Port:                                │
│ [502_________________________]       │
│                                      │
│ Unit ID (Slave ID):                  │
│ [1___________________________]       │
│                                      │
│ [ ] Enable sensor                    │
│                                      │
│        [Cancel]  [Add Sensor]        │
└──────────────────────────────────────┘
```

## Benefits

✅ No manual config file editing
✅ Real-time validation
✅ Better error messages
✅ Version controlled changes
✅ Audit trail (who added/removed sensors)
✅ Consistent with app management UX
✅ Can add multiple sensors at once
✅ Preview before deployment

## Security Considerations

- Validate IP addresses/hostnames
- Restrict port ranges (e.g., 1-65535)
- Prevent duplicate sensor names
- Rate limit sensor additions
- Log all sensor config changes

## Example API Calls

```typescript
// Add Modbus sensor
POST /api/v1/devices/{uuid}/sensors
{
  "protocol": "modbus",
  "name": "flow-sensor",
  "enabled": true,
  "config": {
    "host": "192.168.1.102",
    "port": 502,
    "unitId": 1
  }
}

// Edit sensor
PATCH /api/v1/devices/{uuid}/sensors/flow-sensor
{
  "config": {
    "port": 503
  }
}

// Remove sensor
DELETE /api/v1/devices/{uuid}/sensors/flow-sensor
```

## Migration Path

1. **Phase 1**: Support both config file and target state
2. **Phase 2**: Dashboard UI for adding sensors
3. **Phase 3**: Deprecate config file method (with migration tool)
4. **Phase 4**: Remove config file support

## Related Files

- `agent/src/features/protocol-adapters/` - Protocol adapter features
- `agent/src/features/protocol-adapters/modbus/config/` - Current config files
- `api/src/routes/device-state.ts` - Target state management
- `dashboard/src/components/ApplicationsCard.tsx` - Similar UI pattern

## Alternative: Quick Add Button

For immediate implementation without full UI:

```typescript
// Add button to SensorHealthDashboard
<Button onClick={handleQuickAddSensor}>
  <Plus className="h-4 w-4 mr-2" />
  Add Sensor
</Button>

// Simple dialog with minimal fields
// Generates config and updates target state
// Shows in table after next sync
```
