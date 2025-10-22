# PostgreSQL Backend for Iotistic Sensor

The Iotistic API now supports a PostgreSQL backend for persistent device state storage, inspired by Balena Cloud's architecture.

## Quick Start

### Using In-Memory Storage (Default)

No configuration needed. Just start the stack:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

### Using PostgreSQL Backend

1. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and set:
   USE_POSTGRES=true
   DB_PASSWORD=your_secure_password
   ```

2. **Start the stack:**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

   The PostgreSQL container will:
   - Start on port 5432
   - Auto-initialize the schema from `api/database/schema.sql`
   - Create a persistent volume `Iotistic-pg-data`

3. **Verify:**
   ```bash
   # Check API is using PostgreSQL
   docker logs Iotistic-api
   # Should show: "🐘 Using PostgreSQL backend for device state"
   
   # Test database connection
   docker exec -it Iotistic-postgres psql -U postgres -d Iotistic -c "SELECT COUNT(*) FROM devices;"
   ```

## Environment Variables

Add these to your `.env` file:

```bash
# Enable PostgreSQL backend
USE_POSTGRES=true

# Database password (default: postgres)
DB_PASSWORD=postgres

# Optional: External database port (default: 5432)
# DB_PORT_EXT=5432
```

## Services

The docker-compose stack includes:

- **postgres** - PostgreSQL 16 Alpine (port 5432)
  - Auto-initializes schema on first start
  - Persistent volume: `Iotistic-pg-data`
  - Health checks every 10s

- **api** - Iotistic API (port 3002)
  - Connects to postgres when `USE_POSTGRES=true`
  - Falls back to in-memory if postgres unavailable
  - Waits for postgres health check before starting

## Database Management

### Connect to PostgreSQL

```bash
# Via Docker
docker exec -it Iotistic-postgres psql -U postgres -d Iotistic

# From host (if port exposed)
psql -h localhost -U postgres -d Iotistic
```

### Common Commands

```sql
-- List all devices
SELECT uuid, device_name, is_online, created_at FROM devices;

-- View target states
SELECT device_uuid, apps FROM device_target_state;

-- Check metrics
SELECT device_uuid, cpu_usage, memory_usage, recorded_at 
FROM device_metrics 
ORDER BY recorded_at DESC LIMIT 10;

-- View logs
SELECT device_uuid, service_name, message, timestamp 
FROM device_logs 
ORDER BY timestamp DESC LIMIT 20;
```

### Backup Database

```bash
# Backup
docker exec Iotistic-postgres pg_dump -U postgres Iotistic > Iotistic_backup.sql

# Restore
cat Iotistic_backup.sql | docker exec -i Iotistic-postgres psql -U postgres -d Iotistic
```

### Reset Database

```bash
# Stop services
docker-compose -f docker-compose.dev.yml down

# Remove volume
docker volume rm Iotistic-pg-data

# Restart (will auto-initialize)
docker-compose -f docker-compose.dev.yml up -d
```

## Migration from In-Memory

To migrate from in-memory to PostgreSQL:

1. **Stop the API** (keep devices running):
   ```bash
   docker-compose -f docker-compose.dev.yml stop api
   ```

2. **Enable PostgreSQL** in `.env`:
   ```bash
   USE_POSTGRES=true
   ```

3. **Start PostgreSQL and API**:
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

4. Devices will automatically re-register on their next poll (within 60 seconds)

## Troubleshooting

### API Not Starting

Check logs:
```bash
docker logs Iotistic-api
```

Common issues:
- PostgreSQL not ready: API waits for health check
- Connection refused: Check `DB_HOST=postgres` in environment
- Schema errors: Check `api/database/schema.sql`

### PostgreSQL Connection Errors

```bash
# Check PostgreSQL status
docker exec Iotistic-postgres pg_isready -U postgres

# View PostgreSQL logs
docker logs Iotistic-postgres

# Test connection
docker exec -it Iotistic-postgres psql -U postgres -d Iotistic -c "SELECT NOW();"
```

### Schema Issues

```bash
# Manually apply schema
docker exec -i Iotistic-postgres psql -U postgres -d Iotistic < api/database/schema.sql
```

## Production Considerations

For production deployments:

1. **Use strong passwords:**
   ```bash
   DB_PASSWORD=$(openssl rand -base64 32)
   ```

2. **Enable SSL connections** (requires PostgreSQL configuration)

3. **Set up automated backups:**
   ```bash
   # Add to crontab
   0 2 * * * docker exec Iotistic-postgres pg_dump -U postgres Iotistic | gzip > /backups/Iotistic-$(date +\%Y\%m\%d).sql.gz
   ```

4. **Monitor disk usage:**
   ```bash
   docker system df -v | grep Iotistic-pg-data
   ```

5. **Configure retention policies** (see `api/POSTGRES-BACKEND.md`)

## Documentation

- **Full PostgreSQL Guide**: `api/POSTGRES-BACKEND.md`
- **Implementation Details**: `api/POSTGRES-IMPLEMENTATION.md`
- **Database Schema**: `api/database/schema.sql`
- **API Documentation**: http://localhost:3002/api/docs

## Architecture

```
┌─────────────────────────────────────────┐
│           Raspberry Pi Device            │
├─────────────────────────────────────────┤
│  Agent → API (port 3002)                │
│           ↓                              │
│  ┌─────────────────────────────────┐   │
│  │ PostgreSQL (optional)            │   │
│  │ - devices                        │   │
│  │ - device_target_state            │   │
│  │ - device_current_state           │   │
│  │ - device_metrics                 │   │
│  │ - device_logs                    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Next Steps

- Enable PostgreSQL: Set `USE_POSTGRES=true` in `.env`
- Monitor metrics: Query `device_metrics` table
- View logs: Query `device_logs` table
- Scale up: Add read replicas for high-load scenarios

For detailed information, see `api/POSTGRES-BACKEND.md`.
