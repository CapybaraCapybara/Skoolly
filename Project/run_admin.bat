@echo off
title OPEC International Schools Admin Dashboard
echo =======================================================
echo   OPEC International Schools Admin Dashboard Launcher
echo =======================================================
echo.
echo Clearing any previous background server on port 5000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
echo Starting web server at http://127.0.0.1:5000 ...
echo.
start http://127.0.0.1:5000
python app.py
pause
