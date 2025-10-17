# System Config Table - Proper Migration ✅

## Your Question

> "i see you added the system_config table. is it captured as a db migration?"

**Answer:** It wasn't initially - good catch! ✅ Now it is!

---

## What Was Changed

### Before ❌
- `system_config` table created **inline in code** (`heartbeat-monitor.ts`)
- Used `CREATE TABLE IF NOT EXISTS` on every API startup
- Not tracked in migration history
- Could cause issues if multiple instances start simultaneously

### After ✅
- `system_config` table created by **proper migration** (`002_add_system_config.sql`)
- Tracked in migration history
- Clean separation of schema vs. code
- Follows best practices

---

## Changes Made

### 1. Created Migration File ✅

**File:** `api/database/migrations/002_add_system_config.sql`

```sql
-- Migration: Add system_config table for persistent system state
-- Purpose: Store configuration values and system state (e.g., heartbeat last check time)
-- Created: 2025-10-16

-- System configuration key-value store
CREATE TABLE IF NOT EXISTS system_config (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups (though primary key already provides this)
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);

-- Add comment for documentation
COMMENT ON TABLE system_config IS 'System-wide configuration and state storage (key-value pairs)';
COMMENT ON COLUMN system_config.key IS 'Configuration key (e.g., heartbeat_last_check)';
COMMENT ON COLUMN system_config.value IS 'Configuration value stored as JSON';
COMMENT ON COLUMN system_config.updated_at IS 'Last update timestamp';

-- Example usage:
-- INSERT INTO system_config (key, value) VALUES ('heartbeat_last_check', '{"timestamp": "2025-10-16T10:00:00Z"}')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
```

### 2. Removed Inline Table Creation ✅

**File:** `api/src/services/heartbeat-monitor.ts`

**Before:**
```typescript
private async loadLastCheckTime(): Promise<void> {
  try {
    // Create config table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS system_config (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = await query<{value: {timestamp: string}}>(
      'SELECT value FROM system_config WHERE key = $1',
      [HEARTBEAT_STATE_KEY]
    );
    // ...
  }
}
```

**After:**
```typescript
/**
 * Load last check time from database
 * Note: system_config table must exist (created by migration 002_add_system_config.sql)
 */
private async loadLastCheckTime(): Promise<void> {
  try {
    const result = await query<{value: {timestamp: string}}>(
      'SELECT value FROM system_config WHERE key = $1',
      [HEARTBEAT_STATE_KEY]
    );
    
    if (result.rows.length > 0) {
      this.lastCheckTime = new Date(result.rows[0].value.timestamp);
      console.log(`   Last check was at: ${this.lastCheckTime.toISOString()}`);
    } else {
      console.log('   No previous check time found (first run)');
    }
  } catch (error: any) {
    console.warn('⚠️  Could not load last check time:', error.message);
    console.warn('   Make sure to run database migrations: npx ts-node scripts/run-migrations.ts');
    this.lastCheckTime = null;
  }
}
```

**Key changes:**
- ✅ Removed `CREATE TABLE IF NOT EXISTS` from code
- ✅ Added helpful error message if table doesn't exist
- ✅ Added comment referencing the migration file

### 3. Ran Migration ✅

```bash
cd api
npx ts-node scripts/run-migrations.ts
```

**Output:**
```
📝 Running migration: 002_add_system_config.sql
   ✅ Success

✅ All migrations completed successfully!
```

### 4. Updated Documentation ✅

Updated these files to reference the migration:
- `api/docs/API-DOWNTIME-HANDLING.md`
- `api/docs/DEVICE-ONLINE-AUDIT-COMPLETE.md`

---

## Migration List

Your database now has **2 migrations**:

1. ✅ `001_add_security_tables.sql` - Security infrastructure
   - `provisioning_keys`
   - `device_api_keys`
   - `audit_logs`
   - `provisioning_attempts`

2. ✅ `002_add_system_config.sql` - System state persistence
   - `system_config`

---

## How to Use

### For New Installations

```bash
cd api
npx ts-node scripts/run-migrations.ts
```

This will create all tables in order.

### For Existing Installations

The migration uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run even if the table already exists from the old inline code.

```bash
cd api
npx ts-node scripts/run-migrations.ts
```

If the table already exists, you'll see:
```
📝 Running migration: 002_add_system_config.sql
   ✅ Success
```

---

## Verify Table Exists

```sql
-- Check table structure
\d system_config

-- Expected output:
--                        Table "public.system_config"
--    Column   |            Type             | Collation | Nullable | Default
-- ------------+-----------------------------+-----------+----------+---------
--  key        | character varying(255)      |           | not null |
--  value      | jsonb                       |           | not null |
--  updated_at | timestamp without time zone |           |          | now()
-- Indexes:
--     "system_config_pkey" PRIMARY KEY, btree (key)
--     "idx_system_config_key" btree (key)

-- Check data
SELECT * FROM system_config;

-- If heartbeat has run, you'll see:
--         key          |                 value                  |       updated_at
-- ---------------------+----------------------------------------+-------------------------
--  heartbeat_last_check| {"timestamp": "2025-10-16T10:30:00Z"} | 2025-10-16 10:30:00
```

---

## Why This Matters

### Benefits of Proper Migrations

1. **Version Control** ✅
   - Schema changes tracked in git
   - Easy to see what changed and when
   - Can review schema changes in pull requests

2. **Reproducibility** ✅
   - New environments get same schema
   - No "works on my machine" schema issues
   - CI/CD can run migrations automatically

3. **Team Collaboration** ✅
   - Everyone gets same schema structure
   - No silent schema divergence
   - Clear migration history

4. **Production Safety** ✅
   - Migrations run in order
   - Can test migrations before production
   - Can rollback if needed (with down migrations)

5. **Documentation** ✅
   - Comments explain purpose of each table
   - Migration filename shows when it was added
   - Easy to understand schema evolution

### Problems with Inline Table Creation

1. ❌ No version control for schema
2. ❌ Harder to see what schema exists
3. ❌ Can cause race conditions if multiple instances start
4. ❌ No clear migration history
5. ❌ Difficult to test schema changes

---

## Future Schema Changes

**Always create a migration file:**

```bash
# Example: Adding a new table
touch api/database/migrations/003_add_device_settings.sql
```

```sql
-- api/database/migrations/003_add_device_settings.sql
CREATE TABLE IF NOT EXISTS device_settings (
  id SERIAL PRIMARY KEY,
  device_uuid UUID NOT NULL REFERENCES devices(uuid) ON DELETE CASCADE,
  setting_key VARCHAR(255) NOT NULL,
  setting_value JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(device_uuid, setting_key)
);

CREATE INDEX idx_device_settings_device_uuid ON device_settings(device_uuid);
```

Then run migrations:
```bash
npx ts-node scripts/run-migrations.ts
```

---

## Build Status

✅ **TypeScript compilation successful**
✅ **Migration executed successfully**
✅ **Table created in database**

---

## Summary

### What You Identified ✅
> "system_config table isn't captured as a db migration"

### What Was Fixed ✅
- Created proper migration file: `002_add_system_config.sql`
- Removed inline table creation from code
- Added helpful error messages
- Updated documentation
- Ran migration successfully

### Result ✅
Clean separation between:
- **Schema** (managed by migrations)
- **Code** (uses schema, doesn't create it)

Great catch on following best practices! 🎯
