@echo off
REM ===========================================================================
REM  HL-BOS - Development Control Center
REM
REM  Double-click. It starts the console and opens it in your browser.
REM  Leave this window open while you use it. Close it to shut down.
REM
REM  This runs ONLY on this machine. Nothing is published to the internet.
REM ===========================================================================
setlocal
cd /d "%~dp0\.."

echo.
echo   HL-BOS Development Control Center
echo   ==================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo   Setting up for first use...
  call corepack enable >nul 2>nul
)

if not exist "node_modules\" (
  echo   First run - installing. This takes a few minutes, once.
  call pnpm install --frozen-lockfile
  if errorlevel 1 goto :failed
)

if not exist "apps\control-center\.next\" (
  echo   Preparing the console...
  call pnpm --filter @hl-bos/control-center build
  if errorlevel 1 goto :failed
)

echo   Starting...
start "" "http://localhost:4000"
echo.
echo   The console is opening at http://localhost:4000
echo   Leave this window open. Close it when you are done.
echo.
call pnpm --filter @hl-bos/control-center start
goto :eof

:failed
echo.
echo   Could not start. Nothing was broken.
echo   Copy the message above and send it to Claude.
echo.
pause
