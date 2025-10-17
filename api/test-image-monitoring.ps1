# Test Image Monitoring Service
# Demonstrates Docker Hub polling and auto-approval request creation

$BaseUrl = "http://localhost:4002/api/v1"

Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "Image Monitoring Service Test" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan

# 1. Check monitor status
Write-Host "`n1. Checking monitor status..." -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "$BaseUrl/images/monitor/status" -Method GET
    Write-Host "   ✅ Monitor Status:" -ForegroundColor Green
    Write-Host "      Running: $($status.running)" -ForegroundColor White
    Write-Host "      Check Interval: $($status.checkIntervalMinutes) minutes" -ForegroundColor White
} catch {
    Write-Host "   ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 2. List monitored images
Write-Host "`n2. Listing monitored images..." -ForegroundColor Yellow
try {
    $images = Invoke-RestMethod -Uri "$BaseUrl/images?status=approved" -Method GET
    $monitoredCount = ($images | Where-Object { $_.watch_for_updates -eq $true }).Count
    Write-Host "   ✅ Total approved images: $($images.Count)" -ForegroundColor Green
    Write-Host "   ✅ Monitored images: $monitoredCount" -ForegroundColor Green
    
    Write-Host "`n   Monitored Images:" -ForegroundColor Cyan
    $images | Where-Object { $_.watch_for_updates -eq $true } | ForEach-Object {
        Write-Host "      - $($_.image_name) (ID: $($_.id))" -ForegroundColor White
    }
} catch {
    Write-Host "   ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Manually trigger check for Redis
Write-Host "`n3. Manually triggering check for Redis..." -ForegroundColor Yellow
try {
    $redisImage = $images | Where-Object { $_.image_name -eq 'redis' } | Select-Object -First 1
    
    if ($redisImage) {
        $result = Invoke-RestMethod -Uri "$BaseUrl/images/$($redisImage.id)/check" -Method POST
        Write-Host "   ✅ Check triggered: $($result.message)" -ForegroundColor Green
        Write-Host "      Image: $($result.image_name)" -ForegroundColor White
        
        # Wait a bit for the check to complete
        Start-Sleep -Seconds 5
    } else {
        Write-Host "   ⚠️  Redis image not found in registry" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Check for new approval requests
Write-Host "`n4. Checking for new approval requests..." -ForegroundColor Yellow
try {
    $approvalRequests = Invoke-RestMethod -Uri "$BaseUrl/images/approval-requests?status=pending" -Method GET
    Write-Host "   ✅ Pending approval requests: $($approvalRequests.Count)" -ForegroundColor Green
    
    if ($approvalRequests.Count -gt 0) {
        Write-Host "`n   Recent Requests:" -ForegroundColor Cyan
        $approvalRequests | Select-Object -First 5 | ForEach-Object {
            $metadata = if ($_.metadata) { $_.metadata | ConvertFrom-Json } else { $null }
            $autoDetected = if ($metadata -and $metadata.auto_detected) { "🤖 Auto" } else { "👤 Manual" }
            Write-Host "      $autoDetected - $($_.image_name):$($_.tag_name) (ID: $($_.id))" -ForegroundColor White
        }
    }
} catch {
    Write-Host "   ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Disable monitoring for a specific image
Write-Host "`n5. Testing monitoring control (disable/enable)..." -ForegroundColor Yellow
try {
    $nginxImage = $images | Where-Object { $_.image_name -eq 'nginx' } | Select-Object -First 1
    
    if ($nginxImage) {
        # Disable
        $result = Invoke-RestMethod -Uri "$BaseUrl/images/$($nginxImage.id)/monitoring" `
            -Method PUT `
            -Body (@{ watch_for_updates = $false } | ConvertTo-Json) `
            -ContentType "application/json"
        Write-Host "   ✅ Monitoring disabled for nginx" -ForegroundColor Green
        
        Start-Sleep -Seconds 1
        
        # Re-enable
        $result = Invoke-RestMethod -Uri "$BaseUrl/images/$($nginxImage.id)/monitoring" `
            -Method PUT `
            -Body (@{ watch_for_updates = $true } | ConvertTo-Json) `
            -ContentType "application/json"
        Write-Host "   ✅ Monitoring re-enabled for nginx" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Trigger full system check
Write-Host "`n6. Triggering full system check..." -ForegroundColor Yellow
try {
    $result = Invoke-RestMethod -Uri "$BaseUrl/images/monitor/trigger" -Method POST
    Write-Host "   ✅ Full check triggered" -ForegroundColor Green
    Write-Host "      Images checked: $($result.images_checked)" -ForegroundColor White
    
    Write-Host "`n   ⏳ Waiting 10 seconds for checks to complete..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
} catch {
    Write-Host "   ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 7. Check final approval requests count
Write-Host "`n7. Final approval requests count..." -ForegroundColor Yellow
try {
    $approvalRequests = Invoke-RestMethod -Uri "$BaseUrl/images/approval-requests?status=pending" -Method GET
    Write-Host "   ✅ Total pending approval requests: $($approvalRequests.Count)" -ForegroundColor Green
    
    if ($approvalRequests.Count -gt 0) {
        Write-Host "`n   Latest Requests:" -ForegroundColor Cyan
        $approvalRequests | Select-Object -First 10 | ForEach-Object {
            $metadata = if ($_.metadata) { $_.metadata | ConvertFrom-Json } else { $null }
            $source = if ($metadata -and $metadata.source) { $metadata.source } else { "unknown" }
            Write-Host "      📋 $($_.image_name):$($_.tag_name) (source: $source)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "   ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "✅ Image Monitoring Test Complete!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "  - Review pending approval requests" -ForegroundColor White
Write-Host "  - Approve new tags via: PUT /api/v1/images/approval-requests/:id/approve" -ForegroundColor White
Write-Host "  - Monitor service runs automatically every 60 minutes" -ForegroundColor White
Write-Host "`n"
