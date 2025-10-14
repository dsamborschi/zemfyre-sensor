# Test fresh device provisioning with auto-detected MAC and OS version
Write-Host "🧪 Testing Fresh Device Provisioning" -ForegroundColor Cyan
Write-Host "====================================`n" -ForegroundColor Cyan

# Stop any running agent
Write-Host "1️⃣  Stopping any running agent..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match "agent" } | Stop-Process -Force

# Clean agent database
Write-Host "2️⃣  Cleaning agent database..." -ForegroundColor Yellow
$dbPath = "c:\Users\Dan\zemfyre-sensor\agent\data\database.sqlite"
if (Test-Path $dbPath) {
    Remove-Item $dbPath -Force
    Write-Host "   ✅ Database removed" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  Database doesn't exist (fresh start)" -ForegroundColor Gray
}

# Set environment variables
$env:USE_REAL_DOCKER = "false"  # Don't need Docker for provisioning test
$env:CLOUD_API_ENDPOINT = "http://localhost:4002"
$env:PROVISIONING_API_KEY = "test-provisioning-key-64chars-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
$env:DEVICE_NAME = "TestDevice-AutoDetect"
$env:DEVICE_TYPE = "raspberrypi4"
$env:APPLICATION_ID = "1"
$env:SUPERVISOR_VERSION = "1.0.0"
# Don't set MAC_ADDRESS or OS_VERSION - let system auto-detect!

Write-Host "3️⃣  Environment configured:" -ForegroundColor Yellow
Write-Host "   API Endpoint: $env:CLOUD_API_ENDPOINT" -ForegroundColor Gray
Write-Host "   Device Name: $env:DEVICE_NAME" -ForegroundColor Gray
Write-Host "   Device Type: $env:DEVICE_TYPE" -ForegroundColor Gray
Write-Host "   MAC/OS: AUTO-DETECT ✨" -ForegroundColor Magenta

Write-Host "`n4️⃣  Starting agent with auto-provisioning..." -ForegroundColor Yellow
Write-Host "   (Press Ctrl+C after provisioning completes)`n" -ForegroundColor Gray

# Start agent
cd c:\Users\Dan\zemfyre-sensor\agent
npm run dev
