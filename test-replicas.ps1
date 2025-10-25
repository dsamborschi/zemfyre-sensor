# Test Replicas Control - Shows the difference between removing service vs setting replicas: 0
# Run this script to test the replicas feature

param(
    [Parameter(Mandatory=$false)]
    [string]$DeviceUuid = "test-device-001"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Testing Replicas Control" -ForegroundColor Cyan
Write-Host "Device UUID: $DeviceUuid" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# PostgreSQL connection
$env:PGPASSWORD = "postgres"
$PSQL = "psql -U postgres -d iotistic -t -A"

function Invoke-Sql {
    param([string]$Query)
    $result = Invoke-Expression "$PSQL -c `"$Query`""
    return $result
}

function Get-TargetState {
    Write-Host "`n--- TARGET STATE (database) ---" -ForegroundColor Yellow
    $result = Invoke-Sql "SELECT apps FROM device_target_state WHERE device_uuid = '$DeviceUuid';"
    if ($result) {
        $result | ConvertFrom-Json | ConvertTo-Json -Depth 10
    } else {
        Write-Host "No target state found" -ForegroundColor Red
    }
}

function Get-CurrentState {
    Write-Host "`n--- CURRENT STATE (database) ---" -ForegroundColor Yellow
    $result = Invoke-Sql "SELECT apps FROM device_current_state WHERE device_uuid = '$DeviceUuid';"
    if ($result) {
        $result | ConvertFrom-Json | ConvertTo-Json -Depth 10
    } else {
        Write-Host "No current state found" -ForegroundColor Red
    }
}

function Get-DockerContainers {
    Write-Host "`n--- DOCKER CONTAINERS (actual) ---" -ForegroundColor Yellow
    docker ps -a --filter "name=nodered" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

# Test 1: Service with replicas: 1 (running)
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "TEST 1: Service Running (replicas: 1)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

$runningState = @{
    "1001" = @{
        appId = "1001"
        appName = "test-app"
        services = @(
            @{
                config = @{
                    ports = @("1886:1880")
                    restart = "unless-stopped"
                    volumes = @("nodered-data:/data")
                    resources = @{
                        limits = @{
                            cpu = "1"
                            memory = "512Mi"
                        }
                        requests = @{
                            cpu = "0.5"
                            memory = "256Mi"
                        }
                    }
                    environment = @{
                        TZ = "UTC"
                        NODE_RED_ENABLE_PROJECTS = "true"
                    }
                }
                imageName = "nodered/node-red:latest"
                serviceId = "2"
                serviceName = "nodered"
                replicas = 1  # ← Running
            }
        )
    }
}

$runningJson = $runningState | ConvertTo-Json -Depth 10 -Compress
$runningJsonEscaped = $runningJson.Replace("'", "''")

Write-Host "`nUpdating target state with replicas: 1..." -ForegroundColor Cyan
Invoke-Sql "INSERT INTO device_target_state (device_uuid, apps, config, version) VALUES ('$DeviceUuid', '$runningJsonEscaped', '{}', 1) ON CONFLICT (device_uuid) DO UPDATE SET apps = '$runningJsonEscaped', version = device_target_state.version + 1, updated_at = CURRENT_TIMESTAMP;"

Get-TargetState
Get-CurrentState
Get-DockerContainers

Write-Host "`n✅ Wait 60s for agent to poll and start container..." -ForegroundColor Cyan
Write-Host "(Or send MQTT notification for immediate start)" -ForegroundColor Gray

# Test 2: Service with replicas: 0 (stopped but config preserved)
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "TEST 2: Service Stopped (replicas: 0)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

$stoppedState = @{
    "1001" = @{
        appId = "1001"
        appName = "test-app"
        services = @(
            @{
                config = @{
                    ports = @("1886:1880")
                    restart = "unless-stopped"
                    volumes = @("nodered-data:/data")
                    resources = @{
                        limits = @{
                            cpu = "1"
                            memory = "512Mi"
                        }
                        requests = @{
                            cpu = "0.5"
                            memory = "256Mi"
                        }
                    }
                    environment = @{
                        TZ = "UTC"
                        NODE_RED_ENABLE_PROJECTS = "true"
                    }
                }
                imageName = "nodered/node-red:latest"
                serviceId = "2"
                serviceName = "nodered"
                replicas = 0  # ← Stopped (config preserved!)
            }
        )
    }
}

$stoppedJson = $stoppedState | ConvertTo-Json -Depth 10 -Compress
$stoppedJsonEscaped = $stoppedJson.Replace("'", "''")

Write-Host "`nPress Enter to test replicas: 0 (stop service, keep config)..."
Read-Host

Write-Host "Updating target state with replicas: 0..." -ForegroundColor Cyan
Invoke-Sql "UPDATE device_target_state SET apps = '$stoppedJsonEscaped', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE device_uuid = '$DeviceUuid';"

Get-TargetState
Get-CurrentState
Get-DockerContainers

Write-Host "`n✅ Wait 60s for agent to poll and stop container..." -ForegroundColor Cyan
Write-Host "(Or send MQTT notification for immediate stop)" -ForegroundColor Gray
Write-Host "`n⚠️  NOTICE: Current state will be empty (no containers running)" -ForegroundColor Yellow
Write-Host "   But target state PRESERVES the config for easy restart!" -ForegroundColor Yellow

# Test 3: Service removed completely
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "TEST 3: Service Removed (no config)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "`nPress Enter to test complete removal (config lost)..."
Read-Host

Write-Host "Removing service from target state..." -ForegroundColor Cyan
Invoke-Sql "UPDATE device_target_state SET apps = '{}', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE device_uuid = '$DeviceUuid';"

Get-TargetState
Get-CurrentState
Get-DockerContainers

Write-Host "`n✅ Wait 60s for agent to poll and remove container..." -ForegroundColor Cyan
Write-Host "⚠️  NOTICE: Config is LOST - you'll need to re-specify everything to redeploy!" -ForegroundColor Yellow

# Summary
Write-Host "`n======================================" -ForegroundColor Cyan
Write-Host "SUMMARY: Two Ways to Stop a Service" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Set replicas: 0" -ForegroundColor Green
Write-Host "   - Container stopped & removed" -ForegroundColor White
Write-Host "   - Config PRESERVED in target state" -ForegroundColor White
Write-Host "   - Current state empty (no containers)" -ForegroundColor White
Write-Host "   - Easy to restart: just set replicas: 1" -ForegroundColor White
Write-Host ""
Write-Host "2. Remove from target state" -ForegroundColor Red
Write-Host "   - Container stopped & removed" -ForegroundColor White
Write-Host "   - Config LOST" -ForegroundColor White
Write-Host "   - Current state empty" -ForegroundColor White
Write-Host "   - To restart: must re-specify entire config" -ForegroundColor White
Write-Host ""
Write-Host "✨ Use replicas: 0 for temporary stop (like maintenance)" -ForegroundColor Cyan
Write-Host "🗑️  Remove completely only for permanent deletion" -ForegroundColor Cyan
