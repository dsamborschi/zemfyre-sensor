@echo off
setlocal enabledelayedexpansion
set user=%1
shift

echo Running start-services.cmd
echo Username: %user%

REM Collect all remaining arguments as services
set services=
:loop
if "%1"=="" goto :done
set services=!services! %1
shift
goto :loop
:done

echo Services to start: %services%

REM Windows service start
for %%s in (%services%) do (
    echo Starting service: %%s
    net start "%%s"
    if errorlevel 1 (
        echo Failed to start service: %%s
        exit /b 1
    )
    echo Successfully started service: %%s
)

echo All services started successfully
exit /b 0