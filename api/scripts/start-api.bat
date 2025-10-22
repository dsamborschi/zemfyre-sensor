@echo off
REM Start Iotistic API Server
cd /d "%~dp0"

set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=iotistic
set DB_USER=postgres
set DB_PASSWORD=postgres
set PORT=4002
set NODE_ENV=development

echo ========================================
echo Starting Iotistic API Server
echo ========================================
echo Database: %DB_NAME%@%DB_HOST%:%DB_PORT%
echo Port: %PORT%
echo ========================================
echo.

npx ts-node ./src/index.ts
