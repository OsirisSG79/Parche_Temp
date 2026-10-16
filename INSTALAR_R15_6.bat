@echo off
setlocal
cd /d "%~dp0"
echo.
echo === V-Matrix V15.10.1 R15.6 - instalador auditado y transaccional ===
echo.
rem R15.6 (ALTO-03): %%* reenvia los argumentos al .ps1 (-Force, -Target, -VerifyOnly).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR_R15_6.ps1" %*
set RC=%ERRORLEVEL%
if not "%RC%"=="0" (
  echo.
  echo ERROR: R15.6 NO quedo validado. Si la copia habia comenzado, el instalador intento rollback automatico.
  pause
  exit /b %RC%
)
echo.
echo R15.6 instalado y verificado en disco.
echo Reinicia V-Matrix y confirma patch_build 15.10.1-r15.6.
pause
endlocal
