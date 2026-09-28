@echo off
title Skoolly Project Starter

cd /d "%~dp0"

echo [1/2] Starting OPEC Backend Service (Port 8004)...
start "Skoolly Backend" cmd /k "python microservices/opec_service.py"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend Dev Server (Port 8443)...
start "Skoolly Frontend" cmd /k "npm run dev"

echo.
echo ===================================================
echo   All services have been launched!
echo.
echo   Frontend: http://localhost:8443
echo   Backend:  http://127.0.0.1:8004
echo ===================================================
echo.
pause
