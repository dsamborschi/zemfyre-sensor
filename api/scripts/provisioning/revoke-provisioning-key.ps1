# PowerShell script to revoke a provisioning key via API
# Usage: .\revoke-provisioning-key.ps1 -KeyId "key-id-here"
#
# Environment variables (optional):
#   API_URL - API endpoint (default: http://localhost:4002)

param(
    [Parameter(Mandatory=$true)]
    [string]$KeyId,
    
    [string]$ApiUrl = $env:API_URL ?? "http://localhost:4002"
)

Write-Host ""
Write-Host "🔒 Revoking provisioning key..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Key ID: $KeyId" -ForegroundColor Yellow
Write-Host ""

# Confirm revocation
$confirmation = Read-Host "Are you sure you want to revoke this key? (y/N)"
if ($confirmation -ne "y" -and $confirmation -ne "Y") {
    Write-Host "Revocation cancelled." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

try {
    # Normalize API URL - remove trailing slash and avoid double /api
    $baseUrl = $ApiUrl.TrimEnd('/')
    # If URL already ends with /api, don't add it again
    if ($baseUrl.EndsWith('/api')) {
        $endpoint = "$baseUrl/v1/provisioning-keys/$KeyId"
    } else {
        $endpoint = "$baseUrl/api/v1/provisioning-keys/$KeyId"
    }

    $response = Invoke-RestMethod `
        -Uri $endpoint `
        -Method DELETE `
        -ContentType "application/json"

    Write-Host "✅ Provisioning key revoked successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Key ID:      $($response.keyId)" -ForegroundColor White
    Write-Host "Fleet ID:    $($response.fleetId)" -ForegroundColor White
    Write-Host "Was Active:  $($response.wasActive)" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  This key can no longer be used to provision new devices." -ForegroundColor Yellow
    Write-Host ""

} catch {
    Write-Host "❌ Error revoking provisioning key:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host ""
        Write-Host "Details:" -ForegroundColor Yellow
        Write-Host "  Error: $($errorDetails.error)" -ForegroundColor Red
        Write-Host "  Message: $($errorDetails.message)" -ForegroundColor Red
    }
    
    Write-Host ""
    exit 1
}
