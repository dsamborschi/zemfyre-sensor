# Complete test: Provisioning + State Reporting with IP address
Write-Host "🧪 Complete Device Flow Test" -ForegroundColor Cyan
Write-Host "===========================`n" -ForegroundColor Cyan

Write-Host "📊 Initial database state:" -ForegroundColor Yellow
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT COUNT(*) as device_count FROM devices;"

Write-Host "`n💡 Instructions:" -ForegroundColor Cyan
Write-Host "1. Start the agent in another terminal with:" -ForegroundColor White
Write-Host "   cd c:\Users\Dan\zemfyre-sensor\agent" -ForegroundColor Gray
Write-Host "   `$env:USE_REAL_DOCKER='false'" -ForegroundColor Gray
Write-Host "   `$env:CLOUD_API_ENDPOINT='http://localhost:4002'" -ForegroundColor Gray
Write-Host "   `$env:PROVISIONING_API_KEY='test-key'" -ForegroundColor Gray
Write-Host "   npm run dev" -ForegroundColor Gray

Write-Host "`n2. Wait for:" -ForegroundColor White
Write-Host "   ✅ Device provisioned" -ForegroundColor Green
Write-Host "   ✅ First state report sent (includes metrics with IP)" -ForegroundColor Green

Write-Host "`n3. Then run this script again to verify!" -ForegroundColor White

Write-Host "`n⏳ Waiting 15 seconds for agent to provision and report state..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host "`n📊 Final database state:" -ForegroundColor Yellow
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT uuid, device_name, device_type, provisioning_state, status, ip_address, mac_address, os_version FROM devices;"

Write-Host "`n✅ Expected results:" -ForegroundColor Green
Write-Host "   • device_name: auto-generated or set" -ForegroundColor Gray
Write-Host "   • device_type: standalone or set" -ForegroundColor Gray  
Write-Host "   • provisioning_state: registered" -ForegroundColor Gray
Write-Host "   • status: online" -ForegroundColor Gray
Write-Host "   • ip_address: 192.168.x.x or 10.x.x.x (your local IP) ✨" -ForegroundColor Magenta
Write-Host "   • mac_address: xx:xx:xx:xx:xx:xx (auto-detected) ✨" -ForegroundColor Magenta
Write-Host "   • os_version: Your OS (auto-detected) ✨" -ForegroundColor Magenta
