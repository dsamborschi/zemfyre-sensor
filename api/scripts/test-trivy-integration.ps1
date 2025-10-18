# Test Trivy Installation and Integration
# Run this to verify Trivy is set up correctly

Write-Host "`n🔍 Testing Trivy Security Scanner Integration" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Gray

# 1. Check if Trivy is installed
Write-Host "`n1. Checking Trivy installation..." -ForegroundColor Yellow

$trivyPath = $env:TRIVY_PATH
if (-not $trivyPath) {
    $trivyPath = "trivy"
}

try {
    $version = & $trivyPath --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Trivy installed: $($version[0])" -ForegroundColor Green
    } else {
        throw "Trivy not found"
    }
} catch {
    Write-Host "   ❌ Trivy not found in PATH" -ForegroundColor Red
    Write-Host "`n   Install Trivy:" -ForegroundColor Yellow
    Write-Host "   - Windows: choco install trivy" -ForegroundColor White
    Write-Host "   - Or download: https://github.com/aquasecurity/trivy/releases" -ForegroundColor White
    Write-Host "`n   Set path: `$env:TRIVY_PATH='C:\path\to\trivy.exe'" -ForegroundColor White
    exit 1
}

# 2. Check database
Write-Host "`n2. Checking vulnerability database..." -ForegroundColor Yellow

$cacheDir = $env:TRIVY_CACHE_DIR
if (-not $cacheDir) {
    $cacheDir = "$env:TEMP\trivy-cache"
}

if (Test-Path $cacheDir) {
    Write-Host "   ✅ Cache directory exists: $cacheDir" -ForegroundColor Green
    $cacheSize = (Get-ChildItem -Path $cacheDir -Recurse | Measure-Object -Property Length -Sum).Sum
    $cacheSizeMB = [math]::Round($cacheSize / 1MB, 2)
    Write-Host "   📦 Cache size: $cacheSizeMB MB" -ForegroundColor Cyan
} else {
    Write-Host "   ⚠️  Cache directory not found (will be created on first scan)" -ForegroundColor Yellow
    Write-Host "   Cache will be created at: $cacheDir" -ForegroundColor White
}

# 3. Test configuration
Write-Host "`n3. Testing configuration..." -ForegroundColor Yellow

$config = @{
    "TRIVY_ENABLED" = $env:TRIVY_ENABLED ?? "true"
    "TRIVY_PATH" = $env:TRIVY_PATH ?? "trivy"
    "TRIVY_TIMEOUT" = $env:TRIVY_TIMEOUT ?? "300000"
    "TRIVY_CACHE_DIR" = $cacheDir
    "TRIVY_AUTO_REJECT_CRITICAL" = $env:TRIVY_AUTO_REJECT_CRITICAL ?? "false"
    "TRIVY_CRITICAL_THRESHOLD" = $env:TRIVY_CRITICAL_THRESHOLD ?? "0"
    "TRIVY_HIGH_THRESHOLD" = $env:TRIVY_HIGH_THRESHOLD ?? "999"
}

Write-Host "   Current configuration:" -ForegroundColor Cyan
$config.GetEnumerator() | ForEach-Object {
    Write-Host "   - $($_.Key): $($_.Value)" -ForegroundColor White
}

# 4. Build TypeScript
Write-Host "`n4. Building TypeScript..." -ForegroundColor Yellow

Push-Location $PSScriptRoot

try {
    Write-Host "   Compiling..." -ForegroundColor Cyan
    npm run build 2>&1 | Out-Null
    
    if (Test-Path "dist/services/trivy-scanner.js") {
        Write-Host "   ✅ trivy-scanner.js compiled" -ForegroundColor Green
    } else {
        Write-Host "   ❌ trivy-scanner.js not found" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Build failed: $_" -ForegroundColor Red
    exit 1
}

# 5. Run Node.js test
Write-Host "`n5. Running integration test..." -ForegroundColor Yellow
Write-Host "   (This may take a few minutes on first run)" -ForegroundColor Gray

try {
    node test-trivy.js
} catch {
    Write-Host "`n   ❌ Test failed: $_" -ForegroundColor Red
    exit 1
}

Pop-Location

Write-Host "`n" -NoNewline
Write-Host ("=" * 70) -ForegroundColor Gray
Write-Host "✅ Trivy integration test complete!`n" -ForegroundColor Green

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Start API: npm run dev" -ForegroundColor White
Write-Host "  2. Trigger scan: curl -X POST http://localhost:4002/api/v1/images/redis/7.2-alpine/scan" -ForegroundColor White
Write-Host "  3. View security summary: curl http://localhost:4002/api/v1/images/security/summary`n" -ForegroundColor White
