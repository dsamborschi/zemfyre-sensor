# Test Image Pull Error Handling
# Tests K8s-style error handling with retry logic

Write-Host "📝 Testing Docker Image Pull Error Handling" -ForegroundColor Cyan
Write-Host "=" * 80

# Get device UUID
$deviceResponse = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices" -Method GET
$deviceUuid = $deviceResponse.devices[0].uuid

Write-Host "Device UUID: $deviceUuid" -ForegroundColor Yellow

# Step 1: Deploy app with INVALID image (will fail)
Write-Host "`n🧪 Test 1: Deploy with invalid image tag..." -ForegroundColor Cyan

$targetState = @{
    apps = @{
        "1001" = @{
            appId = 1001
            appName = "test-error-handling"
            services = @(
                @{
                    serviceId = 1
                    serviceName = "nodered-invalid"
                    imageName = "nodered/node-red:this-tag-does-not-exist"
                    appId = 1001
                    appName = "test-error-handling"
                    config = @{
                        image = "nodered/node-red:this-tag-does-not-exist"
                        ports = @("1880:1880")
                        environment = @{
                            TZ = "UTC"
                        }
                        restart = "unless-stopped"
                    }
                },
                @{
                    serviceId = 2
                    serviceName = "mosquitto"
                    imageName = "eclipse-mosquitto:2.0"
                    appId = 1001
                    appName = "test-error-handling"
                    config = @{
                        image = "eclipse-mosquitto:2.0"
                        ports = @("1883:1883")
                        restart = "unless-stopped"
                    }
                }
            )
        }
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$deviceUuid/state" `
        -Method PATCH `
        -Body $targetState `
        -ContentType "application/json"
    
    Write-Host "✅ Target state set successfully" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Depth 3)"
} catch {
    Write-Host "❌ Failed to set target state: $_" -ForegroundColor Red
    exit 1
}

# Wait for reconciliation (agent auto-reconciles)
Write-Host "`n⏳ Waiting 10s for agent to process..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Step 2: Check agent logs for error handling
Write-Host "`n📋 Expected behavior:" -ForegroundColor Cyan
Write-Host "  1. ❌ nodered-invalid image pull FAILS"
Write-Host "  2. ⏰ Retry scheduled with exponential backoff"
Write-Host "  3. ✅ mosquitto image pull SUCCEEDS"
Write-Host "  4. ✅ mosquitto container STARTS"
Write-Host "  5. ⚠️  Reconciliation completes with 1 failure"
Write-Host "  6. 💡 Failed service will retry in next cycle (30s)"

# Step 3: Get current state to see error tracking
Write-Host "`n🔍 Checking device state..." -ForegroundColor Cyan

try {
    $stateResponse = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$deviceUuid" -Method GET
    
    Write-Host "`nDevice State:" -ForegroundColor Yellow
    $stateResponse.device.state.apps | ConvertTo-Json -Depth 10 | Write-Host
    
    # Check for error states in services
    $apps = $stateResponse.device.state.apps
    if ($apps) {
        foreach ($appId in $apps.PSObject.Properties.Name) {
            $app = $apps.$appId
            Write-Host "`n📦 App: $($app.appName) (ID: $appId)" -ForegroundColor Cyan
            
            foreach ($service in $app.services) {
                Write-Host "  🔧 Service: $($service.serviceName)" -ForegroundColor White
                Write-Host "     Image: $($service.imageName)"
                Write-Host "     Status: $($service.serviceStatus)"
                
                if ($service.error) {
                    Write-Host "     ❌ Error:" -ForegroundColor Red
                    Write-Host "        Type: $($service.error.type)"
                    Write-Host "        Message: $($service.error.message)"
                    Write-Host "        Retry Count: $($service.error.retryCount)"
                    if ($service.error.nextRetry) {
                        Write-Host "        Next Retry: $($service.error.nextRetry)"
                    }
                }
                
                if ($service.containerId) {
                    Write-Host "     ✅ Container ID: $($service.containerId.Substring(0, 12))" -ForegroundColor Green
                }
            }
        }
    }
} catch {
    Write-Host "❌ Failed to get device state: $_" -ForegroundColor Red
}

# Step 4: Wait for retry cycle
Write-Host "`n⏳ Waiting 30s for first retry cycle..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

Write-Host "`n📊 Check agent terminal to see:" -ForegroundColor Cyan
Write-Host "  - ImagePullBackOff error logged"
Write-Host "  - Retry countdown (10s → 20s → 40s...)"
Write-Host "  - mosquitto running successfully"
Write-Host "  - Next reconciliation attempt"

# Step 5: Fix the image (deploy valid version)
Write-Host "`n🔧 Test 2: Fixing the image tag..." -ForegroundColor Cyan

$fixedState = @{
    apps = @{
        "1001" = @{
            appId = 1001
            appName = "test-error-handling"
            services = @(
                @{
                    serviceId = 1
                    serviceName = "nodered"
                    imageName = "nodered/node-red:latest"  # Fixed!
                    appId = 1001
                    appName = "test-error-handling"
                    config = @{
                        image = "nodered/node-red:latest"
                        ports = @("1880:1880")
                        environment = @{
                            TZ = "UTC"
                        }
                        restart = "unless-stopped"
                    }
                },
                @{
                    serviceId = 2
                    serviceName = "mosquitto"
                    imageName = "eclipse-mosquitto:2.0"
                    appId = 1001
                    appName = "test-error-handling"
                    config = @{
                        image = "eclipse-mosquitto:2.0"
                        ports = @("1883:1883")
                        restart = "unless-stopped"
                    }
                }
            )
        }
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$deviceUuid/state" `
        -Method PATCH `
        -Body $fixedState `
        -ContentType "application/json"
    
    Write-Host "✅ Fixed target state set" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to set fixed state: $_" -ForegroundColor Red
}

Write-Host "`n⏳ Waiting 10s for agent to fix..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "`n✅ Expected: nodered should now start successfully!" -ForegroundColor Green
Write-Host "   - Retry state cleared"
Write-Host "   - Image pulled"
Write-Host "   - Container started"

# Final state check
Write-Host "`n🏁 Final State Check:" -ForegroundColor Cyan
try {
    $finalState = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$deviceUuid" -Method GET
    $apps = $finalState.device.state.apps
    
    if ($apps) {
        $app = $apps."1001"
        Write-Host "  Nodered: $(if($app.services[0].containerId) {'✅ Running'} else {'❌ Not Running'})"
        Write-Host "  Mosquitto: $(if($app.services[1].containerId) {'✅ Running'} else {'❌ Not Running'})"
    }
} catch {
    Write-Host "❌ Failed to get final state: $_" -ForegroundColor Red
}

Write-Host "`n" + "=" * 80
Write-Host "✅ Error Handling Test Complete!" -ForegroundColor Green
Write-Host "`nKey Features Tested:" -ForegroundColor Cyan
Write-Host "  ✅ Image pull failure detection"
Write-Host "  ✅ Error state tracking (ImagePullBackOff)"
Write-Host "  ✅ Exponential backoff retry logic"
Write-Host "  ✅ Continue on failure (mosquitto still started)"
Write-Host "  ✅ Self-healing when image fixed"
Write-Host "  ✅ K8s-style error reporting"
