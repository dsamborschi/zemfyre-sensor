# Wait for IP address to be populated
Write-Host "⏳ Waiting for IP address to be populated..." -ForegroundColor Yellow
Write-Host "   (Agent sends metrics report every 5 minutes)`n" -ForegroundColor Gray

$maxWait = 30  # Wait up to 30 seconds
$elapsed = 0

while ($elapsed -lt $maxWait) {
    $result = docker exec iotistic-postgres psql -U postgres -d iotistic -t -c "SELECT ip_address FROM devices WHERE uuid='bf90960a-6106-4b59-814e-dbbbe19eb388';" 2>$null
    
    if ($result -and $result.Trim() -ne "") {
        Write-Host "✅ IP address populated!" -ForegroundColor Green
        break
    }
    
    Write-Host "." -NoNewline -ForegroundColor Gray
    Start-Sleep -Seconds 2
    $elapsed += 2
}

Write-Host "`n`n📊 Current device state:" -ForegroundColor Cyan
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT uuid, device_name, ip_address, mac_address, os_version, supervisor_version FROM devices;"

Write-Host "`n💡 Tip: To trigger immediate update, restart the agent with:" -ForegroundColor Yellow
Write-Host "   npm run dev" -ForegroundColor Gray
