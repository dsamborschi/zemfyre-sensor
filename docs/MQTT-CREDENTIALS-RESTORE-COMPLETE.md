# MQTT Credentials Integration - Complete

**Date**: October 20, 2025  
**Status**: ✅ **COMPLETE** - All code and migrations restored

---

## Summary

Successfully restored and integrated MQTT credentials flow after git merge:

1. **Device Provisioning** - API returns MQTT credentials (username, password, broker URL)
2. **Agent Storage** - Credentials saved to device table in SQLite
3. **MQTT Connection** - Agent uses provisioned credentials to connect to broker
4. **Authentication** - Mosquitto Go Auth validates credentials via PostgreSQL

---

## Changes Made

### 1. Agent Types (`agent/src/provisioning/types.ts`)

Added MQTT credential fields:

```typescript
export interface DeviceInfo {
    // ... existing fields
    mqttUsername?: string;
    mqttPassword?: string;
    mqttBrokerUrl?: string;
}

export interface ProvisionResponse {
    // ... existing fields
    mqttUsername?: string;
    mqttPassword?: string;
    mqttBrokerUrl?: string;
}
```

### 2. Device Manager (`agent/src/provisioning/device-manager.ts`)

**loadDeviceInfo()** - Load MQTT credentials from database:
```typescript
mqttUsername: rows[0].mqttUsername,
mqttPassword: rows[0].mqttPassword,
mqttBrokerUrl: rows[0].mqttBrokerUrl,
```

**saveDeviceInfo()** - Save MQTT credentials to database:
```typescript
mqttUsername: this.deviceInfo.mqttUsername || null,
mqttPassword: this.deviceInfo.mqttPassword || null,
mqttBrokerUrl: this.deviceInfo.mqttBrokerUrl || null,
```

**registerWithAPI()** - Extract MQTT credentials from API response:
```typescript
// Save MQTT credentials if provided by the API
if (result.mqttUsername) {
    this.deviceInfo!.mqttUsername = result.mqttUsername;
    console.log('   MQTT Username:', result.mqttUsername);
}
if (result.mqttPassword) {
    this.deviceInfo!.mqttPassword = result.mqttPassword;
    console.log('   MQTT Password: [REDACTED]');
}
if (result.mqttBrokerUrl) {
    this.deviceInfo!.mqttBrokerUrl = result.mqttBrokerUrl;
    console.log('   MQTT Broker:', result.mqttBrokerUrl);
}
```

### 3. Supervisor (`agent/src/supervisor.ts`)

**initializeMqttManager()** - Use provisioned credentials with fallback:
```typescript
// Use MQTT credentials from provisioning if available, otherwise fall back to env vars
const mqttBrokerUrl = deviceInfo.mqttBrokerUrl || process.env.MQTT_BROKER;
const mqttUsername = deviceInfo.mqttUsername || process.env.MQTT_USERNAME;
const mqttPassword = deviceInfo.mqttPassword || process.env.MQTT_PASSWORD;

if (!mqttBrokerUrl) {
    console.log('⏭️  MQTT disabled - no broker URL provided');
    console.log('   Provision device or set MQTT_BROKER env var to enable');
    return;
}

await mqttManager.connect(mqttBrokerUrl, {
    clientId: `device_${deviceInfo.uuid}`,
    clean: true,
    reconnectPeriod: 5000,
    username: mqttUsername,
    password: mqttPassword,
});

console.log(`✅ MQTT Manager connected: ${mqttBrokerUrl}`);
console.log(`   Credentials: ${deviceInfo.mqttUsername ? 'From provisioning' : 'From environment'}`);
```

### 4. Migration (`agent/src/migrations/20251020000000_add_mqtt_credentials.js`)

Recreated migration to add MQTT credential columns:

```javascript
exports.up = function(knex) {
  return knex.schema.table('device', function(table) {
    table.string('mqttUsername', 255).nullable();
    table.string('mqttPassword', 255).nullable();
    table.string('mqttBrokerUrl', 255).nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('device', function(table) {
    table.dropColumn('mqttUsername');
    table.dropColumn('mqttPassword');
    table.dropColumn('mqttBrokerUrl');
  });
};
```

**Migration State Fixed**:
- Removed corrupted migration records using `scripts/fix-migrations.js`
- Marked migration as complete using `scripts/mark-migration-complete.js` (columns already existed)
- Verified with `npx knex migrate:status` - all 7 migrations complete

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Device Provisioning Flow                                        │
└─────────────────────────────────────────────────────────────────┘

Agent                        Cloud API                    Database
  │                              │                            │
  │ POST /api/v1/device/register │                            │
  │─────────────────────────────>│                            │
  │  (uuid, deviceName, etc.)    │                            │
  │                              │                            │
  │                              │ 1. Create device record    │
  │                              │───────────────────────────>│
  │                              │                            │
  │                              │ 2. Create MQTT user        │
  │                              │    (username=UUID)         │
  │                              │    (password=random)       │
  │                              │───────────────────────────>│
  │                              │                            │
  │                              │ 3. Create MQTT ACLs        │
  │                              │    (allow pub/sub on       │
  │                              │     device topics)         │
  │                              │───────────────────────────>│
  │                              │                            │
  │<─────────────────────────────│                            │
  │  Response:                   │                            │
  │  {                           │                            │
  │    id: 1,                    │                            │
  │    uuid: "...",              │                            │
  │    mqttUsername: "...",      │                            │
  │    mqttPassword: "...",      │                            │
  │    mqttBrokerUrl: "..."      │                            │
  │  }                           │                            │
  │                              │                            │
  │ 4. Save credentials          │                            │
  │    to device table           │                            │
  │─────────────────────────────────────────────────────────>│
  │                              │                            │
  │ 5. Connect to MQTT           │                            │
  │    with credentials          │                            │
  │─────────────────────────────>│                            │
  │                       (auth via Mosquitto Go Auth)        │
  │                              │ 6. Verify credentials      │
  │                              │───────────────────────────>│
  │                              │    SELECT FROM mqtt_users  │
  │                              │                            │
  │                              │ 7. Check ACLs              │
  │                              │───────────────────────────>│
  │                              │    SELECT FROM mqtt_acls   │
  │                              │                            │
  │<─────────────────────────────│                            │
  │  CONNACK (success)           │                            │
  │                              │                            │
```

---

## Database Schema

**Agent (SQLite) - `device` table**:
```sql
CREATE TABLE device (
    -- ... existing columns
    mqttUsername TEXT,
    mqttPassword TEXT,
    mqttBrokerUrl TEXT
);
```

**API (PostgreSQL) - `mqtt_users` table**:
```sql
CREATE TABLE mqtt_users (
    username VARCHAR(255) PRIMARY KEY,
    password_hash VARCHAR(255) NOT NULL,
    is_superuser BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**API (PostgreSQL) - `mqtt_acls` table**:
```sql
CREATE TABLE mqtt_acls (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    rw INTEGER NOT NULL, -- 1=read, 2=write, 3=read+write
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Testing

### 1. Check Migration Status

```bash
cd agent
npx knex migrate:status
```

Expected:
```
Found 7 Completed Migration file/files.
20250101000000_initial.js
20250102000000_add_device.js
20250103000000_add_provisioning_keys.js
20250104000000_remove_unused_tables.js
20250105000000_cleanup_old_snapshots.js
20251014012756_add_state_hash_column.js
20251020000000_add_mqtt_credentials.js
No Pending Migration files Found.
```

### 2. Build Agent

```bash
cd agent
npm run build
```

Expected: Clean build with no TypeScript errors.

### 3. Test Device Provisioning

See `docs/MQTT-AUTH-FIX-COMPLETE.md` for full testing steps.

---

## Next Steps

1. ✅ All code changes complete
2. ✅ Migrations restored and synced
3. ✅ Agent builds successfully
4. ⏭️  **Ready for end-to-end testing** (see todo #5)

---

## Files Changed

- ✅ `agent/src/provisioning/types.ts`
- ✅ `agent/src/provisioning/device-manager.ts`
- ✅ `agent/src/supervisor.ts`
- ✅ `agent/src/migrations/20251020000000_add_mqtt_credentials.js` (recreated)
- ✅ `agent/scripts/fix-migrations.js` (utility script)
- ✅ `agent/scripts/mark-migration-complete.js` (utility script)

---

## Troubleshooting

### If credentials not loading

Check device table:
```bash
cd agent
node -e "const db=require('knex')({client:'sqlite3',connection:{filename:'./data/database.sqlite'},useNullAsDefault:true}); db('device').select('*').then(r=>console.log(r)).finally(()=>db.destroy())"
```

### If MQTT connection fails

Check supervisor logs for:
```
✅ MQTT Manager connected: mqtt://localhost:5883
   Username: <device-uuid>
   Credentials: From provisioning
```

If you see "From environment" instead of "From provisioning", the credentials weren't saved correctly.

---

## Commit Message

```
fix: Restore MQTT credentials integration after git merge

- Add mqttUsername, mqttPassword, mqttBrokerUrl to DeviceInfo and ProvisionResponse types
- Update device-manager to load/save MQTT credentials from/to database
- Modify supervisor to use provisioned MQTT credentials with env var fallback
- Recreate 20251020000000_add_mqtt_credentials.js migration
- Add utility scripts to fix corrupted migration state
- All migrations now in sync (7 completed, 0 pending)

This enables the agent to receive MQTT credentials during device provisioning
and use them to authenticate with the MQTT broker via Mosquitto Go Auth.
```
