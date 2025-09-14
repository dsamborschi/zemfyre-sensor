@echo off
REM ==========================
REM Configure and enable Windows NTP server, TEST1
REM ==========================

echo Ensuring W32Time service is set to start automatically...
sc config W32Time start= auto

echo Stopping W32Time service...
net stop W32Time

echo Configuring registry for NTP server...
reg add "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\services\W32Time\Config" /v LocalClockDispersion /t REG_DWORD /d 0 /f
reg add "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\W32Time\Parameters" /v LocalNTP /t REG_DWORD /d 1 /f
reg add "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\services\W32Time\TimeProviders\NtpServer" /v Enabled /t REG_DWORD /d 1 /f
reg add "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\services\W32Time\Config" /v AnnounceFlags /t REG_DWORD /d 5 /f

echo Starting W32Time service...
net start W32Time

REM ==========================
REM Verify NTP server is enabled
REM ==========================
for /f "tokens=3" %%A in ('reg query "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\W32Time\TimeProviders\NtpServer" /v Enabled') do set NTP_ENABLED=%%A

if "%NTP_ENABLED%"=="0x1" (
    echo NTP server is ENABLED and running.
) else (
    echo NTP server is DISABLED.
)


REM ==========================
REM Check and configure firewall rule for NTP
REM ==========================
echo Checking firewall rule for inbound UDP 123...
netsh advfirewall firewall show rule name="Allow NTP from Pi" >nul 2>&1
if errorlevel 1 (
    echo No firewall rule found for UDP 123. Creating one...
    netsh advfirewall firewall add rule name="Allow NTP from Pi" dir=in action=allow protocol=UDP localport=123
    echo Firewall rule created.
) else (
    echo Firewall rule already exists for NTP UDP 123
)


echo.
echo Script finished.
pause

REM ==========================
REM Optional: Test NTP server functionality
REM w32tm /stripchart /computer:EXTERNAL_IP /samples:4 /dataonly
