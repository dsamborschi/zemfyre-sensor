# Set Default Target State for Device
# Creates a minimal target state to enable metrics reporting

param(
    [Parameter(Mandatory=$false)]
    [string]$ApiEndpoint = "http://a18ada74.localhost/api",
    
    [Parameter(Mandatory=$false)]
    [string]$DeviceUuid = "",
    
    [Parameter(Mandatory=$false)]
    [switch]$EnableMetrics = $true,
    
    [Parameter(Mandatory=$false)]
    [int]$MetricsInterval = 60  # seconds
)

# Normalize API endpoint - remove /api if present at the end
if ($ApiEndpoint.EndsWith('/api')) {
    $ApiEndpoint = $ApiEndpoint.Substring(0, $ApiEndpoint.Length - 4)
}

Write-Host "`n🎯 Setting Default Target State" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# If no device UUID provided, list available devices
if ([string]::IsNullOrEmpty($DeviceUuid)) {
    Write-Host "Fetching device list..." -ForegroundColor Yellow
    
    try {
        $devicesResponse = Invoke-RestMethod -Uri "$ApiEndpoint/api/v1/devices" `
            -Method GET `
            -ContentType "application/json"
        
        if ($devicesResponse.devices.Count -eq 0) {
            Write-Host "❌ No devices found" -ForegroundColor Red
            exit 1
        }
        
        Write-Host "`nAvailable devices:" -ForegroundColor Green
        $devicesResponse.devices | ForEach-Object {
            Write-Host "  • $($_.uuid) - $($_.device_name) ($($_.status))" -ForegroundColor White
        }
        
        # Auto-select if only one device
        if ($devicesResponse.devices.Count -eq 1) {
            $DeviceUuid = $devicesResponse.devices[0].uuid
            Write-Host "`n✅ Auto-selected device: $DeviceUuid" -ForegroundColor Green
        } else {
            Write-Host "`n⚠️  Please specify -DeviceUuid parameter" -ForegroundColor Yellow
            exit 0
        }
    } catch {
        Write-Host "❌ Failed to fetch devices: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Build default target state
$targetState = @{
    apps = @{}
    config = @{
        # Enable metrics reporting
        IOTISTIC_METRICS_ENABLED = if ($EnableMetrics) { "true" } else { "false" }
        IOTISTIC_METRICS_INTERVAL = $MetricsInterval.ToString()
        
        # Optional: Add other default config
        IOTISTIC_LOG_LEVEL = "info"
        IOTISTIC_HEARTBEAT_INTERVAL = "30"
    }
}

Write-Host "`n📦 Target State Configuration:" -ForegroundColor Cyan
Write-Host "  • Metrics Enabled: $EnableMetrics" -ForegroundColor White
Write-Host "  • Metrics Interval: ${MetricsInterval}s" -ForegroundColor White
Write-Host "  • No apps configured (empty apps object)" -ForegroundColor Gray

# Convert to JSON
$jsonBody = $targetState | ConvertTo-Json -Depth 10

Write-Host "`n📡 Sending to API..." -ForegroundColor Yellow
Write-Host "  Endpoint: $ApiEndpoint/api/v1/devices/$DeviceUuid/target-state" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod `
        -Uri "$ApiEndpoint/api/v1/devices/$DeviceUuid/target-state" `
        -Method POST `
        -ContentType "application/json" `
        -Body $jsonBody
    
    Write-Host "`n✅ Target state set successfully!" -ForegroundColor Green
    Write-Host "`nResponse:" -ForegroundColor Cyan
    Write-Host "  • Version: $($response.version)" -ForegroundColor White
    Write-Host "  • Apps: $(($response.apps | Get-Member -MemberType NoteProperty).Count) configured" -ForegroundColor White
    Write-Host "  • Config: $(($response.config | Get-Member -MemberType NoteProperty).Count) keys" -ForegroundColor White
    
    Write-Host "`n💡 Next Steps:" -ForegroundColor Cyan
    Write-Host "  1. Agent will poll for this state within 10 seconds" -ForegroundColor White
    Write-Host "  2. Metrics will be reported every ${MetricsInterval}s" -ForegroundColor White
    Write-Host "  3. Check agent logs for 'New target state received from cloud'" -ForegroundColor White
    
    Write-Host "`n🔍 Monitor agent activity:" -ForegroundColor Yellow
    Write-Host "  • Watch for: 'New target state received from cloud'" -ForegroundColor Gray
    Write-Host "  • Watch for: 'Reporting state to cloud'" -ForegroundColor Gray
    Write-Host "  • Check dashboard at: http://$($ApiEndpoint -replace 'http://', '')" -ForegroundColor Gray
    
} catch {
    Write-Host "`n❌ Failed to set target state" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "`nResponse body:" -ForegroundColor Yellow
        Write-Host $responseBody -ForegroundColor Gray
    }
    
    exit 1
}

Write-Host ""
