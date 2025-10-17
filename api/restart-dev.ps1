# Restart API Development Server
Write-Host "🛑 Stopping existing node processes..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "🏗️  Building TypeScript..." -ForegroundColor Cyan
npm run build

Write-Host "🚀 Starting development server..." -ForegroundColor Green
$env:DB_HOST = 'localhost'
$env:DB_PORT = '5432'
$env:DB_NAME = 'iotistic'
$env:DB_USER = 'postgres'
$env:DB_PASSWORD = 'postgres'
$env:PORT = '4002'

npx ts-node src/index.ts
