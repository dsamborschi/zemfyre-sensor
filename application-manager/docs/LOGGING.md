# Container Logging System

The container-manager includes a comprehensive logging system for collecting, storing, and retrieving logs from Docker containers and system events.

## Overview

The logging system is inspired by balena-supervisor's logging architecture but simplified for standalone use:

- **Local storage**: Logs stored in memory + optional file persistence
- **Container log streaming**: Automatic collection from container stdout/stderr
- **System event logging**: Track manager events, errors, and state changes
- **REST API access**: Query logs via HTTP endpoints with filtering
- **Automatic cleanup**: Old logs automatically removed after 24 hours

## Architecture

```
┌──────────────┐
│  Containers  │ stdout/stderr
└──────┬───────┘
       │
       ▼
┌─────────────────────┐
│ ContainerLogMonitor │  (Dockerode log streaming)
└──────┬──────────────┘
       │
       ▼
┌──────────────────┐
│ LocalLogBackend  │  (In-memory + file storage)
└──────┬───────────┘
       │
       ▼
┌──────────────┐
│  REST API    │  (Query & filter logs)
└──────────────┘
```

## Features

### ✅ Container Log Streaming
- Automatically attaches to container stdout/stderr
- Demultiplexes Docker's stream format
- Distinguishes between stdout and stderr
- Preserves timestamps

### ✅ Log Storage
- **In-memory buffer**: Fast access to recent logs (default: 10,000 messages)
- **File persistence**: Optional JSON file storage with rotation
- **Automatic cleanup**: Removes logs older than 24 hours
- **Efficient filtering**: Query by service, container, level, time range

### ✅ Log Levels
- `debug` - Detailed debugging information
- `info` - General informational messages (default for stdout)
- `warn` - Warning messages
- `error` - Error messages (default for stderr)

### ✅ Log Sources
- `container` - Logs from Docker containers
- `system` - System events (startup, shutdown, errors)
- `manager` - Container-manager events (reconciliation, state changes)

## API Endpoints

### GET /api/v1/logs

Get container and system logs with optional filtering.

**Query Parameters:**
- `serviceId` - Filter by service ID
- `serviceName` - Filter by service name
- `containerId` - Filter by container ID
- `level` - Filter by log level (debug/info/warn/error)
- `sourceType` - Filter by source type (container/system/manager)
- `since` - Timestamp (ms) - logs after this time
- `until` - Timestamp (ms) - logs before this time
- `limit` - Maximum number of logs to return

**Examples:**

```bash
# Get all logs
curl http://localhost:3000/api/v1/logs

# Get last 100 logs
curl "http://localhost:3000/api/v1/logs?limit=100"

# Get logs for specific service
curl "http://localhost:3000/api/v1/logs?serviceName=web&limit=50"

# Get error logs only
curl "http://localhost:3000/api/v1/logs?level=error"

# Get logs from last hour
SINCE=$(($(date +%s)*1000 - 3600000))
curl "http://localhost:3000/api/v1/logs?since=$SINCE"

# Get container logs only
curl "http://localhost:3000/api/v1/logs?sourceType=container"
```

**Response:**

```json
{
  "count": 3,
  "logs": [
    {
      "id": "log-1",
      "message": "Server started on port 8080",
      "timestamp": 1696195200000,
      "level": "info",
      "source": {
        "type": "container",
        "name": "web"
      },
      "serviceId": 1,
      "serviceName": "web",
      "containerId": "abc123",
      "isStdErr": false,
      "isSystem": false
    },
    {
      "message": "Error connecting to database",
      "timestamp": 1696195201000,
      "level": "error",
      "source": {
        "type": "container",
        "name": "api"
      },
      "serviceId": 2,
      "serviceName": "api",
      "containerId": "def456",
      "isStdErr": true,
      "isSystem": false
    }
  ]
}
```

### GET /api/v1/logs/count

Get total number of stored logs.

**Example:**

```bash
curl http://localhost:3000/api/v1/logs/count
```

**Response:**

```json
{
  "count": 1247
}
```

### POST /api/v1/logs/:containerId/attach

Manually attach to a container's logs (normally done automatically).

**Body:**

```json
{
  "serviceId": 1,
  "serviceName": "web"
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/v1/logs/abc123/attach \
  -H "Content-Type: application/json" \
  -d '{"serviceId": 1, "serviceName": "web"}'
```

**Response:**

```json
{
  "message": "Successfully attached to container logs",
  "containerId": "abc123",
  "serviceName": "web"
}
```

### DELETE /api/v1/logs/:containerId/attach

Detach from a container's logs.

**Example:**

```bash
curl -X DELETE http://localhost:3000/api/v1/logs/abc123/attach
```

**Response:**

```json
{
  "message": "Successfully detached from container logs",
  "containerId": "abc123"
}
```

## Configuration

The logging system is configured during server initialization:

```typescript
const logBackend = new LocalLogBackend({
  maxLogs: 10000,                      // Max logs in memory
  maxAge: 24 * 60 * 60 * 1000,        // 24 hours
  enableFilePersistence: true,         // Enable file storage
  logDir: './data/logs',               // Log directory
  maxFileSize: 10 * 1024 * 1024,      // 10MB per file
});
```

### Environment Variables

```bash
# Enable real Docker (logging only works in this mode)
USE_REAL_DOCKER=true

# Custom log directory
LOG_DIR=./data/logs
```

## Usage Examples

### Example 1: Monitor Container Logs in Real-Time

```bash
# Terminal 1: Start container-manager
USE_REAL_DOCKER=true npm run dev

# Terminal 2: Deploy an app
curl -X POST http://localhost:3000/api/v1/apps/1001 \
  -H "Content-Type: application/json" \
  -d '{
    "appId": 1001,
    "appName": "nginx-app",
    "services": [{
      "serviceId": 1,
      "serviceName": "web",
      "imageName": "nginx:alpine"
    }]
  }'

# Terminal 3: Watch logs (poll every 2 seconds)
while true; do
  clear
  curl -s "http://localhost:3000/api/v1/logs?serviceName=web&limit=20" | jq '.logs[] | "\(.timestamp | todate) [\(.level)] \(.message)"'
  sleep 2
done
```

### Example 2: Debug Failing Container

```bash
# Get error logs from last 5 minutes
SINCE=$(($(date +%s)*1000 - 300000))
curl "http://localhost:3000/api/v1/logs?level=error&since=$SINCE" | jq .

# Get all logs for specific container
curl "http://localhost:3000/api/v1/logs?containerId=abc123" | jq .
```

### Example 3: Export Logs to File

```bash
# Export all logs from today
TODAY=$(date -d "today 00:00:00" +%s000)
curl "http://localhost:3000/api/v1/logs?since=$TODAY" | jq . > logs-$(date +%Y%m%d).json
```

### Example 4: Monitor System Events

```bash
# Get system and manager logs
curl "http://localhost:3000/api/v1/logs?sourceType=system&sourceType=manager" | jq '.logs[] | "\(.timestamp | todate) \(.message)"'
```

## Automatic Log Attachment

When using real Docker (`USE_REAL_DOCKER=true`), the container-manager automatically attaches to container logs when:

1. A new container is started
2. The container-manager starts and finds running containers
3. Container is restarted during reconciliation

You don't need to manually attach - it happens automatically!

## Log File Structure

When file persistence is enabled, logs are stored in:

```
data/logs/
├── container-manager-1696195200000.log
├── container-manager-1696205200000.log
└── container-manager-1696215200000.log
```

Each file contains newline-delimited JSON (NDJSON):

```json
{"id":"log-1","message":"Container started","timestamp":1696195200000,...}
{"id":"log-2","message":"HTTP request received","timestamp":1696195201000,...}
```

### Log Rotation

- New log file created when current file exceeds 10MB
- Old files automatically deleted after 24 hours
- Rotation happens automatically during writes

## Programmatic Usage

You can use the logging system directly in your code:

```typescript
import { LocalLogBackend, ContainerLogMonitor } from './src/logging';

// Create log backend
const logBackend = new LocalLogBackend({
  maxLogs: 5000,
  enableFilePersistence: true,
});

await logBackend.initialize();

// Create log monitor
const logMonitor = new ContainerLogMonitor(docker, logBackend);

// Attach to container
await logMonitor.attach({
  containerId: 'abc123',
  serviceId: 1,
  serviceName: 'web',
  follow: true,
  stdout: true,
  stderr: true,
});

// Log system message
await logMonitor.logSystemMessage('Application started', 'info');

// Log manager event
await logMonitor.logManagerEvent('reconciliation-complete', {
  apps: 3,
  services: 7,
}, 'info');

// Query logs
const logs = await logBackend.getLogs({
  serviceName: 'web',
  level: 'error',
  limit: 100,
});

// Cleanup old logs
const removed = await logBackend.cleanup(24 * 60 * 60 * 1000); // 24 hours
console.log(`Removed ${removed} old logs`);
```

## Performance Considerations

### Memory Usage

- Default: 10,000 logs × ~500 bytes = ~5MB
- Adjust `maxLogs` based on available memory
- File persistence reduces memory pressure

### Disk Usage

- Log files: ~10MB per file
- Automatic cleanup prevents unlimited growth
- Compression possible by gzipping old files

### Network Usage

- Logs streamed from Docker daemon
- Minimal overhead (only active containers)
- No cloud upload (local only)

## Comparison with Balena

| Feature | Balena Supervisor | Container-Manager |
|---------|------------------|-------------------|
| Log collection | ✅ journald + dockerode | ✅ dockerode only |
| Cloud streaming | ✅ gzip + HTTPS | ❌ Local only |
| Local storage | ✅ In-memory | ✅ In-memory + files |
| Log backend | ✅ Pluggable | ✅ Local backend |
| API access | ✅ Device API | ✅ REST API |
| Filtering | ✅ Yes | ✅ Yes |
| Real-time | ✅ WebSocket | ❌ Polling only |
| Compression | ✅ gzip | ❌ None |

## Future Enhancements

Potential improvements for future versions:

1. **WebSocket streaming** - Real-time log push instead of polling
2. **Cloud backend** - Stream logs to remote server
3. **Log compression** - Gzip old log files
4. **Advanced filtering** - Regex pattern matching
5. **Log aggregation** - Combine logs from multiple devices
6. **Structured logging** - Parse JSON logs from containers
7. **Log retention policies** - Per-service retention settings
8. **Log forwarding** - Forward to syslog, Loki, Elasticsearch, etc.

## Troubleshooting

### Logs not appearing

**Problem**: Container logs not showing up

**Solutions**:
- Ensure `USE_REAL_DOCKER=true` is set
- Check container is running: `docker ps`
- Verify log monitor initialized: Check server startup logs
- Try manual attach: `POST /api/v1/logs/:containerId/attach`

### High memory usage

**Problem**: Container-manager using too much memory

**Solutions**:
- Reduce `maxLogs` setting (e.g., from 10000 to 5000)
- Enable file persistence to offload to disk
- Reduce `maxAge` for more frequent cleanup
- Filter queries to return fewer logs

### Log files growing too large

**Problem**: `data/logs` directory filling up disk

**Solutions**:
- Reduce `maxFileSize` for more frequent rotation
- Reduce `maxAge` for faster cleanup
- Manually delete old log files
- Set up external log rotation (logrotate)

### Missing logs after restart

**Problem**: Logs disappear when container-manager restarts

**Solutions**:
- Enable file persistence: `enableFilePersistence: true`
- Logs are not persisted in database (by design)
- For permanent history, use external logging system

## Security Considerations

### Log Sensitivity

- Container logs may contain sensitive data
- No authentication required for log API (add if needed)
- Logs stored unencrypted on disk
- Consider data privacy regulations

### Recommendations

1. **Restrict API access**: Add authentication to log endpoints
2. **Sanitize logs**: Remove sensitive data before logging
3. **Encrypt files**: Use encrypted filesystem for log directory
4. **Access control**: Limit who can read `/data/logs`
5. **Audit logging**: Track who accesses logs

## Best Practices

1. **Use appropriate log levels**:
   - `debug` - Development only
   - `info` - Normal operations
   - `warn` - Potential issues
   - `error` - Actual failures

2. **Structure your logs**:
   ```javascript
   console.log(JSON.stringify({
     event: 'http_request',
     method: 'GET',
     path: '/api/users',
     duration: 45,
     status: 200
   }));
   ```

3. **Set reasonable limits**:
   - Don't log every single request in production
   - Use sampling for high-frequency events
   - Aggregate similar messages

4. **Monitor log volume**:
   ```bash
   # Check log count
   curl http://localhost:3000/api/v1/logs/count
   ```

5. **Regular cleanup**:
   - Built-in cleanup runs hourly
   - Manual cleanup if needed
   - Archive important logs before cleanup

## Examples on Raspberry Pi

### Setup

```bash
# SSH into your Pi
ssh pi@raspberrypi.local

# Navigate to container-manager
cd /opt/container-manager

# Start with logging enabled
USE_REAL_DOCKER=true npm run dev
```

### Deploy and Monitor

```bash
# Deploy nginx
curl -X POST http://localhost:3000/api/v1/apps/1001 \
  -H "Content-Type: application/json" \
  -d '{
    "appId": 1001,
    "appName": "nginx",
    "services": [{
      "serviceId": 1,
      "serviceName": "web",
      "imageName": "nginx:alpine",
      "ports": ["8085:80"]
    }]
  }'

# Watch logs
watch -n 2 'curl -s "http://localhost:3000/api/v1/logs?serviceName=web&limit=10" | jq -r ".logs[] | \"\(.timestamp | todate) \(.message)\""'
```

---

**Happy logging! 📝**

The logging system is now ready to track everything happening in your containers and container-manager!
