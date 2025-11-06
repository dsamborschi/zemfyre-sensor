# Quick Start Script for VPN Local Testing
# Windows Agent → Docker VPN → Docker Services

Write-Host "🚀 Starting VPN Test Environment..." -ForegroundColor Cyan

# Step 1: Start Docker services
Write-Host "`n📦 Starting Docker services..." -ForegroundColor Yellow
docker-compose -f docker-compose.test-vpn.yml up -d

# Wait for services to be healthy
Write-Host "`n⏳ Waiting for services to be healthy (30 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Step 2: Check service status
Write-Host "`n✅ Checking service status..." -ForegroundColor Yellow
docker-compose -f docker-compose.test-vpn.yml ps

# Step 3: Run database migration
Write-Host "`n🗄️ Running database migration..." -ForegroundColor Yellow
docker exec iotistic-api-test npm run migrate 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ⚠️  Migration may have already been run (or API not built yet)" -ForegroundColor Yellow
}

# Step 4: Check VPN server logs
Write-Host "`n📋 VPN Server Status:" -ForegroundColor Yellow
$vpnLogs = docker logs iotistic-vpn-test --tail 20 2>&1
if ($vpnLogs -match "Initialization Sequence Completed") {
    Write-Host "   ✅ VPN Server is READY" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  VPN Server may still be starting..." -ForegroundColor Yellow
    Write-Host "   Run: docker logs iotistic-vpn-test -f" -ForegroundColor Gray
}

# Step 5: Get CA certificate URL
Write-Host "`n📜 CA Certificate:" -ForegroundColor Yellow
Write-Host "   URL: http://localhost:8080/ca.crt" -ForegroundColor Cyan
Write-Host "   Download: curl http://localhost:8080/ca.crt -o ca.crt" -ForegroundColor Gray

# Step 6: Test basic connectivity
Write-Host "`n🔌 Testing Docker network connectivity..." -ForegroundColor Yellow
$testConnection = docker exec iotistic-vpn-test ping -c 1 172.25.0.12 2>&1
if ($testConnection -match "1 packets transmitted, 1 received") {
    Write-Host "   ✅ VPN can reach MQTT (172.25.0.12)" -ForegroundColor Green
} else {
    Write-Host "   ❌ VPN cannot reach MQTT" -ForegroundColor Red
}

# Step 7: Show service IPs
Write-Host "`n🌐 Service IP Addresses:" -ForegroundColor Yellow
Write-Host "   VPN Server:  172.25.0.20 (gateway: 10.8.0.1)" -ForegroundColor Cyan
Write-Host "   PostgreSQL:  172.25.0.10:5432" -ForegroundColor Cyan
Write-Host "   Redis:       172.25.0.11:6379" -ForegroundColor Cyan
Write-Host "   Mosquitto:   172.25.0.12:1883" -ForegroundColor Cyan
Write-Host "   API:         172.25.0.13:3002" -ForegroundColor Cyan

# Step 8: Next steps
Write-Host "`n📝 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Provision a test device:" -ForegroundColor White
Write-Host "      curl -X POST http://localhost:3002/api/v1/device/register ..." -ForegroundColor Gray
Write-Host ""
Write-Host "   2. Save VPN config from response to:" -ForegroundColor White
Write-Host "      C:\Users\$env:USERNAME\openvpn-config\iotistic-test.ovpn" -ForegroundColor Gray
Write-Host ""
Write-Host "   3. Connect with OpenVPN:" -ForegroundColor White
Write-Host "      - OpenVPN GUI: Import config and connect" -ForegroundColor Gray
Write-Host "      - Or command line: openvpn --config iotistic-test.ovpn" -ForegroundColor Gray
Write-Host ""
Write-Host "   4. After VPN connection, configure agent:" -ForegroundColor White
Write-Host "      `$env:MQTT_BROKER = 'mqtt://172.25.0.12:1883'" -ForegroundColor Gray
Write-Host "      `$env:CLOUD_API_ENDPOINT = 'http://172.25.0.13:3002'" -ForegroundColor Gray
Write-Host ""
Write-Host "   5. Run agent:" -ForegroundColor White
Write-Host "      cd agent && npm start" -ForegroundColor Gray

Write-Host "`n📖 Full guide: VPN-LOCAL-TEST-GUIDE.md" -ForegroundColor Cyan
Write-Host "`n✅ Environment is ready for testing!" -ForegroundColor Green
