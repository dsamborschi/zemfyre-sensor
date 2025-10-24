# Test K8s-Style Resource Limits
# This script demonstrates CPU and memory resource limits

Write-Host "`n=== K8s-Style Resource Limits Test ===" -ForegroundColor Cyan
Write-Host "This script deploys containers with resource limits and monitors usage`n"

# Configuration
$DB_PATH = "C:\Users\Dan\zemfyre-sensor\agent\data\agent.db"
$API_URL = "http://localhost:48484"

# Check if agent database exists
if (-not (Test-Path $DB_PATH)) {
    Write-Host "❌ Agent database not found at: $DB_PATH" -ForegroundColor Red
    Write-Host "Please start the agent first`n" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Agent database found`n" -ForegroundColor Green

# Test Case 1: Conservative limits (typical IoT device)
$state1 = @{
    apps = @{
        "2001" = @{
            appId = 2001
            appName = "resource-test-conservative"
            services = @(
                @{
                    serviceId = 1
                    serviceName = "nginx-limited"
                    imageName = "nginx:alpine"
                    config = @{
                        image = "nginx:alpine"
                        ports = @("8081:80")
                        resources = @{
                            limits = @{
                                cpu = "0.5"
                                memory = "256Mi"
                            }
                            requests = @{
                                cpu = "0.25"
                                memory = "128Mi"
                            }
                        }
                    }
                }
            )
        }
    }
} | ConvertTo-Json -Depth 10

Write-Host "📋 Test Case 1: Conservative Limits" -ForegroundColor Cyan
Write-Host "  - CPU Limit: 0.5 (50% of 1 CPU)"
Write-Host "  - Memory Limit: 256Mi"
Write-Host "  - CPU Request: 0.25 (25% of 1 CPU)"
Write-Host "  - Memory Request: 128Mi`n"

# Insert into database
Write-Host "Inserting target state into database..." -ForegroundColor Yellow
sqlite3 $DB_PATH "DELETE FROM stateSnapshot WHERE type='target';"
sqlite3 $DB_PATH "INSERT INTO stateSnapshot (type, state) VALUES ('target', '$($state1 -replace "'", "''")');
"

Write-Host "✅ Target state updated`n" -ForegroundColor Green
Write-Host "⏳ Waiting for reconciliation (30s)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Check if container started
Write-Host "`nChecking container status..." -ForegroundColor Yellow
$containerInfo = docker ps --filter "label=iotistic.app-id=2001" --format "{{.ID}} {{.Names}} {{.Status}}"

if ($containerInfo) {
    Write-Host "✅ Container started successfully!" -ForegroundColor Green
    Write-Host "Container: $containerInfo`n"
    
    # Get container ID
    $containerId = ($containerInfo -split " ")[0]
    
    # Inspect resource limits
    Write-Host "📊 Applied Resource Limits:" -ForegroundColor Cyan
    docker inspect $containerId | ConvertFrom-Json | ForEach-Object {
        $config = $_.HostConfig
        Write-Host "  NanoCpus: $($config.NanoCpus) ($(($config.NanoCpus / 1000000000).ToString('0.0')) CPUs)"
        Write-Host "  Memory: $($config.Memory) bytes ($(($config.Memory / 1024 / 1024).ToString('0')) MiB)"
        Write-Host "  CpuShares: $($config.CpuShares) ($(($config.CpuShares / 1024).ToString('0.00')) CPUs weight)"
        Write-Host "  MemoryReservation: $($config.MemoryReservation) bytes ($(($config.MemoryReservation / 1024 / 1024).ToString('0')) MiB)`n"
    }
    
    # Monitor resource usage
    Write-Host "📈 Current Resource Usage (5 second snapshot):" -ForegroundColor Cyan
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" $containerId
    
} else {
    Write-Host "❌ Container failed to start" -ForegroundColor Red
    Write-Host "Check agent logs for errors`n"
}

Write-Host "`n" -ForegroundColor White

# Test Case 2: Generous limits (powerful device)
Write-Host "📋 Test Case 2: Generous Limits (for testing)" -ForegroundColor Cyan
Write-Host "  - CPU Limit: 2 (2 full CPUs)"
Write-Host "  - Memory Limit: 1Gi"
Write-Host "  - CPU Request: 1 (1 full CPU)"
Write-Host "  - Memory Request: 512Mi`n"

$state2 = @{
    apps = @{
        "2001" = @{
            appId = 2001
            appName = "resource-test-generous"
            services = @(
                @{
                    serviceId = 1
                    serviceName = "nginx-generous"
                    imageName = "nginx:alpine"
                    config = @{
                        image = "nginx:alpine"
                        ports = @("8082:80")
                        resources = @{
                            limits = @{
                                cpu = "2"
                                memory = "1Gi"
                            }
                            requests = @{
                                cpu = "1"
                                memory = "512Mi"
                            }
                        }
                    }
                }
            )
        }
    }
} | ConvertTo-Json -Depth 10

$response = Read-Host "Update to generous limits? (y/n)"
if ($response -eq "y") {
    Write-Host "`nUpdating target state..." -ForegroundColor Yellow
    sqlite3 $DB_PATH "DELETE FROM stateSnapshot WHERE type='target';"
    sqlite3 $DB_PATH "INSERT INTO stateSnapshot (type, state) VALUES ('target', '$($state2 -replace "'", "''")');"
    
    Write-Host "✅ Updated to generous limits`n" -ForegroundColor Green
    Write-Host "⏳ Waiting for reconciliation (30s)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
    
    # Check updated container
    Write-Host "`nChecking updated container..." -ForegroundColor Yellow
    $containerInfo = docker ps --filter "label=iotistic.app-id=2001" --format "{{.ID}} {{.Names}}"
    
    if ($containerInfo) {
        $containerId = ($containerInfo -split " ")[0]
        
        Write-Host "📊 Updated Resource Limits:" -ForegroundColor Cyan
        docker inspect $containerId | ConvertFrom-Json | ForEach-Object {
            $config = $_.HostConfig
            Write-Host "  NanoCpus: $($config.NanoCpus) ($(($config.NanoCpus / 1000000000).ToString('0.0')) CPUs)"
            Write-Host "  Memory: $($config.Memory) bytes ($(($config.Memory / 1024 / 1024).ToString('0')) MiB)"
            Write-Host "  CpuShares: $($config.CpuShares) ($(($config.CpuShares / 1024).ToString('0.00')) CPUs weight)"
            Write-Host "  MemoryReservation: $($config.MemoryReservation) bytes ($(($config.MemoryReservation / 1024 / 1024).ToString('0')) MiB)`n"
        }
    }
}

# Test Case 3: Millicores format (K8s standard)
Write-Host "`n📋 Test Case 3: Millicores Format" -ForegroundColor Cyan
Write-Host "  - CPU Limit: 500m (500 millicores = 0.5 CPU)"
Write-Host "  - Memory Limit: 512Mi (binary format)`n"

$state3 = @{
    apps = @{
        "2001" = @{
            appId = 2001
            appName = "resource-test-millicores"
            services = @(
                @{
                    serviceId = 1
                    serviceName = "nginx-millicores"
                    imageName = "nginx:alpine"
                    config = @{
                        image = "nginx:alpine"
                        ports = @("8083:80")
                        resources = @{
                            limits = @{
                                cpu = "500m"
                                memory = "512Mi"
                            }
                            requests = @{
                                cpu = "250m"
                                memory = "256Mi"
                            }
                        }
                    }
                }
            )
        }
    }
} | ConvertTo-Json -Depth 10

$response = Read-Host "Test millicores format? (y/n)"
if ($response -eq "y") {
    Write-Host "`nUpdating target state..." -ForegroundColor Yellow
    sqlite3 $DB_PATH "DELETE FROM stateSnapshot WHERE type='target';"
    sqlite3 $DB_PATH "INSERT INTO stateSnapshot (type, state) VALUES ('target', '$($state3 -replace "'", "''")');"
    
    Write-Host "✅ Updated to millicores format`n" -ForegroundColor Green
    Write-Host "⏳ Waiting for reconciliation (30s)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
    
    # Verify conversion
    Write-Host "`nVerifying millicores conversion..." -ForegroundColor Yellow
    $containerInfo = docker ps --filter "label=iotistic.app-id=2001" --format "{{.ID}}"
    
    if ($containerInfo) {
        docker inspect $containerInfo | ConvertFrom-Json | ForEach-Object {
            $config = $_.HostConfig
            $nanoCpus = $config.NanoCpus
            $expectedNanoCpus = 500000000  # 500m = 500000000 nanocpus
            
            if ($nanoCpus -eq $expectedNanoCpus) {
                Write-Host "✅ Millicores conversion correct!" -ForegroundColor Green
                Write-Host "  Expected: $expectedNanoCpus nanocpus"
                Write-Host "  Got: $nanoCpus nanocpus`n"
            } else {
                Write-Host "❌ Millicores conversion mismatch!" -ForegroundColor Red
                Write-Host "  Expected: $expectedNanoCpus nanocpus"
                Write-Host "  Got: $nanoCpus nanocpus`n"
            }
        }
    }
}

# Cleanup
Write-Host "`n🧹 Cleanup" -ForegroundColor Cyan
$response = Read-Host "Remove test containers? (y/n)"
if ($response -eq "y") {
    Write-Host "`nRemoving test app..." -ForegroundColor Yellow
    sqlite3 $DB_PATH "DELETE FROM stateSnapshot WHERE type='target';"
    sqlite3 $DB_PATH "INSERT INTO stateSnapshot (type, state) VALUES ('target', '{\"apps\":{}}');"
    
    Write-Host "✅ Target state cleared`n" -ForegroundColor Green
    Write-Host "⏳ Waiting for cleanup (30s)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
    
    Write-Host "✅ Cleanup complete!`n" -ForegroundColor Green
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
Write-Host "See agent/docs/RESOURCE-LIMITS.md for full documentation`n"
