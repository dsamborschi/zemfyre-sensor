# Iotistic Admin - Docker Build & Test Script
# Run this from the admin directory

Write-Host "🐳 Building Iotistic Admin Docker Image..." -ForegroundColor Cyan

# Build the image
docker build -t iotistic-admin:latest .

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Build successful!" -ForegroundColor Green
    
    # Show image info
    Write-Host "`n📦 Image Information:" -ForegroundColor Yellow
    docker images | Select-String "iotistic-admin"
    
    Write-Host "`n🚀 To run the container:" -ForegroundColor Cyan
    Write-Host "   docker run -d -p 51850:80 --name iotistic-admin iotistic-admin:latest"
    
    Write-Host "`n🌐 Access the app at:" -ForegroundColor Cyan
    Write-Host "   http://localhost:51850"
    
    Write-Host "`n🛑 To stop and remove:" -ForegroundColor Cyan
    Write-Host "   docker stop iotistic-admin && docker rm iotistic-admin"
    
    Write-Host "`n📊 Or use Docker Compose:" -ForegroundColor Cyan
    Write-Host "   cd .."
    Write-Host "   docker-compose -f docker-compose.dev.yml up -d admin"
    
} else {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
