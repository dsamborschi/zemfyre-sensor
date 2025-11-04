#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test authentication endpoints
.DESCRIPTION
    Creates a test user, logs in, tests protected endpoints, and cleans up
#>

$API_BASE = "http://localhost:3002/api/v1"
$TEST_USER = "test_" + (Get-Random -Maximum 9999)
$TEST_EMAIL = "$TEST_USER@test.local"
$TEST_PASSWORD = "Test1234!"

Write-Host "`n=== Iotistic Authentication Test ===" -ForegroundColor Cyan
Write-Host "API Base: $API_BASE" -ForegroundColor Gray
Write-Host "Test User: $TEST_USER" -ForegroundColor Gray
Write-Host ""

# Test 1: Register new user
Write-Host "[1/6] Testing user registration..." -ForegroundColor Yellow
try {
    $registerBody = @{
        username = $TEST_USER
        email = $TEST_EMAIL
        password = $TEST_PASSWORD
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
        -Uri "$API_BASE/auth/register" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $registerBody

    Write-Host "✅ Registration successful!" -ForegroundColor Green
    Write-Host "   User ID: $($response.data.user.id)" -ForegroundColor Gray
    Write-Host "   Role: $($response.data.user.role)" -ForegroundColor Gray
    
    $accessToken = $response.data.accessToken
    $refreshToken = $response.data.refreshToken
    $userId = $response.data.user.id
}
catch {
    Write-Host "❌ Registration failed: $_" -ForegroundColor Red
    exit 1
}

# Test 2: Login
Write-Host "`n[2/6] Testing login..." -ForegroundColor Yellow
try {
    $loginBody = @{
        username = $TEST_USER
        password = $TEST_PASSWORD
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
        -Uri "$API_BASE/auth/login" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $loginBody

    Write-Host "✅ Login successful!" -ForegroundColor Green
    
    $accessToken = $response.data.accessToken
}
catch {
    Write-Host "❌ Login failed: $_" -ForegroundColor Red
    exit 1
}

# Test 3: Get current user
Write-Host "`n[3/6] Testing /auth/me (protected endpoint)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod `
        -Uri "$API_BASE/auth/me" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $accessToken"
        }

    Write-Host "✅ Protected endpoint accessible!" -ForegroundColor Green
    Write-Host "   Username: $($response.data.user.username)" -ForegroundColor Gray
    Write-Host "   Email: $($response.data.user.email)" -ForegroundColor Gray
}
catch {
    Write-Host "❌ Protected endpoint failed: $_" -ForegroundColor Red
    exit 1
}

# Test 4: List users (should work - all roles have user:read)
Write-Host "`n[4/6] Testing user list..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod `
        -Uri "$API_BASE/users" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $accessToken"
        }

    Write-Host "✅ User list retrieved!" -ForegroundColor Green
    Write-Host "   Total users: $($response.Count)" -ForegroundColor Gray
}
catch {
    Write-Host "❌ User list failed: $_" -ForegroundColor Red
}

# Test 5: Refresh token
Write-Host "`n[5/6] Testing token refresh..." -ForegroundColor Yellow
try {
    $refreshBody = @{
        refreshToken = $refreshToken
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
        -Uri "$API_BASE/auth/refresh" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $refreshBody

    Write-Host "✅ Token refresh successful!" -ForegroundColor Green
    
    $accessToken = $response.data.accessToken
}
catch {
    Write-Host "❌ Token refresh failed: $_" -ForegroundColor Red
}

# Test 6: Cleanup - Delete test user
Write-Host "`n[6/6] Cleaning up test user..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod `
        -Uri "$API_BASE/users/$userId" `
        -Method DELETE `
        -Headers @{
            "Authorization" = "Bearer $accessToken"
        }

    Write-Host "✅ Test user deleted!" -ForegroundColor Green
}
catch {
    $errorMsg = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($errorMsg.message -match "Cannot delete your own account") {
        Write-Host "⚠️  Cannot delete self (expected behavior)" -ForegroundColor Yellow
        Write-Host "   Note: Test user will remain in database" -ForegroundColor Gray
    }
    else {
        Write-Host "⚠️  Cleanup failed: $($errorMsg.message)" -ForegroundColor Yellow
    }
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
Write-Host "✅ All critical tests passed!" -ForegroundColor Green
Write-Host ""
