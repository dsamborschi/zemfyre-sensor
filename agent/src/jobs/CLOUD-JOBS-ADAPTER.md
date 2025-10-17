# Cloud Jobs Adapter - Device Integration Guide

The **CloudJobsAdapter** enables Raspberry Pi devices to receive and execute jobs from the cloud management portal via HTTP polling. This replaces the AWS IoT Jobs MQTT approach with a simpler HTTP-based architecture.

## Overview

```
Cloud API (port 4002)
       ↓
  HTTP Polling (30s)
       ↓
CloudJobsAdapter
       ↓
   JobEngine
       ↓
  Execute Job
       ↓
 Report Status
```

## Features

- ✅ **HTTP Polling** - Simple, reliable job delivery without MQTT complexity
- ✅ **Automatic Retry** - Built-in retry logic with exponential backoff
- ✅ **Status Reporting** - Real-time job progress updates to cloud
- ✅ **Error Handling** - Comprehensive error capture and reporting
- ✅ **Graceful Shutdown** - Clean stop without interrupting running jobs
- ✅ **Configurable Polling** - Adjust polling interval based on needs

## Setup

### 1. Enable Cloud Jobs

Set environment variables in your device configuration:

```bash
# Required: Enable Cloud Jobs feature
ENABLE_CLOUD_JOBS=true

# Required: Enable Job Engine (Cloud Jobs depends on it)
ENABLE_JOB_ENGINE=true

# Required: Cloud API URL
CLOUD_API_URL=http://your-cloud-server:4002/api/v1

# Optional: Polling interval in milliseconds (default: 30000 = 30 seconds)
CLOUD_JOBS_POLLING_INTERVAL=30000

# Optional: Enable debug logging
DEBUG=true
```

### 2. Start the Agent

```bash
cd agent
npm run build
npm start
```

You should see output like:

```
☁️  Initializing Cloud Jobs Adapter...
✅ Cloud Jobs Adapter initialized
   Cloud API: http://your-cloud-server:4002/api/v1
   Device UUID: 8479359e-dbeb-4858-813c-e8a9008dde04
   Polling interval: 30000ms (30s)
   Status: Polling for jobs...
```

### 3. Configure in Docker Compose

Add to your `docker-compose.yml`:

```yaml
device-agent:
  image: iotistic/agent:latest
  environment:
    - ENABLE_CLOUD_JOBS=true
    - ENABLE_JOB_ENGINE=true
    - CLOUD_API_URL=http://cloud-api:4002/api/v1
    - CLOUD_JOBS_POLLING_INTERVAL=30000
    - DEBUG=false
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    - agent-data:/app/data
```

## How It Works

### Job Execution Flow

1. **Polling**
   - CloudJobsAdapter polls `/devices/:uuid/jobs/next` every 30 seconds
   - If no jobs available, receives `{"message": "No pending jobs"}`
   - If job available, receives job document with job_id, job_name, timeout, etc.

2. **Execution**
   - Adapter reports status as `IN_PROGRESS` to cloud
   - Passes job document to JobEngine for execution
   - JobEngine executes steps sequentially or in parallel
   - Captures stdout, stderr, and exit code

3. **Status Reporting**
   - Progress updates sent via `PATCH /devices/:uuid/jobs/:jobId/status`
   - Final status: `SUCCEEDED` or `FAILED`
   - Includes execution results (stdout, stderr, exit_code)

4. **Error Handling**
   - Network failures: Retries with exponential backoff (1s, 2s, 4s)
   - Job failures: Captured and reported with error details
   - Timeout: Job marked as `TIMED_OUT` if exceeds timeout_seconds

### Job Document Example

Received from cloud:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "job_name": "Restart Redis Service",
  "timeout_seconds": 300,
  "job_document": {
    "version": "1.0",
    "steps": [
      {
        "action": {
          "type": "runCommand",
          "input": {
            "command": "docker restart redis"
          }
        }
      }
    ],
    "includeStdOut": true
  }
}
```

## API Reference

### CloudJobsAdapter Class

```typescript
import { CloudJobsAdapter } from './jobs/cloud-jobs-adapter';
import { JobEngine } from './jobs/job-engine';

const adapter = new CloudJobsAdapter(
  {
    cloudApiUrl: 'http://localhost:4002/api/v1',
    deviceUuid: '8479359e-dbeb-4858-813c-e8a9008dde04',
    pollingIntervalMs: 30000,  // Optional, default 30s
    maxRetries: 3,             // Optional, default 3
    enableLogging: true        // Optional, default true
  },
  jobEngine
);

// Start polling
adapter.start();

// Get status
const status = adapter.getStatus();
console.log(status);
// {
//   polling: true,
//   currentJobId: "550e8400-e29b-41d4-a716-446655440000",
//   config: { ... }
// }

// Query job history
const history = await adapter.getJobHistory(10);

// Stop polling
adapter.stop();
```

## Testing

### Test Job Creation from Cloud

```powershell
# From cloud server
$body = @{
    job_name = "Test Health Check"
    template_id = 3  # health-check template
    target_type = "device"
    target_devices = @("8479359e-dbeb-4858-813c-e8a9008dde04")
    timeout_seconds = 300
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4002/api/v1/jobs/execute" `
    -Method POST -Body $body -ContentType "application/json"
```

### Monitor Device Logs

Watch the agent logs for:

```
[CloudJobsAdapter] Received job from cloud {"jobId":"...","jobName":"Test Health Check"}
[CloudJobsAdapter] Starting job execution {"jobId":"...","steps":3}
[CloudJobsAdapter] Job status updated {"jobId":"...","status":"IN_PROGRESS"}
[CloudJobsAdapter] Job execution completed {"jobId":"...","exitCode":0,"duration":"1523ms"}
[CloudJobsAdapter] Job status updated {"jobId":"...","status":"SUCCEEDED"}
```

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CLOUD_JOBS` | `false` | Enable CloudJobsAdapter |
| `ENABLE_JOB_ENGINE` | `false` | Enable JobEngine (required for Cloud Jobs) |
| `CLOUD_API_URL` | - | Cloud API endpoint (e.g., `http://api:4002/api/v1`) |
| `CLOUD_JOBS_POLLING_INTERVAL` | `30000` | Polling interval in milliseconds |
| `DEBUG` | `false` | Enable debug logging for detailed output |

## Troubleshooting

### "Device UUID not available"

**Problem**: CloudJobsAdapter can't get device UUID

**Solution**: Ensure device is provisioned:

```bash
# Check device info
curl http://localhost:48484/v2/device

# If not provisioned, register device first
curl -X POST http://cloud:4002/api/v1/device/register \
  -H "Content-Type: application/json" \
  -d '{"provisioning_key": "your-key"}'
```

### "Job Engine not enabled"

**Problem**: Cloud Jobs requires Job Engine

**Solution**: Set both environment variables:

```bash
ENABLE_JOB_ENGINE=true
ENABLE_CLOUD_JOBS=true
```

### "Failed to update job status"

**Problem**: Network connectivity issues to cloud API

**Solution**: 
- Check CLOUD_API_URL is accessible from device
- Verify firewall rules allow outbound HTTP
- Check cloud API is running: `curl http://cloud:4002/`

### "No pending jobs" repeatedly

**Problem**: Device polling but no jobs assigned

**Solution**: This is normal. Create a job from cloud:

```powershell
# List devices
Invoke-RestMethod http://localhost:4002/api/v1/devices

# Execute job on device
# See "Test Job Creation from Cloud" above
```

### Polling too frequent/slow

**Problem**: Need to adjust polling frequency

**Solution**: Set `CLOUD_JOBS_POLLING_INTERVAL`:

```bash
# Poll every 10 seconds (more responsive)
CLOUD_JOBS_POLLING_INTERVAL=10000

# Poll every 60 seconds (less network traffic)
CLOUD_JOBS_POLLING_INTERVAL=60000
```

## Architecture Benefits

### Why HTTP Polling vs MQTT?

1. **Simpler Infrastructure** - No MQTT broker required on cloud
2. **Easier Firewall Traversal** - Standard HTTP/HTTPS
3. **Better Cloud Integration** - Same API used by portal
4. **Familiar Debugging** - Standard HTTP tools (curl, Postman)
5. **Stateless** - No persistent connections to maintain

### Performance Considerations

- **Polling Interval**: 30s default balances responsiveness vs network overhead
- **Concurrent Jobs**: One job at a time per device (prevents resource conflicts)
- **Retry Logic**: Exponential backoff prevents overwhelming cloud during issues
- **Timeout**: Jobs that exceed `timeout_seconds` are automatically terminated

## Integration with Portal

The CloudJobsAdapter uses the same API as the management portal, enabling:

1. **Create Job** - Portal → Cloud API → Job Queue
2. **Device Polls** - CloudJobsAdapter → Cloud API → Next Pending Job
3. **Execute Job** - CloudJobsAdapter → JobEngine → Execute
4. **Report Status** - CloudJobsAdapter → Cloud API → Portal Update
5. **View Results** - Portal → Cloud API → Job History

## Security Considerations

### Authentication

Currently uses device UUID for authentication. For production:

1. **Add API Key**: Include device-specific API key in headers
2. **Use HTTPS**: Encrypt communication with cloud
3. **Certificate Pinning**: Validate cloud API certificate
4. **Rate Limiting**: Prevent abuse of polling endpoint

Example with API key:

```typescript
this.httpClient = axios.create({
  baseURL: this.config.cloudApiUrl,
  headers: {
    'Content-Type': 'application/json',
    'X-Device-UUID': this.config.deviceUuid,
    'X-API-Key': process.env.DEVICE_API_KEY
  }
});
```

## Next Steps

1. ✅ CloudJobsAdapter implemented
2. ✅ Integrated into DeviceSupervisor
3. ⏳ Test with real Raspberry Pi device
4. ⏳ Build portal UI for job management
5. ⏳ Add authentication/security
6. ⏳ Implement WebSocket for real-time updates (optional)

## Related Documentation

- **Cloud API**: See `api/docs/DEVICE-JOBS-MANAGEMENT.md`
- **Job Engine**: See `agent/src/jobs/README.md`
- **Quick Reference**: See `api/JOBS-API-QUICK-REFERENCE.md`
- **Portal Integration**: See `admin/docs/JOBS-PORTAL.md` (to be created)
