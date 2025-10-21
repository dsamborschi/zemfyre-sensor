# MQTT ACL Fix for Shadow Feature - Complete

## Problem
Agent's Shadow Feature was failing to subscribe to shadow topics with error:
```
Subscribe error: Unspecified error
```

Mosquitto logs showed:
```
time="2025-10-21T02:53:13Z" level=debug msg="Acl is false for user device_fad1444c-9a0e-4b7e-8c55-7ffcd478e319"
```

## Root Causes

### 1. mosquitto-go-auth Configuration
- **Wrong parameter name**: `auth_opt_pw_hash_algorithm` → `auth_opt_hasher`
- **Wrong parameter name**: `auth_opt_pw_hash_cost` → `auth_opt_hasher_cost`

### 2. ACL Query Column Mismatch
- **Database column**: `access`
- **Query was using**: `rw` (column doesn't exist)

### 3. ACL Access Values
- **MQTT access types**:
  - 1 = READ
  - 2 = WRITE  
  - 3 = READWRITE (1+2)
  - 4 = SUBSCRIBE
  - 5 = READ+SUBSCRIBE (1+4)
  - 6 = WRITE+SUBSCRIBE (2+4)
  - 7 = ALL (1+2+4)

- **Problem**: Devices had `access = 3` (READ+WRITE) but SUBSCRIBE requires `access & 4 != 0`
- **Database constraint**: Only allowed values 1, 2, 3 (missing 4-7)

## Fixes Applied

### 1. mosquitto.conf
**File**: `api/mosquitto.conf`

Changed hasher configuration:
```conf
# Before
auth_opt_pw_hash_algorithm bcrypt
auth_opt_pw_hash_cost 10

# After
auth_opt_hasher bcrypt
auth_opt_hasher_cost 10
auth_opt_hasher_salt_size 16
```

Fixed ACL query:
```sql
# Correct query that works with mosquitto-go-auth
auth_opt_pg_aclquery SELECT topic FROM mqtt_acls WHERE username = $1 AND (access & $2) != 0
```

### 2. Database Migration
**File**: `api/database/migrations/018_fix_mqtt_acl_constraint.sql`

```sql
-- Drop restrictive constraint
ALTER TABLE mqtt_acls DROP CONSTRAINT valid_access;

-- Allow all valid bitwise combinations
ALTER TABLE mqtt_acls ADD CONSTRAINT valid_access CHECK (access >= 1 AND access <= 7);
```

### 3. Update Existing ACLs
**Script**: `api/scripts/update-device-acls.ts`

Updated device ACL from 3 → 7:
```sql
UPDATE mqtt_acls 
SET access = 7 
WHERE username LIKE 'device_%' AND access = 3;
```

### 4. Provisioning Code
**File**: `api/src/routes/provisioning.ts`

Changed default access for new devices:
```typescript
// Before: access = 3 (READ+WRITE only)
VALUES ($1, $2, 3, 0)

// After: access = 7 (READ+WRITE+SUBSCRIBE)
VALUES ($1, $2, 7, 0)
```

### 5. Enhanced MQTT Error Logging
**File**: `agent/src/mqtt/mqtt-manager.ts`

Added detailed error logging in subscribe callback:
```typescript
client!.subscribe(topic, options || {}, (error, granted) => {
  if (error) {
    console.error(`[MqttManager] Subscribe failed:`, {
      topic,
      error: error.message,
      errorCode: (error as any).code,
      errorName: error.name,
      granted
    });
    reject(new Error(errorMsg));
  } else if (!granted || granted.length === 0) {
    // No subscription granted
    reject(new Error(errorMsg));
  } else if (granted[0].qos === 128) {
    // QoS 128 means subscription rejected by broker
    reject(new Error(errorMsg));
  }
  // ...
});
```

## Testing

1. ✅ **Authentication**: Admin user connects successfully with bcrypt hash
2. ✅ **ACL Query**: No more "column rw does not exist" errors
3. ✅ **Device ACL**: Updated to access=7 (includes SUBSCRIBE)
4. ✅ **Constraint**: Database now allows access values 1-7

## Expected Result

The agent should now be able to:
1. Connect to MQTT with device credentials
2. Subscribe to shadow topics:
   - `iot/device/{uuid}/shadow/name/device-state/update/accepted`
   - `iot/device/{uuid}/shadow/name/device-state/update/rejected`
   - `iot/device/{uuid}/shadow/name/device-state/update/delta`
   - `iot/device/{uuid}/shadow/name/device-state/update/documents`
   - `iot/device/{uuid}/shadow/name/device-state/get/accepted`
   - `iot/device/{uuid}/shadow/name/device-state/get/rejected`

## Files Changed

1. `api/mosquitto.conf` - Fixed hasher config and ACL query
2. `api/database/migrations/018_fix_mqtt_acl_constraint.sql` - New migration
3. `api/scripts/update-device-acls.ts` - ACL update script
4. `api/scripts/run-migration-018.ts` - Migration runner
5. `api/src/routes/provisioning.ts` - Default ACL access level
6. `agent/src/mqtt/mqtt-manager.ts` - Enhanced error logging

## Next Steps

1. Restart the agent to test Shadow Feature subscription
2. Monitor Mosquitto logs for ACL checks
3. Verify shadow topics are subscribed successfully

## Key Learnings

1. **mosquitto-go-auth uses different option names** than standard mosquitto auth plugins
2. **SUBSCRIBE is a separate permission** (value 4) from READ/WRITE
3. **ACL query must return topics**, not boolean - plugin does pattern matching
4. **Bitwise AND** is used to check permissions: `(access & requested) != 0`
5. **Database constraints** must allow all valid bitwise combinations
