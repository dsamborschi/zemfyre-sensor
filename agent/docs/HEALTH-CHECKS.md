# Kubernetes-Style Health Checks

> **Automatic container health monitoring and recovery for IoT edge devices**

## Table of Contents

- [Overview](#overview)
- [Health Check Types](#health-check-types)
- [Configuration](#configuration)
- [Check Methods](#check-methods)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

Health checks (also called **probes** in Kubernetes) are automated mechanisms to monitor whether containers are running properly and ready to serve traffic. The agent supports three types of health probes:

### Probe Types

| Probe Type | Purpose | Action on Failure |
|------------|---------|-------------------|
| **Liveness** | Is the container alive? | **Restart container** |
| **Readiness** | Is the container ready for traffic? | **Mark as not ready** (don't restart) |
| **Startup** | Has the container finished starting? | Delay liveness/readiness checks |

### Check Methods

- **HTTP**: Send HTTP GET request, check status code
- **TCP**: Attempt TCP connection to port
- **Exec**: Run command inside container, check exit code

---

## Health Check Types

### 1. Liveness Probe

**Purpose**: Detect when a container is in a broken state and needs to be restarted.

**Use Cases**:
- Application deadlock (stuck threads, infinite loops)
- Memory leak causing unresponsiveness
- Corrupted internal state
- Critical service failure

**Behavior**:
- Runs periodically after container starts
- If fails `failureThreshold` times → **container is automatically restarted**
- Disabled until startup probe succeeds (if configured)

**Example Scenario**: Node-RED becomes unresponsive due to a flow deadlock. The liveness probe detects this and automatically restarts the container.

### 2. Readiness Probe

**Purpose**: Detect when a container is temporarily unable to serve requests.

**Use Cases**:
- Still loading large dataset into memory
- Waiting for database connection
- Cache warming up
- Temporary overload
- Dependency not yet ready

**Behavior**:
- Runs periodically after container starts
- If fails `failureThreshold` times → **marked as "not ready"**
- Container keeps running (not restarted)
- Can transition back to "ready" when checks pass

**Example Scenario**: InfluxDB is running but still replaying WAL (Write-Ahead Log) from disk. Readiness probe marks it as "not ready" until replay completes.

### 3. Startup Probe

**Purpose**: Protect slow-starting containers from premature liveness checks.

**Use Cases**:
- Applications with long initialization time
- Database recovery operations
- Large file loading
- Complex startup sequences

**Behavior**:
- Runs until it succeeds OR reaches max attempts
- Disables liveness/readiness probes until startup succeeds
- Allows more generous timeout for startup phase
- Marks container as "started" when successful

**Example Scenario**: Grafana takes 30 seconds to initialize its database. Startup probe gives it 60 seconds (6 checks × 10s) before enabling liveness checks.

---

## Configuration

### Basic Structure

Health probes are configured in the `config` section of each service:

```json
{
  "apps": {
    "1": {
      "id": 1,
      "name": "my-app",
      "services": {
        "my-service": {
          "id": "my-service",
          "image": "my-image:latest",
          "config": {
            "ports": ["8080:8080"],
            "livenessProbe": { /* probe config */ },
            "readinessProbe": { /* probe config */ },
            "startupProbe": { /* probe config */ }
          }
        }
      }
    }
  }
}
```

### Probe Parameters

All probe types support these common parameters:

```typescript
{
  "type": "http" | "tcp" | "exec",
  
  // Timing
  "initialDelaySeconds": 10,   // Wait before first check (default: 0)
  "periodSeconds": 30,          // How often to check (default: 10)
  "timeoutSeconds": 5,          // Check timeout (default: 1)
  
  // Thresholds
  "successThreshold": 1,        // Consecutive successes to mark healthy (default: 1)
  "failureThreshold": 3,        // Consecutive failures to mark unhealthy (default: 3)
  
  // Method-specific fields (see below)
}
```

**Parameter Guidelines**:

- **initialDelaySeconds**: Use 0 for startup probe, 10-30s for liveness/readiness
- **periodSeconds**: 
  - Liveness: 30-60s (don't check too often)
  - Readiness: 5-10s (detect quickly)
  - Startup: 5-10s (check frequently during startup)
- **timeoutSeconds**: 1-5s (shorter is better, but allow for network latency)
- **failureThreshold**: 
  - Liveness: 2-3 (restart quickly if truly broken)
  - Readiness: 2-3 (mark unready quickly)
  - Startup: 30-60 (allow many retries for slow starts)

---

## Check Methods

### HTTP Check

Sends an HTTP GET request to the container and checks the response status code.

```typescript
{
  "type": "http",
  "path": "/healthz",              // URL path to check
  "port": 8080,                    // Container port (internal)
  "scheme": "http",                // "http" or "https" (default: "http")
  "headers": {                     // Optional HTTP headers
    "X-Custom-Header": "value"
  },
  "expectedStatus": [200, 204],    // Expected status codes (default: 200-399)
  
  // Timing/thresholds
  "initialDelaySeconds": 15,
  "periodSeconds": 10,
  "timeoutSeconds": 3,
  "failureThreshold": 3
}
```

**Success Criteria**: HTTP response status code is in `expectedStatus` array (or 200-399 if not specified).

**Common Status Codes**:
- `200 OK`: Healthy
- `204 No Content`: Healthy (no body returned)
- `503 Service Unavailable`: Not ready (use for readiness)

**Best Practices**:
- Use a dedicated health endpoint (e.g., `/health`, `/healthz`, `/ping`)
- Keep health endpoint lightweight (no database queries unless checking DB health)
- Return `200` for healthy, `503` for temporarily unavailable

### TCP Check

Attempts to establish a TCP connection to the container on the specified port.

```typescript
{
  "type": "tcp",
  "port": 1883,                    // Container port to check
  
  // Timing/thresholds
  "initialDelaySeconds": 5,
  "periodSeconds": 30,
  "timeoutSeconds": 3,
  "failureThreshold": 3
}
```

**Success Criteria**: TCP connection succeeds (socket connects successfully).

**Best For**:
- Services without HTTP interfaces (MQTT, databases, etc.)
- Simple "is the port listening?" checks
- Minimal overhead

**Limitations**:
- Only checks if port is accepting connections
- Doesn't verify application logic is working

### Exec Check

Runs a command inside the container and checks the exit code.

```typescript
{
  "type": "exec",
  "command": [                     // Command to run inside container
    "mosquitto_sub",
    "-t", "$SYS/#",
    "-C", "1"
  ],
  
  // Timing/thresholds
  "initialDelaySeconds": 10,
  "periodSeconds": 30,
  "timeoutSeconds": 5,
  "failureThreshold": 3
}
```

**Success Criteria**: Command exits with code `0`.

**Best For**:
- Deep application-level checks
- Services without network interfaces
- Database queries, file existence checks

**Best Practices**:
- Keep commands fast (runs frequently!)
- Use absolute paths or ensure PATH is correct
- Return exit code 0 for success, non-zero for failure

**Example Commands**:
```bash
# Check file exists
["test", "-f", "/tmp/ready"]

# Check database connection
["pg_isready", "-h", "localhost", "-U", "postgres"]

# Check InfluxDB
["influx", "ping"]

# Check MQTT broker
["mosquitto_sub", "-t", "$SYS/#", "-C", "1"]
```

---

## Examples

### Example 1: Mosquitto (MQTT Broker)

```json
{
  "livenessProbe": {
    "type": "tcp",
    "port": 1883,
    "initialDelaySeconds": 10,
    "periodSeconds": 60,
    "timeoutSeconds": 3,
    "failureThreshold": 3
  },
  "readinessProbe": {
    "type": "exec",
    "command": ["mosquitto_sub", "-t", "$SYS/#", "-C", "1", "-W", "2"],
    "initialDelaySeconds": 5,
    "periodSeconds": 10,
    "timeoutSeconds": 5,
    "failureThreshold": 2
  }
}
```

**Explanation**:
- **Liveness**: TCP check ensures MQTT port is listening (simple, fast)
- **Readiness**: Exec check subscribes to system topic to verify broker is fully operational

### Example 2: Node-RED

```json
{
  "livenessProbe": {
    "type": "http",
    "path": "/",
    "port": 1880,
    "initialDelaySeconds": 30,
    "periodSeconds": 30,
    "timeoutSeconds": 10,
    "failureThreshold": 2
  },
  "readinessProbe": {
    "type": "http",
    "path": "/",
    "port": 1880,
    "initialDelaySeconds": 15,
    "periodSeconds": 10,
    "timeoutSeconds": 5,
    "failureThreshold": 2
  }
}
```

**Explanation**:
- **Liveness**: HTTP check to detect if Node-RED UI is responsive
- **Readiness**: Same check but with faster interval to detect temporary hangs
- **Quick restart**: `failureThreshold: 2` restarts quickly if Node-RED deadlocks

### Example 3: InfluxDB (Slow Startup)

```json
{
  "startupProbe": {
    "type": "http",
    "path": "/health",
    "port": 8086,
    "initialDelaySeconds": 0,
    "periodSeconds": 10,
    "timeoutSeconds": 5,
    "failureThreshold": 30
  },
  "livenessProbe": {
    "type": "http",
    "path": "/health",
    "port": 8086,
    "periodSeconds": 60,
    "timeoutSeconds": 5,
    "failureThreshold": 3
  },
  "readinessProbe": {
    "type": "http",
    "path": "/ping",
    "port": 8086,
    "periodSeconds": 10,
    "timeoutSeconds": 3,
    "failureThreshold": 2
  }
}
```

**Explanation**:
- **Startup**: Allows 5 minutes (30 × 10s) for InfluxDB to replay WAL and start
- **Liveness**: Once started, checks health less frequently (every 60s)
- **Readiness**: Checks `/ping` endpoint to ensure queries can be served

### Example 4: Grafana

```json
{
  "startupProbe": {
    "type": "http",
    "path": "/api/health",
    "port": 3000,
    "periodSeconds": 10,
    "failureThreshold": 30
  },
  "livenessProbe": {
    "type": "http",
    "path": "/api/health",
    "port": 3000,
    "periodSeconds": 60,
    "failureThreshold": 3
  },
  "readinessProbe": {
    "type": "http",
    "path": "/api/health",
    "port": 3000,
    "periodSeconds": 10,
    "failureThreshold": 2
  }
}
```

**Explanation**:
- **Startup**: Allows up to 5 minutes for Grafana to initialize
- **Liveness**: Checks health API every minute
- **Readiness**: Faster checks to detect when Grafana is serving requests

### Example 5: PostgreSQL

```json
{
  "livenessProbe": {
    "type": "exec",
    "command": ["pg_isready", "-h", "localhost", "-U", "postgres"],
    "initialDelaySeconds": 30,
    "periodSeconds": 30,
    "timeoutSeconds": 5,
    "failureThreshold": 3
  },
  "readinessProbe": {
    "type": "exec",
    "command": ["pg_isready", "-h", "localhost", "-U", "postgres"],
    "initialDelaySeconds": 10,
    "periodSeconds": 10,
    "timeoutSeconds": 5,
    "failureThreshold": 2
  }
}
```

**Explanation**:
- **Liveness**: Checks if PostgreSQL process is accepting connections
- **Readiness**: Same check but faster to detect when DB is ready after recovery

### Example 6: Custom Application

```json
{
  "startupProbe": {
    "type": "http",
    "path": "/startup",
    "port": 8080,
    "periodSeconds": 5,
    "failureThreshold": 60
  },
  "livenessProbe": {
    "type": "http",
    "path": "/health",
    "port": 8080,
    "periodSeconds": 15,
    "failureThreshold": 3
  },
  "readinessProbe": {
    "type": "http",
    "path": "/ready",
    "port": 8080,
    "periodSeconds": 5,
    "failureThreshold": 2
  }
}
```

**Explanation**:
- **Startup**: Custom `/startup` endpoint, allows 5 minutes to initialize
- **Liveness**: `/health` checks if app is alive (detect deadlocks)
- **Readiness**: `/ready` checks if app can handle requests (check dependencies)

---

## Best Practices

### 1. Choose the Right Probe Type

| Scenario | Recommended Probe |
|----------|-------------------|
| Fast-starting service | Liveness only |
| Slow-starting service (>30s) | Startup + Liveness |
| Service with dependencies | Startup + Liveness + Readiness |
| Stateless service | Liveness only |
| Stateful service (database) | All three probes |

### 2. Configure Appropriate Timeouts

**Too Short**:
- False positives (healthy container marked unhealthy)
- Unnecessary restarts
- Resource waste

**Too Long**:
- Slow detection of real failures
- Extended downtime

**Recommended**:
```json
{
  "initialDelaySeconds": 15,    // Give app time to start
  "periodSeconds": 30,           // Check every 30s
  "timeoutSeconds": 3,           // 3s timeout
  "failureThreshold": 3          // 3 failures = 90s to detect failure
}
```

### 3. Use Startup Probes for Slow Services

Without startup probe:
```
Container starts → Liveness immediately fails → Restart → Loop forever
```

With startup probe:
```
Container starts → Startup probe gives 5 min → Success → Liveness takes over
```

### 4. Health Endpoint Best Practices

**Good Health Endpoint**:
```javascript
// Fast, lightweight check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Check critical dependencies
app.get('/ready', async (req, res) => {
  try {
    await db.ping();  // Check database
    await mqtt.ping(); // Check MQTT
    res.status(200).send('Ready');
  } catch (err) {
    res.status(503).send('Not ready');
  }
});
```

**Bad Health Endpoint**:
```javascript
// DON'T: Heavy queries
app.get('/health', async (req, res) => {
  const count = await db.query('SELECT COUNT(*) FROM huge_table');
  res.send({ count });
});

// DON'T: External API calls
app.get('/health', async (req, res) => {
  await fetch('https://external-api.com/status');
  res.send('OK');
});
```

### 5. Test Health Checks

```bash
# Test HTTP check
curl http://container-ip:8080/health

# Test TCP check
nc -zv container-ip 1883

# Test exec check
docker exec container-id mosquitto_sub -t $SYS/# -C 1
```

### 6. Monitor Health Check Logs

The agent logs health check events:

```
[HealthCheck] mosquitto (088a258fc1b1) liveness probe: unknown → healthy
[HealthCheck] mosquitto startup completed
[HealthCheck] node-red liveness failed: HTTP timeout
[ContainerManager] Liveness probe failed for node-red, restarting container...
[HealthCheck] node-red (new-id-here) liveness probe: unknown → healthy
✅ Container restarted: node-red (new ID: 4f2a3b1c8e9d)
```

### 7. Resource Limits + Health Checks

Combine with resource limits for better reliability:

```json
{
  "config": {
    "resources": {
      "limits": {
        "cpu": "1",
        "memory": "512Mi"
      }
    },
    "livenessProbe": {
      "type": "http",
      "path": "/health",
      "port": 8080
    }
  }
}
```

---

## Troubleshooting

### Container Keeps Restarting

**Symptom**: Container enters restart loop

**Possible Causes**:
1. **Liveness probe too aggressive**: 
   - Solution: Increase `initialDelaySeconds`, `periodSeconds`, or `failureThreshold`
   
2. **Application genuinely broken**:
   - Solution: Check application logs, fix root cause

3. **Health endpoint slow**:
   - Solution: Optimize health endpoint, increase `timeoutSeconds`

**Debug**:
```bash
# Check container logs
docker logs container-id

# Check health check history
curl http://localhost:48484/v2/health

# Manually test health endpoint
docker exec container-id wget -O- http://localhost:8080/health
```

### Container Never Becomes Ready

**Symptom**: Readiness probe always fails

**Possible Causes**:
1. **Dependency not available**:
   - Solution: Check if database/MQTT broker is running

2. **Wrong port/path**:
   - Solution: Verify `port` and `path` in configuration

3. **initialDelaySeconds too short**:
   - Solution: Increase delay to allow startup time

**Debug**:
```bash
# Check if port is listening
docker exec container-id netstat -tlnp

# Test endpoint manually
docker exec container-id curl http://localhost:8080/ready
```

### Health Check Times Out

**Symptom**: Health check always times out

**Possible Causes**:
1. **Network configuration**:
   - Solution: Ensure container has correct network mode

2. **Firewall/routing**:
   - Solution: Check if port is accessible from agent

3. **Application too slow**:
   - Solution: Increase `timeoutSeconds` or optimize endpoint

**Debug**:
```bash
# Check network connectivity
docker exec container-id ping -c 1 google.com

# Check if service is listening
docker exec container-id ss -tlnp | grep :8080
```

### Startup Probe Never Succeeds

**Symptom**: Container marked as "not started" indefinitely

**Possible Causes**:
1. **failureThreshold too low**:
   - Solution: Increase `failureThreshold` (e.g., 60 for 10 minutes)

2. **Application startup genuinely failing**:
   - Solution: Check logs for errors

**Debug**:
```bash
# Monitor startup logs
docker logs -f container-id

# Check current health status
curl http://localhost:48484/v2/health | jq
```

---

## API Reference

### Get Container Health

```bash
GET http://localhost:48484/v2/health
```

**Response**:
```json
[
  {
    "containerId": "088a258fc1b1...",
    "serviceName": "mosquitto",
    "isLive": true,
    "isReady": true,
    "isStarted": true,
    "liveness": {
      "status": "healthy",
      "consecutiveSuccesses": 5,
      "consecutiveFailures": 0,
      "lastCheck": {
        "success": true,
        "message": "TCP connected",
        "timestamp": 1729776000000,
        "duration": 12
      }
    },
    "readiness": {
      "status": "healthy",
      "consecutiveSuccesses": 10,
      "consecutiveFailures": 0
    }
  }
]
```

---

## Summary

Health checks provide **automatic recovery** and **visibility** into container health:

✅ **Liveness Probe**: Restart broken containers automatically  
✅ **Readiness Probe**: Know when container is ready for traffic  
✅ **Startup Probe**: Protect slow-starting containers  
✅ **HTTP/TCP/Exec**: Flexible check methods  
✅ **Configurable Thresholds**: Fine-tune for your application  

**Next Steps**:
1. Add health checks to critical services (MQTT, databases)
2. Monitor agent logs for health events
3. Tune thresholds based on real-world behavior
4. Combine with resource limits for complete reliability

---

**Related Documentation**:
- [Resource Limits](./RESOURCE-LIMITS.md) - K8s-style CPU/memory limits
- [Container Manager](./README.md) - Container orchestration
- [Logging](../logging/README.md) - Container log monitoring
