#!/usr/bin/env pwsh
# Test Redis webhook endpoint

Write-Host "Testing Redis webhook..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod `
        -Uri "http://localhost:4002/api/v1/webhooks/docker-registry" `
        -Method POST `
        -Body '{"repository":{"repo_name":"redis"},"push_data":{"tag":"7.2-alpine"}}' `
        -ContentType "application/json"
    
    Write-Host "`n✅ Success!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "`n❌ Error!" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Details:" -ForegroundColor Red
        Write-Host $_.ErrorDetails.Message
    }
}
