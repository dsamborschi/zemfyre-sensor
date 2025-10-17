# Image Field Schema Inconsistency Fix

**Date**: October 17, 2025  
**Issue**: Redis webhook unable to find devices with Redis images  
**Root Cause**: Schema inconsistency in how images are stored in `device_target_state.apps`

## Problem Description

The webhook endpoint reported "No devices found using this image" for Redis, even though the device had `redis:7-alpine` in its target state.

### Schema Inconsistency Discovered

Different services store their image information in different JSONB fields:

**Pattern 1: Nginx (config.image)**
```json
{
  "1001": {
    "services": [{
      "config": {
        "image": "nginx:latest"
      }
    }]
  }
}
```

**Pattern 2: Redis (imageName)**
```json
{
  "1002": {
    "services": [{
      "imageName": "redis:7-alpine",
      "config": {
        "ports": ["6356:6379"],
        "volumes": ["/data/redis:/data"]
      }
    }]
  }
}
```

## Original Queries (Broken)

### In `image-update-manager.ts` (findAffectedDevices)
```sql
WHERE service->'config'->>'image' = $1  -- Only checked config.image
```

### In `webhooks.ts` (current tag lookup)
```sql
WHERE service->'config'->>'image' LIKE $1 || '%'  -- Only checked config.image
```

## Fixed Queries

### Fixed `image-update-manager.ts` (Line 143-160)
```sql
WHERE (
  service->'config'->>'image' = $1 OR
  service->>'imageName' = $1
)
```

Now checks **both** possible locations for the image field.

### Fixed `webhooks.ts` (Line 191-200)
```sql
SELECT DISTINCT 
  COALESCE(
    split_part(service->'config'->>'image', ':', 2),
    split_part(service->>'imageName', ':', 2)
  ) as current_tag
FROM device_target_state ts,
jsonb_each(ts.apps) as app(key, value),
jsonb_array_elements(value->'services') as service
WHERE (
  service->'config'->>'image' LIKE $1 || '%' OR
  service->>'imageName' LIKE $1 || '%'
)
```

Uses `COALESCE` to return the first non-null value from either location.

## Test Results

### Before Fix
```powershell
PS> Invoke-RestMethod -Uri "http://localhost:4002/api/v1/webhooks/docker-registry" `
  -Method POST `
  -Body '{"repository":{"repo_name":"redis"},"push_data":{"tag":"7.2-alpine"}}' `
  -ContentType "application/json"

ERROR: No devices found using this image
```

### After Fix
```powershell
PS> Invoke-RestMethod ...

✅ Success!
{
  "message": "Webhook processed successfully",
  "rollout_id": "d0eb949b-2674-4c7d-895d-c15bceab8299",
  "strategy": "staged",
  "image": "redis",
  "tag": "7.2-alpine"
}
```

### Rollout Created Successfully
```sql
SELECT * FROM image_rollouts WHERE rollout_id = 'd0eb949b-2674-4c7d-895d-c15bceab8299';

 rollout_id                           | image_name | old_tag  | new_tag    | status      | strategy 
--------------------------------------+------------+----------+------------+-------------+----------
 d0eb949b-2674-4c7d-895d-c15bceab8299 | redis      | 7-alpine | 7.2-alpine | in_progress | staged   
```

### Device Scheduled for Update
```sql
SELECT * FROM device_rollout_status WHERE rollout_id = 'd0eb949b-2674-4c7d-895d-c15bceab8299';

 device_uuid                          | batch_number | status    
--------------------------------------+--------------+-----------
 8479359e-dbeb-4858-813c-e8a9008dde04 |            1 | scheduled 
```

## Recommendation

**Future Schema Standardization**: Consider standardizing on ONE pattern for all services:
- Option A: Always use `config.image`
- Option B: Always use `imageName` at service level

This would simplify queries and reduce chance of future bugs.

## Files Modified

1. **api/src/services/image-update-manager.ts** (Line 143-160)
   - Updated `findAffectedDevices()` WHERE clause

2. **api/src/routes/webhooks.ts** (Line 191-200)
   - Updated current tag lookup query with COALESCE

## Related Issues

- Successfully tested with nginx (uses `config.image`) ✅
- Successfully tested with Redis (uses `imageName`) ✅
- Both patterns now supported in the same codebase ✅
