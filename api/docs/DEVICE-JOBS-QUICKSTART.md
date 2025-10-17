# Device Jobs System - Quick Reference

## What Is It?

A system to remotely execute tasks on your Raspberry Pi devices from the cloud portal. Think of it like AWS IoT Jobs but for your own infrastructure.

## How It Works

```
Portal → Create Job → Database → Device Polls → Device Executes → Reports Back
```

## Key Concepts

1. **Job Template**: Reusable job definition (e.g., "restart-service")
2. **Job Execution**: One-time instance of running a job
3. **Device Status**: Per-device tracking of job results

## Quick Start

### 1. Run Migration

```bash
cd api
node run-migration-011.js  # (Create this file similar to run-migration-009.js)
```

### 2. Register Routes

In `api/src/index.ts`:

```typescript
import jobsRoutes from './routes/device-jobs';
app.use('/api/v1', jobsRoutes);
```

### 3. Execute a Job

```bash
# Using existing template
curl -X POST http://localhost:4002/api/v1/jobs/execute \
  -H "Content-Type: application/json" \
  -d '{
    "job_name": "Restart nginx",
    "template_id": 1,
    "target_type": "device",
    "target_devices": ["8479359e-dbeb-4858-813c-e8a9008dde04"]
  }'
```

### 4. Device Gets Job

Your agent polls:

```bash
GET /api/v1/devices/8479359e-dbeb-4858-813c-e8a9008dde04/jobs/next
```

### 5. Device Reports Status

```bash
PATCH /api/v1/devices/8479359e-dbeb-4858-813c-e8a9008dde04/jobs/{jobId}/status
{
  "status": "SUCCEEDED",
  "exit_code": 0,
  "stdout": "Job completed"
}
```

### 6. View Results

```bash
GET /api/v1/jobs/executions/{jobId}
```

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/jobs/templates` | GET | List job templates |
| `/jobs/templates` | POST | Create template |
| `/jobs/execute` | POST | Execute job on device(s) |
| `/jobs/executions` | GET | List all job executions |
| `/jobs/executions/:id` | GET | Get job details + device statuses |
| `/jobs/executions/:id/cancel` | POST | Cancel running job |
| `/devices/:uuid/jobs` | GET | Get jobs for specific device |
| `/devices/:uuid/jobs/next` | GET | Get next pending job (device polls) |
| `/devices/:uuid/jobs/:jobId/status` | PATCH | Update job status (device reports) |

## Job Document Example

```json
{
  "version": "1.0",
  "includeStdOut": true,
  "steps": [
    {
      "name": "Restart Service",
      "type": "runCommand",
      "input": {
        "command": "systemctl,restart,nginx"
      },
      "runAsUser": "root"
    }
  ]
}
```

## Sample Job Templates (Pre-Installed)

1. **restart-service**: Restart any systemd service
2. **update-config**: Download and apply new config file
3. **health-check**: Run system diagnostics

## Target Types

- `device`: Specific device UUIDs
- `group`: Filter devices by properties
- `all`: All active devices

## Job Statuses

- `QUEUED`: Job created, waiting for device
- `IN_PROGRESS`: Device is executing
- `SUCCEEDED`: Completed successfully
- `FAILED`: Execution failed
- `CANCELED`: Manually canceled
- `TIMED_OUT`: Exceeded timeout
- `REJECTED`: Device rejected the job

## Agent Integration (TODO)

You need to add polling to your agent:

1. Create `agent/src/jobs/cloud-jobs-adapter.ts` (see DEVICE-JOBS-MANAGEMENT.md)
2. Start adapter in supervisor
3. Poll `/devices/:uuid/jobs/next` every 30 seconds
4. Execute job using existing `JobEngine`
5. Report status via PATCH endpoint

## Portal UI (TODO)

Build admin pages:

1. **Job Templates**: CRUD for templates
2. **Execute Job**: Form to select template + target devices
3. **Job Dashboard**: Real-time status of running jobs
4. **Device Jobs**: History tab on device detail page

## Full Documentation

- **Complete Guide**: `api/docs/DEVICE-JOBS-MANAGEMENT.md`
- **Migration**: `api/database/migrations/011_add_device_jobs.sql`
- **API Routes**: `api/src/routes/device-jobs.ts`
- **Agent Code**: `agent/src/jobs/` (existing implementation)

## Benefits

✅ Remote task execution  
✅ Multi-device deployment  
✅ Progress tracking  
✅ Historical audit trail  
✅ Template reuse  
✅ No MQTT complexity  
✅ Portal integration ready  

---

**Your agent already has the job execution engine** - it just needs HTTP polling instead of MQTT!
