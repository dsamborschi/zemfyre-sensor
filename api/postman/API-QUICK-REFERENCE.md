# Zemfyre Cloud API - Quick Reference

## 🔗 Base URL
```
http://localhost:3002
```

## 📋 Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/device/:uuid/state` | Device polling (ETag cached) |
| `PATCH` | `/api/v1/device/state` | Device state reporting |
| `POST` | `/api/v1/device/:uuid/logs` | Upload device logs |
| `GET` | `/api/v1/devices` | List all devices |
| `GET` | `/api/v1/devices?online=true` | Filter online devices |
| `GET` | `/api/v1/devices/:uuid` | Get device details |
| `DELETE` | `/api/v1/devices/:uuid` | Delete device |
| `GET` | `/api/v1/devices/:uuid/target-state` | Get target state |
| `POST` | `/api/v1/devices/:uuid/target-state` | Set target state |
| `DELETE` | `/api/v1/devices/:uuid/target-state` | Clear target state |
| `GET` | `/api/v1/devices/:uuid/current-state` | Get current state |
| `GET` | `/api/v1/devices/:uuid/logs` | Get device logs |
| `GET` | `/api/v1/devices/:uuid/metrics` | Get device metrics |

## 🔥 Most Common Operations

### Device Polling (Every 60s)
```bash
curl -H "If-None-Match: \"v1\"" \
  http://localhost:3002/api/v1/device/abc-123/state
```

### Report Device State
```bash
curl -X PATCH http://localhost:3002/api/v1/device/state \
  -H "Content-Type: application/json" \
  -d '{
    "abc-123": {
      "apps": {"node-red": {"status": "running"}},
      "cpu_usage": 25.5,
      "memory_usage": 512000000
    }
  }'
```

### Set Target State
```bash
curl -X POST http://localhost:3002/api/v1/devices/abc-123/target-state \
  -H "Content-Type: application/json" \
  -d '{
    "apps": {
      "node-red": {
        "image": "nodered/node-red:latest",
        "ports": ["1880:1880"]
      }
    },
    "config": {"hostname": "sensor-001"}
  }'
```

### List Devices
```bash
curl http://localhost:3002/api/v1/devices
```

### Get Device Details
```bash
curl http://localhost:3002/api/v1/devices/abc-123
```

### Upload Logs
```bash
curl -X POST http://localhost:3002/api/v1/device/abc-123/logs \
  -H "Content-Type: application/json" \
  -d '[
    {
      "timestamp": "2025-10-12T10:30:00Z",
      "message": "Service started",
      "service_name": "node-red"
    }
  ]'
```

### Get Logs
```bash
# All logs (paginated)
curl "http://localhost:3002/api/v1/devices/abc-123/logs?limit=100&offset=0"

# Filter by service
curl "http://localhost:3002/api/v1/devices/abc-123/logs?service=node-red"
```

### Get Metrics
```bash
curl "http://localhost:3002/api/v1/devices/abc-123/metrics?limit=100"
```

## 📊 Response Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `304` | Not Modified (ETag cache hit) |
| `400` | Bad Request (invalid body) |
| `404` | Not Found |
| `500` | Internal Server Error |

## 🎯 ETag Caching

**Why?** Saves bandwidth when polling every 60 seconds.

**Flow:**
1. First request → Returns full state + ETag
2. Next request with `If-None-Match: "<etag>"` → Returns 304 if unchanged
3. When state changes → Returns 200 with new state + new ETag

**Example:**
```bash
# Initial poll
curl -v http://localhost:3002/api/v1/device/abc-123/state
# < ETag: "v1"
# { "abc-123": { "apps": {...} } }

# Subsequent poll (no change)
curl -v -H "If-None-Match: \"v1\"" \
  http://localhost:3002/api/v1/device/abc-123/state
# < 304 Not Modified
# (empty body)

# After state update
curl -v -H "If-None-Match: \"v1\"" \
  http://localhost:3002/api/v1/device/abc-123/state
# < ETag: "v2"
# { "abc-123": { "apps": {...new state...} } }
```

## 🔧 Query Parameters

### `/api/v1/devices`
- `online=true|false` - Filter by online status

### `/api/v1/devices/:uuid/logs`
- `service=<name>` - Filter by service name
- `limit=<number>` - Number of entries (default: 100)
- `offset=<number>` - Pagination offset (default: 0)

### `/api/v1/devices/:uuid/metrics`
- `limit=<number>` - Number of entries (default: 100)

## 📝 Data Models

### Device State Report
```json
{
  "<device-uuid>": {
    "apps": {
      "<app-name>": {
        "status": "running",
        "containerId": "abc123"
      }
    },
    "config": { "hostname": "sensor-001" },
    "ip_address": "192.168.1.100",
    "mac_address": "b8:27:eb:12:34:56",
    "os_version": "Raspberry Pi OS 11",
    "supervisor_version": "1.2.3",
    "uptime": 86400,
    "cpu_usage": 25.5,
    "cpu_temp": 45.2,
    "memory_usage": 512000000,
    "memory_total": 1024000000,
    "storage_usage": 5368709120,
    "storage_total": 32212254720
  }
}
```

### Target State (Docker Compose Format)
```json
{
  "apps": {
    "<app-name>": {
      "image": "image:tag",
      "environment": { "KEY": "value" },
      "ports": ["8080:8080"],
      "volumes": ["data:/data"],
      "restart": "unless-stopped"
    }
  },
  "config": {
    "hostname": "device-name",
    "timezone": "UTC"
  }
}
```

### Log Entry
```json
{
  "timestamp": "2025-10-12T10:30:00Z",
  "message": "Log message",
  "service_name": "node-red",
  "is_system": false,
  "is_stderr": false
}
```

### Metric Entry
```json
{
  "cpu_usage": 25.5,
  "cpu_temp": 45.2,
  "memory_usage": 512000000,
  "memory_total": 1024000000,
  "storage_usage": 5368709120,
  "storage_total": 32212254720,
  "recorded_at": "2025-10-12T10:30:00Z"
}
```

## 🚀 Testing with Postman Mock Server

1. **Import**: `Zemfyre-Cloud-API-Mock.postman_collection.json`
2. **Create Mock**: Right-click collection → Mock Collection
3. **Get URL**: Copy mock server URL
4. **Test**: Use mock URL instead of `localhost:3002`

**Mock URL Example:**
```bash
https://abc123.mock.pstmn.io/api/v1/devices
```

## 📚 More Info

- **Full Documentation**: `POSTGRES-BACKEND.md`
- **Postman Guide**: `postman/README.md`
- **Database Schema**: `database/schema.sql`
- **Source Code**: `src/routes/cloud-postgres.ts`
