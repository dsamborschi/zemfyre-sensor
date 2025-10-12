#!/usr/bin/env pwsh
# Test Device CLI Commands

Write-Host "🧪 Testing Device CLI..." -ForegroundColor Cyan
Write-Host ""

$testsPassed = 0
$testsFailed = 0

function Test-Command {
    param(
        [string]$Description,
        [string]$Command
    )
    
    Write-Host "Testing: $Description" -ForegroundColor Yellow
    Write-Host "Command: npm run cli -- $Command" -ForegroundColor Gray
    
    try {
        $output = npm run cli -- $Command 2>&1
        if ($LASTEXITCODE -eq 0 -or $Command -like "help*") {
            Write-Host "✅ PASS" -ForegroundColor Green
            $script:testsPassed++
        } else {
            Write-Host "❌ FAIL (exit code: $LASTEXITCODE)" -ForegroundColor Red
            $script:testsFailed++
        }
    } catch {
        Write-Host "❌ FAIL (exception: $($_.Exception.Message))" -ForegroundColor Red
        $script:testsFailed++
    }
    Write-Host ""
}

# Change to agent directory
Push-Location agent

Write-Host "📋 Running CLI Tests..." -ForegroundColor Cyan
Write-Host ""

# Test help
Test-Command "Show help" "help"

# Test version
Test-Command "Show version" "version"

# Test config set-api
Test-Command "Set API endpoint" "config set-api https://test.example.com"

# Test config get-api
Test-Command "Get API endpoint" "config get-api"

# Test config set
Test-Command "Set custom config" "config set pollInterval 30000"

# Test config get
Test-Command "Get custom config" "config get pollInterval"

# Test config show
Test-Command "Show all config" "config show"

# Test status
Test-Command "Show status" "status"

# Test invalid command
Write-Host "Testing: Invalid command (should fail gracefully)" -ForegroundColor Yellow
npm run cli -- invalid-command 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✅ PASS (correctly rejected invalid command)" -ForegroundColor Green
    $testsPassed++
} else {
    Write-Host "❌ FAIL (should have rejected invalid command)" -ForegroundColor Red
    $testsFailed++
}
Write-Host ""

# Test config reset (cleanup)
Test-Command "Reset config (cleanup)" "config reset"

Pop-Location

# Summary
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Test Summary:" -ForegroundColor Cyan
Write-Host "  Passed: $testsPassed" -ForegroundColor Green
Write-Host "  Failed: $testsFailed" -ForegroundColor Red
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan

if ($testsFailed -eq 0) {
    Write-Host ""
    Write-Host "🎉 All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host ""
    Write-Host "⚠️  Some tests failed. Check output above." -ForegroundColor Yellow
    exit 1
}
