# Quick verification of provisioning with auto-detected system info
Write-Host "🔍 Verifying Device Provisioning" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

Write-Host "📊 Cloud Database (PostgreSQL):" -ForegroundColor Yellow
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT uuid, device_name, device_type, provisioning_state, status, mac_address, os_version, supervisor_version FROM devices;"

Write-Host "`n📱 Device Count:" -ForegroundColor Yellow  
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT COUNT(*) as total_devices FROM devices;"

Write-Host "`n✅ If mac_address and os_version are populated, auto-detection is working!" -ForegroundColor Green
Write-Host "✅ If status is 'online', device provisioning is complete!" -ForegroundColor Green
