@echo off
setlocal
cd /d "%~dp0"
echo.
echo === V-Matrix V15.10.1 R8 - instalador verificable ===
echo Destino: C:\Programas Base\OCR-Validacion-Excel-ocr-gpu-produccion
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR_R8.ps1"
set RC=%ERRORLEVEL%
if not "%RC%"=="0" (
  echo.
  echo ERROR: R8 NO quedo validado. Revisa el mensaje anterior.
  pause
  exit /b %RC%
)
echo.
echo R8 instalado y verificado en disco.
echo Cierra COMPLETAMENTE el servidor/dashboard anterior y vuelve a iniciarlo.
pause
endlocal
