# Volume Quick Reference

## Volume Format

### Named Volumes (Managed)
```
volumeName:/container/path
```
**Examples**:
- `data:/var/lib/data`
- `config:/etc/app/config`
- `pgdata:/var/lib/postgresql/data`
- `redis-data:/data`

**Result**: Docker volume `{appId}_{volumeName}` with labels:
- `iotistic.managed=true`
- `iotistic.app-id={appId}`

### Bind Mounts (Not Managed)
```
/host/path:/container/path
```
**Examples**:
- `/opt/config:/etc/app/config`
- `/var/log/app:/var/log`
- `/data/uploads:/app/uploads`

**Result**: Direct mount (no Docker volume created, not reconciled)

---

## Docker Commands

### List Managed Volumes
```bash
docker volume ls --filter label=iotistic.managed=true
```

### Inspect Volume
```bash
docker volume inspect {appId}_{volumeName}
```

### Check Container Mounts
```bash
docker inspect <container> | grep -A 10 Mounts
```

### Remove Volume Manually
```bash
docker volume rm {appId}_{volumeName}
```

---

## Common Use Cases

### PostgreSQL Database
```json
{
  "serviceName": "postgres",
  "imageName": "postgres:16-alpine",
  "config": {
    "image": "postgres:16-alpine",
    "volumes": ["pgdata:/var/lib/postgresql/data"],
    "environment": {
      "POSTGRES_PASSWORD": "secret"
    }
  }
}
```

### Redis Cache
```json
{
  "serviceName": "redis",
  "imageName": "redis:alpine",
  "config": {
    "image": "redis:alpine",
    "volumes": ["redis-data:/data"]
  }
}
```

### Node.js App with Config Bind Mount
```json
{
  "serviceName": "app",
  "imageName": "node:20-alpine",
  "config": {
    "image": "node:20-alpine",
    "volumes": [
      "app-data:/app/data",
      "/opt/app-config:/app/config:ro"
    ]
  }
}
```

---

## UI Colors

- **Ports**: Blue (primary)
- **Networks**: Green (success)
- **Volumes**: Orange (warning) ⚠️

---

## Reconciliation Order

1. Download images
2. **Create volumes** ← Before networks
3. Create networks
4. Stop old containers
5. Remove old containers
6. Start new containers
7. Remove old networks
8. **Remove old volumes** ← After networks

---

## Testing Quick Commands

```bash
# Deploy test service
curl -X POST http://localhost:3002/api/v1/state/target \
  -H "Content-Type: application/json" \
  -d '{
    "apps": {
      "1234": {
        "appId": 1234,
        "appName": "test",
        "services": [{
          "serviceId": 1,
          "serviceName": "test",
          "imageName": "busybox:latest",
          "appId": 1234,
          "appName": "test",
          "config": {
            "image": "busybox:latest",
            "volumes": ["testdata:/data"]
          }
        }]
      }
    }
  }'

# Apply changes
curl -X POST http://localhost:3002/api/v1/state/apply

# Verify volume created
docker volume ls --filter label=iotistic.managed=true

# Inspect volume
docker volume inspect 1234_testdata

# Check labels
docker volume inspect 1234_testdata | grep -A 5 Labels
```

---

## Troubleshooting

### Volume Not Created
1. Check logs: `docker-compose logs -f application-manager`
2. Verify format: `volumeName:/path` (no leading `/`)
3. Check reconciliation: Look for `createVolume` step

### Volume Not Removed
1. Check if containers using it are stopped
2. Verify volume has `iotistic.managed=true` label
3. Check reconciliation: Look for `removeVolume` step

### Data Lost
1. Named volumes persist across container restarts
2. Check volume still exists: `docker volume ls`
3. Verify mount path in container config
4. Ensure volume name didn't change (appId prefix)

### Bind Mount Not Working
1. Host path must exist before starting container
2. Check permissions on host directory
3. Use absolute paths starting with `/`
4. Remember: Bind mounts are NOT reconciled

---

## API Examples

### Get Current State
```bash
curl http://localhost:3002/api/v1/state/current
```

### Get Target State
```bash
curl http://localhost:3002/api/v1/state/target
```

### Check Reconciliation Status
```bash
curl http://localhost:3002/api/v1/state/status
```

---

## Implementation Status

✅ Phase 1: Backend Setup  
✅ Phase 2: Backend Reconciliation  
✅ Phase 3: Frontend UI  
⏹️ Phase 4: Testing  
⏹️ Phase 5: Documentation  

**Ready for end-to-end testing!** 🚀
