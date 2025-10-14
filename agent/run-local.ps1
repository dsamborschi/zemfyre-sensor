# Run Device Agent Locally on Windows
# =====================================
# This script runs the agent with real Docker support on Windows

Write-Host "🚀 Starting Device Agent (Windows + Docker Desktop)" -ForegroundColor Cyan
Write-Host "=" * 80

# Set environment variables
$env:CLOUD_API_ENDPOINT = "https://ce19202b-7e1a-4ea5-bb03-ef891d53ea3c.mock.pstmn.io"
$env:NODE_ENV = "development"
$env:DATABASE_PATH = "./data/database.sqlite"
$env:DEVICE_API_PORT = "48484"
$env:MQTT_BROKER = "mqtt://localhost:1883"
$env:ENABLE_FILE_LOGGING = "true"
$env:MAX_LOGS = "500"
$env:ENABLE_CLOUD_LOGGING = "false"

Write-Host ""
Write-Host "Environment Configuration:" -ForegroundColor Yellow
Write-Host "  CLOUD_API_ENDPOINT: $env:CLOUD_API_ENDPOINT"
Write-Host "  DATABASE_PATH: $env:DATABASE_PATH"
Write-Host "  DEVICE_API_PORT: $env:DEVICE_API_PORT"
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker version --format '{{.Server.Version}}' 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker is running (version: $dockerVersion)" -ForegroundColor Green
    } else {
        Write-Host "❌ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Docker is not available. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting agent..." -ForegroundColor Cyan
Write-Host "=" * 80
Write-Host ""

# Run the agent
npm run dev
