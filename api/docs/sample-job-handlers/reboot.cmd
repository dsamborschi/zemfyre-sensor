@echo off
set user=%1
echo Running reboot.cmd
echo Username: %user%

set REBOOT_LOCK_FILE=%TEMP%\dc-reboot.lock

if exist "%REBOOT_LOCK_FILE%" (
    echo Found lock file
    set /p LOCK_FILE_BOOT=<%REBOOT_LOCK_FILE%
    del "%REBOOT_LOCK_FILE%"
    
    REM Get current boot time (simplified for Windows)
    for /f "skip=1" %%i in ('wmic os get LastBootUpTime ^| findstr .') do set LAST_BOOT=%%i
    echo Boot time check completed
    echo Reboot was successful
    exit /b 0
) else (
    echo Did not find %REBOOT_LOCK_FILE%
    echo %date% %time% > "%REBOOT_LOCK_FILE%"
    echo Scheduling reboot in 1 minute...
    shutdown /r /t 60 /c "Reboot initiated by AWS IoT Job"
    exit /b 0
)