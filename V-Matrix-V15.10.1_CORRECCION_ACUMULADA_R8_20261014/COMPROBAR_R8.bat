@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR_R8.ps1" -VerifyOnly
set RC=%ERRORLEVEL%
pause
exit /b %RC%
