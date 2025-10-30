# Test Protocol Adapter Device Flow
# This script tests the complete flow: Dashboard -> API -> Database -> Agent -> SQLite

$deviceUuid = "5c629f26-8495-4747-86e3-c2d98851aa62"
$apiUrl = "http://7f05d0d2.localhost/api"

Write-Host "🧪 Testing Protocol Adapter Device Flow" -ForegroundColor Cyan
Write-Host ""

# Step 1: Add a test device via API
Write-Host "📤 Step 1: Adding test protocol device via API..." -ForegroundColor Yellow
$device = @{
    name = "test-modbus-device"
    protocol = "modbus"
    enabled = $true
    pollInterval = 5000
    connection = @{
        type = "tcp"
        host = "192.168.1.100"
        port = 502
        unitId = 1
    }
    registers = @(
        @{
            name = "temperature"
            address = 0
            type = "holding"
            dataType = "float32"
            unit = "°C"
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/v1/devices/$deviceUuid/protocol-devices" `
        -Method POST `
        -Body $device `
        -ContentType "application/json"
    Write-Host "✅ Device added successfully!" -ForegroundColor Green
    Write-Host $response | ConvertTo-Json
} catch {
    Write-Host "❌ Failed to add device: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Verify in database
Write-Host "🗄️  Step 2: Checking database..." -ForegroundColor Yellow
$query = "SELECT config->'protocolAdapterDevices' as devices FROM device_target_state WHERE device_uuid = '$deviceUuid'"
Write-Host "Query: $query"
Write-Host ""

# Step 3: Check API can retrieve it
Write-Host "📡 Step 3: Retrieving devices from API..." -ForegroundColor Yellow
try {
    $devices = Invoke-RestMethod -Uri "$apiUrl/v1/devices/$deviceUuid/protocol-devices"
    Write-Host "✅ Retrieved $($devices.count) device(s)" -ForegroundColor Green
    $devices.devices | ForEach-Object {
        Write-Host "  - $($_.name) ($($_.protocol))" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to retrieve devices: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "⏳ Now wait 60 seconds for agent to poll and sync to SQLite..." -ForegroundColor Yellow
Write-Host "   Then check: ./data/device.sqlite -> protocol_adapter_devices table"
