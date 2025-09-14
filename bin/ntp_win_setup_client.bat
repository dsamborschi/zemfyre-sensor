
@echo off
REM ==========================
REM Disable Windows NTP server and remove firewall rule
REM ==========================

echo Stopping W32Time service...
net stop W32Time

echo Disabling NTP server in registry...
reg add "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\services\W32Time\TimeProviders\NtpServer" /v Enabled /t REG_DWORD /d 0 /f
reg add "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\services\W32Time\Config" /v AnnounceFlags /t REG_DWORD /d 0 /f
reg add "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\W32Time\Parameters" /v LocalNTP /t REG_DWORD /d 0 /f

echo Starting W32Time service...
net start W32Time

REM ==========================
REM Verify NTP server is disabled
REM ==========================, test3
for /f "tokens=3" %%A in ('reg query "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\W32Time\TimeProviders\NtpServer" /v Enabled') do set NTP_ENABLED=%%A
echo NTP server Enabled? %NTP_ENABLED%

REM ==========================
REM Remove firewall rule for NTP
REM ==========================
echo Removing firewall rule "Allow NTP from Pi" if exists...
netsh advfirewall firewall show rule name="Allow NTP from Pi" >nul 2>&1
if errorlevel 1 (
    echo No firewall rule found
) else (
    netsh advfirewall firewall delete rule name="Allow NTP from Pi" >nul
    echo Firewall rule removed
)

echo.
echo Script finished.
pause
