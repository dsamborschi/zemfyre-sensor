# Test device provisioning with metadata
$uuid = "66c29736-c96c-49ba-ad8d-b20a80ced7b1"
$deviceName = "RaspberryPi-Living-Room"
$deviceType = "raspberrypi4"
$macAddress = "b8:27:eb:12:34:56"
$osVersion = "Debian GNU/Linux 12 (bookworm)"
$supervisorVersion = "1.0.0"
$applicationId = "app-001"

$body = @{
    uuid = $uuid
    deviceName = $deviceName
    deviceType = $deviceType
    deviceApiKey = "test-device-api-key"
    applicationId = $applicationId
    macAddress = $macAddress
    osVersion = $osVersion
    supervisorVersion = $supervisorVersion
} | ConvertTo-Json

Write-Host "📡 Provisioning device with metadata..." -ForegroundColor Cyan
Write-Host "Device: $deviceName ($deviceType)" -ForegroundColor Yellow
Write-Host "UUID: $uuid" -ForegroundColor Yellow

$headers = @{
    "Authorization" = "Bearer test-provisioning-key"
    "Content-Type" = "application/json"
}

$response = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/device/register" -Method Post -Body $body -Headers $headers

Write-Host "✅ Response:" -ForegroundColor Green
$response | ConvertTo-Json -Depth 5

Write-Host "`n🔍 Checking database..." -ForegroundColor Cyan
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT uuid, device_name, device_type, provisioning_state, mac_address, os_version FROM devices WHERE uuid = '$uuid';"
