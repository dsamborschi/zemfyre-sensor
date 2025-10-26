# Inject Default Config via API
# Device UUID: cad1a747-44e0-4530-87c8-944d4981a42c

$deviceUuid = "cad1a747-44e0-4530-87c8-944d4981a42c"
$apiUrl = "http://a18ada74.localhost/api/v1/devices/$deviceUuid/target-state"

Write-Host "🔧 Injecting default target state config via API..." -ForegroundColor Cyan
Write-Host "   Device UUID: $deviceUuid" -ForegroundColor Gray
Write-Host "   API: $apiUrl" -ForegroundColor Gray
Write-Host ""

# Default config (Professional plan defaults)
$targetState = @{
    apps = @{}
    config = @{
        logging = @{
            level = "info"
            enableRemoteLogging = $true
        }
        features = @{
            enableShadow = $true
            enableCloudJobs = $true
            enableMetricsExport = $false
        }
        settings = @{
            metricsIntervalMs = 30000
            deviceReportIntervalMs = 20000
            stateReportIntervalMs = 10000
        }
    }
} | ConvertTo-Json -Depth 10

Write-Host "Sending target state to API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body $targetState -ContentType "application/json"
    
    Write-Host ""
    Write-Host "✅ Target state created/updated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    Write-Host ($response | ConvertTo-Json -Depth 10)
    Write-Host ""
    Write-Host "📋 Config applied:" -ForegroundColor Cyan
    Write-Host "   - Metrics Interval: 30 seconds" -ForegroundColor Gray
    Write-Host "   - Device Report Interval: 20 seconds" -ForegroundColor Gray
    Write-Host "   - State Report Interval: 10 seconds" -ForegroundColor Gray
    Write-Host "   - Cloud Jobs: Enabled" -ForegroundColor Gray
    Write-Host "   - Metrics Export: Disabled" -ForegroundColor Gray
    Write-Host "   - Logging Level: info" -ForegroundColor Gray
    Write-Host ""
    Write-Host "💡 Agent will pick up new config within 10 seconds" -ForegroundColor Yellow
    Write-Host "   Metrics should start appearing within 30 seconds!" -ForegroundColor Yellow
} catch {
    Write-Host ""
    Write-Host "❌ Failed to inject config" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Yellow
    Write-Host $_.ErrorDetails.Message
}
