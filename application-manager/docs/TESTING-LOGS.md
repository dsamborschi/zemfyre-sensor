# Testing Automatic Log Collection

## Quick Test Guide

The logging system now **automatically attaches** to container logs when they start. No manual attachment needed!

## Test Steps

### 1. Start Container-Manager with Real Docker

```bash
USE_REAL_DOCKER=true npm run dev
```

You should see:
```
✅ Database initialized
✅ Log backend initialized
✅ ContainerManager initialized
✅ Log monitor initialized
✅ Log monitor attached to ContainerManager
📝 Attaching logs to existing containers...
✅ Auto-reconciliation enabled (30000ms interval)
✅ Server initialization complete
```

### 2. Deploy a Container

```bash
curl -X POST http://localhost:3000/api/v1/apps/1001 \
  -H "Content-Type: application/json" \
  -d '{
    "appId": 1001,
    "appName": "nginx-test",
    "services": [{
      "serviceId": 1,
      "serviceName": "web",
      "imageName": "nginx:alpine",
      "ports": ["8085:80"]
    }]
  }'
```

You should see in the container-manager logs:
```
📝 Attached logs: web (abc123...)
```

### 3. Generate Some Logs

```bash
# Access nginx to generate access logs
curl http://localhost:8085/
curl http://localhost:8085/favicon.ico
curl http://localhost:8085/nonexistent
```

### 4. Check Logs via API

```bash
# Get all logs
curl http://localhost:3000/api/v1/logs | jq .

# Get log count
curl http://localhost:3000/api/v1/logs/count

# Get logs for web service
curl "http://localhost:3000/api/v1/logs?serviceName=web" | jq .

# Get last 10 logs
curl "http://localhost:3000/api/v1/logs?limit=10" | jq -r '.logs[] | "\(.timestamp | todate) [\(.level)] \(.message)"'
```

## Expected Results

After accessing nginx a few times, you should see logs like:

```json
{
  "count": 5,
  "logs": [
    {
      "id": "log-1",
      "message": "/docker-entrypoint.sh: Configuration complete; ready for start up",
      "timestamp": 1696195200000,
      "level": "info",
      "source": {
        "type": "container",
        "name": "web"
      },
      "serviceId": 1,
      "serviceName": "web",
      "containerId": "abc123...",
      "isStdErr": false,
      "isSystem": false
    },
    {
      "message": "172.17.0.1 - - [01/Oct/2025:12:00:01 +0000] \"GET / HTTP/1.1\" 200 615",
      "timestamp": 1696195201000,
      "level": "info",
      "source": {
        "type": "container",
        "name": "web"
      },
      "serviceId": 1,
      "serviceName": "web",
      "containerId": "abc123...",
      "isStdErr": false
    }
  ]
}
```

## What Changed

### Before
- ❌ Logs not collected automatically
- ❌ Had to manually attach: `POST /api/v1/logs/:containerId/attach`
- ❌ `curl /api/v1/logs` returned `count: 0`

### Now
- ✅ Logs automatically collected when container starts
- ✅ Existing containers attached on startup
- ✅ `curl /api/v1/logs` returns actual logs
- ✅ No manual attachment needed!

## How It Works

1. **On startup**: Container-manager finds any running containers and attaches to their logs
2. **On container start**: When a new container starts, logs are automatically attached
3. **Continuous streaming**: Logs stream in real-time from container stdout/stderr
4. **Stored locally**: Logs saved in memory (10,000 max) and files (`data/logs/`)

## Troubleshooting

### Still seeing count: 0?

1. **Check you're using real Docker**:
   ```bash
   USE_REAL_DOCKER=true npm run dev
   ```

2. **Check log monitor initialized**:
   Look for this in startup logs:
   ```
   ✅ Log monitor initialized
   ✅ Log monitor attached to ContainerManager
   ```

3. **Check container is running**:
   ```bash
   docker ps
   ```

4. **Check attachment happened**:
   Look for this in logs:
   ```
   📝 Attached logs: web (abc123...)
   ```

5. **Generate logs manually**:
   ```bash
   # Make the container output something
   docker exec <container-id> echo "test log message"
   
   # Then check
   curl http://localhost:3000/api/v1/logs
   ```

### Container logs but no API logs?

The container might not be outputting anything yet. Try:
```bash
# Access the service
curl http://localhost:8085/

# Or exec a command
docker exec <container-id> ls /

# Then check logs
curl http://localhost:3000/api/v1/logs
```

## Example Full Test

```bash
# Terminal 1: Start container-manager
cd standalone-application-manager
USE_REAL_DOCKER=true npm run dev

# Terminal 2: Deploy and test
# Deploy nginx
curl -X POST http://localhost:3000/api/v1/apps/1001 \
  -d '{"appId":1001,"appName":"nginx","services":[{"serviceId":1,"serviceName":"web","imageName":"nginx:alpine","ports":["8085:80"]}]}'

# Wait a few seconds for startup
sleep 5

# Generate traffic
for i in {1..10}; do curl -s http://localhost:8085/ > /dev/null; done

# Check logs
curl http://localhost:3000/api/v1/logs | jq .

# Watch logs in real-time (poll every 2s)
watch -n 2 'curl -s "http://localhost:3000/api/v1/logs?serviceName=web&limit=10" | jq -r ".logs[] | \"\(.timestamp | todate) \(.message[0:80])\""'
```

## Success!

If you see logs appearing, the automatic log collection is working! 🎉

The logs will include:
- Container startup messages
- HTTP access logs (if web service)
- Application output
- Error messages

All automatically collected without any manual attachment! 📝
