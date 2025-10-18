# Migration System - Existing Database Fix ✅

**Issue**: Database had existing schema but `schema_migrations` table was empty, causing migration 001 to fail.

**Error**: 
```
❌ Migration 1 failed: relation "idx_provisioning_keys_fleet_id" already exists
```

## Solution: Mark Existing Migrations as Applied

Since your database already has schema from migrations 1-13, we marked them as applied without re-running them.

### What We Did

1. **Created marking script**: `scripts/mark-migrations-applied.ts`
   - Marks migrations as applied in `schema_migrations` table
   - Doesn't actually run the SQL (for databases with existing schema)

2. **Added npm command**: `npm run migrate:mark-applied <range>`
   - Example: `npm run migrate:mark-applied 1-13`

3. **Marked migrations 1-13 as applied**:
   ```bash
   npm run migrate:mark-applied 1-13
   ```
   
   Result:
   - ✅ 13 migrations marked as applied
   - Only migration 014 (API key rotation) remains pending
   - Next API startup will apply only migration 014

### Current Status

```bash
npm run migrate:status
```

**Output**:
```
Applied migrations: 13
Pending migrations: 1

⏳ Pending:
   014 - add api key rotation
```

### Next Steps

**Just start the API!** Migration 014 will auto-apply:

```bash
npm run dev
```

**Expected Startup**:
```
🔄 Checking for database migrations...

📊 Applied migrations: 13
📋 Total migrations available: 15

🔨 Found 1 pending migration(s):

📄 Applying migration 14: add api key rotation
   ✅ Applied in 45ms

✅ Successfully applied 1 migration(s)

🔄 Starting API key rotation scheduler...
✅ API key rotation schedulers started
```

## When This Happens

This situation occurs when:
- Database was created manually or via schema.sql
- `schema_migrations` table didn't exist or was empty
- Migration system tries to apply all migrations from scratch
- Existing objects cause conflicts

## Future Prevention

Going forward, the migration system will track everything automatically:
- New migrations apply on API startup
- `schema_migrations` table always up to date
- No manual intervention needed

## Manual Verification

Check what's in your database:

```sql
-- View applied migrations
SELECT * FROM schema_migrations ORDER BY migration_number;

-- Verify API key rotation migration applied
SELECT * FROM schema_migrations WHERE migration_number = 14;

-- Check new rotation columns exist
\d devices
-- Should show: api_key_expires_at, api_key_last_rotated_at, etc.

-- Check history table exists
\d device_api_key_history
```

## Available Commands

```bash
# Check migration status
npm run migrate:status

# Apply pending migrations manually
npm run migrate

# Mark migrations as applied (without running them)
npm run migrate:mark-applied 1-13

# Create new migration
npm run migrate:create migration_name
```

---

**Status**: ✅ **RESOLVED**

Your database is now properly tracked. Migration 014 will apply automatically on next API startup! 🚀
