

@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Skoolly Dev Server
cd /d "%~dp0"

rem ── Ports ─────────────────────────────────────────────────────────────
rem  Vite proxies /api to 127.0.0.1:8004 (vite.config.ts) — change both together.
if not defined SCRAPER_PORT set "SCRAPER_PORT=8001"
if not defined API_PORT set "API_PORT=8004"
if not defined WEB_PORT set "WEB_PORT=8443"
rem  Saga services: orchestrator.py calls the scraper, validator and save service on these ports directly.
set "ORCH_PORT=8000"
set "VALIDATOR_PORT=8002"
set "SAVE_PORT=8003"

rem ── Colours (ANSI, Windows 10+) ───────────────────────────────────────
for /f %%a in ('echo prompt $E^| cmd') do set "ESC=%%a"
set "R=%ESC%[0m"
set "B=%ESC%[1m"
set "DIM=%ESC%[90m"
set "GOLD=%ESC%[33m"
set "BLUE=%ESC%[94m"
set "MAGENTA=%ESC%[95m"
set "CYAN=%ESC%[36m"
set "OK=%ESC%[92m"
set "ERR=%ESC%[91m"
set "LINE=%DIM%  ──────────────────────────────────────────────────────────────%R%"

cls
echo.
echo   %B%%GOLD%Skoolly%R%%B% · Dev Server%R%
echo %LINE%
echo   %DIM%Service      Port    URL%R%
echo   %MAGENTA%Scraper%R%      %B%%SCRAPER_PORT%%R%    http://127.0.0.1:%SCRAPER_PORT%   %DIM%FastAPI + Playwright + Gemini%R%
echo   %GOLD%Saga%R%         %B%%ORCH_PORT%%R%    http://127.0.0.1:%ORCH_PORT%   %DIM%orchestrator, validator %VALIDATOR_PORT%, save %SAVE_PORT%%R%
echo   %BLUE%Backend%R%      %B%%API_PORT%%R%    http://127.0.0.1:%API_PORT%   %DIM%FastAPI, auto-reloads on .py changes%R%
echo   %CYAN%Frontend%R%     %B%%WEB_PORT%%R%    http://localhost:%WEB_PORT%    %DIM%Vite%R%
echo %LINE%
echo.

rem ── Pre-flight checks ─────────────────────────────────────────────────
if defined VIRTUAL_ENV (
    set "PYTHON_EXE=python"
) else if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=.venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

"%PYTHON_EXE%" -c "import sys" >nul 2>&1 || (set "MSG=python was not found in PATH or .venv" & goto :fail)
where node   >nul 2>&1 || (set "MSG=node was not found in PATH" & goto :fail)
if not exist "node_modules\vite\bin\vite.js" (set "MSG=Dependencies are not installed. Run npm install first." & goto :fail)

set "BUSY="
call :port_up %SCRAPER_PORT% && set "BUSY=!BUSY! port %SCRAPER_PORT% (scraper)"
call :port_up %VALIDATOR_PORT% && set "BUSY=!BUSY! port %VALIDATOR_PORT% (validator)"
call :port_up %SAVE_PORT% && set "BUSY=!BUSY! port %SAVE_PORT% (save service)"
call :port_up %ORCH_PORT% && set "BUSY=!BUSY! port %ORCH_PORT% (orchestrator)"
call :port_up %API_PORT% && set "BUSY=!BUSY! port %API_PORT% (backend)"
call :port_up %WEB_PORT% && set "BUSY=!BUSY! port %WEB_PORT% (frontend)"
if defined BUSY (
    set "MSG=Already in use:!BUSY!. An old Skoolly window is probably still open - close it and run this again."
    goto :fail
)

set "PYTHONIOENCODING=utf-8"
set "PYTHONUNBUFFERED=1"

rem ── 1/6 Scraper Service ──────────────────────────────────────────────────
echo   %MAGENTA%[1/6]%R% Starting scraper service on port %SCRAPER_PORT% ...
start "" /b "%PYTHON_EXE%" -m uvicorn scraper_service:app --app-dir microservices --host 127.0.0.1 --port %SCRAPER_PORT% --reload --reload-dir microservices
call :wait_port %SCRAPER_PORT% 60 || (set "DOWN=Scraper failed to start - see the error above" & goto :stop)
echo   %OK%[ OK ]%R% Scraper ready    http://127.0.0.1:%SCRAPER_PORT%
echo.

rem ── 2-4/6 Saga: validator, save service (draft versions in the database), orchestrator ─────
rem  The admin page's batch scrape goes orchestrator -> scraper -> validator -> save service.
echo   %GOLD%[2/6]%R% Starting validator service on port %VALIDATOR_PORT% ...
start "" /b "%PYTHON_EXE%" -m uvicorn saga.validator_service:app --app-dir microservices --host 127.0.0.1 --port %VALIDATOR_PORT% --reload --reload-dir microservices
call :wait_port %VALIDATOR_PORT% 60 || (set "DOWN=Validator failed to start - see the error above" & goto :stop)
echo   %OK%[ OK ]%R% Validator ready  http://127.0.0.1:%VALIDATOR_PORT%
echo.
echo   %GOLD%[3/6]%R% Starting save service on port %SAVE_PORT% ...
start "" /b "%PYTHON_EXE%" -m uvicorn saga.save_service:app --app-dir microservices --host 127.0.0.1 --port %SAVE_PORT% --reload --reload-dir microservices
call :wait_port %SAVE_PORT% 60 || (set "DOWN=Save service failed to start - see the error above" & goto :stop)
echo   %OK%[ OK ]%R% Save service ready  http://127.0.0.1:%SAVE_PORT%
echo.
echo   %GOLD%[4/6]%R% Starting Saga orchestrator on port %ORCH_PORT% ...
start "" /b "%PYTHON_EXE%" -m uvicorn saga.orchestrator:app --app-dir microservices --host 127.0.0.1 --port %ORCH_PORT% --reload --reload-dir microservices
call :wait_port %ORCH_PORT% 60 || (set "DOWN=Orchestrator failed to start - see the error above" & goto :stop)
echo   %OK%[ OK ]%R% Orchestrator ready  http://127.0.0.1:%ORCH_PORT%
echo.

rem ── 5/6 Backend ──────────────────────────────────────────────────────────
echo   %BLUE%[5/6]%R% Starting backend on port %API_PORT% ...
start "" /b "%PYTHON_EXE%" -m uvicorn school_service:app --app-dir microservices --host 127.0.0.1 --port %API_PORT% --reload --reload-dir microservices
call :wait_port %API_PORT% 60 || (set "DOWN=Backend failed to start - see the error above" & goto :stop)
echo   %OK%[ OK ]%R% Backend ready    http://127.0.0.1:%API_PORT%
echo.

rem ── 6/6 Frontend ─────────────────────────────────────────────────────────
echo   %CYAN%[6/6]%R% Starting frontend on port %WEB_PORT% ...
start "" /b node node_modules\vite\bin\vite.js --host 127.0.0.1 --port %WEB_PORT%
call :wait_port %WEB_PORT% 60 || (set "DOWN=Frontend failed to start - see the error above" & goto :stop)
ping -n 2 127.0.0.1 >nul
echo.
echo %LINE%
echo   %OK%%B%All services are up%R%
echo.
echo   Website       %B%http://localhost:%WEB_PORT%%R%
echo   Admin         http://localhost:%WEB_PORT%/#admin
echo   Backend docs  http://127.0.0.1:%API_PORT%/docs
echo   Scraper docs  http://127.0.0.1:%SCRAPER_PORT%/docs
echo.
echo   %DIM%Logs from all services follow below · Press Ctrl+C to stop everything%R%
echo %LINE%
echo.

rem ── Watch all; if one stops, stop the others too ───────────────────────
:monitor
ping -n 4 127.0.0.1 >nul
call :still_up %SCRAPER_PORT% || (set "DOWN=Scraper stopped" & goto :stop)
call :still_up %VALIDATOR_PORT% || (set "DOWN=Validator stopped" & goto :stop)
call :still_up %SAVE_PORT% || (set "DOWN=Save service stopped" & goto :stop)
call :still_up %ORCH_PORT% || (set "DOWN=Orchestrator stopped" & goto :stop)
call :still_up %API_PORT% || (set "DOWN=Backend stopped" & goto :stop)
call :still_up %WEB_PORT% || (set "DOWN=Frontend stopped" & goto :stop)
goto :monitor

:stop
echo.
echo   %ERR%[STOP]%R% !DOWN! - shutting down all services
call :kill_port %SCRAPER_PORT%
call :kill_port %VALIDATOR_PORT%
call :kill_port %SAVE_PORT%
call :kill_port %ORCH_PORT%
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
