# Database Migrations Guide

Automatic database migration system for the Iotistic API.

## Overview

The migration system automatically applies pending database schema changes on API startup. No manual SQL execution required!

### Key Features

✅ **Automatic on Startup**: Migrations run when API starts  
✅ **Version Tracking**: Tracks which migrations have been applied  
✅ **Order Guaranteed**: Migrations apply in numerical order  
✅ **Idempotent**: Safe to run multiple times (already-applied migrations are skipped)  
✅ **Transaction Safety**: Each migration runs in a transaction (all-or-nothing)  
✅ **CLI Tools**: Manual migration management when needed  

## How It Works

### 1. On API Startup

```typescript
// api/src/index.ts calls:
await db.initializeSchema();

// Which now runs:
await runMigrations();
```

**Migration Flow**:
```
1. Create schema_migrations table (if not exists)
2. Read all .sql files from database/migrations/
3. Compare with applied migrations in schema_migrations table
4. Apply pending migrations in order (001, 002, 003...)
5. Record each migration in schema_migrations table
```

### 2. Migration Tracking Table

```sql
CREATE TABLE schema_migrations (
  id SERIAL PRIMARY KEY,
  migration_number INTEGER NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP DEFAULT NOW(),
  checksum VARCHAR(64),
  execution_time_ms INTEGER
);
```

**Example Records**:
```sql
SELECT * FROM schema_migrations ORDER BY migration_number;

 id | migration_number |           name            |          filename           |         applied_at          
----+------------------+---------------------------+-----------------------------+-----------------------------
  1 |                1 | add security tables       | 001_add_security_tables.sql | 2025-10-18 10:00:00.000
  2 |                2 | add system config         | 002_add_system_config.sql   | 2025-10-18 10:00:01.500
  3 |               13 | add mqtt tables           | 013_add_mqtt_tables.sql     | 2025-10-18 10:00:15.200
  4 |               14 | add api key rotation      | 014_add_api_key_rotation.sql| 2025-10-18 10:00:16.800
```

## Creating New Migrations

### Using the CLI (Recommended)

```bash
# Create new migration file
npm run migrate:create add_new_feature

# Creates: database/migrations/015_add_new_feature.sql
```

**Generated Template**:
```sql
-- Migration: add_new_feature
-- Created: 2025-10-18T10:30:00.000Z
-- Description: Add description here

-- Add your SQL statements here
-- Example:
-- CREATE TABLE new_table (
--   id SERIAL PRIMARY KEY,
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );
```

### Manually

Create file: `database/migrations/015_your_migration_name.sql`

**Naming Convention**: `{number}_description.sql`
- Number: 3 digits, zero-padded (001, 002, 015)
- Description: Lowercase, underscores for spaces
- Extension: `.sql`

**Examples**:
- ✅ `015_add_user_roles.sql`
- ✅ `016_add_device_location.sql`
- ❌ `15_add_feature.sql` (not zero-padded)
- ❌ `add_feature.sql` (no number)

## Running Migrations

### Automatic (Production)

Migrations run automatically when the API starts:

```bash
npm start
# or
npm run dev
```

**Startup Logs**:
```
🔄 Checking for database migrations...

📊 Applied migrations: 13
📋 Total migrations available: 14

🔨 Found 1 pending migration(s):

📄 Applying migration 14: add api key rotation
   ✅ Applied in 45ms

✅ Successfully applied 1 migration(s)
```

### Manual (Development/Testing)

```bash
# Check status (doesn't apply anything)
npm run migrate:status

# Run pending migrations
npm run migrate

# Create new migration
npm run migrate:create add_feature_name
```

## Migration Best Practices

### 1. Idempotent Migrations

Use `IF NOT EXISTS` / `IF EXISTS` to make migrations safe to re-run:

```sql
-- ✅ Good: Idempotent
CREATE TABLE IF NOT EXISTS new_table (
  id SERIAL PRIMARY KEY
);

ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS new_column VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_devices_new_column 
ON devices(new_column);

-- ❌ Bad: Will fail on second run
CREATE TABLE new_table (id SERIAL PRIMARY KEY);
ALTER TABLE devices ADD COLUMN new_column VARCHAR(255);
```

### 2. Backward Compatibility

Don't break existing functionality:

```sql
-- ✅ Good: Add optional column with default
ALTER TABLE devices 
ADD COLUMN feature_enabled BOOLEAN DEFAULT false;

-- ❌ Bad: Add required column without default
ALTER TABLE devices 
ADD COLUMN required_field VARCHAR(255) NOT NULL;
-- This will fail if table has existing rows!

-- ✅ Better: Add with default, then update
ALTER TABLE devices 
ADD COLUMN required_field VARCHAR(255) DEFAULT 'default_value';

UPDATE devices SET required_field = 'actual_value' WHERE condition;

ALTER TABLE devices 
ALTER COLUMN required_field DROP DEFAULT;
```

### 3. Data Migrations

Combine schema changes with data updates:

```sql
-- Add new column
ALTER TABLE devices ADD COLUMN status VARCHAR(50) DEFAULT 'active';

-- Populate from existing data
UPDATE devices 
SET status = CASE 
  WHEN is_online = true THEN 'online'
  WHEN last_seen > NOW() - INTERVAL '1 hour' THEN 'recently_active'
  ELSE 'offline'
END;

-- Add constraint after data is populated
ALTER TABLE devices 
ALTER COLUMN status SET NOT NULL;

CREATE INDEX idx_devices_status ON devices(status);
```

### 4. Foreign Keys and Constraints

Add in correct order:

```sql
-- ✅ Good: Create referenced table first
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- ❌ Bad: Reference table that doesn't exist yet
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)  -- organizations doesn't exist!
);
```

### 5. Large Data Migrations

For tables with millions of rows, consider batching:

```sql
-- Create new column
ALTER TABLE large_table ADD COLUMN new_field VARCHAR(255);

-- Update in batches (run multiple times)
UPDATE large_table 
SET new_field = 'computed_value'
WHERE new_field IS NULL
LIMIT 10000;

-- Create index after data is populated
CREATE INDEX idx_large_table_new_field ON large_table(new_field);
```

### 6. Comments and Documentation

Document why, not just what:

```sql
-- Migration 015: Add device location tracking
-- Created: 2025-10-18
-- Jira: ZFYR-123
-- Purpose: Support geofencing alerts for fleet management

-- Add latitude/longitude columns
ALTER TABLE devices 
ADD COLUMN latitude DECIMAL(10, 8),  -- Range: -90 to 90
ADD COLUMN longitude DECIMAL(11, 8), -- Range: -180 to 180
ADD COLUMN location_updated_at TIMESTAMP;

-- Add spatial index for efficient geospatial queries
CREATE INDEX idx_devices_location 
ON devices USING gist (
  ll_to_earth(latitude, longitude)
);

-- Document: Using PostGIS earthdistance module
-- Requires: CREATE EXTENSION IF NOT EXISTS cube; CREATE EXTENSION IF NOT EXISTS earthdistance;
```

## Checking Migration Status

### Via CLI

```bash
npm run migrate:status
```

**Output**:
```
📊 Database Migration Status

Applied migrations: 14
Pending migrations: 0
Total migrations:   14

✅ Applied:
   001 - add security tables (2025-10-18T10:00:00.000Z)
   002 - add system config (2025-10-18T10:00:01.500Z)
   ...
   014 - add api key rotation (2025-10-18T10:00:16.800Z)

✅ Database is up to date!
```

### Via SQL

```sql
-- Check applied migrations
SELECT * FROM schema_migrations ORDER BY migration_number DESC;

-- Check pending migrations (manual)
-- Compare migration numbers in files vs schema_migrations table
```

### Via API (Future Enhancement)

```bash
# Could add admin endpoint:
curl http://localhost:4002/api/v1/admin/migrations/status
```

## Troubleshooting

### Migration Failed Mid-Execution

**Symptom**: Migration partially applied, then error

**Solution**: Each migration runs in a transaction, so it's rolled back automatically:

```
📄 Applying migration 15: add new feature
❌ Migration 15 failed: column "duplicate_column" already exists
```

**Fix**:
1. Edit migration file to fix the issue
2. Restart API (or run `npm run migrate`)
3. Migration will retry (checksum prevents duplicate application)

### Migration Already Applied Manually

**Symptom**: You ran SQL manually, now migration is stuck

**Solution**: Mark migration as applied:

```sql
INSERT INTO schema_migrations 
  (migration_number, name, filename, applied_at) 
VALUES 
  (15, 'add new feature', '015_add_new_feature.sql', NOW());
```

### Existing Database Without Migration Tracking

**Symptom**: `schema_migrations` table is empty but database has schema, migrations fail with "already exists" errors

**Solution**: Mark existing migrations as applied without running them:

```bash
# If migrations 1-13 are already in your database
npm run migrate:mark-applied 1-13

# Verify
npm run migrate:status

# Now only new migrations will apply
npm run dev
```

**See**: [Migration Fix for Existing Database](./MIGRATION-FIX-EXISTING-DB.md) for detailed guide.

### Wrong Migration Order

**Symptom**: Migration 016 applied, but 015 is now added

**Solution**: Migrations apply in numerical order regardless of when they were created. Just add 015, it will apply next startup.

### Need to Rollback

**Important**: This system doesn't support automatic rollbacks!

**Why**: Rollbacks are dangerous in production (data loss risk)

**Best Practice**: Create a **new forward migration** to undo changes:

```sql
-- Instead of rolling back 015_add_feature.sql
-- Create: 016_remove_feature.sql

DROP TABLE IF EXISTS feature_table;
ALTER TABLE devices DROP COLUMN IF EXISTS feature_column;
```

### Development: Reset Database

```bash
# Nuclear option: Drop and recreate database
psql -U postgres -c "DROP DATABASE iotistic;"
psql -U postgres -c "CREATE DATABASE iotistic;"

# Restart API - all migrations will run from scratch
npm run dev
```

## Advanced Usage

### Conditional Migrations

Use PL/pgSQL for complex logic:

```sql
DO $$
BEGIN
  -- Only add column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'devices' AND column_name = 'new_field'
  ) THEN
    ALTER TABLE devices ADD COLUMN new_field VARCHAR(255);
  END IF;
END $$;
```

### Multi-Statement Migrations

Separate with semicolons, but be careful with transactions:

```sql
-- All these run in one transaction
CREATE TABLE table1 (id SERIAL PRIMARY KEY);
CREATE TABLE table2 (id SERIAL PRIMARY KEY);
CREATE INDEX idx_table1_id ON table1(id);

-- If any fails, all are rolled back
```

### Extensions and Functions

```sql
-- Enable PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- Create custom function
CREATE OR REPLACE FUNCTION update_modified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger
CREATE TRIGGER update_devices_timestamp
  BEFORE UPDATE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_timestamp();
```

## Migration Checklist

Before creating a migration:

- [ ] Does the migration have a clear, descriptive name?
- [ ] Is the number sequential (next available number)?
- [ ] Are all statements idempotent (safe to re-run)?
- [ ] Does it work with existing data (backward compatible)?
- [ ] Are indexes created AFTER data is populated?
- [ ] Are foreign keys added in correct order?
- [ ] Is it documented (comments explaining why)?
- [ ] Tested locally with real data?
- [ ] Reviewed by another developer?

## See Also

- [Database Schema](../database/schema.sql) - Current full schema
- [Migration System Code](../src/db/migrations.ts) - Implementation
- [Connection Pool](../src/db/connection.ts) - Database connection
- [Existing Migrations](../database/migrations/) - All migration files

---

**Migration System Version**: 1.0  
**Last Updated**: October 18, 2025  
**Auto-applies on**: API startup (`npm start`, `npm run dev`)
