# Inject Default Config for Device
# Device UUID: cad1a747-44e0-4530-87c8-944d4981a42c

$deviceUuid = "cad1a747-44e0-4530-87c8-944d4981a42c"
$namespace = "customer-a18ada74"
$deployment = "customer-a18ada74-customer-instance-api"

Write-Host "🔧 Injecting default target state config..." -ForegroundColor Cyan
Write-Host "   Device UUID: $deviceUuid" -ForegroundColor Gray
Write-Host "   Namespace: $namespace" -ForegroundColor Gray
Write-Host ""

# Default config (Professional plan defaults)
$config = @{
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
} | ConvertTo-Json -Depth 10 -Compress

# Escape single quotes for SQL
$configEscaped = $config -replace "'", "''"

# SQL command
$sql = @"
INSERT INTO device_target_state (device_uuid, apps, config, version, updated_at)
VALUES (
  '$deviceUuid',
  '{}',
  '$configEscaped',
  1,
  CURRENT_TIMESTAMP
)
ON CONFLICT (device_uuid) DO UPDATE SET
  apps = EXCLUDED.apps,
  config = EXCLUDED.config,
  version = device_target_state.version + 1,
  updated_at = CURRENT_TIMESTAMP
RETURNING device_uuid, version, updated_at;
"@

Write-Host "Executing SQL command..." -ForegroundColor Yellow

# Execute via kubectl
$result = kubectl exec -n $namespace deployment/$deployment -- psql -U postgres -d iotistic -t -c $sql

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Target state created/updated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Result:" -ForegroundColor Cyan
    Write-Host $result
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
} else {
    Write-Host ""
    Write-Host "❌ Failed to inject config" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""
Write-Host "To verify, check target state:" -ForegroundColor Cyan
Write-Host "kubectl exec -n $namespace deployment/$deployment -- psql -U postgres -d iotistic -c `"SELECT device_uuid, config, version FROM device_target_state WHERE device_uuid = '$deviceUuid';`"" -ForegroundColor Gray
