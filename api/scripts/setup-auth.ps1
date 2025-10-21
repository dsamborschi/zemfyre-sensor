# Setup Authentication System
# Creates admin user and generates JWT secret

Write-Host "🔐 Authentication System Setup" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Load environment variables from .env if it exists
$envFile = Join-Path $PSScriptRoot ".." ".env"
if (Test-Path $envFile) {
    Write-Host "📄 Loading .env file..." -ForegroundColor Yellow
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*)\s*=\s*(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value)
        }
    }
} else {
    Write-Host "⚠️  .env file not found, using defaults" -ForegroundColor Yellow
}

# Database configuration
$DB_HOST = $env:DB_HOST ?? "localhost"
$DB_PORT = $env:DB_PORT ?? "5432"
$DB_NAME = $env:DB_NAME ?? "iotistic"
$DB_USER = $env:DB_USER ?? "postgres"
$DB_PASSWORD = $env:DB_PASSWORD ?? "postgres"

Write-Host "`n📊 Database Configuration:" -ForegroundColor Green
Write-Host "  Host: $DB_HOST"
Write-Host "  Port: $DB_PORT"
Write-Host "  Database: $DB_NAME"
Write-Host "  User: $DB_USER"

# Check if PostgreSQL is accessible
Write-Host "`n🔍 Testing database connection..." -ForegroundColor Yellow

$PGPASSWORD = $DB_PASSWORD
$env:PGPASSWORD = $DB_PASSWORD

try {
    $testResult = psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Database connection failed!" -ForegroundColor Red
        Write-Host "Error: $testResult" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Database connection successful!" -ForegroundColor Green
} catch {
    Write-Host "❌ psql command not found. Please install PostgreSQL client tools." -ForegroundColor Red
    exit 1
}

# Check if users table exists
Write-Host "`n🔍 Checking if users table exists..." -ForegroundColor Yellow

$checkTable = psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users');" 2>&1

if ($checkTable -match "f") {
    Write-Host "⚠️  Users table does not exist!" -ForegroundColor Red
    Write-Host "📋 Run the migration first:" -ForegroundColor Yellow
    Write-Host "   .\scripts\run-mqtt-acl-migration.ps1`n" -ForegroundColor Cyan
    exit 1
}

Write-Host "✅ Users table exists!" -ForegroundColor Green

# Check if admin user already exists
Write-Host "`n🔍 Checking for existing admin user..." -ForegroundColor Yellow

$adminExists = psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM users WHERE username = 'admin';" 2>&1

if ($adminExists -match "^\s*1") {
    Write-Host "⚠️  Admin user already exists!" -ForegroundColor Yellow
    $response = Read-Host "Do you want to reset the admin password? (y/N)"
    
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Host "❌ Skipping admin user creation." -ForegroundColor Yellow
    } else {
        # Generate new password hash for 'admin123'
        # Bcrypt hash for 'admin123' with 10 rounds
        $passwordHash = '$2b$10$rGHQ7Y9jzVXYxR.kJNGsZOpXXhd0P0V7K5KaKq.eHJq7hZ9xF.Gm2'
        
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c @"
UPDATE users 
SET password_hash = '$passwordHash',
    updated_at = NOW()
WHERE username = 'admin';
"@
        
        Write-Host "✅ Admin password reset to 'admin123'" -ForegroundColor Green
        Write-Host "⚠️  Please change this password immediately after first login!" -ForegroundColor Red
    }
} else {
    # Create admin user
    Write-Host "📝 Creating admin user..." -ForegroundColor Yellow
    
    # Bcrypt hash for 'admin123' with 10 rounds
    $passwordHash = '$2b$10$rGHQ7Y9jzVXYxR.kJNGsZOpXXhd0P0V7K5KaKq.eHJq7hZ9xF.Gm2'
    
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c @"
INSERT INTO users (username, email, password_hash, full_name, role, is_active)
VALUES (
    'admin',
    'admin@iotistic.local',
    '$passwordHash',
    'System Administrator',
    'admin',
    true
)
ON CONFLICT (username) DO NOTHING;
"@
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Admin user created successfully!" -ForegroundColor Green
        Write-Host "`n📋 Admin Credentials:" -ForegroundColor Cyan
        Write-Host "  Username: admin"
        Write-Host "  Password: admin123"
        Write-Host "  Email: admin@iotistic.local"
        Write-Host "`n⚠️  CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!" -ForegroundColor Red
    } else {
        Write-Host "❌ Failed to create admin user!" -ForegroundColor Red
        exit 1
    }
}

# Generate JWT secret if not in .env
Write-Host "`n🔑 Checking JWT secret..." -ForegroundColor Yellow

$currentSecret = $env:JWT_SECRET

if ([string]::IsNullOrEmpty($currentSecret) -or $currentSecret -eq "your-secret-key-change-in-production") {
    Write-Host "⚠️  JWT_SECRET not set or using default!" -ForegroundColor Yellow
    
    # Generate random secret
    $randomBytes = New-Object byte[] 64
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($randomBytes)
    $newSecret = [System.BitConverter]::ToString($randomBytes).Replace("-", "").ToLower()
    
    Write-Host "✅ Generated new JWT secret!" -ForegroundColor Green
    
    # Update or create .env file
    if (Test-Path $envFile) {
        $envContent = Get-Content $envFile -Raw
        
        if ($envContent -match "JWT_SECRET=") {
            # Replace existing JWT_SECRET
            $envContent = $envContent -replace "JWT_SECRET=.*", "JWT_SECRET=$newSecret"
            Set-Content -Path $envFile -Value $envContent -NoNewline
            Write-Host "✅ Updated JWT_SECRET in .env file" -ForegroundColor Green
        } else {
            # Add JWT_SECRET
            Add-Content -Path $envFile -Value "`nJWT_SECRET=$newSecret"
            Write-Host "✅ Added JWT_SECRET to .env file" -ForegroundColor Green
        }
    } else {
        # Create .env file
        $envTemplate = @"
# JWT Configuration
JWT_SECRET=$newSecret
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iotistic
DB_USER=postgres
DB_PASSWORD=postgres

# API Configuration
PORT=4002
NODE_ENV=development
"@
        Set-Content -Path $envFile -Value $envTemplate
        Write-Host "✅ Created .env file with JWT_SECRET" -ForegroundColor Green
    }
    
    Write-Host "`n⚠️  Restart the API server to use the new JWT_SECRET!" -ForegroundColor Yellow
} else {
    Write-Host "✅ JWT_SECRET is already configured" -ForegroundColor Green
}

# Verify auth endpoints are accessible
Write-Host "`n🌐 Verifying API server..." -ForegroundColor Yellow

$apiPort = $env:PORT ?? "4002"
$apiUrl = "http://localhost:$apiPort"

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/" -Method Get -ErrorAction Stop
    Write-Host "✅ API server is running on port $apiPort" -ForegroundColor Green
    
    # Check if auth endpoints exist
    Write-Host "`n🔍 Checking auth endpoints..." -ForegroundColor Yellow
    
    $testEndpoint = "$apiUrl/api/v1/auth/me"
    try {
        $authResponse = Invoke-WebRequest -Uri $testEndpoint -Method Get -ErrorAction Stop
        # Expect 401 since we're not authenticated
        Write-Host "⚠️  Unexpected response from /auth/me" -ForegroundColor Yellow
    } catch {
        if ($_.Exception.Response.StatusCode -eq 401) {
            Write-Host "✅ Auth endpoints are configured correctly" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Auth endpoint returned: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "⚠️  API server is not running on port $apiPort" -ForegroundColor Yellow
    Write-Host "   Start the API server with: npm run dev" -ForegroundColor Cyan
}

Write-Host "`n✅ Authentication Setup Complete!" -ForegroundColor Green
Write-Host "`n📚 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Test authentication: .\scripts\test-auth.ps1"
Write-Host "  2. Login with admin credentials (admin/admin123)"
Write-Host "  3. Change admin password immediately!"
Write-Host "  4. Create additional users as needed`n"
