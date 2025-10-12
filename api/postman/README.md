# Postman Mock Server for Zemfyre Cloud API

This directory contains a Postman collection with comprehensive mock examples for the Zemfyre Cloud API (based on `cloud-postgres.ts`).

## 📋 Collection Contents

The collection includes **13 API endpoints** organized into 6 folders:

### 1. Device Polling (2 endpoints)
- `GET /api/v1/device/:uuid/state` - Device polling with ETag caching
  - Initial request: Returns full state with ETag
  - Cached request: Returns 304 Not Modified if unchanged

### 2. Device State Reporting (1 endpoint)
- `PATCH /api/v1/device/state` - Device reports current state, metrics, and system info

### 3. Device Management (4 endpoints)
- `GET /api/v1/devices` - List all devices (with optional `online` filter)
- `GET /api/v1/devices/:uuid` - Get device details
- `DELETE /api/v1/devices/:uuid` - Delete device

### 4. Target State (3 endpoints)
- `GET /api/v1/devices/:uuid/target-state` - Get desired state
- `POST /api/v1/devices/:uuid/target-state` - Set desired state
- `DELETE /api/v1/devices/:uuid/target-state` - Clear desired state

### 5. Current State (1 endpoint)
- `GET /api/v1/devices/:uuid/current-state` - Get device-reported state

### 6. Logs (3 endpoints)
- `POST /api/v1/device/:uuid/logs` - Upload device logs
- `GET /api/v1/devices/:uuid/logs` - Retrieve logs (with pagination and filtering)
- Filter by service: `?service=node-red`

### 7. Metrics (1 endpoint)
- `GET /api/v1/devices/:uuid/metrics` - Get time-series metrics

## 🚀 Quick Start

### Option 1: Import to Postman Desktop/Web

1. **Open Postman** (download from [postman.com](https://www.postman.com/downloads/))

2. **Import Collection**:
   - Click **Import** button
   - Select `Zemfyre-Cloud-API-Mock.postman_collection.json`
   - Click **Import**

3. **Set Variables**:
   - The collection includes default variables:
     - `baseUrl`: `http://localhost:3002`
     - `deviceUuid`: `abc-123-def-456-ghi-789`
   - Edit these in Collection → Variables tab

4. **Run Requests**:
   - Select any request from the collection
   - Click **Send**
   - View response examples in **Examples** tab

### Option 2: Create Postman Mock Server

1. **Import Collection** (see above)

2. **Create Mock Server**:
   - Right-click collection → **Mock Collection**
   - Name: `Zemfyre Cloud API Mock`
   - Environment: Create new or use existing
   - Make it public ✅ (optional)
   - Click **Create Mock Server**

3. **Get Mock URL**:
   - Copy the mock server URL (e.g., `https://abc123.mock.pstmn.io`)
   - Update `baseUrl` variable to mock URL

4. **Test Mock Server**:
   ```bash
   # List devices
   curl https://abc123.mock.pstmn.io/api/v1/devices
   
   # Get device state
   curl https://abc123.mock.pstmn.io/api/v1/device/abc-123-def-456-ghi-789/state
   ```

## 📊 Example Workflows

### Workflow 1: Device Registration & Polling

```bash
# 1. Device polls for target state (first time - empty)
GET /api/v1/device/new-device-001/state
# Response: { "new-device-001": { "apps": {} } }
# ETag: "abc123"

# 2. Cloud admin sets target state
POST /api/v1/devices/new-device-001/target-state
Body: {
  "apps": {
    "node-red": { "image": "nodered/node-red:latest" }
  },
  "config": { "hostname": "sensor-001" }
}

# 3. Device polls again (new state available)
GET /api/v1/device/new-device-001/state
# Response: Full target state with new ETag "v1"

# 4. Device reports current state
PATCH /api/v1/device/state
Body: {
  "new-device-001": {
    "apps": { "node-red": { "status": "running" } },
    "cpu_usage": 25.5,
    "memory_usage": 512000000
  }
}
```

### Workflow 2: ETag Caching (Bandwidth Optimization)

```bash
# 1. Initial poll (200 OK with full data)
GET /api/v1/device/abc-123/state
# Response: { "abc-123": { "apps": {...} } }
# ETag: "v5"

# 2. Subsequent poll with ETag (304 Not Modified)
GET /api/v1/device/abc-123/state
Headers: If-None-Match: "v5"
# Response: 304 (no body)

# 3. Target state changed, poll again with old ETag
GET /api/v1/device/abc-123/state
Headers: If-None-Match: "v5"
# Response: 200 OK with new state
# ETag: "v6"
```

### Workflow 3: Log Aggregation

```bash
# 1. Device uploads logs
POST /api/v1/device/abc-123/logs
Body: [
  {
    "timestamp": "2025-10-12T10:30:00Z",
    "message": "Service started",
    "service_name": "node-red",
    "is_stderr": false
  }
]

# 2. Admin retrieves all logs
GET /api/v1/devices/abc-123/logs?limit=100

# 3. Filter logs by service
GET /api/v1/devices/abc-123/logs?service=node-red&limit=50

# 4. Pagination
GET /api/v1/devices/abc-123/logs?limit=25&offset=50
```

### Workflow 4: Fleet Management

```bash
# 1. List all devices
GET /api/v1/devices

# 2. Filter online devices only
GET /api/v1/devices?online=true

# 3. Get specific device details
GET /api/v1/devices/abc-123

# 4. Get device metrics (last 100 readings)
GET /api/v1/devices/abc-123/metrics?limit=100

# 5. Compare target vs current state
GET /api/v1/devices/abc-123/target-state
GET /api/v1/devices/abc-123/current-state
```

## 🎯 Using Mock Responses

Each request in the collection includes **example responses** that demonstrate:

### Success Responses
- `200 OK` - Request successful with data
- `304 Not Modified` - ETag cache hit (no data returned)

### Error Responses
- `400 Bad Request` - Invalid request body
- `404 Not Found` - Device/resource not found
- `500 Internal Server Error` - Server error

### Example Response Bodies

**Device List** (3 devices with different statuses):
```json
{
  "count": 3,
  "devices": [
    {
      "uuid": "abc-123-...",
      "device_name": "Raspberry Pi 4 - Office",
      "is_online": true,
      "cpu_usage": 25.5,
      "target_apps_count": 2,
      "current_apps_count": 2
    },
    {
      "uuid": "xyz-789-...",
      "device_name": "Raspberry Pi 3 - Lab",
      "is_online": true
    },
    {
      "uuid": "mno-456-...",
      "device_name": "Intel NUC - Gateway",
      "is_online": false
    }
  ]
}
```

**Target State** (Docker Compose-like format):
```json
{
  "apps": {
    "node-red": {
      "image": "nodered/node-red:3.1",
      "environment": { "TZ": "UTC" },
      "ports": ["1880:1880"],
      "restart": "unless-stopped"
    },
    "influxdb": {
      "image": "influxdb:2.7-alpine",
      "ports": ["8086:8086"],
      "volumes": ["influx-data:/var/lib/influxdb2"]
    }
  },
  "config": {
    "hostname": "zemfyre-pi-001",
    "timezone": "UTC"
  },
  "version": 5
}
```

## 🔧 Customization

### Modify Variables

Edit collection variables to match your environment:

```javascript
// Collection Variables
{
  "baseUrl": "http://localhost:3002",  // Change to your API URL
  "deviceUuid": "your-device-uuid"      // Your test device UUID
}
```

### Add New Examples

To add custom mock responses:

1. Select a request in the collection
2. Click **Examples** tab
3. Click **Add Example**
4. Provide:
   - Example name
   - Status code (200, 404, etc.)
   - Response headers
   - Response body (JSON)
5. Save

### Create Environment

For multiple environments (dev, staging, prod):

1. Click **Environments** in Postman
2. Create new environment (e.g., "Local Dev")
3. Add variables:
   - `baseUrl`: `http://localhost:3002`
   - `deviceUuid`: `test-device-001`
4. Select environment from dropdown

## 🧪 Testing Scenarios

### Test 1: New Device Onboarding
1. Poll for state (empty response)
2. Set target state from cloud
3. Device reports current state
4. Verify state reconciliation

### Test 2: ETag Caching
1. Initial poll (get ETag)
2. Poll with ETag (304 response)
3. Update target state
4. Poll with old ETag (200 with new state)

### Test 3: Multi-Device Management
1. List all devices
2. Filter by online status
3. Update target state for multiple devices
4. Monitor current state updates

### Test 4: Log & Metric Collection
1. Device uploads logs periodically
2. Admin retrieves recent logs
3. Filter logs by service
4. Query time-series metrics

## 📚 API Documentation

### Base URL
- **Local**: `http://localhost:3002`
- **Cloud**: Configure in `.env` (`API_PORT_EXT=3002`)

### Authentication
- **Current**: None (add JWT/API keys for production)
- **Future**: Bearer token in `Authorization` header

### Content Type
- All requests: `Content-Type: application/json`
- All responses: `application/json`

### Rate Limiting
- Not implemented in mock
- Recommended: 100 requests/minute per device

## 🚨 Common Issues

### Issue 1: Mock Server Not Responding
**Solution**: Ensure mock server is created and URL is correct
```bash
# Test mock server
curl -v https://your-mock-url.mock.pstmn.io/api/v1/devices
```

### Issue 2: Variables Not Substituted
**Solution**: Check collection variables are set
- Collection → Variables tab
- Ensure `{{baseUrl}}` and `{{deviceUuid}}` are defined

### Issue 3: Example Response Not Returned
**Solution**: Mock server returns first matching example
- Ensure example exists for the request
- Check request method and path match exactly

## 📖 Resources

- **Postman Docs**: https://learning.postman.com/docs/designing-and-developing-your-api/mocking-data/setting-up-mock/
- **API Source**: `api/src/routes/cloud-postgres.ts`
- **Database Schema**: `api/database/schema.sql`
- **Implementation Guide**: `api/POSTGRES-BACKEND.md`

## 🤝 Contributing

To update the collection:

1. Make changes in Postman
2. Export collection (Collection → ... → Export)
3. Replace `Zemfyre-Cloud-API-Mock.postman_collection.json`
4. Commit and push

## 📝 Notes

- **Mock responses** are static examples - they don't persist data
- For **real testing**, use the actual API with PostgreSQL backend
- **ETag values** in examples are simplified (real values are Base64 encoded)
- **Timestamps** use ISO 8601 format (UTC)

---

**Need help?** Check the [API documentation](../POSTGRES-BACKEND.md) or open an issue.
