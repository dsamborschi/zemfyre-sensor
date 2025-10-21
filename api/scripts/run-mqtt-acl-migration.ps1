#!/usr/bin/env pwsh
# Run MQTT Authentication and ACL Migration
# This script creates the mqtt_users and mqtt_acls tables for mosquitto-go-auth

$ErrorActionPreference = "Stop"

Write-Host "🔄 Running MQTT Authentication & ACL Migration..." -ForegroundColor Cyan
Write-Host ""

# Load environment variables from .env if it exists
if (Test-Path ".env") {
    Write-Host "📁 Loading environment from .env" -ForegroundColor Gray
    Get-Content .env | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value)
        }
    }
}

# Get database connection details
$DB_HOST = $env:DB_HOST ?? "localhost"
$DB_PORT = $env:DB_PORT ?? "5432"
$DB_NAME = $env:DB_NAME ?? "iotistic"
$DB_USER = $env:DB_USER ?? "postgres"
$DB_PASSWORD = $env:DB_PASSWORD

if (-not $DB_PASSWORD) {
    Write-Host "❌ DB_PASSWORD not set!" -ForegroundColor Red
    Write-Host "   Set it in .env or as environment variable" -ForegroundColor Yellow
    exit 1
}

Write-Host "📊 Database Connection:" -ForegroundColor Cyan
Write-Host "   Host: $DB_HOST" -ForegroundColor Gray
Write-Host "   Port: $DB_PORT" -ForegroundColor Gray
Write-Host "   Database: $DB_NAME" -ForegroundColor Gray
Write-Host "   User: $DB_USER" -ForegroundColor Gray
Write-Host ""

# Check if psql is available
$psqlExists = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlExists) {
    Write-Host "❌ psql not found!" -ForegroundColor Red
    Write-Host "   Please install PostgreSQL client tools" -ForegroundColor Yellow
    Write-Host "   Download from: https://www.postgresql.org/download/" -ForegroundColor Cyan
    exit 1
}

# Set password environment variable for psql
$env:PGPASSWORD = $DB_PASSWORD

# Migration file path
$migrationFile = "database/migrations/017_add_user_auth_and_mqtt_acl.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ Migration file not found: $migrationFile" -ForegroundColor Red
    Write-Host "   Make sure you're in the api/ directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "🔧 Running Migration:" -ForegroundColor Yellow
Write-Host "   File: $migrationFile" -ForegroundColor Gray
Write-Host ""

try {
    # Test connection first
    Write-Host "🔌 Testing database connection..." -ForegroundColor Cyan
    $testQuery = "SELECT version();"
    $testResult = psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c $testQuery -t 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Cannot connect to database!" -ForegroundColor Red
        Write-Host "   Error: $testResult" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Database connection successful" -ForegroundColor Green
    Write-Host ""
    
    # Run the migration
    Write-Host "📝 Executing migration..." -ForegroundColor Cyan
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $migrationFile

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Migration completed successfully!" -ForegroundColor Green
        Write-Host ""

        # Verify tables were created
        Write-Host "📋 Verifying Created Tables:" -ForegroundColor Cyan
        $verifyQuery = @"
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
AND (
    tablename LIKE 'mqtt_%'
    OR tablename IN ('users', 'refresh_tokens', 'user_sessions')
)
ORDER BY tablename;
"@

        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c $verifyQuery

        Write-Host ""
        Write-Host "🔍 Checking Default Data:" -ForegroundColor Cyan
        
        # Check for default admin user
        $adminCheckQuery = "SELECT username, role FROM users WHERE username = 'admin';"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c $adminCheckQuery

        # Check for MQTT superuser
        $mqttAdminQuery = "SELECT username, is_superuser FROM mqtt_users WHERE username = 'mqtt_admin';"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c $mqttAdminQuery

        # Count ACL rules
        $aclCountQuery = "SELECT COUNT(*) as acl_rules FROM mqtt_acls;"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c $aclCountQuery

        Write-Host ""
        Write-Host "🎯 Next Steps:" -ForegroundColor Yellow
        Write-Host "   1. Configure mosquitto-go-auth with PostgreSQL backend" -ForegroundColor White
        Write-Host "   2. Update api/mosquitto.conf with database credentials" -ForegroundColor White
        Write-Host "   3. Set MQTT_BROKER_URL in .env" -ForegroundColor White
        Write-Host "   4. Restart Mosquitto: docker compose restart mosquitto" -ForegroundColor White
        Write-Host "   5. Test MQTT connection with credentials" -ForegroundColor White
        Write-Host ""
        Write-Host "⚠️  Security Note:" -ForegroundColor Red
        Write-Host "   Default passwords were created:" -ForegroundColor Yellow
        Write-Host "   - Admin user password: admin123" -ForegroundColor Yellow
        Write-Host "   - MQTT admin password: mqtt_admin" -ForegroundColor Yellow
        Write-Host "   CHANGE THESE IN PRODUCTION!" -ForegroundColor Red
        Write-Host ""

    } else {
        Write-Host ""
        Write-Host "❌ Migration failed!" -ForegroundColor Red
        Write-Host "   Check the error messages above" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ Error running migration: $_" -ForegroundColor Red
    exit 1
} finally {
    # Clear password from environment
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
