#!/usr/bin/env pwsh
# Cleanup test approval requests and restart monitoring

Write-Host "`n🧹 Cleaning up test approval requests..." -ForegroundColor Cyan

# Database connection details
$env:PGPASSWORD = "postgres"
$dbParams = @{
    Host = "localhost"
    Port = 5432
    Database = "iotistic"
    Username = "postgres"
}

# Run cleanup SQL
Write-Host "   Executing cleanup SQL..." -ForegroundColor Yellow
psql -h localhost -p 5432 -U postgres -d iotistic -f cleanup-test-approvals.sql

Write-Host "`n✅ Cleanup complete!" -ForegroundColor Green
Write-Host "`n📊 Current state:" -ForegroundColor Cyan

# Show approval request counts
psql -h localhost -p 5432 -U postgres -d iotistic -c "
SELECT 
    status,
    COUNT(*) as count
FROM image_approval_requests
WHERE source = 'image_monitor'
GROUP BY status
ORDER BY status;
"

Write-Host "`n🚀 Starting API server with monitoring..." -ForegroundColor Cyan
Write-Host "   Monitor will check for new tags in 60 minutes" -ForegroundColor Yellow
Write-Host "   Use Ctrl+C to stop`n" -ForegroundColor Gray

# Set environment variables
$env:DB_HOST = "localhost"
$env:DB_PORT = "5432"
$env:DB_NAME = "iotistic"
$env:DB_USER = "postgres"
$env:DB_PASSWORD = "postgres"
$env:PORT = "4002"

# Start API
node dist/index.js
