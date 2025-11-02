# Device State Management with React Context - Recommendations

## Executive Summary

This document provides recommendations for implementing a centralized React Context to manage device state across the Iotistic dashboard. The context will work **alongside the existing Sync button** in the Header component.

### Key Points

1. **Existing Sync Button**: The dashboard already has a Sync button (`Header.tsx`) that calls `POST /api/v1/devices/:uuid/deploy` to mark state as ready for devices
2. **Two-Phase Flow**: 
   - **Phase 1**: Save changes to `device_target_state` (sets `needs_deployment = true`)
   - **Phase 2**: Click Sync button to deploy (increments `version`, sets `needs_deployment = false`)
3. **Config Field**: The `device_target_state` table has BOTH `apps` (JSONB) and `config` (JSONB) fields - both must be managed in context
4. **Three State Layers**:
   - **Pending Changes**: Local edits in React state (not saved to database)
   - **Target State**: Saved in database, waiting for deployment (`needs_deployment = true`)
   - **Current State**: What the device is actually running

### Updated Flow

```
User edits → pendingChanges (local) → Save Draft → device_target_state (DB) → Sync Button → Device applies
```

---

## Current State Analysis

### Current Implementation Issues

1. **Direct State Mutation**: Applications are updated directly via PATCH API calls without maintaining local state
2. **No Pending Changes Tracking**: Changes are saved immediately without giving users a chance to review
3. **Scattered State Logic**: State management is spread across `App.tsx`, `ApplicationsCard.tsx`, and individual components
4. **No Undo/Rollback**: Once changes are made, there's no way to revert without manual editing
5. **Duplicate Data**: Same device state is fetched multiple times by different components
6. **No Optimistic Updates**: UI doesn't update until API confirms changes

### Current Flow (Applications Example)
```typescript
// In App.tsx, line ~813
const handleToggleServiceStatus = async (appId, serviceId, action) => {
  // 1. Build updated services array
  const updatedServices = app.services.map(s => ({
    serviceName: s.serviceName,
    image: s.imageName,
    state: s.serviceId === serviceId ? stateMap[action] : (s.state || "running"),
    // ... other fields
  }));

  // 2. Immediately PATCH to API
  await fetch(`/api/v1/devices/${uuid}/apps/${appId}`, {
    method: 'PATCH',
    body: JSON.stringify({ services: updatedServices })
  });

  // 3. Update local state for UI
  setApplications(prev => ({ /* update */ }));
};
```

**Problems:**
- ❌ Changes hit API immediately (no batching)
- ❌ No way to preview changes before saving
- ❌ Can't edit multiple things then deploy once
- ❌ Hard to implement "Save Draft" vs "Deploy Now"

---

## Recommended Architecture: React Context + State Manager

### 1. Context Structure

Create a centralized device state context that manages both **current** and **target** states for each device.

```typescript
// dashboard/src/contexts/DeviceStateContext.tsx

interface DeviceState {
  deviceUuid: string;
  
  // Server states (source of truth)
  currentState: {
    apps: Record<string, AppState>;
    config: Record<string, any>; // Device configuration (network, mqtt, etc.)
    version: number;
    lastReportedAt: string;
  } | null;
  
  targetState: {
    apps: Record<string, AppState>;
    config: Record<string, any>; // Device configuration stored in device_target_state.config
    version: number;
    needsDeployment: boolean;
    lastDeployedAt?: string;
    deployedBy?: string;
  } | null;
  
  // Local pending changes (not yet saved to database)
  pendingChanges: {
    apps: Record<string, AppState>;
    config: Record<string, any>; // Pending config changes
  } | null;
  
  // UI state
  isDirty: boolean; // Has unsaved changes (pendingChanges exists)
  isSyncing: boolean; // Currently saving to API
  lastSyncError: string | null;
}

interface DeviceStateContextValue {
  // State getters
  getDeviceState: (deviceUuid: string) => DeviceState | undefined;
  getCurrentApps: (deviceUuid: string) => Record<string, AppState>;
  getTargetApps: (deviceUuid: string) => Record<string, AppState>;
  getPendingApps: (deviceUuid: string) => Record<string, AppState>;
  
  // State modifiers (local only - doesn't hit API)
  updatePendingApp: (deviceUuid: string, appId: string, updates: Partial<AppState>) => void;
  updatePendingService: (deviceUuid: string, appId: string, serviceId: number, updates: Partial<ServiceState>) => void;
  addPendingApp: (deviceUuid: string, app: AppState) => void;
  removePendingApp: (deviceUuid: string, appId: string) => void;
  
  // Config modifiers (device-level configuration)
  updatePendingConfig: (deviceUuid: string, path: string, value: any) => void;
  resetPendingConfig: (deviceUuid: string) => void;
  
  // State sync actions (hits API)
  fetchDeviceState: (deviceUuid: string) => Promise<void>;
  saveTargetState: (deviceUuid: string) => Promise<void>; // Save to device_target_state (draft)
  syncTargetState: (deviceUuid: string, deployedBy: string) => Promise<void>; // Mark for deployment (Sync button)
  cancelDeployment: (deviceUuid: string) => Promise<void>; // Cancel pending deployment
  discardPendingChanges: (deviceUuid: string) => void;
  
  // Utilities
  hasPendingChanges: (deviceUuid: string) => boolean;
  getDiff: (deviceUuid: string) => StateDiff; // Show what changed
}
```

### 2. Provider Implementation

```typescript
// dashboard/src/contexts/DeviceStateContext.tsx

export function DeviceStateProvider({ children }: { children: React.ReactNode }) {
  // Store state for all devices
  const [deviceStates, setDeviceStates] = useState<Record<string, DeviceState>>({});
  
  // Fetch device state from API
  const fetchDeviceState = useCallback(async (deviceUuid: string) => {
    try {
      const response = await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}`));
      const data = await response.json();
      
      setDeviceStates(prev => ({
        ...prev,
        [deviceUuid]: {
          deviceUuid,
          currentState: data.current_state,
          targetState: data.target_state,
          pendingChanges: null, // Start with no pending changes
          isDirty: false,
          isSyncing: false,
          lastSyncError: null,
        }
      }));
    } catch (error) {
      console.error('Failed to fetch device state:', error);
    }
  }, []);
  
  // Update pending changes (local only)
  const updatePendingService = useCallback((
    deviceUuid: string, 
    appId: string, 
    serviceId: number, 
    updates: Partial<ServiceState>
  ) => {
    setDeviceStates(prev => {
      const deviceState = prev[deviceUuid];
      if (!deviceState) return prev;
      
      // Start with target state if no pending changes yet
      const currentPending = deviceState.pendingChanges || {
        apps: { ...deviceState.targetState?.apps },
        config: { ...deviceState.targetState?.config }
      };
      
      // Update specific service
      const app = currentPending.apps[appId];
      if (!app) return prev;
      
      const updatedServices = app.services.map(s => 
        s.serviceId === serviceId ? { ...s, ...updates } : s
      );
      
      return {
        ...prev,
        [deviceUuid]: {
          ...deviceState,
          pendingChanges: {
            ...currentPending,
            apps: {
              ...currentPending.apps,
              [appId]: {
                ...app,
                services: updatedServices
              }
            }
          },
          isDirty: true
        }
      };
    });
  }, []);
  
  // Save to device_target_state (doesn't mark for deployment yet)
  const saveTargetState = useCallback(async (deviceUuid: string) => {
    const deviceState = deviceStates[deviceUuid];
    if (!deviceState?.pendingChanges) return;
    
    setDeviceStates(prev => ({
      ...prev,
      [deviceUuid]: { ...prev[deviceUuid], isSyncing: true, lastSyncError: null }
    }));
    
    try {
      // Save to API (device_target_state table) - sets needs_deployment = true
      await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}/target-state`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apps: deviceState.pendingChanges.apps,
          config: deviceState.pendingChanges.config
        })
      });
      
      // Re-fetch to get updated state
      await fetchDeviceState(deviceUuid);
      
      toast.success('Target state saved as draft. Click "Sync" button to deploy.');
    } catch (error) {
      setDeviceStates(prev => ({
        ...prev,
        [deviceUuid]: { 
          ...prev[deviceUuid], 
          isSyncing: false, 
          lastSyncError: error.message 
        }
      }));
      toast.error('Failed to save target state');
    }
  }, [deviceStates, fetchDeviceState]);
  
  // Sync/Deploy - marks target state ready for device (Sync button in Header)
  const syncTargetState = useCallback(async (deviceUuid: string, deployedBy: string = 'dashboard') => {
    setDeviceStates(prev => ({
      ...prev,
      [deviceUuid]: { ...prev[deviceUuid], isSyncing: true }
    }));
    
    try {
      // Call /deploy endpoint - increments version, sets needs_deployment = false
      await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}/deploy`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deployedBy })
      });
      
      // Re-fetch to update needsDeployment flag
      await fetchDeviceState(deviceUuid);
      
      toast.success('State synced! Device will apply changes on next poll.');
    } catch (error) {
      setDeviceStates(prev => ({
        ...prev,
        [deviceUuid]: { 
          ...prev[deviceUuid], 
          isSyncing: false, 
          lastSyncError: error.message 
        }
      }));
      toast.error('Failed to sync state');
    }
  }, [fetchDeviceState]);
  
  // Cancel deployment - discard pending deployment
  const cancelDeployment = useCallback(async (deviceUuid: string) => {
    try {
      await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}/deploy/cancel`), {
        method: 'POST'
      });
      
      await fetchDeviceState(deviceUuid);
      toast.info('Deployment cancelled');
    } catch (error) {
      toast.error('Failed to cancel deployment');
    }
  }, [fetchDeviceState]);
  
  // Update device config (local only)
  const updatePendingConfig = useCallback((deviceUuid: string, path: string, value: any) => {
    setDeviceStates(prev => {
      const deviceState = prev[deviceUuid];
      if (!deviceState) return prev;
      
      // Start with target state if no pending changes
      const currentPending = deviceState.pendingChanges || {
        apps: { ...deviceState.targetState?.apps },
        config: { ...deviceState.targetState?.config }
      };
      
      // Update config using dot notation path (e.g., "mqtt.broker")
      const pathParts = path.split('.');
      const updatedConfig = { ...currentPending.config };
      let current = updatedConfig;
      
      for (let i = 0; i < pathParts.length - 1; i++) {
        current[pathParts[i]] = { ...current[pathParts[i]] };
        current = current[pathParts[i]];
      }
      current[pathParts[pathParts.length - 1]] = value;
      
      return {
        ...prev,
        [deviceUuid]: {
          ...deviceState,
          pendingChanges: {
            ...currentPending,
            config: updatedConfig
          },
          isDirty: true
        }
      };
    });
  }, []);
  
  // Discard pending changes
  const discardPendingChanges = useCallback((deviceUuid: string) => {
    setDeviceStates(prev => ({
      ...prev,
      [deviceUuid]: {
        ...prev[deviceUuid],
        pendingChanges: null,
        isDirty: false
      }
    }));
  }, []);
  
  const value: DeviceStateContextValue = {
    getDeviceState: (uuid) => deviceStates[uuid],
    getCurrentApps: (uuid) => deviceStates[uuid]?.currentState?.apps || {},
    getTargetApps: (uuid) => deviceStates[uuid]?.targetState?.apps || {},
    getPendingApps: (uuid) => deviceStates[uuid]?.pendingChanges?.apps || deviceStates[uuid]?.targetState?.apps || {},
    updatePendingService,
    // ... other methods
    fetchDeviceState,
    saveTargetState,
    syncTargetState,
    cancelDeployment,
    discardPendingChanges,
    hasPendingChanges: (uuid) => !!deviceStates[uuid]?.isDirty,
    getDiff: (uuid) => calculateDiff(deviceStates[uuid])
  };
  
  return (
    <DeviceStateContext.Provider value={value}>
      {children}
    </DeviceStateContext.Provider>
  );
}

// Custom hook
export function useDeviceState() {
  const context = useContext(DeviceStateContext);
  if (!context) {
    throw new Error('useDeviceState must be used within DeviceStateProvider');
  }
  return context;
}
```

### 3. Usage in Components

```typescript
// dashboard/src/components/ApplicationsCard.tsx

export function ApplicationsCard({ deviceUuid, deviceStatus }: ApplicationsCardProps) {
  const { 
    getPendingApps,
    updatePendingService,
    saveTargetState,
    hasPendingChanges,
    getDeviceState 
  } = useDeviceState();
  
  // Get pending apps (or target if no pending changes)
  const applications = useMemo(() => {
    const appsObj = getPendingApps(deviceUuid);
    return Object.entries(appsObj).map(([appId, app]) => ({
      id: appId,
      ...app
    }));
  }, [deviceUuid, getPendingApps]);
  
  const deviceState = getDeviceState(deviceUuid);
  
  // Handle service state change (pause/stop/start)
  const handleServiceStateChange = (appId: string, serviceId: number, newState: string) => {
    // Update local pending state only
    updatePendingService(deviceUuid, appId, serviceId, { state: newState });
    
    // Show visual feedback
    toast.info(`Service marked as ${newState}. Click 'Save Draft' to save changes.`);
  };
  
  return (
    <Card>
      {/* Show pending changes banner */}
      {hasPendingChanges(deviceUuid) && (
        <div className="bg-yellow-50 border-b border-yellow-200 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-600" />
            <span className="text-sm text-yellow-800">You have unsaved changes</span>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => discardPendingChanges(deviceUuid)}
            >
              Discard
            </Button>
            <Button 
              size="sm"
              onClick={() => saveTargetState(deviceUuid)}
            >
              Save Draft
            </Button>
          </div>
        </div>
      )}
      
      {/* Applications list */}
      {applications.map(app => (
        <ApplicationRow
          key={app.id}
          app={app}
          onServiceStateChange={handleServiceStateChange}
        />
      ))}
      
      {/* Show sync status */}
      {deviceState?.isSyncing && (
        <div className="text-sm text-gray-500">Syncing...</div>
      )}
    </Card>
  );
}
```

### Usage: Device Configuration

```typescript
// dashboard/src/components/DeviceConfigCard.tsx

export function DeviceConfigCard({ deviceUuid }: { deviceUuid: string }) {
  const { 
    getDeviceState,
    updatePendingConfig,
    saveTargetState,
    hasPendingChanges 
  } = useDeviceState();
  
  const deviceState = getDeviceState(deviceUuid);
  const config = deviceState?.pendingChanges?.config || deviceState?.targetState?.config || {};
  
  const handleMqttBrokerChange = (broker: string) => {
    // Update config.mqtt.broker
    updatePendingConfig(deviceUuid, 'mqtt.broker', broker);
  };
  
  const handleLoggingLevelChange = (level: string) => {
    // Update config.logging.level
    updatePendingConfig(deviceUuid, 'logging.level', level);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Device Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* MQTT Broker */}
        <div>
          <Label>MQTT Broker</Label>
          <Input
            value={config.mqtt?.broker || ''}
            onChange={(e) => handleMqttBrokerChange(e.target.value)}
            placeholder="mqtt://broker.example.com:1883"
          />
        </div>
        
        {/* Logging Level */}
        <div>
          <Label>Logging Level</Label>
          <Select
            value={config.logging?.level || 'info'}
            onValueChange={handleLoggingLevelChange}
          >
            <SelectItem value="debug">Debug</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </Select>
        </div>
        
        {/* Save Button */}
        {hasPendingChanges(deviceUuid) && (
          <Button onClick={() => saveTargetState(deviceUuid)}>
            Save Configuration
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

---

---

## Device Target State Structure

### Database Schema (`device_target_state` table)

The `device_target_state` table stores both **applications** and **device configuration**:

```sql
CREATE TABLE device_target_state (
  device_uuid TEXT PRIMARY KEY REFERENCES devices(uuid),
  apps JSONB NOT NULL DEFAULT '{}',           -- Application configurations
  config JSONB NOT NULL DEFAULT '{}',         -- Device configuration (network, mqtt, etc.)
  version INTEGER NOT NULL DEFAULT 1,         -- Incremented on each deployment
  needs_deployment BOOLEAN DEFAULT false,     -- Pending changes flag
  last_deployed_at TIMESTAMP,                 -- When last deployed
  deployed_by TEXT,                           -- Who triggered deployment
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Fields Explained

#### `apps` (JSONB)
Contains all application definitions:
```json
{
  "1001": {
    "appId": "1001",
    "appName": "monitoring",
    "services": [
      {
        "serviceId": "1",
        "serviceName": "nodered",
        "imageName": "nodered/node-red:latest",
        "state": "running",
        "config": {
          "ports": ["1880:1880"],
          "volumes": ["nodered-data:/data"]
        }
      }
    ]
  }
}
```

#### `config` (JSONB)
Contains device-level configuration:
```json
{
  "network": {
    "hostname": "iotistic-device-001",
    "staticIp": "192.168.1.100"
  },
  "mqtt": {
    "broker": "mqtt://broker.example.com:1883",
    "username": "device001",
    "password": "encrypted"
  },
  "sensors": {
    "bme688": { "enabled": true, "interval": 60 }
  },
  "logging": {
    "level": "info",
    "remote": true
  }
}
```

### Model Methods (`api/src/db/models.ts`)

```typescript
// Set target state (saves both apps and config)
DeviceTargetStateModel.set(deviceUuid, apps, config);
// Result: needs_deployment = true

// Deploy to device (increment version)
DeviceTargetStateModel.deploy(deviceUuid, 'dashboard');
// Result: version++, needs_deployment = false

// Generate ETag for cache validation
DeviceTargetStateModel.generateETag(state);
// Includes: version + apps + config
```

**Important:** When updating target state, ALWAYS include both `apps` and `config` fields, even if only one changed. The context should track pending changes for both.

---

## Existing Sync Button Integration

### Current Deployment Flow (Already Implemented)

The dashboard already has a **Sync button** in the Header (`dashboard/src/components/Header.tsx`) that handles the two-phase deployment:

#### Phase 1: Save Changes
When users make changes (e.g., toggle service state), the changes should first be saved to `device_target_state`:

```typescript
// Save to database, sets needs_deployment = true
await fetch(`/api/v1/devices/${deviceUuid}/target-state`, {
  method: 'PUT',
  body: JSON.stringify({ apps, config })
});
```

**Result:** Changes stored in database, `needsDeployment` flag set to `true`

#### Phase 2: Sync/Deploy (Existing Sync Button)
The **Sync button** calls the `/deploy` endpoint:

```typescript
// From App.tsx, handleDeploy() function
const handleDeploy = async (deviceUuid: string) => {
  await fetch(`/api/v1/devices/${deviceUuid}/deploy`, {
    method: 'POST',
    body: JSON.stringify({ deployedBy: 'dashboard' })
  });
  
  // Updates:
  // - version = version + 1
  // - needs_deployment = false
  // - last_deployed_at = now
  // - deployed_by = 'dashboard'
};
```

**Result:** Version incremented, device will apply changes on next poll

### Sync Button Behavior

**Visual State:**
- **Disabled (Gray)**: No pending changes (`needsDeployment = false`)
- **Enabled (Yellow #ca8a04)**: Changes ready to sync (`needsDeployment = true`)
- **Cancel Button**: Appears when `needsDeployment = true`, calls `/deploy/cancel`

**Key Files:**
- `dashboard/src/components/Header.tsx` (lines 57-69): Sync button UI
- `dashboard/src/App.tsx` (lines 615-695): `handleDeploy()` and `handleCancelDeploy()`
- `api/src/db/models.ts` (lines 264-302): `DeviceTargetStateModel.deploy()`

### Integration with React Context

The context should work **alongside** the existing Sync button:

1. **User edits in UI** → Updates `pendingChanges` in context (local only, not saved)
2. **User clicks "Save Draft"** → Calls `saveTargetState()` → Saves to `device_target_state` → Sets `needs_deployment = true`
3. **Sync button turns yellow** → User sees changes are ready (enabled state)
4. **User clicks Sync** → Calls `syncTargetState()` (wraps existing `handleDeploy`) → Increments version → Device applies changes

**Important:** The context manages local pending changes, but the Sync button remains the final deployment trigger (already implemented in Header).

### API Endpoints Used

| Endpoint | Method | Purpose | Context Method |
|----------|--------|---------|----------------|
| `/api/v1/devices/:uuid/target-state` | PUT | Save apps + config to database | `saveTargetState()` |
| `/api/v1/devices/:uuid/deploy` | POST | Mark state ready for device | `syncTargetState()` |
| `/api/v1/devices/:uuid/deploy/cancel` | POST | Cancel pending deployment | `cancelDeployment()` |
| `/api/v1/devices/:uuid` | GET | Fetch device state | `fetchDeviceState()` |

### State Flags

| Flag | Set By | Means | Sync Button State |
|------|--------|-------|-------------------|
| `isDirty` | Context (local) | Has unsaved pending changes | N/A (not in database yet) |
| `needs_deployment` | PUT /target-state | Changes saved, waiting for deployment | **Enabled (Yellow)** |
| `version` | POST /deploy | Deployment triggered, device will sync | Disabled (Gray) after sync |

---

## Benefits of This Approach

### ✅ **Separation of Concerns**
- **Pending State**: Local edits (not saved to database)
- **Target State**: Saved configuration (in `device_target_state` table, `needs_deployment = true`)
- **Deployed State**: Ready for device (version incremented, `needs_deployment = false`)
- **Current State**: What device is actually running

### ✅ **Better UX**
- Users can make multiple changes before saving
- "Save Draft" vs "Deploy Now" options
- Undo/discard changes before deployment
- Visual diff showing what changed

### ✅ **Optimistic Updates**
- UI responds instantly to user actions
- Changes queued locally, synced in background
- Rollback on API errors

### ✅ **Performance**
- Single source of truth (context)
- No prop drilling
- Reduced API calls (batch updates)
- Components re-render only when their device state changes

### ✅ **Developer Experience**
- Clean separation: UI components don't manage state logic
- Testable: Context logic can be tested independently
- Reusable: Any component can access device state via `useDeviceState()`

---

## Migration Strategy

### Phase 1: Create Context (No Breaking Changes)
1. Create `DeviceStateContext.tsx`
2. Wrap `<App>` with `<DeviceStateProvider>`
3. Keep existing state management working
4. Test context can fetch/store device states

### Phase 2: Migrate Read Operations
1. Update `ApplicationsCard` to read from context
2. Update `ApplicationsPage` to use context
3. Remove duplicate `applications` state from `App.tsx`
4. Verify UI still displays correctly

### Phase 3: Migrate Write Operations
1. Update service toggle to use `updatePendingService()`
2. Add "Save Draft" and "Deploy" buttons
3. Implement `saveTargetState()` and `deployTargetState()`
4. Remove old PATCH calls from `App.tsx`

### Phase 4: Extend to Other Features
1. Add protocol devices to context
2. Add sensors to context
3. Add device config to context
4. Centralize all device state management

---

## State Flow Diagram (With Sync Button)

```
┌───────────────────────────────────────────────────────────────────────┐
│                       DeviceStateContext                               │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │   Pending    │  │    Target    │  │   Deployed   │  │ Current  │ │
│  │   Changes    │  │    State     │  │    State     │  │  State   │ │
│  │   (local)    │  │  (database)  │  │ (database)   │  │ (device) │ │
│  │              │  │              │  │              │  │          │ │
│  │ apps, config │  │ apps, config │  │ apps, config │  │apps, cfg │ │
│  │              │  │needs_deploy  │  │ version: n+1 │  │version:n │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘ │
│        │                  │                  │                │       │
│        │ Save Draft       │ Sync Button      │ Device Polls   │       │
│        │ (saveTargetState)│ (syncTargetState)│                │       │
│        ▼                  ▼                  ▼                ▼       │
│  User edits UI  →  PUT /target-state  →  POST /deploy  →  GET /state │
│                    needs_deploy=true    version++              │      │
│                                          needs_deploy=false     │      │
└───────────────────────────────────────────────────────────────────────┘

Flow:
1. User edits service state → Updates pendingChanges (local only)
2. User clicks "Save Draft" → Saves to device_target_state.apps + .config
                            → Sets needs_deployment = true
                            → Sync button turns yellow
3. User clicks "Sync" → Calls POST /deploy
                      → Increments version
                      → Sets needs_deployment = false
                      → Device sees new version on next poll
4. Device applies changes → Updates current_state
                          → Reports back to API
```

---

## Implementation Checklist

### Core Context
- [ ] Create `contexts/DeviceStateContext.tsx`
- [ ] Implement state interfaces (`DeviceState`, `AppState`, etc.)
- [ ] Implement provider with state management
- [ ] Implement `useDeviceState()` hook
- [ ] Add to `App.tsx` (`<DeviceStateProvider>`)

### State Operations
- [ ] Implement `fetchDeviceState(uuid)`
- [ ] Implement `updatePendingService(uuid, appId, serviceId, updates)`
- [ ] Implement `updatePendingApp(uuid, appId, updates)`
- [ ] Implement `updatePendingConfig(uuid, configKey, value)` - Update device config
- [ ] Implement `saveTargetState(uuid)` - Save apps + config to DB (sets needs_deployment = true)
- [ ] Implement `syncTargetState(uuid, deployedBy)` - Mark ready for device (calls existing /deploy)
- [ ] Implement `cancelDeployment(uuid)` - Cancel pending deployment (calls existing /deploy/cancel)
- [ ] Implement `discardPendingChanges(uuid)`

### UI Components
- [ ] Add pending changes banner to `ApplicationsCard`
- [ ] Add "Save Draft" button (saves to database, shows Sync button)
- [ ] Add "Discard Changes" button
- [ ] Show visual diff of changes
- [ ] Disable actions when `isSyncing`
- [ ] Integrate with existing Sync button in `Header.tsx` (already implemented)
- [ ] Update Header to receive `deploymentStatus` from context

### API Integration
- [ ] Update API routes to support partial updates
- [ ] Ensure `PUT /devices/:uuid/target-state` works correctly
- [ ] Add API error handling in context
- [ ] Add retry logic for failed syncs

### Testing
- [ ] Test concurrent edits to multiple services
- [ ] Test save draft → deploy flow
- [ ] Test discard changes
- [ ] Test offline mode (queue changes)
- [ ] Test API error scenarios

---

## Alternative: Use React Query + Zustand

If you want a more battle-tested solution:

### React Query for Server State
```typescript
// Handles fetching/caching device states
const { data: deviceState } = useQuery(['device', deviceUuid], () => 
  fetchDeviceState(deviceUuid)
);
```

### Zustand for Local Pending Changes
```typescript
// Lightweight state manager for pending edits
const usePendingChanges = create((set) => ({
  changes: {},
  updateService: (deviceUuid, appId, serviceId, updates) => 
    set((state) => ({ /* update logic */ }))
}));
```

**Benefits:**
- React Query handles caching, refetching, optimistic updates
- Zustand is simpler than Redux, no boilerplate
- Both have great DevTools

---

## Recommendation Summary

**Best Approach:** React Context (as outlined above)

**Why:**
- ✅ Full control over state logic
- ✅ No extra dependencies
- ✅ Perfect fit for your architecture (target vs current state)
- ✅ Easier to implement "Save Draft" vs "Deploy"

**When to Use Alternatives:**
- If you need advanced caching/refetching → Add React Query
- If state becomes very complex → Consider Zustand
- If you have 10+ developers → Redux might be better

**Next Steps:**
1. Start with Phase 1 (create context, no breaking changes)
2. Test with a single device
3. Migrate one component at a time
4. Extend to all device state management

---

## Questions to Consider

1. **How long should pending changes persist?**
   - Option A: Clear on page refresh (lost)
   - Option B: Save to localStorage (preserved across sessions)
   - **Recommendation:** Use localStorage for drafts

2. **Should users be able to edit while device is syncing?**
   - Option A: Block all edits until sync completes
   - Option B: Allow edits, queue them for next sync
   - **Recommendation:** Option B (better UX)

3. **How to handle conflicts (user edits while device reports new state)?**
   - Option A: Overwrite user's pending changes
   - Option B: Show conflict dialog, let user merge
   - **Recommendation:** Option B (safer)

---

## Example Code References

See these files for reference:
- `api/src/db/models.ts` - `DeviceTargetStateModel` (lines 233-331)
- `api/src/routes/device-state.ts` - Target state API endpoints
- `api/src/routes/devices.ts` - PATCH /apps/:appId (lines 660-760)
- `dashboard/src/App.tsx` - Current state management (lines 47-870)
- `dashboard/src/components/ApplicationsCard.tsx` - UI component

---

**Author:** GitHub Copilot  
**Date:** 2025-11-01  
**Status:** Recommendation (Not Implemented)
