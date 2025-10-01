# Database Persistence Strategy

## TL;DR

✅ **Database persists across container updates** using Docker named volumes, just like balena-supervisor!

## How It Works

```
┌─────────────────────────────────────────┐
│  Container (can be replaced/updated)    │
│  ┌────────────────────────────────────┐ │
│  │ /app/data/database.sqlite          │ │
│  │         ↓                          │ │
│  │    (mounted from volume)           │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
                ↓ (Docker volume mount)
┌─────────────────────────────────────────┐
│  Docker Host (persists across updates)  │
│  ┌────────────────────────────────────┐ │
│  │ Named Volume:                      │ │
│  │ container-manager-data             │ │
│  │                                    │ │
│  │ Actual location on host:           │ │
│  │ /var/lib/docker/volumes/           │ │
│  │   .../container-manager-data/_data │ │
│  │                                    │ │
│  │ → database.sqlite (persisted!)     │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## Configuration

**docker-compose.yml:**
```yaml
services:
  container-manager:
    volumes:
      - container-manager-data:/app/data  # This is the key!

volumes:
  container-manager-data:  # Named volume = persistent
    driver: local
```

## What Happens on Update

1. **Before Update:**
   - Container running with volume mounted
   - Database at `/app/data/database.sqlite` (inside container)
   - Actually stored in Docker volume on host

2. **During Update:**
   ```bash
   docker-compose down      # Stop old container
   docker-compose build     # Build new image
   docker-compose up -d     # Start new container
   ```

3. **After Update:**
   - New container starts
   - **Same volume** mounted to `/app/data`
   - Database still there with all data intact!
   - Target state automatically restored from database

## Comparison with Balena

| Aspect | Balena Supervisor | Your Container-Manager |
|--------|-------------------|------------------------|
| **Storage Type** | Host partition bind mount | Docker named volume |
| **Host Path** | `/mnt/data/resin-data/balena-supervisor/` | `/var/lib/docker/volumes/.../` |
| **Container Path** | `/data/` | `/app/data/` |
| **Database Path** | `/data/database.sqlite` | `/app/data/database.sqlite` |
| **Persists Updates** | ✅ Yes | ✅ Yes |
| **Managed By** | balenaOS | Docker volume driver |

## Testing Persistence

```bash
# 1. Start and add data
docker-compose up -d
curl -X POST http://localhost:3000/api/v1/state/target -d '{...}'

# 2. Simulate update
docker-compose down
docker-compose up -d

# 3. Verify data persisted
curl http://localhost:3000/api/v1/state/target
# ✅ Target state still there!
```

## Commands

```bash
# View volume info
docker volume inspect standalone-application-manager_container-manager-data

# Backup volume
docker run --rm -v standalone-application-manager_container-manager-data:/data \
  -v $(pwd):/backup alpine tar czf /backup/db-backup.tar.gz -C /data .

# Restore volume
docker run --rm -v standalone-application-manager_container-manager-data:/data \
  -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/db-backup.tar.gz"

# Remove volume (caution: deletes database!)
docker-compose down -v
```

## Why This Works

1. **Docker volumes** live on the host filesystem, outside containers
2. Containers can be **destroyed/recreated** without affecting volumes
3. **Same volume** can be mounted to new container versions
4. This is **exactly how balena handles persistence**, just using Docker's native volume system instead of direct host bind mounts

## Benefits

✅ **Automatic**: No manual backup/restore needed
✅ **Reliable**: Managed by Docker
✅ **Portable**: Works on any Docker host
✅ **Production-Ready**: Same pattern as balena
✅ **Easy Updates**: Just rebuild and restart, data persists!
