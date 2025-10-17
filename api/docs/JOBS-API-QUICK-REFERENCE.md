# Device Jobs API - Quick Test Commands

## Start API
```powershell
cd C:\Users\Dan\zemfyre-sensor\api
.\start-api.bat
```

## Common API Calls

### 1. List Templates
```powershell
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/jobs/templates" | Select-Object -ExpandProperty templates | Format-Table id, name, description
```

### 2. Get Devices
```powershell
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices" | Select-Object -ExpandProperty devices | Format-Table uuid, device_name, is_online
```

### 3. Execute Job
```powershell
$body = @{
    job_name = "Test Job - $(Get-Date -Format 'HH:mm:ss')"
    template_id = 3  # health-check
    target_type = "device"
    target_devices = @("8479359e-dbeb-4858-813c-e8a9008dde04")
    timeout_seconds = 300
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4002/api/v1/jobs/execute" `
    -Method POST -Body $body -ContentType "application/json"
```

### 4. Device Poll for Job
```powershell
$deviceUuid = "8479359e-dbeb-4858-813c-e8a9008dde04"
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$deviceUuid/jobs/next"
```

### 5. Update Job Status
```powershell
$deviceUuid = "8479359e-dbeb-4858-813c-e8a9008dde04"
$jobId = "YOUR-JOB-ID-HERE"

# Mark as IN_PROGRESS
$body = @{
    status = "IN_PROGRESS"
    status_details = @{
        message = "Job is running"
        progress = 50
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$deviceUuid/jobs/$jobId/status" `
    -Method PATCH -Body $body -ContentType "application/json"

# Mark as SUCCEEDED
$body = @{
    status = "SUCCEEDED"
    exit_code = 0
    stdout = "Job completed successfully"
    stderr = ""
    status_details = @{
        message = "All tasks completed"
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$deviceUuid/jobs/$jobId/status" `
    -Method PATCH -Body $body -ContentType "application/json"
```

### 6. View Device Job History
```powershell
$deviceUuid = "8479359e-dbeb-4858-813c-e8a9008dde04"
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$deviceUuid/jobs" | 
    Select-Object -ExpandProperty jobs | 
    Format-Table job_name, status, started_at, completed_at
```

### 7. List All Job Executions
```powershell
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/jobs/executions" | 
    Select-Object -ExpandProperty executions |
    Format-Table job_name, status, target_device_count, created_at
```

### 8. Create Custom Template
```powershell
$body = @{
    name = "custom-backup"
    description = "Backup configuration files"
    category = "maintenance"
    job_document = @{
        version = "1.0"
        steps = @(
            @{
                action = @{
                    type = "runCommand"
                    input = @{
                        command = "tar -czf /tmp/backup.tar.gz /app/config"
                    }
                }
            },
            @{
                action = @{
                    type = "runHandler"
                    input = @{
                        handler = "backup-upload.sh"
                    }
                }
            }
        )
        includeStdOut = $true
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:4002/api/v1/jobs/templates" `
    -Method POST -Body $body -ContentType "application/json"
```

## Full Workflow Test
```powershell
.\test-device-jobs.ps1
```

## Database Queries (PostgreSQL)

### View all templates
```sql
SELECT id, name, description, category, is_active FROM job_templates ORDER BY name;
```

### View all executions
```sql
SELECT 
    job_id, 
    job_name, 
    status, 
    target_device_count,
    succeeded_count,
    failed_count,
    created_at
FROM job_executions 
ORDER BY created_at DESC 
LIMIT 10;
```

### View device job status
```sql
SELECT 
    djs.device_uuid,
    d.device_name,
    je.job_name,
    djs.status,
    djs.exit_code,
    djs.started_at,
    djs.completed_at
FROM device_job_status djs
JOIN job_executions je ON djs.job_id = je.job_id
JOIN devices d ON djs.device_uuid = d.uuid
ORDER BY djs.started_at DESC
LIMIT 20;
```

## cURL Examples (Cross-Platform)

### List templates
```bash
curl http://localhost:4002/api/v1/jobs/templates
```

### Execute job
```bash
curl -X POST http://localhost:4002/api/v1/jobs/execute \
  -H "Content-Type: application/json" \
  -d '{
    "job_name": "Test Job",
    "template_id": 3,
    "target_type": "device",
    "target_devices": ["8479359e-dbeb-4858-813c-e8a9008dde04"],
    "timeout_seconds": 300
  }'
```

### Poll for job (from device)
```bash
curl http://localhost:4002/api/v1/devices/8479359e-dbeb-4858-813c-e8a9008dde04/jobs/next
```

### Update status (from device)
```bash
curl -X PATCH http://localhost:4002/api/v1/devices/8479359e-dbeb-4858-813c-e8a9008dde04/jobs/JOB_ID/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "SUCCEEDED",
    "exit_code": 0,
    "stdout": "Job completed",
    "stderr": ""
  }'
```

## Monitoring Job Execution

### Watch for new jobs (real-time monitoring)
```powershell
while ($true) {
    Clear-Host
    Write-Host "=== Active Jobs ===" -ForegroundColor Cyan
    Invoke-RestMethod -Uri "http://localhost:4002/api/v1/jobs/executions?status=IN_PROGRESS" | 
        Select-Object -ExpandProperty executions |
        Format-Table job_name, target_device_count, succeeded_count, failed_count
    Start-Sleep -Seconds 5
}
```

### Check device queue
```powershell
$deviceUuid = "8479359e-dbeb-4858-813c-e8a9008dde04"
while ($true) {
    $job = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$deviceUuid/jobs/next"
    if ($job.job_id) {
        Write-Host "New job available: $($job.job_name)" -ForegroundColor Green
        break
    }
    Write-Host "No jobs... waiting" -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}
```

## Troubleshooting

### Check if API is running
```powershell
Invoke-RestMethod -Uri "http://localhost:4002/"
```

### View API documentation
```powershell
Invoke-RestMethod -Uri "http://localhost:4002/api/docs"
```

### Check database connection
```powershell
psql -h localhost -U postgres -d iotistic -c "SELECT COUNT(*) FROM job_templates;"
```

### View recent API logs
Check the CMD window where `start-api.bat` is running for real-time logs.

---

**Pro Tip**: Keep `start-api.bat` running in a separate CMD window during development. The logs will show all API requests and database queries in real-time.
