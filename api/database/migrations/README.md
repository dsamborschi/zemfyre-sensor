# MQTT Authentication & ACL Migration

This directory contains the PostgreSQL migration for setting up MQTT authentication and access control lists (ACLs) compatible with **mosquitto-go-auth**.

## Overview

The migration creates:
- **User Authentication Tables**: For dashboard/API users
- **MQTT Authentication Tables**: For MQTT broker authentication (`mqtt_users`, `mqtt_acls`)
- **Default Users**: Admin user and MQTT superuser
- **Default ACL Rules**: Topic access patterns
- **Triggers**: Auto-create MQTT users when devices are provisioned

## Files

- `017_add_user_auth_and_mqtt_acl.sql` - Main migration SQL script
- `run-mqtt-acl-migration.ps1` - PowerShell script to run the migration

## Quick Start

### 1. Prerequisites

- PostgreSQL 12+ running
- PostgreSQL client tools (`psql`) installed
- Database created (default: `iotistic`)

### 2. Configure Database Connection

Create/update `.env` file in the `api/` directory:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iotistic
DB_USER=postgres
DB_PASSWORD=your_password_here
```

### 3. Run Migration

```powershell
cd api
./scripts/run-mqtt-acl-migration.ps1
```

Or manually with `psql`:

```bash
psql -h localhost -p 5432 -U postgres -d iotistic -f database/migrations/017_add_user_auth_and_mqtt_acl.sql
```

### 4. Verify Tables Created

```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND (tablename LIKE 'mqtt_%' OR tablename IN ('users', 'refresh_tokens'))
ORDER BY tablename;
```

Expected tables:
- `users`
- `refresh_tokens`
- `user_sessions`
- `mqtt_users`
- `mqtt_acls`

## Database Schema

### mqtt_users

Stores MQTT broker user credentials.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| username | VARCHAR(255) | MQTT username (unique) |
| password_hash | VARCHAR(255) | Bcrypt hashed password |
| is_superuser | BOOLEAN | Bypass all ACL checks |
| is_active | BOOLEAN | Account enabled/disabled |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

### mqtt_acls

Defines topic access control rules.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| username | VARCHAR(255) | User (NULL = all users) |
| clientid | VARCHAR(255) | Client ID (NULL = all clients) |
| topic | VARCHAR(255) | Topic pattern (+, # wildcards) |
| access | INTEGER | 1=subscribe, 2=publish, 3=both |
| priority | INTEGER | Higher priority wins conflicts |
| created_at | TIMESTAMP | Creation timestamp |

## Default Credentials

⚠️ **CHANGE THESE IN PRODUCTION!**

### Dashboard Admin
- **Username**: `admin`
- **Password**: `admin123`
- **Role**: admin

### MQTT Superuser
- **Username**: `mqtt_admin`
- **Password**: `mqtt_admin`
- **Superuser**: Yes

## Default ACL Rules

| Topic Pattern | Access | Description |
|--------------|--------|-------------|
| `sensor/#` | Publish | Devices publish sensor data |
| `device/+/status` | Publish | Devices publish status |
| `device/+/command/#` | Subscribe | Devices receive commands |
| `device/+/config` | Subscribe | Devices receive config |
| `system/#` | Subscribe | Read-only system topics |
| `alerts/#` | Subscribe | Read alert topics |

## Device Provisioning Integration

When a device is provisioned via the API:

1. **Device record created** in `devices` table
2. **MQTT username set** to device UUID
3. **Trigger fires** automatically:
   - Creates user in `mqtt_users`
   - Creates ACL rules for device-specific topics:
     - `device/{uuid}/#` - Full access (publish + subscribe)
     - `sensor/{uuid}/#` - Publish sensor data
     - `system/status` - Read system status

Example device topics:
```
device/abc-123-def/sensor/temperature
device/abc-123-def/status
sensor/abc-123-def/bme688/temperature
```

## Mosquitto Go Auth Configuration

Update `api/mosquitto.conf` or your Mosquitto Go Auth config:

```conf
auth_plugin /usr/local/lib/mosquitto-go-auth.so

auth_opt_backends postgres

# PostgreSQL connection
auth_opt_pg_host localhost
auth_opt_pg_port 5432
auth_opt_pg_dbname iotistic
auth_opt_pg_user postgres
auth_opt_pg_password your_password

# Authentication query
auth_opt_pg_userquery SELECT password_hash FROM mqtt_users WHERE username = $1 AND is_active = true LIMIT 1

# Authorization query (ACL check)
auth_opt_pg_aclquery SELECT COUNT(*) FROM mqtt_acls WHERE username = $1 AND rw >= $2 AND ($3 = topic OR topic = '#' OR $3 LIKE REPLACE(REPLACE(topic, '+', '_'), '#', '%'))

# Superuser query
auth_opt_pg_superquery SELECT COUNT(*) FROM mqtt_users WHERE username = $1 AND is_superuser = true AND is_active = true

# Hash algorithm (bcrypt recommended)
auth_opt_hasher bcrypt
auth_opt_hasher_cost 10
```

## API Integration

The provisioning endpoint automatically creates MQTT credentials:

```typescript
// api/src/routes/provisioning.ts
router.post('/device/register', async (req, res) => {
  // ... device registration logic
  
  // Generate MQTT credentials
  const mqttUsername = uuid;
  const mqttPassword = crypto.randomBytes(16).toString('base64');
  const mqttPasswordHash = await bcrypt.hash(mqttPassword, 10);
  
  // Insert into mqtt_users
  await query(
    `INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)
     VALUES ($1, $2, false, true)
     ON CONFLICT (username) DO NOTHING`,
    [mqttUsername, mqttPasswordHash]
  );
  
  // Insert ACL rules
  await query(
    `INSERT INTO mqtt_acls (username, topic, access, priority)
     VALUES ($1, $2, 3, 0)`,
    [mqttUsername, `iot/device/${uuid}/#`]
  );
  
  // Return credentials to device
  res.json({
    mqtt: {
      username: mqttUsername,
      password: mqttPassword,
      broker: 'mqtt://mosquitto:1883'
    }
  });
});
```

## Troubleshooting

### Migration Fails

**Error**: `psql: command not found`
- **Fix**: Install PostgreSQL client tools
- Windows: https://www.postgresql.org/download/windows/
- Linux: `sudo apt-get install postgresql-client`

**Error**: `FATAL: password authentication failed`
- **Fix**: Check DB_PASSWORD in `.env`
- Verify PostgreSQL user permissions

**Error**: `database "iotistic" does not exist`
- **Fix**: Create database first:
  ```sql
  CREATE DATABASE iotistic;
  ```

### MQTT Connection Denied

**Check 1**: Verify user exists in `mqtt_users`
```sql
SELECT * FROM mqtt_users WHERE username = 'your-device-uuid';
```

**Check 2**: Verify ACL rules exist
```sql
SELECT * FROM mqtt_acls WHERE username = 'your-device-uuid';
```

**Check 3**: Test password hash
```javascript
const bcrypt = require('bcrypt');
const stored = '$2b$10$...'; // from database
const provided = 'password'; // what device sends
bcrypt.compare(provided, stored); // should return true
```

**Check 4**: Enable Mosquitto debug logging
```conf
log_type all
log_dest file /var/log/mosquitto/mosquitto.log
```

## Useful Queries

### List all MQTT users
```sql
SELECT username, is_superuser, is_active, created_at 
FROM mqtt_users 
ORDER BY created_at DESC;
```

### List ACL rules for a user
```sql
SELECT topic, access, priority 
FROM mqtt_acls 
WHERE username = 'device-uuid'
ORDER BY priority DESC;
```

### Find devices without MQTT credentials
```sql
SELECT uuid, device_name 
FROM devices 
WHERE mqtt_username IS NULL 
AND is_active = true;
```

### MQTT access summary (uses view)
```sql
SELECT * FROM mqtt_access_summary;
```

## Security Best Practices

1. **Change Default Passwords**: Update admin and mqtt_admin passwords immediately
2. **Use Strong Passwords**: Minimum 16 characters for MQTT credentials
3. **Least Privilege**: Give devices access only to their own topics
4. **Monitor Access**: Review audit_logs regularly for unauthorized attempts
5. **Rotate Credentials**: Implement periodic password rotation
6. **Use TLS**: Configure Mosquitto with SSL/TLS for encrypted connections

## Related Documentation

- [MQTT-AUTH-FIX-COMPLETE.md](../../docs/MQTT-AUTH-FIX-COMPLETE.md) - ACL query fixes
- [MQTT-API-RESTORE-COMPLETE.md](../../docs/MQTT-API-RESTORE-COMPLETE.md) - Full MQTT integration
- [mosquitto-go-auth docs](https://github.com/iegomez/mosquitto-go-auth) - Official plugin documentation

## Support

For issues or questions:
1. Check Mosquitto logs: `/var/log/mosquitto/mosquitto.log`
2. Check PostgreSQL logs: `/var/log/postgresql/`
3. Enable debug logging in Mosquitto Go Auth
4. Review audit_logs table for authentication failures
