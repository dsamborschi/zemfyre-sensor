#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Removes an agent service from docker-compose.yml
.DESCRIPTION
    Removes the specified agent service and its volume from docker-compose.yml.
    Optionally stops and removes the container and volume.
.PARAMETER AgentNumber
    The agent number to remove (e.g., 4 for agent-4)
.PARAMETER Force
    Also stop and remove the container and volume
.EXAMPLE
    .\scripts\remove-agent.ps1 -AgentNumber 4
    # Removes agent-4 from docker-compose.yml
.EXAMPLE
    .\scripts\remove-agent.ps1 -AgentNumber 4 -Force
    # Removes agent-4 and also stops/removes container and volume
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [int]$AgentNumber,
    
    [Parameter(Mandatory=$false)]
    [switch]$Force
)

# Configuration
$dockerComposeFile = Join-Path $PSScriptRoot ".." "docker-compose.yml"

# Check if docker-compose.yml exists
if (-not (Test-Path $dockerComposeFile)) {
    Write-Error "docker-compose.yml not found at: $dockerComposeFile"
    exit 1
}

# Read docker-compose.yml
$content = Get-Content $dockerComposeFile -Raw

# Check if agent exists
if ($content -notmatch "agent-$AgentNumber`:") {
    Write-Error "Agent-$AgentNumber not found in docker-compose.yml"
    exit 1
}

Write-Host "Removing agent-$AgentNumber from docker-compose.yml..." -ForegroundColor Yellow

# Remove service definition (including the blank line before it)
$servicePattern = "(?s)\r?\n\r?\n    agent-$AgentNumber`:.*?IOTISTIC_LICENSE_KEY=[^\r\n]+"
$content = $content -replace $servicePattern, ""

# Remove volume definition
$volumePattern = "\r?\n  agent-$AgentNumber-data:\r?\n    driver: local"
$content = $content -replace $volumePattern, ""

# Write back to file
Set-Content -Path $dockerComposeFile -Value $content -NoNewline

Write-Host "✅ Successfully removed agent-$AgentNumber from docker-compose.yml" -ForegroundColor Green

# If Force flag is set, also remove container and volume
if ($Force) {
    Write-Host "`nStopping and removing container and volume..." -ForegroundColor Yellow
    
    # Stop and remove container
    Write-Host "  Stopping container agent-$AgentNumber..." -ForegroundColor Cyan
    docker stop "agent-$AgentNumber" 2>$null
    
    Write-Host "  Removing container agent-$AgentNumber..." -ForegroundColor Cyan
    docker rm "agent-$AgentNumber" 2>$null
    
    # Remove volume
    Write-Host "  Removing volume agent-$AgentNumber-data..." -ForegroundColor Cyan
    docker volume rm "agent-$AgentNumber-data" 2>$null
    
    Write-Host "✅ Container and volume removed" -ForegroundColor Green
}

Write-Host "`nAgent-$AgentNumber has been removed." -ForegroundColor Green
if (-not $Force) {
    Write-Host "`nNote: Container and volume still exist. To remove them, run:" -ForegroundColor Yellow
    Write-Host "  docker stop agent-$AgentNumber && docker rm agent-$AgentNumber" -ForegroundColor White
    Write-Host "  docker volume rm agent-$AgentNumber-data" -ForegroundColor White
}
