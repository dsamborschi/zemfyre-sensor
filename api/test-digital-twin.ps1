# Test Digital Twin API Endpoints
# Run this script while the API server is running in debug mode

$API_BASE = "http://localhost:4002/api/v1"
$DEVICE_UUID = "46b68204-9806-43c5-8d19-18b1f53e3b8a"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Digital Twin API Endpoints" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Fleet Health
Write-Host "1. Testing GET /fleet/health" -ForegroundColor Yellow
Write-Host "   Endpoint: $API_BASE/fleet/health" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/fleet/health" -Method Get
    Write-Host "   ✅ SUCCESS" -ForegroundColor Green
    Write-Host "   Total Devices: $($response.totalDevices)" -ForegroundColor Gray
    Write-Host "   Healthy: $($response.health.healthy)" -ForegroundColor Gray
    Write-Host "   Average CPU: $($response.systemMetrics.averageCpuUsage)%" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "   ❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 2: Fleet Twins
Write-Host "2. Testing GET /fleet/twins" -ForegroundColor Yellow
Write-Host "   Endpoint: $API_BASE/fleet/twins?limit=10" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/fleet/twins?limit=10" -Method Get
    Write-Host "   ✅ SUCCESS" -ForegroundColor Green
    Write-Host "   Total: $($response.total)" -ForegroundColor Gray
    Write-Host "   Count: $($response.count)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "   ❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 3: Fleet Alerts
Write-Host "3. Testing GET /fleet/alerts" -ForegroundColor Yellow
Write-Host "   Endpoint: $API_BASE/fleet/alerts" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/fleet/alerts" -Method Get
    Write-Host "   ✅ SUCCESS" -ForegroundColor Green
    Write-Host "   Total Alerts: $($response.total)" -ForegroundColor Gray
    if ($response.total -gt 0) {
        Write-Host "   First Alert: $($response.alerts[0].deviceUuid)" -ForegroundColor Gray
        Write-Host "   Alert Count: $($response.alerts[0].alertCount)" -ForegroundColor Gray
    }
    Write-Host ""
} catch {
    Write-Host "   ❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 4: Single Device Twin
Write-Host "4. Testing GET /devices/:uuid/twin" -ForegroundColor Yellow
Write-Host "   Endpoint: $API_BASE/devices/$DEVICE_UUID/twin" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/devices/$DEVICE_UUID/twin" -Method Get
    Write-Host "   ✅ SUCCESS" -ForegroundColor Green
    Write-Host "   Device: $($response.deviceUuid)" -ForegroundColor Gray
    Write-Host "   Health: $($response.health.status)" -ForegroundColor Gray
    Write-Host "   CPU: $($response.system.cpuUsage)%" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "   ❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 5: Twin History (should return 501)
Write-Host "5. Testing GET /devices/:uuid/twin/history (Phase 4 - Now Implemented)" -ForegroundColor Yellow
Write-Host "   Endpoint: $API_BASE/devices/$DEVICE_UUID/twin/history?limit=10" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/devices/$DEVICE_UUID/twin/history?limit=10" -Method Get
    Write-Host "   ✅ SUCCESS" -ForegroundColor Green
    Write-Host "   Count: $($response.count)" -ForegroundColor Gray
    Write-Host "   Time Range: $($response.timeRange.from) to $($response.timeRange.to)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "   ❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 6: Field-Specific History
Write-Host "6. Testing GET /devices/:uuid/twin/history?field=system.cpuUsage" -ForegroundColor Yellow
Write-Host "   Endpoint: $API_BASE/devices/$DEVICE_UUID/twin/history?field=system.cpuUsage&limit=50" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/devices/$DEVICE_UUID/twin/history?field=system.cpuUsage&limit=50" -Method Get
    Write-Host "   ✅ SUCCESS" -ForegroundColor Green
    Write-Host "   Field: $($response.field)" -ForegroundColor Gray
    Write-Host "   Data Points: $($response.count)" -ForegroundColor Gray
    if ($response.statistics) {
        Write-Host "   Average: $($response.statistics.average)%" -ForegroundColor Gray
        Write-Host "   Min: $($response.statistics.min)%, Max: $($response.statistics.max)%" -ForegroundColor Gray
    }
    Write-Host ""
} catch {
    Write-Host "   ❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 7: Anomaly Detection
Write-Host "7. Testing GET /devices/:uuid/twin/anomalies (Phase 4)" -ForegroundColor Yellow
Write-Host "   Endpoint: $API_BASE/devices/$DEVICE_UUID/twin/anomalies?field=system.cpuUsage" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/devices/$DEVICE_UUID/twin/anomalies?field=system.cpuUsage&threshold=2" -Method Get
    Write-Host "   ✅ SUCCESS" -ForegroundColor Green
    Write-Host "   Field: $($response.field)" -ForegroundColor Gray
    Write-Host "   Data Points: $($response.statistics.dataPoints)" -ForegroundColor Gray
    Write-Host "   Mean: $($response.statistics.mean)%" -ForegroundColor Gray
    Write-Host "   Anomalies Detected: $($response.anomalyDetection.detected.total)" -ForegroundColor Gray
    if ($response.anomalyDetection.detected.total -gt 0) {
        Write-Host "   Critical: $($response.anomalyDetection.detected.critical)" -ForegroundColor Red
        Write-Host "   Warning: $($response.anomalyDetection.detected.warning)" -ForegroundColor Yellow
    }
    Write-Host ""
} catch {
    Write-Host "   ❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
