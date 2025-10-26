# PowerShell script to create a provisioning key via API
# Usage: .\create-provisioning-key.ps1
# 
# Environment variables (optional):
#   API_URL - API endpoint (default: http://localhost:4002)
#   FLEET_ID - Fleet identifier (default: default-fleet)
#   MAX_DEVICES - Maximum devices (default: 100)
#   EXPIRES_IN_DAYS - Expiration days (default: 365)
#   DESCRIPTION - Key description

param(
    [string]$ApiUrl = $env:API_URL ?? "http://7f05d0d2.localhost/api",
    [string]$FleetId = $env:FLEET_ID ?? "default-fleet",
    [int]$MaxDevices = [int]($env:MAX_DEVICES ?? 100),
    [int]$ExpiresInDays = [int]($env:EXPIRES_IN_DAYS ?? 365),
    [string]$Description = $env:DESCRIPTION ?? "Provisioning key created via API"
)

Write-Host ""
Write-Host "🔑 Creating provisioning key..." -ForegroundColor Cyan
Write-Host ""

$body = @{
    fleetId = $FleetId
    maxDevices = $MaxDevices
    expiresInDays = $ExpiresInDays
    description = $Description
} | ConvertTo-Json -Depth 10

try {
    # Normalize API URL - remove trailing slash and avoid double /api
    $baseUrl = $ApiUrl.TrimEnd('/')
    # If URL already ends with /api, don't add it again
    if ($baseUrl.EndsWith('/api')) {
        $endpoint = "$baseUrl/v1/provisioning-keys"
    } else {
        $endpoint = "$baseUrl/api/v1/provisioning-keys"
    }

    $response = Invoke-RestMethod `
        -Uri $endpoint `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    Write-Host "✅ Provisioning key created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "═════════════════════════════════════════════════════════════" -ForegroundColor DarkGray
    Write-Host "Key ID:          $($response.id)" -ForegroundColor White
    Write-Host "Fleet ID:        $($response.fleetId)" -ForegroundColor White
    Write-Host "Max Devices:     $($response.maxDevices)" -ForegroundColor White
    Write-Host "Expires At:      $($response.expiresAt)" -ForegroundColor White
    Write-Host "Description:     $($response.description)" -ForegroundColor White
    Write-Host "═════════════════════════════════════════════════════════════" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "🔐 PROVISIONING KEY (save this securely):" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host $response.key -ForegroundColor Green
    Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "⚠️  WARNING: This key will only be displayed once!" -ForegroundColor Yellow
    Write-Host "   Store it securely - it cannot be recovered." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Usage in install.sh (Linux/macOS):" -ForegroundColor Cyan
    Write-Host "   PROVISIONING_API_KEY=`"$($response.key)`" ./bin/install.sh" -ForegroundColor White
    Write-Host ""
    Write-Host "Or set in environment:" -ForegroundColor Cyan
    Write-Host "   export PROVISIONING_API_KEY=`"$($response.key)`"" -ForegroundColor White
    Write-Host "   ./bin/install.sh" -ForegroundColor White
    Write-Host ""
    Write-Host "Windows PowerShell:" -ForegroundColor Cyan
    Write-Host "   `$env:PROVISIONING_API_KEY=`"$($response.key)`"" -ForegroundColor White
    Write-Host ""

    # Also save to file for convenience (optional)
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $filename = "provisioning-key-$($response.id)-$timestamp.txt"
    $outputPath = Join-Path $PSScriptRoot $filename
    
    $keyInfo = @"
Provisioning Key Information
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

Key ID:          $($response.id)
Fleet ID:        $($response.fleetId)
Max Devices:     $($response.maxDevices)
Expires At:      $($response.expiresAt)
Description:     $($response.description)

PROVISIONING KEY:
$($response.key)

⚠️  WARNING: Store this key securely - it cannot be retrieved again!

Usage:
  Linux/macOS:
    PROVISIONING_API_KEY="$($response.key)" ./bin/install.sh
  
  Windows:
    `$env:PROVISIONING_API_KEY="$($response.key)"

  Or set as environment variable:
    export PROVISIONING_API_KEY="$($response.key)"
"@

    $keyInfo | Out-File -FilePath $outputPath -Encoding UTF8
    Write-Host "💾 Key saved to: $outputPath" -ForegroundColor Green
    Write-Host ""

} catch {
    Write-Host "❌ Error creating provisioning key:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host ""
        Write-Host "Details:" -ForegroundColor Yellow
        Write-Host "  Error: $($errorDetails.error)" -ForegroundColor Red
        Write-Host "  Message: $($errorDetails.message)" -ForegroundColor Red
        
        if ($errorDetails.details) {
            Write-Host "  Current Devices: $($errorDetails.details.currentDevices)" -ForegroundColor Yellow
            Write-Host "  Max Devices: $($errorDetails.details.maxDevices)" -ForegroundColor Yellow
            Write-Host "  Plan: $($errorDetails.details.plan)" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    exit 1
}
