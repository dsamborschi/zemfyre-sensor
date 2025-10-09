@echo off
set user=%1
echo Running shutdown.cmd
echo Username: %user%

echo System scheduled for shutdown in one minute...
shutdown /s /t 60 /c "Shutdown initiated by AWS IoT Job"
exit /b 0