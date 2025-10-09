@echo off
setlocal enabledelayedexpansion
set user=%1
shift

echo Running stop-services.cmd
echo Username: %user%

REM Collect all remaining arguments as services
set services=
:loop
if "%1"=="" goto :done
set services=!services! %1
shift
goto :loop
:done

echo Services to stop: %services%

REM Windows service stop
for %%s in (%services%) do (
    echo Stopping service: %%s
    net stop "%%s"
    if errorlevel 1 (
        echo Failed to stop service: %%s
        exit /b 1
    )
    echo Successfully stopped service: %%s
)

echo All services stopped successfully
exit /b 0