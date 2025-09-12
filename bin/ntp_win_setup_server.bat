@echo off
REM ==========================
REM Configure and enable Windows NTP server
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
echo NTP server Enabled? %NTP_ENABLED%

REM ==========================
REM Check and configure firewall rule for NTP
REM ==========================
echo Checking firewall rule for inbound UDP 123...
powershell -Command $rule = Get-NetFirewallRule | Where-Object {($_.Enabled -eq 'True') -and ($_.Direction -eq 'Inbound') -and ($_.Action -eq 'Allow')} | ForEach-Object {Get-NetFirewallPortFilter -AssociatedNetFirewallRule $_} | Where-Object {$_.Protocol -eq 'UDP' -and $_.LocalPort -eq 123}; 
if ($rule) {Write-Host "Firewall rule exists for NTP (UDP 123)."} else { 
    Write-Host "No firewall rule found for UDP 123. Creating one...";
    New-NetFirewallRule -DisplayName "Allow NTP from Pi" -Direction Inbound -Action Allow -Protocol UDP -LocalPort 123 -Profile Any;
    Write-Host "Firewall rule created."
}

echo.
echo Script finished.
pause
