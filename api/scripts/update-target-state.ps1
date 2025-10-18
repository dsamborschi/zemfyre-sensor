# Update Target State for a Device
# Usage: .\update-target-state.ps1 -DeviceUuid "device-uuid-here" [-FilePath "path/to/target-state.json"]

param(
    [Parameter(Mandatory=$true)]
    [string]$DeviceUuid,
    
    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = "http://localhost:4002",
    
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== Update Device Target State ===" -ForegroundColor Cyan
Write-Host "Device UUID: $DeviceUuid" -ForegroundColor Yellow
Write-Host "API URL: $ApiUrl" -ForegroundColor Yellow

# Example target state structure
$exampleTargetState = @{
    apps = @{
        "app-1" = @{
            appId = "app-1"
            name = "mosquitto"
            releaseId = "release-1"
            services = @{
                mosquitto = @{
                    image = "eclipse-mosquitto:2.0"
                    environment = @{
                        TZ = "UTC"
                    }
                    ports = @(
                        "1883:1883"
                        "9001:9001"
                    )
                    volumes = @(
                        "mosquitto-data:/mosquitto/data"
                        "mosquitto-log:/mosquitto/log"
                    )
                    restart = "unless-stopped"
                }
            }
            volumes = @{
                "mosquitto-data" = @{}
                "mosquitto-log" = @{}
            }
        }
        "app-2" = @{
            appId = "app-2"
            name = "nodered"
            services = @{
                nodered = @{
                    image = "nodered/node-red:latest"
                    environment = @{
                        TZ = "UTC"
                        NODE_RED_ENABLE_PROJECTS = "true"
                    }
                    ports = @(
                        "1880:1880"
                    )
                    volumes = @(
                        "nodered-data:/data"
                    )
              
                }
            }
            volumes = @{
                "nodered-data" = @{}
            }
        }
    }
}

# Determine which target state to use
$targetState = $null


Write-Host "`nUsing example target state" -ForegroundColor Green
$targetState = $exampleTargetState


# Display target state summary
Write-Host "`nTarget State Summary:" -ForegroundColor Cyan
if ($targetState.apps) {
    Write-Host "  Apps: $($targetState.apps.Count)" -ForegroundColor White
    foreach ($appId in $targetState.apps.Keys) {
        $app = $targetState.apps[$appId]
        Write-Host "    - $($app.name) (ID: $appId)" -ForegroundColor Gray
        if ($app.services) {
            foreach ($serviceName in $app.services.Keys) {
                $service = $app.services[$serviceName]
                Write-Host "      • $serviceName : $($service.image)" -ForegroundColor DarkGray
            }
        }
    }
}


# Send update request
Write-Host "`nSending update request..." -ForegroundColor Cyan

try {
    $endpoint = "$ApiUrl/api/v1/devices/$DeviceUuid/target-state"
    
    $response = Invoke-RestMethod `
        -Uri $endpoint `
        -Method PUT `
        -Body ($targetState | ConvertTo-Json -Depth 10 -Compress) `
        -ContentType "application/json" `
        -ErrorAction Stop
    
    Write-Host "✅ Target state updated successfully!" -ForegroundColor Green
    
    if ($response.message) {
        Write-Host "`nResponse: $($response.message)" -ForegroundColor White
    }
    
    if ($response.targetState) {
        Write-Host "`nUpdated Target State:" -ForegroundColor Cyan
        Write-Host ($response.targetState | ConvertTo-Json -Depth 3) -ForegroundColor Gray
    }
    
    # Fetch and display current state
    Write-Host "`nFetching current device state..." -ForegroundColor Cyan
    try {
        $deviceState = Invoke-RestMethod `
            -Uri "$ApiUrl/api/v1/devices/$DeviceUuid/state" `
            -Method GET `
            -ErrorAction Stop
        
        Write-Host "`nCurrent State:" -ForegroundColor Cyan
        Write-Host "  Status: $($deviceState.status)" -ForegroundColor White
        Write-Host "  Is Online: $($deviceState.is_online)" -ForegroundColor White
        Write-Host "  Last Seen: $($deviceState.last_connectivity_event)" -ForegroundColor White
        
        if ($deviceState.current_state) {
            Write-Host "`n  Current Apps:" -ForegroundColor Cyan
            if ($deviceState.current_state.apps) {
                foreach ($appId in $deviceState.current_state.apps.Keys) {
                    $app = $deviceState.current_state.apps[$appId]
                    Write-Host "    - $($app.name) (ID: $appId)" -ForegroundColor Gray
                }
            }
            else {
                Write-Host "    (none)" -ForegroundColor DarkGray
            }
        }
    }
    catch {
        Write-Host "⚠️  Could not fetch current state: $_" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "`n❌ Error updating target state:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        try {
            $errorDetail = $_.ErrorDetails.Message | ConvertFrom-Json
            Write-Host "`nError Details:" -ForegroundColor Yellow
            Write-Host ($errorDetail | ConvertTo-Json -Depth 3) -ForegroundColor Gray
        }
        catch {
            Write-Host $_.ErrorDetails.Message -ForegroundColor Gray
        }
    }
    
    exit 1
}

Write-Host "`n=== Update Complete ===" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Device will poll for new target state within ~10 seconds" -ForegroundColor White
Write-Host "2. Check device logs to see state reconciliation" -ForegroundColor White
Write-Host "3. Monitor job executions: GET $ApiUrl/api/v1/jobs/device/$DeviceUuid" -ForegroundColor White
