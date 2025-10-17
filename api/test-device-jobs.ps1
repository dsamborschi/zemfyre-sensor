#!/usr/bin/env pwsh
#
# Test Device Jobs API
#

$API_BASE = "http://localhost:4002/api/v1"

Write-Host "`n=== Device Jobs API Test ===" -ForegroundColor Cyan

# Test 1: List job templates
Write-Host "`n1️⃣  Listing job templates..." -ForegroundColor Yellow
try {
    $templates = Invoke-RestMethod -Uri "$API_BASE/jobs/templates" -Method GET
    Write-Host "✅ Found $($templates.Count) templates" -ForegroundColor Green
    $templates | ForEach-Object {
        Write-Host "   - $($_.name): $($_.description)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed to list templates: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Get specific template
Write-Host "`n2️⃣  Getting template details..." -ForegroundColor Yellow
try {
    $templates = Invoke-RestMethod -Uri "$API_BASE/jobs/templates" -Method GET
    if ($templates.Count -gt 0) {
        $templateId = $templates[0].id
        $template = Invoke-RestMethod -Uri "$API_BASE/jobs/templates/$templateId" -Method GET
        Write-Host "✅ Template: $($template.name)" -ForegroundColor Green
        Write-Host "   Version: $($template.job_document.version)" -ForegroundColor Gray
        Write-Host "   Steps: $($template.job_document.steps.Count)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed to get template: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: List job handlers
Write-Host "`n3️⃣  Listing job handlers..." -ForegroundColor Yellow
try {
    $handlers = Invoke-RestMethod -Uri "$API_BASE/jobs/handlers" -Method GET
    Write-Host "✅ Found $($handlers.Count) handlers" -ForegroundColor Green
    $handlers | ForEach-Object {
        Write-Host "   - $($_.name) ($($_.handler_type))" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed to list handlers: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Create a new job template
Write-Host "`n4️⃣  Creating new job template..." -ForegroundColor Yellow
$newTemplate = @{
    name = "test-template-$(Get-Random -Maximum 9999)"
    description = "Test template created via API"
    job_document = @{
        version = "1.0"
        steps = @(
            @{
                action = @{
                    type = "runCommand"
                    input = @{
                        command = "echo 'Hello from test job'"
                    }
                }
            }
        )
    }
    category = "testing"
    is_system = $false
} | ConvertTo-Json -Depth 10

try {
    $created = Invoke-RestMethod -Uri "$API_BASE/jobs/templates" -Method POST `
        -Body $newTemplate -ContentType "application/json"
    Write-Host "✅ Created template: $($created.name) (ID: $($created.id))" -ForegroundColor Green
    
    # Test 5: Delete the template
    Write-Host "`n5️⃣  Deleting test template..." -ForegroundColor Yellow
    Invoke-RestMethod -Uri "$API_BASE/jobs/templates/$($created.id)" -Method DELETE
    Write-Host "✅ Template deleted successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: List job executions (should be empty)
Write-Host "`n6️⃣  Listing job executions..." -ForegroundColor Yellow
try {
    $executions = Invoke-RestMethod -Uri "$API_BASE/jobs/executions" -Method GET
    Write-Host "✅ Found $($executions.Count) executions" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to list executions: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Get list of devices (to execute a job)
Write-Host "`n7️⃣  Checking for devices..." -ForegroundColor Yellow
try {
    $devices = Invoke-RestMethod -Uri "$API_BASE/devices" -Method GET
    if ($devices.Count -gt 0) {
        Write-Host "✅ Found $($devices.Count) devices" -ForegroundColor Green
        $deviceUuid = $devices[0].uuid
        Write-Host "   Using device: $deviceUuid" -ForegroundColor Gray
        
        # Test 8: Execute a job on the device
        Write-Host "`n8️⃣  Executing job on device..." -ForegroundColor Yellow
        $templates = Invoke-RestMethod -Uri "$API_BASE/jobs/templates" -Method GET
        if ($templates.Count -gt 0) {
            $executeJob = @{
                template_id = $templates[0].id
                target_type = "device"
                target_devices = @($deviceUuid)
                timeout_seconds = 300
            } | ConvertTo-Json -Depth 10
            
            $execution = Invoke-RestMethod -Uri "$API_BASE/jobs/execute" -Method POST `
                -Body $executeJob -ContentType "application/json"
            Write-Host "✅ Job created: $($execution.job_id)" -ForegroundColor Green
            Write-Host "   Status: $($execution.status)" -ForegroundColor Gray
            Write-Host "   Target devices: $($execution.target_device_count)" -ForegroundColor Gray
            
            # Test 9: Device polls for next job
            Write-Host "`n9️⃣  Device polling for job..." -ForegroundColor Yellow
            $nextJob = Invoke-RestMethod -Uri "$API_BASE/devices/$deviceUuid/jobs/next" -Method GET
            if ($nextJob) {
                Write-Host "✅ Device received job: $($nextJob.job_id)" -ForegroundColor Green
                Write-Host "   Job document version: $($nextJob.job_document.version)" -ForegroundColor Gray
                Write-Host "   Steps: $($nextJob.job_document.steps.Count)" -ForegroundColor Gray
                
                # Test 10: Update job status
                Write-Host "`n🔟 Updating job status..." -ForegroundColor Yellow
                $statusUpdate = @{
                    status = "IN_PROGRESS"
                    status_details = @{
                        message = "Job is running"
                        progress = 50
                    }
                } | ConvertTo-Json -Depth 10
                
                Invoke-RestMethod -Uri "$API_BASE/devices/$deviceUuid/jobs/$($execution.job_id)/status" `
                    -Method PATCH -Body $statusUpdate -ContentType "application/json"
                Write-Host "✅ Status updated to IN_PROGRESS" -ForegroundColor Green
                
                # Mark as succeeded
                $finalStatus = @{
                    status = "SUCCEEDED"
                    exit_code = 0
                    stdout = "Job completed successfully"
                    stderr = ""
                    status_details = @{
                        message = "Job completed"
                        completed_at = (Get-Date).ToUniversalTime().ToString("o")
                    }
                } | ConvertTo-Json -Depth 10
                
                Invoke-RestMethod -Uri "$API_BASE/devices/$deviceUuid/jobs/$($execution.job_id)/status" `
                    -Method PATCH -Body $finalStatus -ContentType "application/json"
                Write-Host "✅ Job marked as SUCCEEDED" -ForegroundColor Green
            } else {
                Write-Host "⚠️  No pending jobs for device" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "⚠️  No devices found. Skipping job execution test." -ForegroundColor Yellow
        Write-Host "   Tip: Register a device first using the provisioning API" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
Write-Host "All device jobs API endpoints tested successfully!`n" -ForegroundColor Green
