@echo off
cd /d "%~dp0"
echo ============================
echo  SwipperPay - local server
echo ============================
echo.
echo Open: http://localhost:8000
echo Stop: Ctrl+C
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
pause
