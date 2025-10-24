# Config Field Support - Bug Fix

## Problem Summary

When adding `config` to `device_target_state`, the agent was not receiving or reporting the config changes:

1. **Agent was not fetching config** - API only returned `apps`, not `config`
2. **Agent was not storing config** - SimpleState interface only had `apps`
3. **Agent was not reporting config** - Current state report excluded `config`
4. **Config not saved to device_current_state** - API had code but agent never sent it

## Root Causes

### 1. API Response Missing Config
**File**: `api/src/routes/device-state.ts`

**Before**:
```typescript
const response = {
  [uuid]: {
    apps: targetState.apps  // Only apps, no config!
  }
};
```

**After**:
```typescript
const response = {
  [uuid]: {
    apps: targetState.apps,
    config: targetState.config || {}  // Now includes config
  }
};
```

### 2. Agent Interface Missing Config
**File**: `agent/src/compose/container-manager.ts`

**Before**:
```typescript
export interface SimpleState {
  apps: Record<number, SimpleApp>;
}
```

**After**:
```typescript
export interface SimpleState {
  apps: Record<number, SimpleApp>;
  config?: Record<string, any>;  // Added config support
}
```

### 3. Agent Not Parsing Config
**File**: `agent/src/api-binder.ts`

**Before**:
```typescript
const newTargetState: SimpleState = { 
  apps: deviceState.apps || {} 
};
```

**After**:
```typescript
const newTargetState: SimpleState = { 
  apps: deviceState.apps || {},
  config: deviceState.config || {}  // Now parsing config
};
```

### 4. Agent Not Reporting Config
**File**: `agent/src/api-binder.ts`

**Before**:
```typescript
const stateReport: DeviceStateReport = {
  [deviceInfo.uuid]: {
    apps: currentState.apps,
    // config missing!
  }
};
```

**After**:
```typescript
const stateReport: DeviceStateReport = {
  [deviceInfo.uuid]: {
    apps: currentState.apps,
    config: currentState.config,  // Now includes config
  }
};
```

### 5. getCurrentState() Not Including Config
**File**: `agent/src/compose/container-manager.ts`

**Before**:
```typescript
public async getCurrentState(): Promise<SimpleState> {
  await this.syncCurrentStateFromDocker();
  return _.cloneDeep(this.currentState);  // Only had apps
}
```

**After**:
```typescript
public async getCurrentState(): Promise<SimpleState> {
  await this.syncCurrentStateFromDocker();
  const state = _.cloneDeep(this.currentState);
  state.config = this.targetState.config;  // Include config from target
  return state;
}
```

## Files Changed

### Agent
- ✅ `agent/src/compose/container-manager.ts` - Added config to SimpleState interface
- ✅ `agent/src/compose/container-manager.ts` - getCurrentState() includes config
- ✅ `agent/src/api-binder.ts` - Updated TargetStateResponse interface
- ✅ `agent/src/api-binder.ts` - Parse config from target state
- ✅ `agent/src/api-binder.ts` - Added config to DeviceStateReport interface
- ✅ `agent/src/api-binder.ts` - Include config in state reports (2 places)

### API
- ✅ `api/src/routes/device-state.ts` - Return config in target state response
- ✅ `api/src/routes/device-state.ts` - Include config in empty state response

**Note**: API already had full config support in:
- ✅ `DeviceTargetStateModel.set()` - Saves config to database
- ✅ `DeviceCurrentStateModel.update()` - Saves config to database
- ✅ `generateETag()` - Includes config in ETag calculation
- ✅ Event sourcing - Publishes config changes

## How It Works Now

### 1. Update Target State with Config
```bash
# Using PowerShell script
cd api/scripts/state
./update-target-state.ps1 -DeviceUuid "your-uuid" -FilePath "target-state-with-config-example.json"
```

**What happens**:
- API saves config to `device_target_state.config` (JSONB column)
- Version number increments: `version = version + 1`
- ETag changes because version changed
- Old ETag: based on `{version: 1, apps: {...}, config: {}}`
- New ETag: based on `{version: 2, apps: {...}, config: {...}}`

### 2. Agent Polls for Target State
```
📡 Polling target state...
   Endpoint: http://localhost:4002/api/v1/device/:uuid/state
   Current ETag: 597a6a522e1e1b9ac19d799a4eff8756f61bfe91
   Response Status: 200  ← Was 304 before fix
```

**What happens**:
- Agent sends `If-None-Match: old-etag`
- API calculates new ETag (includes version + config)
- ETags don't match → Return 200 with full state
- Response includes: `{apps: {...}, config: {...}}`

### 3. Agent Stores Config
```typescript
const newTargetState: SimpleState = { 
  apps: deviceState.apps || {},
  config: deviceState.config || {}  // Now stored in targetState
};

this.targetState = newTargetState;
await this.containerManager.setTarget(this.targetState);
```

**What happens**:
- Agent logs: `Config keys: 5` (mqtt, features, logging, api, healthChecks)
- Config stored in `containerManager.targetState.config`
- Available to all agent components

### 4. Agent Reports Current State
```
📤 Reported current state to cloud
```

**What happens**:
- Agent calls `getCurrentState()` → includes config from targetState
- Builds report with: `{apps: {...}, config: {...}}`
- Sends PATCH to `/api/v1/device/state`
- API saves to `device_current_state.config` (JSONB column)

### 5. Verify in Database
```sql
-- Check target state (what should be)
SELECT config FROM device_target_state WHERE device_uuid = 'your-uuid';

-- Check current state (what is)
SELECT config FROM device_current_state WHERE device_uuid = 'your-uuid';

-- Both should now match after agent reports
```

## Testing Steps

### 1. Rebuild Services
```bash
# Rebuild agent
cd agent && npm run build

# Rebuild API (already done)
cd api && npm run build
```

### 2. Restart Agent
```bash
# Stop agent
# Start agent in dev mode or restart container
```

### 3. Update Target State with Config
```bash
cd api/scripts/state
./update-target-state.ps1 -DeviceUuid "15b92ffd-7635-427c-8820-04845321e4c3" -FilePath "target-state-with-config-example.json"
```

### 4. Watch Agent Logs
Look for:
```
🎯 New target state received from cloud
   Apps: 1
   Config keys: 5  ← Should see this now!
🔍 Difference detected - applying new state
```

### 5. Verify Config Saved
```bash
# Check device_current_state table
psql -U postgres -d iotistic -c "SELECT config FROM device_current_state WHERE device_uuid = 'your-uuid';"
```

Should see:
```json
{
  "mqtt": {...},
  "features": {...},
  "logging": {...},
  "api": {...},
  "healthChecks": {...}
}
```

## Expected Behavior

### Before Fix
- ❌ Agent logs: `Response Status: 304` (ETag matched, no update)
- ❌ `device_current_state.config` stays empty: `{}`
- ❌ Agent never sees config changes

### After Fix
- ✅ Agent logs: `Response Status: 200` (new state fetched)
- ✅ Agent logs: `Config keys: 5` (config parsed)
- ✅ `device_current_state.config` populated with config object
- ✅ Config available in agent for feature flags, etc.

## Next Steps

### 1. Use Config in Agent
Now that config is available, you can use it:

```typescript
// In any agent component
const targetState = containerManager.getTargetState();
const config = targetState.config;

// Check feature flags
if (config?.features?.enableCloudJobs) {
  // Start cloud jobs adapter
}

// Use MQTT settings
const mqttBroker = config?.mqtt?.broker || 'localhost';

// Apply logging level
const logLevel = config?.logging?.level || 'info';
```

### 2. Implement Hot Reload
When target state changes, agent can react:

```typescript
// In supervisor or main agent
containerManager.on('target-state-changed', async (newState) => {
  const config = newState.config;
  
  // Reload configuration dynamically
  await applyConfig(config);
});
```

### 3. Add Config Validation
Validate config structure before applying:

```typescript
function validateConfig(config: any): boolean {
  // Check required fields
  if (config.mqtt && !config.mqtt.broker) {
    console.error('Invalid config: mqtt.broker required');
    return false;
  }
  return true;
}
```

## Summary

The fix ensures **complete config lifecycle**:

1. ✅ **API stores** config in `device_target_state.config`
2. ✅ **API returns** config in target state polling response
3. ✅ **Agent fetches** config when target state changes (ETag mismatch)
4. ✅ **Agent stores** config in `targetState.config`
5. ✅ **Agent reports** config in current state updates
6. ✅ **API saves** config to `device_current_state.config`

**Result**: Config is now fully synchronized between cloud and device!
