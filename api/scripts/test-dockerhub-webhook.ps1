#!/usr/bin/env pwsh
# Test Docker Hub webhook with real Docker Hub payload format

Write-Host "`n=== Testing Docker Hub Webhook Payload Format ===" -ForegroundColor Cyan
Write-Host "Based on Docker Hub documentation example`n" -ForegroundColor Gray

# Test 1: Official Redis image (no namespace)
Write-Host "Test 1: Official Redis image (redis)" -ForegroundColor Yellow
try {
    $response1 = Invoke-RestMethod `
        -Uri "http://localhost:4002/api/v1/webhooks/docker-registry" `
        -Method POST `
        -Body (@{
            callback_url = "https://registry.hub.docker.com/u/svendowideit/testhook/hook/123/"
            push_data = @{
                pushed_at = 1417566161
                pusher = "docker"
                tag = "7.2-alpine"
            }
            repository = @{
                comment_count = 0
                date_created = 1417494799
                description = "Redis official image"
                is_official = $true
                is_private = $false
                is_trusted = $true
                name = "redis"
                namespace = "library"
                owner = "library"
                repo_name = "redis"  # Official images: just the name
                repo_url = "https://hub.docker.com/_/redis"
                star_count = 12000
                status = "Active"
            }
        } | ConvertTo-Json -Depth 10) `
        -ContentType "application/json"
    
    Write-Host "  ✅ Success!" -ForegroundColor Green
    Write-Host "  Rollout ID: $($response1.rollout_id)" -ForegroundColor Gray
    Write-Host "  Image: $($response1.image):$($response1.tag)`n" -ForegroundColor Gray
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Test 2: Custom namespaced image (iotistic/agent)
Write-Host "Test 2: Namespaced image (iotistic/agent)" -ForegroundColor Yellow
try {
    $response2 = Invoke-RestMethod `
        -Uri "http://localhost:4002/api/v1/webhooks/docker-registry" `
        -Method POST `
        -Body (@{
            callback_url = "https://registry.hub.docker.com/u/iotistic/agent/hook/456/"
            push_data = @{
                pushed_at = 1417566161
                pusher = "iotistic"
                tag = "v2.1.0"
            }
            repository = @{
                comment_count = 5
                date_created = 1417494799
                description = "Iotistic device agent"
                is_official = $false
                is_private = $false
                is_trusted = $true
                name = "agent"
                namespace = "iotistic"
                owner = "iotistic"
                repo_name = "iotistic/agent"  # Namespaced format
                repo_url = "https://hub.docker.com/r/iotistic/agent"
                star_count = 10
                status = "Active"
            }
        } | ConvertTo-Json -Depth 10) `
        -ContentType "application/json"
    
    Write-Host "  ✅ Success!" -ForegroundColor Green
    Write-Host "  Rollout ID: $($response2.rollout_id)" -ForegroundColor Gray
    Write-Host "  Image: $($response2.image):$($response2.tag)`n" -ForegroundColor Gray
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Test 3: Nginx official image
Write-Host "Test 3: Nginx official image (nginx)" -ForegroundColor Yellow
try {
    $response3 = Invoke-RestMethod `
        -Uri "http://localhost:4002/api/v1/webhooks/docker-registry" `
        -Method POST `
        -Body (@{
            push_data = @{
                tag = "1.25-alpine"
            }
            repository = @{
                repo_name = "nginx"
                namespace = "library"
            }
        } | ConvertTo-Json -Depth 10) `
        -ContentType "application/json"
    
    Write-Host "  ✅ Success!" -ForegroundColor Green
    Write-Host "  Rollout ID: $($response3.rollout_id)" -ForegroundColor Gray
    Write-Host "  Image: $($response3.image):$($response3.tag)`n" -ForegroundColor Gray
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)`n" -ForegroundColor Red
}

Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host "`nNote: Verify that policies are matching correctly:" -ForegroundColor Yellow
Write-Host "  - 'redis:*' should match 'redis'" -ForegroundColor Gray
Write-Host "  - 'iotistic/agent:*' should match 'iotistic/agent'" -ForegroundColor Gray
Write-Host "  - 'nginx*' should match 'nginx'`n" -ForegroundColor Gray
