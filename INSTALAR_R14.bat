@echo off
setlocal
cd /d "%~dp0"
echo.
echo === V-Matrix V15.10.1 R14 - instalador auditado y transaccional ===
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR_R14.ps1"
set RC=%ERRORLEVEL%
if not "%RC%"=="0" (
  echo.
  echo ERROR: R14 NO quedo validado. Si la copia habia comenzado, el instalador intento rollback automatico.
  pause
  exit /b %RC%
)
echo.
echo R14 instalado y verificado en disco.
echo Reinicia V-Matrix y confirma patch_build 15.10.1-r14.
pause
endlocal
