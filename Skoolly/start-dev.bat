@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Skoolly Dev Server
cd /d "%~dp0"

rem ── Ports ─────────────────────────────────────────────────────────────
rem  Vite proxies /api to 127.0.0.1:8004 (vite.config.ts) — change both together.
if not defined API_PORT set "API_PORT=8004"
if not defined WEB_PORT set "WEB_PORT=8443"

rem ── Colours (ANSI, Windows 10+) ───────────────────────────────────────
for /f %%a in ('echo prompt $E^| cmd') do set "ESC=%%a"
set "R=%ESC%[0m"
set "B=%ESC%[1m"
set "DIM=%ESC%[90m"
set "GOLD=%ESC%[33m"
set "BLUE=%ESC%[94m"
set "CYAN=%ESC%[36m"
set "OK=%ESC%[92m"
set "ERR=%ESC%[91m"
set "LINE=%DIM%  ──────────────────────────────────────────────────────────────%R%"

cls
echo.
echo   %B%%GOLD%Skoolly%R%%B% · Dev Server%R%
echo %LINE%
echo   %DIM%Service      Port    URL%R%
echo   %BLUE%Backend%R%      %B%%API_PORT%%R%    http://127.0.0.1:%API_PORT%   %DIM%FastAPI, auto-reloads on .py changes%R%
echo   %CYAN%Frontend%R%     %B%%WEB_PORT%%R%    http://localhost:%WEB_PORT%    %DIM%Vite%R%
echo %LINE%
echo.

rem ── Pre-flight checks ─────────────────────────────────────────────────
where python >nul 2>&1 || (set "MSG=python was not found in PATH" & goto :fail)
where node   >nul 2>&1 || (set "MSG=node was not found in PATH" & goto :fail)
if not exist "node_modules\vite\bin\vite.js" (set "MSG=Dependencies are not installed. Run npm install first." & goto :fail)

set "BUSY="
call :port_up %API_PORT% && set "BUSY=!BUSY! port %API_PORT% (backend)"
call :port_up %WEB_PORT% && set "BUSY=!BUSY! port %WEB_PORT% (frontend)"
if defined BUSY (
    set "MSG=Already in use:!BUSY!. An old Skoolly window is probably still open - close it and run this again."
    goto :fail
)

set "PYTHONIOENCODING=utf-8"
set "PYTHONUNBUFFERED=1"

rem ── 1/2 Backend ───────────────────────────────────────────────────────
echo   %BLUE%[1/2]%R% Starting backend on port %API_PORT% ...
start "" /b python -m uvicorn opec_service:app --app-dir microservices --host 127.0.0.1 --port %API_PORT% --reload --reload-dir microservices
call :wait_port %API_PORT% 60 || (set "DOWN=Backend failed to start - see the error above" & goto :stop)
echo   %OK%[ OK ]%R% Backend ready    http://127.0.0.1:%API_PORT%
echo.

rem ── 2/2 Frontend ──────────────────────────────────────────────────────
echo   %CYAN%[2/2]%R% Starting frontend on port %WEB_PORT% ...
start "" /b node node_modules\vite\bin\vite.js --host 0.0.0.0 --port %WEB_PORT%
call :wait_port %WEB_PORT% 60 || (set "DOWN=Frontend failed to start - see the error above" & goto :stop)
ping -n 2 127.0.0.1 >nul
echo.
echo %LINE%
echo   %OK%%B%All services are up%R%
echo.
echo   Website       %B%http://localhost:%WEB_PORT%%R%
echo   Admin         http://localhost:%WEB_PORT%/#admin
echo   API docs      http://127.0.0.1:%API_PORT%/docs
echo.
echo   %DIM%Logs from both services follow below · Press Ctrl+C to stop everything%R%
echo %LINE%
echo.

rem ── Watch both; if one stops, stop the other too ──────────────────────
:monitor
ping -n 4 127.0.0.1 >nul
call :still_up %API_PORT% || (set "DOWN=Backend stopped" & goto :stop)
call :still_up %WEB_PORT% || (set "DOWN=Frontend stopped" & goto :stop)
goto :monitor

:stop
echo.
echo   %ERR%[STOP]%R% !DOWN! - shutting down the other service too
call :kill_port %API_PORT%
call :kill_port %WEB_PORT%
echo   %DIM%Everything has been stopped.%R%
echo.
pause
exit /b 1

:fail
echo   %ERR%[FAIL]%R% !MSG!
echo.
pause
exit /b 1

rem ── Helpers (ping -n N+1 = sleep N seconds; works even without a console stdin) ───────────────────────────────────────────────────────────
:port_up
netstat -ano | findstr /r /c:":%1 .*LISTENING" >nul
exit /b %errorlevel%

:still_up
rem two checks 2 s apart so a backend auto-reload isn't mistaken for a crash
call :port_up %1 && exit /b 0
ping -n 3 127.0.0.1 >nul
call :port_up %1
exit /b %errorlevel%

:wait_port
set /a "_tries=0"
:wait_port_loop
call :port_up %1 && exit /b 0
set /a "_tries+=1"
if !_tries! geq %2 exit /b 1
ping -n 2 127.0.0.1 >nul
goto :wait_port_loop

:kill_port
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%1 .*LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1
exit /b 0
