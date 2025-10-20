#!/usr/bin/env pwsh
# Run MQTT Monitoring Database Migration

$ErrorActionPreference = "Stop"

Write-Host "🔄 Running MQTT Monitoring Migration..." -ForegroundColor Cyan

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
    exit 1
}

Write-Host "📊 Database: $DB_NAME @ ${DB_HOST}:${DB_PORT}" -ForegroundColor Gray
Write-Host ""

# Check if psql is available
$psqlExists = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlExists) {
    Write-Host "❌ psql not found! Please install PostgreSQL client tools." -ForegroundColor Red
    exit 1
}

# Set password environment variable for psql
$env:PGPASSWORD = $DB_PASSWORD

# Run migration
$migrationFile = "database/migrations/20251019_mqtt_monitoring_tables.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ Migration file not found: $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "🔧 Running migration: $migrationFile" -ForegroundColor Yellow
Write-Host ""

try {
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $migrationFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Migration completed successfully!" -ForegroundColor Green
        Write-Host ""
        
        # Show created tables
        Write-Host "📋 Created Tables:" -ForegroundColor Cyan
        $query = @"
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE 'mqtt_%'
ORDER BY tablename;
"@
        
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c $query -t
        
        Write-Host ""
        Write-Host "🎯 Next Steps:" -ForegroundColor Yellow
        Write-Host "   1. Set MQTT_PERSIST_TO_DB=true in .env" -ForegroundColor White
        Write-Host "   2. Restart the API: npm run dev" -ForegroundColor White
        Write-Host "   3. Monitor logs for database sync messages" -ForegroundColor White
        Write-Host ""
        
    } else {
        Write-Host ""
        Write-Host "❌ Migration failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ Error running migration: $_" -ForegroundColor Red
    exit 1
} finally {
    # Clear password
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
