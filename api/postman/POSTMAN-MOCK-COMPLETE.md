# Postman Mock Server - Complete! ✅

## Summary

Successfully created a comprehensive **Postman Mock Server** collection for the Zemfyre Cloud API, including all 13 endpoints from `cloud-postgres.ts` with realistic mock examples.

## 📁 Files Created

### 1. **`Zemfyre-Cloud-API-Mock.postman_collection.json`**
   - Complete Postman Collection v2.1 format
   - **13 API endpoints** organized into 6 folders
   - **25+ mock response examples** (success, errors, edge cases)
   - Collection variables: `baseUrl`, `deviceUuid`
   - Ready to import into Postman

### 2. **`README.md`**
   - Comprehensive guide (150+ lines)
   - Import instructions (Desktop/Web)
   - Mock server setup guide
   - Example workflows (4 scenarios)
   - Customization guide
   - Testing scenarios
   - Troubleshooting section

### 3. **`API-QUICK-REFERENCE.md`**
   - One-page cheat sheet
   - All endpoints table
   - Common curl examples
   - Query parameters reference
   - Data models (JSON examples)
   - Response codes table
   - ETag caching explanation

## 🎯 What's Included

### Endpoint Coverage

✅ **Device Polling** (2 requests)
- Initial poll (200 with state)
- Cached poll (304 Not Modified)
- ETag caching demonstration

✅ **State Reporting** (1 request)
- Full state report with metrics
- Apps, config, system info

✅ **Device Management** (4 requests)
- List all devices
- Filter by online status
- Get device details
- Delete device

✅ **Target State** (3 requests)
- Get target state
- Set target state (with validation)
- Clear target state

✅ **Current State** (1 request)
- Get device-reported state
- 404 when no state available

✅ **Logs** (3 requests)
- Upload logs (array format)
- Get logs (paginated)
- Filter by service name

✅ **Metrics** (1 request)
- Get time-series metrics
- Pagination support

### Mock Response Examples

Each endpoint includes **multiple example responses**:

- ✅ **Success cases** (200 OK)
- ✅ **Not Modified** (304 - ETag cache hit)
- ✅ **Not Found** (404 - missing device/data)
- ✅ **Bad Request** (400 - invalid input)
- ✅ **Edge cases** (empty state, new devices, offline devices)

### Realistic Mock Data

**3 Sample Devices**:
1. **Raspberry Pi 4 - Office** (online, 2 apps running)
2. **Raspberry Pi 3 - Lab** (online, 1 app running)
3. **Intel NUC - Gateway** (offline, no apps)

**Sample Applications**:
- Node-RED (IoT automation)
- InfluxDB (time-series database)
- Grafana (dashboards)

**Sample Metrics**:
- CPU usage: 25.5%
- CPU temperature: 45.2°C
- Memory: 512MB / 1024MB
- Storage: 5GB / 32GB

**Sample Logs**:
- Service startup messages
- System warnings
- Error messages (stderr)

## 🚀 How to Use

### Option 1: Postman Desktop/Web

```bash
# 1. Import collection
#    Postman → Import → Select JSON file

# 2. Set variables (optional)
#    Collection → Variables
#    - baseUrl: http://localhost:3002
#    - deviceUuid: abc-123-def-456-ghi-789

# 3. Run requests
#    Select request → Send
#    View examples in "Examples" tab
```

### Option 2: Create Mock Server

```bash
# 1. Import collection (see above)

# 2. Create mock server
#    Right-click collection → Mock Collection
#    Name: "Zemfyre Cloud API Mock"
#    Make public: ✅ (optional)

# 3. Get mock URL
#    Copy URL (e.g., https://abc123.mock.pstmn.io)

# 4. Test from command line
curl https://abc123.mock.pstmn.io/api/v1/devices

# 5. Update baseUrl variable
#    Collection → Variables → baseUrl = <mock-url>
```

### Option 3: Test Real API

```bash
# 1. Start API with PostgreSQL
docker-compose -f docker-compose.cloud.yml up -d

# 2. Import collection

# 3. Keep default baseUrl
#    http://localhost:3002

# 4. Run requests against real API
#    Data will persist in PostgreSQL
```

## 📊 Example Workflows

### Workflow 1: Device Onboarding

```bash
# Step 1: Device polls (empty state)
GET /api/v1/device/new-device-001/state
# → 200 OK: { "new-device-001": { "apps": {} } }

# Step 2: Admin sets target state
POST /api/v1/devices/new-device-001/target-state
Body: { "apps": { "node-red": {...} } }
# → 200 OK: { "status": "ok", "version": 1 }

# Step 3: Device polls again (new state)
GET /api/v1/device/new-device-001/state
# → 200 OK: { "new-device-001": { "apps": { "node-red": {...} } } }
# ETag: "v1"

# Step 4: Device reports state
PATCH /api/v1/device/state
Body: { "new-device-001": { "apps": { "node-red": { "status": "running" } } } }
# → 200 OK: { "status": "ok" }
```

### Workflow 2: ETag Caching

```bash
# Poll 1: Get state (200 OK)
GET /api/v1/device/abc-123/state
# ETag: "v5"

# Poll 2: No change (304 Not Modified)
GET /api/v1/device/abc-123/state
If-None-Match: "v5"
# → 304 (no body, saves bandwidth)

# Target state updated (version 6)

# Poll 3: New state available (200 OK)
GET /api/v1/device/abc-123/state
If-None-Match: "v5"
# ETag: "v6" (new state returned)
```

### Workflow 3: Fleet Management

```bash
# 1. List all devices
GET /api/v1/devices
# → 3 devices (2 online, 1 offline)

# 2. Filter online only
GET /api/v1/devices?online=true
# → 2 devices

# 3. Get device details
GET /api/v1/devices/abc-123
# → Full device info + target/current state

# 4. Get recent metrics
GET /api/v1/devices/abc-123/metrics?limit=10
# → Last 10 metric readings

# 5. Get logs (last hour)
GET /api/v1/devices/abc-123/logs?limit=100
# → Recent log entries
```

## 🎨 Key Features

### 1. ETag Caching Examples
- Demonstrates bandwidth optimization
- Shows 304 Not Modified responses
- Illustrates version tracking

### 2. Pagination
- Logs: `?limit=100&offset=0`
- Metrics: `?limit=100`
- Demonstrates large dataset handling

### 3. Filtering
- Devices: `?online=true|false`
- Logs: `?service=node-red`
- Shows query parameter usage

### 4. Error Handling
- 400 Bad Request (invalid apps object)
- 404 Not Found (device doesn't exist)
- 404 No State (device hasn't reported yet)

### 5. Realistic Data
- 3 diverse devices (Pi3, Pi4, x86)
- Multiple app configurations
- Time-series metrics
- Structured logs

## 📚 Documentation Structure

```
api/postman/
├── Zemfyre-Cloud-API-Mock.postman_collection.json  # Import this
├── README.md                                        # Full guide (150+ lines)
├── API-QUICK-REFERENCE.md                          # Cheat sheet
└── POSTMAN-MOCK-COMPLETE.md                        # This summary
```

## 🔧 Customization

### Add Custom Device UUID

```javascript
// Collection Variables
{
  "deviceUuid": "my-test-device-uuid-001"
}
```

### Add New Mock Response

1. Select request in Postman
2. Click "Examples" tab
3. Click "Add Example"
4. Set status code, headers, body
5. Save

### Create Environment

```javascript
// Local Dev Environment
{
  "baseUrl": "http://localhost:3002",
  "deviceUuid": "test-device-001"
}

// Staging Environment
{
  "baseUrl": "https://staging-api.example.com",
  "deviceUuid": "staging-device-001"
}

// Mock Environment
{
  "baseUrl": "https://abc123.mock.pstmn.io",
  "deviceUuid": "mock-device-001"
}
```

## 🧪 Testing Checklist

Use the collection to test:

- ✅ Device registration (first poll)
- ✅ Target state deployment
- ✅ Current state reporting
- ✅ ETag caching (bandwidth savings)
- ✅ Multi-device management
- ✅ Log aggregation
- ✅ Metric collection
- ✅ Device deletion (cleanup)
- ✅ Error handling (404, 400)
- ✅ Pagination (logs, metrics)
- ✅ Filtering (online devices, service logs)

## 📖 API Specification

### Base URL
```
http://localhost:3002
```

### Content Type
```
application/json
```

### Authentication
```
None (add JWT/API keys later)
```

### Rate Limiting
```
Not implemented (recommend 100 req/min per device)
```

### Versioning
```
/api/v1/*
```

## 🎯 Use Cases

### 1. **Frontend Development**
- Mock API before backend is ready
- Test UI without database
- Predictable responses for testing

### 2. **API Documentation**
- Share collection with team
- Demonstrate API usage
- Onboard new developers

### 3. **Integration Testing**
- Test device agent code
- Validate request/response formats
- Simulate error conditions

### 4. **Load Testing**
- Use mock server for baseline
- Test without database overhead
- Validate caching behavior

### 5. **Contract Testing**
- Ensure API matches spec
- Validate response schemas
- Test edge cases

## 🚨 Important Notes

### Mock Server Limitations

⚠️ **Static Responses**:
- Mock responses don't persist data
- Each request returns predefined examples
- Use real API for integration tests

⚠️ **No State Management**:
- Setting target state doesn't affect polling
- Deleting device doesn't remove it
- Use PostgreSQL backend for real testing

⚠️ **No Validation**:
- Mock accepts any request body
- No database constraints
- Validates format, not business logic

### Real API vs Mock

| Feature | Mock Server | Real API |
|---------|------------|----------|
| **Speed** | Instant | Database queries |
| **Data Persistence** | ❌ No | ✅ Yes |
| **State Changes** | ❌ No | ✅ Yes |
| **Validation** | Basic | Full |
| **Use Case** | Testing, Docs | Production |

## 🔗 Related Files

- **API Implementation**: `api/src/routes/cloud-postgres.ts`
- **Database Schema**: `api/database/schema.sql`
- **Data Models**: `api/src/db/models.ts`
- **Backend Guide**: `api/POSTGRES-BACKEND.md`
- **Setup Guide**: `docs/POSTGRES-SETUP.md`
- **Cloud Stack**: `docker-compose.cloud.yml`

## 🎉 Next Steps

1. **Import Collection**: Open Postman, import JSON file
2. **Explore Examples**: Check "Examples" tab for each request
3. **Create Mock Server**: Right-click collection → Mock Collection
4. **Test Workflows**: Try the 3 example workflows above
5. **Customize**: Add your own devices, apps, and scenarios
6. **Share**: Export collection and share with team
7. **Document**: Use as API specification

## 📞 Support

- **Postman Docs**: https://learning.postman.com/docs/
- **API Source**: `api/src/routes/cloud-postgres.ts`
- **Issues**: Open GitHub issue with `api` label

---

Your Zemfyre Cloud API now has **complete Postman mock server support** with 13 endpoints and 25+ realistic examples! 🚀
