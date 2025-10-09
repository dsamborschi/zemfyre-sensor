@echo off
setlocal enabledelayedexpansion
set user=%1
shift

echo Running restart-services.cmd
echo Username: %user%

REM Collect all remaining arguments as services
set services=
:loop
if "%1"=="" goto :done
set services=!services! %1
shift
goto :loop
:done

echo Services to restart: %services%

REM Windows service restart
for %%s in (%services%) do (
    echo Restarting service: %%s
    net stop "%%s" 2>nul
    timeout /t 2 /nobreak >nul
    net start "%%s"
    if errorlevel 1 (
        echo Failed to restart service: %%s
        exit /b 1
    )
    echo Successfully restarted service: %%s
)

echo All services restarted successfully
exit /b 0