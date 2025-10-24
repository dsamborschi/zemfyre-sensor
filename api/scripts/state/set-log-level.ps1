#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Update device log level dynamically via target state config
.DESCRIPTION
    Updates the logging.level configuration in device target state to change
    log verbosity without restarting the agent. Useful for debugging.
.PARAMETER DeviceUuid
    Device UUID to update
.PARAMETER LogLevel
    Log level: 'debug', 'info', 'warn', or 'error'
.PARAMETER ApiUrl
    API base URL (default: http://localhost:4002)
.EXAMPLE
    .\set-log-level.ps1 -DeviceUuid "abc-123" -LogLevel "debug"
    # Enable debug logging for troubleshooting
.EXAMPLE
    .\set-log-level.ps1 -DeviceUuid "abc-123" -LogLevel "info"
    # Restore normal log level
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$DeviceUuid,
    
    [Parameter(Mandatory=$true)]
    [ValidateSet('debug', 'info', 'warn', 'error')]
    [string]$LogLevel,
    
    [string]$ApiUrl = "http://localhost:4002"
)

# Colors
$Green = "`e[32m"
$Yellow = "`e[33m"
$Red = "`e[31m"
$Blue = "`e[34m"
$Reset = "`e[0m"

function Write-Success { param($msg) Write-Host "${Green}✓${Reset} $msg" }
function Write-Warning { param($msg) Write-Host "${Yellow}⚠${Reset} $msg" }
function Write-Failure { param($msg) Write-Host "${Red}✗${Reset} $msg" }
function Write-Info { param($msg) Write-Host "${Blue}ℹ${Reset} $msg" }

Write-Host ""
Write-Host "${Blue}═══════════════════════════════════════════════════${Reset}"
Write-Host "${Blue}   Device Log Level Update${Reset}"
Write-Host "${Blue}═══════════════════════════════════════════════════${Reset}"
Write-Host ""

try {
    # 1. Get current target state
    Write-Info "Fetching current target state..."
    $response = Invoke-RestMethod -Uri "$ApiUrl/api/v1/devices/$DeviceUuid/target-state" -Method Get
    
    $currentApps = $response.apps
    $currentConfig = $response.config
    $currentVersion = $response.version
    
    if (-not $currentConfig) {
        $currentConfig = @{}
    }
    
    # 2. Update logging config
    if (-not $currentConfig.logging) {
        $currentConfig.logging = @{}
    }
    
    $oldLevel = $currentConfig.logging.level
    $currentConfig.logging.level = $LogLevel
    
    Write-Info "Current log level: $($oldLevel ? $oldLevel : 'not set (defaults to info)')"
    Write-Info "New log level: $LogLevel"
    
    # 3. Build updated state
    $updatedState = @{
        apps = $currentApps
        config = $currentConfig
    }
    
    # 4. Update target state
    Write-Info "Updating target state..."
    $updateResponse = Invoke-RestMethod -Uri "$ApiUrl/api/v1/devices/$DeviceUuid/target-state" `
        -Method Post `
        -ContentType "application/json" `
        -Body ($updatedState | ConvertTo-Json -Depth 10)
    
    Write-Host ""
    Write-Success "Log level updated successfully!"
    Write-Host ""
    Write-Host "  Device:      $DeviceUuid"
    Write-Host "  Old Level:   $($oldLevel ? $oldLevel : 'default (info)')"
    Write-Host "  New Level:   ${Green}$LogLevel${Reset}"
    Write-Host "  Version:     $currentVersion → $($updateResponse.version)"
    Write-Host ""
    Write-Info "The agent will pick up this change on next poll (~30 seconds)"
    Write-Info "Watch agent logs for: 'Log level changed: $oldLevel → $LogLevel'"
    Write-Host ""
    
    # Show what to expect
    Write-Host "${Blue}Log Level Guide:${Reset}"
    Write-Host "  • ${Green}debug${Reset}  - All logs (very verbose, for troubleshooting)"
    Write-Host "  • ${Blue}info${Reset}   - Normal operations (default)"
    Write-Host "  • ${Yellow}warn${Reset}   - Warnings and errors only"
    Write-Host "  • ${Red}error${Reset}  - Errors only"
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Failure "Failed to update log level"
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host ""
    exit 1
}
