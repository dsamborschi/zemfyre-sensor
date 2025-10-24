# Update Target State for a Device
# Usage: 
#   .\update-target-state.ps1 -DeviceUuid "device-uuid-here"
#   .\update-target-state.ps1 -DeviceUuid "device-uuid-here" -FilePath "target-state.json"
#   .\update-target-state.ps1 -DeviceUuid "device-uuid-here" -Clear
#   .\update-target-state.ps1 -DeviceUuid "device-uuid-here" -FilePath "target-state.json" -GenerateIds
#   .\update-target-state.ps1 -DeviceUuid "device-uuid-here" -ApiKey "your-api-key"

param(
    [Parameter(Mandatory=$true)]
    [string]$DeviceUuid,
    
    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = "http://localhost:4002",
    
    [Parameter(Mandatory=$false)]
    [string]$ApiKey,
    
    [Parameter(Mandatory=$false)]
    [string]$FilePath,
    
    [Parameter(Mandatory=$false)]
    [switch]$Clear,
    
    [Parameter(Mandatory=$false)]
    [switch]$GenerateIds
)

$ErrorActionPreference = "Stop"

# Function to generate app ID from API
function Get-NextAppId {
    param(
        [string]$AppName,
        [string]$ApiUrl,
        [string]$ApiKey = ""
    )
    
    try {
        $headers = @{
            "Content-Type" = "application/json"
        }
        if ($ApiKey) {
            $headers["X-Device-API-Key"] = $ApiKey
        }
        
        $response = Invoke-RestMethod `
            -Uri "$ApiUrl/api/v1/apps/next-id" `
            -Method POST `
            -Headers $headers `
            -Body (@{ appName = $AppName } | ConvertTo-Json) `
            -ErrorAction Stop
        
        return $response.appId
    }
    catch {
        Write-Host "⚠️  Warning: Could not generate app ID for '$AppName', using fallback" -ForegroundColor Yellow
        return $null
    }
}

# Function to generate service ID from API
function Get-NextServiceId {
    param(
        [string]$ServiceName,
        [int]$AppId,
        [string]$ImageName,
        [string]$ApiUrl,
        [string]$ApiKey = ""
    )
    
    try {
        $headers = @{
            "Content-Type" = "application/json"
        }
        if ($ApiKey) {
            $headers["X-Device-API-Key"] = $ApiKey
        }
        
        $response = Invoke-RestMethod `
            -Uri "$ApiUrl/api/v1/services/next-id" `
            -Method POST `
            -Headers $headers `
            -Body (@{ 
                serviceName = $ServiceName
                appId = $AppId
                imageName = $ImageName
            } | ConvertTo-Json) `
            -ErrorAction Stop
        
        return $response.serviceId
    }
    catch {
        Write-Host "⚠️  Warning: Could not generate service ID for '$ServiceName', using fallback" -ForegroundColor Yellow
        return $null
    }
}

Write-Host "`n=== Update Device Target State ===" -ForegroundColor Cyan
Write-Host "Device UUID: $DeviceUuid" -ForegroundColor Yellow
Write-Host "API URL: $ApiUrl" -ForegroundColor Yellow


# Determine which target state to use
$targetState = $null

# Determine the source of target state
if ($Clear) {
    Write-Host "`nClearing target state (empty apps)" -ForegroundColor Yellow
    $targetState = @{
        apps = @{}
        config = @{}
    }
}
elseif ($FilePath) {
    Write-Host "`nLoading target state from file: $FilePath" -ForegroundColor Green
    
    if (-not (Test-Path $FilePath)) {
        Write-Host "❌ Error: File not found: $FilePath" -ForegroundColor Red
        exit 1
    }
    
    try {
        $fileContent = Get-Content -Path $FilePath -Raw
        $targetState = $fileContent | ConvertFrom-Json -AsHashtable
        
        # Ensure required fields
        if (-not $targetState.apps) {
            Write-Host "⚠️  Warning: 'apps' field missing, adding empty apps object" -ForegroundColor Yellow
            $targetState.apps = @{}
        }
        
        # Generate IDs if requested and apps is array format
        if ($GenerateIds -and $targetState.apps -is [System.Array]) {
            Write-Host "`n🔢 Generating unique IDs from API..." -ForegroundColor Cyan
            
            $appsWithIds = @()
            foreach ($app in $targetState.apps) {
                $appName = if ($app.appName) { $app.appName } else { $app.name }
                
                # Generate app ID if missing
                if (-not $app.appId) {
                    Write-Host "  Generating app ID for '$appName'..." -ForegroundColor Gray
                    $generatedAppId = Get-NextAppId -AppName $appName -ApiUrl $ApiUrl -ApiKey $ApiKey
                    if ($generatedAppId) {
                        $app.appId = $generatedAppId
                        Write-Host "    ✅ App ID: $($app.appId)" -ForegroundColor Green
                    }
                    else {
                        Write-Host "    ⚠️  Using placeholder ID (will need manual assignment)" -ForegroundColor Yellow
                        $app.appId = 9999
                    }
                }
                
                # Generate service IDs if missing
                if ($app.services -and $app.services -is [System.Array]) {
                    $servicesWithIds = @()
                    foreach ($service in $app.services) {
                        $serviceName = if ($service.serviceName) { $service.serviceName } else { "service" }
                        $imageName = if ($service.imageName) { $service.imageName } else { $service.config.image }
                        
                        if (-not $service.serviceId) {
                            Write-Host "    Generating service ID for '$serviceName'..." -ForegroundColor Gray
                            $generatedServiceId = Get-NextServiceId `
                                -ServiceName $serviceName `
                                -AppId $app.appId `
                                -ImageName $imageName `
                                -ApiUrl $ApiUrl `
                                -ApiKey $ApiKey
                            
                            if ($generatedServiceId) {
                                $service.serviceId = $generatedServiceId
                                Write-Host "      ✅ Service ID: $($service.serviceId)" -ForegroundColor Green
                            }
                            else {
                                Write-Host "      ⚠️  Using placeholder ID" -ForegroundColor Yellow
                                $service.serviceId = 9999
                            }
                        }
                        
                        $servicesWithIds += $service
                    }
                    $app.services = $servicesWithIds
                }
                
                $appsWithIds += $app
            }
            $targetState.apps = $appsWithIds
            Write-Host "  ✅ All IDs generated" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "❌ Error parsing JSON file: $_" -ForegroundColor Red
        exit 1
    }
}
else {
    # Default: Use the example file
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $exampleFile = Join-Path $scriptDir "target-state-example.json"
    
    Write-Host "`nUsing default example file: target-state-example.json" -ForegroundColor Green
    
    if (-not (Test-Path $exampleFile)) {
        Write-Host "❌ Error: Example file not found at: $exampleFile" -ForegroundColor Red
        Write-Host "Please provide -FilePath or use -Clear flag" -ForegroundColor Yellow
        exit 1
    }
    
    try {
        $fileContent = Get-Content -Path $exampleFile -Raw
        $targetState = $fileContent | ConvertFrom-Json -AsHashtable
        
        if (-not $targetState.apps) {
            Write-Host "⚠️  Warning: 'apps' field missing, adding empty apps object" -ForegroundColor Yellow
            $targetState.apps = @{}
        }
    }
    catch {
        Write-Host "❌ Error parsing example file: $_" -ForegroundColor Red
        exit 1
    }
}


# Display target state summary
Write-Host "`nTarget State Summary:" -ForegroundColor Cyan
if ($targetState.apps) {
    # Handle both array and object formats
    $appsList = if ($targetState.apps -is [System.Array]) {
        $targetState.apps
    } else {
        $targetState.apps.Values
    }
    
    Write-Host "  Apps: $($appsList.Count)" -ForegroundColor White
    foreach ($app in $appsList) {
        $appName = if ($app.appName) { $app.appName } else { $app.name }
        Write-Host "    - $appName (ID: $($app.appId))" -ForegroundColor Gray
        if ($app.services) {
            foreach ($service in $app.services) {
                $serviceName = if ($service.serviceName) { $service.serviceName } else { "service" }
                $imageName = if ($service.imageName) { $service.imageName } else { $service.image }
                Write-Host "      • $serviceName : $imageName" -ForegroundColor DarkGray
            }
        }
    }
}


# Send update request
Write-Host "`nSending update request..." -ForegroundColor Cyan

try {
    $endpoint = "$ApiUrl/api/v1/devices/$DeviceUuid/target-state"
    
    # Build headers
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if ($ApiKey) {
        $headers["X-Device-API-Key"] = $ApiKey
    }
    
    $response = Invoke-RestMethod `
        -Uri $endpoint `
        -Method PUT `
        -Headers $headers `
        -Body ($targetState | ConvertTo-Json -Depth 10 -Compress) `
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
        $getHeaders = @{}
        if ($ApiKey) {
            $getHeaders["X-Device-API-Key"] = $ApiKey
        }
        
        $deviceState = Invoke-RestMethod `
            -Uri "$ApiUrl/api/v1/devices/$DeviceUuid/state" `
            -Method GET `
            -Headers $getHeaders `
            -ErrorAction Stop
        
        Write-Host "`nCurrent State:" -ForegroundColor Cyan
        Write-Host "  Status: $($deviceState.status)" -ForegroundColor White
        Write-Host "  Is Online: $($deviceState.is_online)" -ForegroundColor White
        Write-Host "  Last Seen: $($deviceState.last_connectivity_event)" -ForegroundColor White
        
        if ($deviceState.current_state) {
            Write-Host "`n  Current Apps:" -ForegroundColor Cyan
            if ($deviceState.current_state.apps) {
                # Handle both array and object formats
                $currentAppsList = if ($deviceState.current_state.apps -is [System.Array]) {
                    $deviceState.current_state.apps
                } else {
                    $deviceState.current_state.apps.PSObject.Properties | ForEach-Object { $_.Value }
                }
                
                foreach ($app in $currentAppsList) {
                    $appName = if ($app.appName) { $app.appName } else { $app.name }
                    Write-Host "    - $appName (ID: $($app.appId))" -ForegroundColor Gray
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
