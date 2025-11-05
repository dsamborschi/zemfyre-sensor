# Run Sensor Simulator Locally on Windows
# This runs the simulator as a local Node.js process instead of in Docker

# Configuration
$env:NUM_SENSORS = "3"
$env:SOCKET_DIR = "./sockets"
$env:PUBLISH_INTERVAL_MS = "60000"
$env:ENABLE_FAILURES = "true"
$env:FAILURE_CHANCE = "0.05"
$env:RECONNECT_DELAY_MS = "10000"
$env:DATA_FORMAT = "json"
$env:EOM_DELIMITER = "`n"
$env:LOG_LEVEL = "info"

Write-Host "🚀 Starting Sensor Simulator (Local Windows)" -ForegroundColor Green
Write-Host "Sockets will be created in: $(Get-Location)\sockets" -ForegroundColor Cyan

# Start simulator
node simulator.js
