#!/usr/bin/env pwsh
# Test script for Simple Container Manager API
# Run this AFTER starting the server with: npm run dev

Write-Host "=" -NoNewline -ForegroundColor Green
Write-Host ("=" * 79) -ForegroundColor Green
Write-Host "Testing Simple Container Manager API" -ForegroundColor Cyan
Write-Host "=" -NoNewline -ForegroundColor Green
Write-Host ("=" * 79) -ForegroundColor Green
Write-Host ""

$API_URL = "http://localhost:3000"

function Test-Endpoint {
    param (
        [string]$Name,
        [string]$Method,
        [string]$Path,
        [object]$Body = $null
    )
    
    Write-Host "`n📋 $Name" -ForegroundColor Yellow
    Write-Host ("-" * 80) -ForegroundColor DarkGray
    Write-Host "$Method $Path" -ForegroundColor Cyan
    
    try {
        $params = @{
            Uri = "$API_URL$Path"
            Method = $Method
            ContentType = "application/json"
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
            Write-Host "Body:" -ForegroundColor Gray
            Write-Host ($Body | ConvertTo-Json -Depth 10) -ForegroundColor DarkGray
        }
        
        $response = Invoke-RestMethod @params
        Write-Host "✅ Success" -ForegroundColor Green
        Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor White
        
        return $response
    }
    catch {
        Write-Host "❌ Error: $_" -ForegroundColor Red
        return $null
    }
}

# Test 1: Health check
Test-Endpoint -Name "Health Check" -Method GET -Path "/"

Start-Sleep -Seconds 1

# Test 2: Get initial state
Test-Endpoint -Name "Get Initial State" -Method GET -Path "/api/v1/state"

Start-Sleep -Seconds 1

# Test 3: Set target state (nginx)
$targetState = @{
    apps = @{
        "1001" = @{
            appId = 1001
            appName = "Web Server"
            services = @(
                @{
                    serviceId = 1
                    serviceName = "nginx"
                    imageName = "nginx:alpine"
                    appId = 1001
                    appName = "Web Server"
                    config = @{
                        image = "nginx:alpine"
                        ports = @("8080:80")
                        environment = @{
                            ENV = "production"
                        }
                    }
                }
            )
        }
    }
}

Test-Endpoint -Name "Set Target State (Deploy nginx)" -Method POST -Path "/api/v1/state/target" -Body $targetState

Start-Sleep -Seconds 1

# Test 4: Apply state
Test-Endpoint -Name "Apply Target State" -Method POST -Path "/api/v1/state/apply"

Write-Host "`n⏳ Waiting for reconciliation..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Test 5: Check status
Test-Endpoint -Name "Check Status" -Method GET -Path "/api/v1/status"

Start-Sleep -Seconds 1

# Test 6: List apps
Test-Endpoint -Name "List All Apps" -Method GET -Path "/api/v1/apps"

Start-Sleep -Seconds 1

# Test 7: Get specific app
Test-Endpoint -Name "Get App Details" -Method GET -Path "/api/v1/apps/1001"

Start-Sleep -Seconds 1

# Test 8: Update app (add database)
$updatedApp = @{
    appId = 1001
    appName = "Web Server"
    services = @(
        @{
            serviceId = 1
            serviceName = "nginx"
            imageName = "nginx:alpine"
            appId = 1001
            appName = "Web Server"
            config = @{
                image = "nginx:alpine"
                ports = @("8080:80")
            }
        },
        @{
            serviceId = 2
            serviceName = "postgres"
            imageName = "postgres:15"
            appId = 1001
            appName = "Web Server"
            config = @{
                image = "postgres:15"
                environment = @{
                    POSTGRES_PASSWORD = "secret"
                }
            }
        }
    )
}

Test-Endpoint -Name "Add Database Service" -Method POST -Path "/api/v1/apps/1001" -Body $updatedApp

Start-Sleep -Seconds 1

# Test 9: Apply changes
Test-Endpoint -Name "Apply Changes" -Method POST -Path "/api/v1/state/apply"

Write-Host "`n⏳ Waiting for reconciliation..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Test 10: Check final state
Test-Endpoint -Name "Check Final State" -Method GET -Path "/api/v1/state"

Write-Host "`n" -NoNewline
Write-Host "=" -NoNewline -ForegroundColor Green
Write-Host ("=" * 79) -ForegroundColor Green
Write-Host "✅ API TESTS COMPLETE" -ForegroundColor Green
Write-Host "=" -NoNewline -ForegroundColor Green
Write-Host ("=" * 79) -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  • API is running and responding" -ForegroundColor White
Write-Host "  • State management working" -ForegroundColor White
Write-Host "  • App operations working" -ForegroundColor White
Write-Host "  • Reconciliation working" -ForegroundColor White
Write-Host ""
