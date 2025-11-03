#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Migrate protocolAdapterDevices to sensors field in device_target_state

.DESCRIPTION
    This script:
    1. Merges config.protocolAdapterDevices into config.sensors
    2. Removes the old protocolAdapterDevices field
    3. Updates all device_target_state records
#>

$ErrorActionPreference = "Stop"

# Database connection parameters
$DB_HOST = $env:DB_HOST ?? "localhost"
$DB_PORT = $env:DB_PORT ?? "5432"
$DB_NAME = $env:DB_NAME ?? "iotistic"
$DB_USER = $env:DB_USER ?? "postgres"
$DB_PASSWORD = $env:DB_PASSWORD ?? "postgres"

Write-Host "🔄 Migrating protocolAdapterDevices to sensors..." -ForegroundColor Cyan

# SQL to merge protocolAdapterDevices into sensors and remove old field
$sql = @"
UPDATE device_target_state
SET config = (
    -- Merge protocolAdapterDevices into sensors
    CASE 
        WHEN config ? 'protocolAdapterDevices' THEN
            jsonb_set(
                config - 'protocolAdapterDevices',
                '{sensors}',
                COALESCE(config->'sensors', '[]'::jsonb) || (config->'protocolAdapterDevices')
            )
        ELSE
            config
    END
)
WHERE config ? 'protocolAdapterDevices';
"@

# Execute the migration
$env:PGPASSWORD = $DB_PASSWORD
$result = psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c $sql 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migration completed successfully!" -ForegroundColor Green
    Write-Host $result
} else {
    Write-Host "❌ Migration failed!" -ForegroundColor Red
    Write-Host $result
    exit 1
}

# Verify the migration
Write-Host ""
Write-Host "🔍 Verifying migration..." -ForegroundColor Cyan

$verifySql = @"
SELECT 
    device_uuid,
    jsonb_array_length(COALESCE(config->'sensors', '[]'::jsonb)) as sensor_count,
    CASE WHEN config ? 'protocolAdapterDevices' THEN 'YES ⚠️' ELSE 'NO ✅' END as has_old_field
FROM device_target_state
WHERE config IS NOT NULL;
"@

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c $verifySql
