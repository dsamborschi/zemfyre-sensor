# SQLite Persistence

## Overview

The container-manager now uses SQLite for persistent state storage, inspired by balena-supervisor. This means your target state and application configuration survive restarts!

## Database Schema

### Tables

**app** - Application definitions
- `id`: Auto-increment primary key
- `appId`: Unique application ID
- `appName`: Application name
- `commit`: Git commit hash (optional)
- `releaseId`: Release identifier (optional)
- `services`: JSON array of services
- `createdAt`, `updatedAt`: Timestamps

**service** - Individual services
- `id`: Auto-increment primary key
- `serviceId`, `appId`: Composite unique key
- `serviceName`: Service name
- `imageName`: Docker image name
- `config`: Full service configuration (JSON)
- `status`: Current status (stopped, starting, running, stopping)
- `containerId`: Docker container ID
- `createdAt`, `updatedAt`: Timestamps

**image** - Pulled images
- `id`: Auto-increment primary key
- `imageName`: Unique image name
- `appId`, `serviceId`: Related app/service
- `dockerImageId`: Docker's internal image ID
- `size`: Image size in bytes
- `pulledAt`, `createdAt`: Timestamps

**stateSnapshot** - State history
- `id`: Auto-increment primary key
- `type`: 'current' or 'target'
- `state`: Full state snapshot (JSON)
- `createdAt`: Timestamp

## Database Location

By default, the database is created at:
```
./data/database.sqlite
```

You can customize this with the `DATABASE_PATH` environment variable:
```bash
export DATABASE_PATH=/var/lib/container-manager/database.sqlite
```

## Persistence Across Updates (Like Balena)

### The Problem
When you update/replace a Docker container, all data inside it is lost. The database needs to survive container updates.

### The Solution: Docker Named Volumes

Just like balena-supervisor, we use Docker volumes to persist data on the host:

**In `docker-compose.yml`:**
```yaml
services:
  container-manager:
    volumes:
      - container-manager-data:/app/data  # Named volume
    environment:
      - DATABASE_PATH=/app/data/database.sqlite

volumes:
  container-manager-data:
    driver: local
```

**What happens:**
1. Docker creates a named volume `container-manager-data` on the **host**
2. This volume is mounted to `/app/data` **inside** the container
3. Database written to `/app/data/database.sqlite` inside container → actually stored in the Docker volume on host
4. When container is updated/recreated, **same volume is mounted** → database persists!

### How Balena Does It

On actual balena devices:
```bash
# On host: /mnt/data/resin-data/balena-supervisor/
# Bind mounted into container at: /data/
# Database path: /data/database.sqlite (inside container)
# → Actually stored on host persistent partition
```

Balena uses:
- **Host partition**: `/mnt/data` (persistent partition on SD card/disk)
- **Bind mount**: Host directory → container `/data`
- **Result**: Database survives supervisor updates

### Testing Persistence

1. **Start container**:
   ```bash
   docker-compose up -d
   ```

2. **Add some data**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/state/target \
     -H "Content-Type: application/json" \
     -d '{"apps": {"1001": {...}}}'
   ```

3. **Update container** (simulate supervisor update):
   ```bash
   docker-compose down
   docker-compose build
   docker-compose up -d
   ```

4. **Check data persisted**:
   ```bash
   curl http://localhost:3000/api/v1/state/target
   # Should show the same target state you set before!
   ```

### Inspecting the Volume

```bash
# List all volumes
docker volume ls

# Inspect the volume
docker volume inspect standalone-application-manager_container-manager-data

# See where it's actually stored on host
docker volume inspect standalone-application-manager_container-manager-data \
  | grep Mountpoint
# Example output: "Mountpoint": "/var/lib/docker/volumes/standalone-application-manager_container-manager-data/_data"

# View database on host (requires root)
sudo ls -la /var/lib/docker/volumes/standalone-application-manager_container-manager-data/_data/
```

### Backup and Restore

**Backup:**
```bash
# Create backup of the volume
docker run --rm \
  -v standalone-application-manager_container-manager-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/container-manager-backup.tar.gz -C /data .
```

**Restore:**
```bash
# Restore from backup
docker run --rm \
  -v standalone-application-manager_container-manager-data:/data \
  -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/container-manager-backup.tar.gz"
```

### Alternative: Bind Mount (Development)

For development, you might prefer a bind mount to see the database directly:

```yaml
services:
  container-manager:
    volumes:
      - ./data:/app/data  # Bind mount local directory
```

**Pros**: Easy to inspect/backup/edit
**Cons**: Not portable between hosts, requires specific host directory structure

## How It Works

1. **On Startup**: 
   - Database initialized with `db.initialized()`
   - Migrations run automatically
   - Target state loaded from last snapshot
   - Current state synced from Docker (if using real Docker)

2. **When Setting Target State**:
   - State saved to `stateSnapshot` table with type='target'
   - Event emitted for listeners

3. **After Reconciliation**:
   - Current state saved to `stateSnapshot` table with type='current'
   - Provides audit trail of state changes

## Migrations

Migrations are in `src/migrations/` and run automatically on startup using Knex.js.

To create a new migration:
```bash
npx knex migrate:make <migration_name>
```

## Example: State Persistence

```typescript
import ContainerManager from './container-manager';
import * as db from './db';

// Initialize database
await db.initialized();

// Create manager
const manager = new ContainerManager(true);
await manager.init(); // Loads persisted target state

// Set target state
await manager.setTarget({
	apps: {
		1001: {
			appId: 1001,
			appName: 'Web Server',
			services: [{ ... }]
		}
	}
});

// Target state is now persisted!
// If you restart, it will be loaded automatically
```

## Benefits Over In-Memory State

✅ **Persistence**: State survives restarts
✅ **Audit Trail**: State history for debugging
✅ **Recovery**: Can recover from crashes
✅ **Migrations**: Schema evolution support
✅ **Queries**: Can query historical state

## Compatibility with Balena

This implementation is inspired by balena-supervisor's database design but simplified:
- Uses same tools (Knex.js + SQLite3)
- Similar table structure
- Compatible migration system
- Can be extended with balena-specific features

## Database Tools

View the database:
```bash
sqlite3 data/database.sqlite
```

Query examples:
```sql
-- List all apps
SELECT * FROM app;

-- List all services
SELECT * FROM service;

-- View recent state changes
SELECT type, createdAt FROM stateSnapshot ORDER BY createdAt DESC LIMIT 10;
```

## Docker Persistence

When running in Docker, mount a volume to persist the database:
```yaml
volumes:
  - ./data:/app/data  # Persist database
```

Or in docker run:
```bash
docker run -v $(pwd)/data:/app/data container-manager
```

## Environment Variables

- `DATABASE_PATH`: Custom database file location (default: `./data/database.sqlite`)
- `USE_REAL_DOCKER`: Use real Docker vs simulation (default: `false`)

## Future Enhancements

Possible additions inspired by balena-supervisor:
- [ ] Image cache management
- [ ] Service dependency tracking
- [ ] Update lock mechanism
- [ ] Configuration snapshots
- [ ] API secret storage
