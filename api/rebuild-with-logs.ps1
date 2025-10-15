# Rebuild and restart API container with logging fixes
Write-Host "🔨 Rebuilding API container with logging fixes..." -ForegroundColor Cyan

# Stop and remove existing container
Write-Host "`n📦 Stopping existing containers..." -ForegroundColor Yellow
docker-compose -f docker-compose.cloud.yml down

# Rebuild with no cache to ensure changes are applied
Write-Host "`n🏗️  Building API image (no cache)..." -ForegroundColor Yellow
docker-compose -f docker-compose.cloud.yml build --no-cache api

# Start services
Write-Host "`n🚀 Starting services..." -ForegroundColor Yellow
docker-compose -f docker-compose.cloud.yml up -d

# Wait a bit for startup
Write-Host "`n⏳ Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Show logs
Write-Host "`n📋 API Container Logs (last 50 lines):" -ForegroundColor Green
docker logs iotistic-api --tail 50

Write-Host "`n✅ Done! Container is running with logging enabled." -ForegroundColor Green
Write-Host "`nTo follow logs in real-time:" -ForegroundColor Cyan
Write-Host "  docker logs -f iotistic-api" -ForegroundColor White
