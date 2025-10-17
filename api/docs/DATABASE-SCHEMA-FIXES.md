# Database Schema Fixes - Image Update System

**Date**: October 17, 2025  
**Issue**: Queries were using old `state` column that doesn't exist in actual schema

## Problem

The image update system code was written assuming a simple schema with a `state` column containing `image` and `tag` fields. The actual database schema uses a complex JSONB structure with nested apps and services.

## Actual Schema

### `device_target_state` table:
```sql
- id (serial)
- device_uuid (uuid)
- apps (jsonb)  -- Contains: {"appId": {"services": [{"config": {"image": "name:tag"}}]}}
- config (jsonb)
- version (integer)
- created_at (timestamp)
- updated_at (timestamp)
```

### `device_current_state` table:
```sql
- id (serial)
- device_uuid (uuid)
- apps (jsonb)  -- Same structure as target_state
- config (jsonb)
- system_info (jsonb)
- reported_at (timestamp)
```

## Files Fixed

### 1. `api/src/services/image-update-manager.ts`

**Method**: `findAffectedDevices()`
- **Old**: Queried `ts.state->>'image'` and `ts.state->>'tag'`
- **New**: Uses JSONB traversal to search within nested `apps` structure:
  ```sql
  FROM device_target_state ts,
  jsonb_each(ts.apps) as app(key, value),
  jsonb_array_elements(value->'services') as service
  WHERE service->'config'->>'image' = $1
  ```

**Method**: `updateDeviceTargetState()`
- **Old**: Retrieved `state` column, updated simple `tag` field
- **New**: 
  - Retrieves `apps` JSONB
  - Iterates through all apps and services
  - Updates matching services with new image tag
  - Increments version number

### 2. `api/src/routes/webhooks.ts`

**Location**: Current tag lookup query
- **Old**: `SELECT ts.state->>'tag' FROM ... WHERE ts.state->>'image' = $1`
- **New**: Uses `split_part()` to extract tag from full image string:
  ```sql
  SELECT split_part(service->'config'->>'image', ':', 2) as current_tag
  FROM device_target_state ts,
  jsonb_each(ts.apps) as app(key, value),
  jsonb_array_elements(value->'services') as service
  WHERE service->'config'->>'image' LIKE $1 || '%'
  ```

### 3. `api/src/services/health-checker.ts`

**Method**: `containerCheck()`
- **Old**: Queried `state` column from `device_current_state`
- **New**:
  - Queries `apps`, `config`, `system_info` columns
  - Searches through apps/services structure to find container
  - Matches by `serviceName` or `appName`

### 4. `api/src/services/rollback-manager.ts`

**Method**: `updateDeviceTargetState()`
- **Old**: Retrieved `state` column, updated simple `tag` field
- **New**:
  - Retrieves `apps` JSONB
  - Iterates through all apps and services
  - Rolls back matching services to old image tag
  - Increments version number

### 5. `api/scripts/test-image-updates.ts`

**Location**: Device query
- **Old**: `ts.state->>'image'` and `ts.state->>'tag'`
- **New**: Simply retrieves `apps` column and displays first 100 chars

## Testing

### Test Policy Created:
```sql
INSERT INTO image_update_policies (
  image_pattern = 'nginx*',
  update_strategy = 'staged',
  staged_batches = 3,
  batch_delay_minutes = 1,
  health_check_enabled = false,
  auto_rollback_enabled = true,
  max_failure_rate = 0.2,
  enabled = true
)
```

### Test Command:
```powershell
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/webhooks/docker-registry" `
  -Method POST `
  -Body '{"repository":{"repo_name":"nginx"},"push_data":{"tag":"latest"}}' `
  -ContentType "application/json"
```

## Build Status

✅ TypeScript compilation: **SUCCESS**  
✅ Zero errors  
✅ Server starts successfully  
✅ Rollout Monitor active  

## Current Status

- **3 rollouts** detected in database (from previous test attempts)
- **1 device** found using `nginx:alpine` image
- All schema incompatibilities resolved
- System ready for end-to-end testing

## Next Steps

1. Start server: `npx ts-node src/index.ts` from `api/` directory
2. Trigger webhook with nginx image
3. Monitor rollout progress via database or API endpoints
4. Verify device target state gets updated correctly

## Notes

- The JSONB structure is more complex than originally anticipated
- Image updates now properly traverse the nested apps/services structure
- Version number is incremented on every target state update
- All methods maintain backward compatibility with the existing schema
