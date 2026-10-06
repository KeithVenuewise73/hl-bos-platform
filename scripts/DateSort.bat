@echo off
setlocal EnableDelayedExpansion
REM ===========================================================================
REM  DateSort - organize loose camera photos by the day they were taken.
REM
REM  Double-click this. The first time it sets itself up (a few minutes);
REM  after that it starts in seconds and opens DateSort in your browser.
REM
REM  Leave this window open while you use DateSort. Close it to stop.
REM
REM  It needs nothing on your PATH and no admin rights. The only prerequisite
REM  is Node; if it is missing, this says so plainly and opens the installer.
REM  Steps 1-3 are the same as control-center.bat's, so the two share one
REM  build tool inside this folder.
REM ===========================================================================
cd /d "%~dp0\.."
set "ROOT=%CD%"
set "TOOLCHAIN=%ROOT%\.hlbos\toolchain"
set "PNPM_CJS=%TOOLCHAIN%\node_modules\pnpm\bin\pnpm.cjs"
set "PNPM_VERSION=10.34.5"

cls
echo.
echo   DateSort
echo   =================================================
echo.

REM --- 1. Find Node -----------------------------------------------------------
set "NODE_EXE="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE goto :need_node

for /f "delims=" %%V in ('""%NODE_EXE%" --version" 2^>nul') do set "NODE_VER=%%V"
if not defined NODE_VER goto :need_node
echo   [ok]   Node !NODE_VER!

set "NODE_MAJOR=!NODE_VER:v=!"
for /f "tokens=1 delims=." %%M in ("!NODE_MAJOR!") do set "NODE_MAJOR=%%M"
if !NODE_MAJOR! LSS 22 goto :node_too_old

REM --- 2. Find npm beside Node, not on PATH -----------------------------------
for %%D in ("%NODE_EXE%") do set "NODE_DIR=%%~dpD"
set "NPM_CLI=%NODE_DIR%node_modules\npm\bin\npm-cli.js"
if not exist "%NPM_CLI%" set "NPM_CLI=%NODE_DIR%..\lib\node_modules\npm\bin\npm-cli.js"
if not exist "%NPM_CLI%" goto :no_npm

REM --- 3. Install the build tool INTO THIS FOLDER, at the pinned version ------
if exist "%PNPM_CJS%" (
  echo   [ok]   Build tool ready
) else (
  echo   [..]   First run: setting up the build tool. About a minute.
  "%NODE_EXE%" "%NPM_CLI%" install pnpm@%PNPM_VERSION% --prefix "%TOOLCHAIN%" --no-save --no-fund --no-audit
  if not exist "%PNPM_CJS%" goto :pnpm_failed
  echo   [ok]   Build tool installed
)

REM --- 4. Libraries, build, start, open (scripts\date-sort.mjs) ------------
"%NODE_EXE%" "%ROOT%\scripts\date-sort.mjs"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
goto :eof

REM ===========================================================================
REM  Problems. Each says what happened and the ONE next step.
REM ===========================================================================
:need_node
echo   [--]   Node is not installed on this computer.
echo.
echo   Node is the engine DateSort runs on. It is an ordinary Windows installer:
echo   download it, double-click it, click Next until it finishes.
echo.
echo   Opening the download page now. Choose the green LTS button.
echo.
start "" "https://nodejs.org/en/download"
echo   When it has finished, close this window and double-click
echo   DateSort.bat again. It will do everything else itself.
echo.
pause
exit /b 1

:node_too_old
echo   [--]   Node !NODE_VER! is installed, but DateSort needs 22 or newer.
echo.
echo   Opening the download page. Install the LTS version over the top of the
echo   old one - it replaces it safely.
echo.
start "" "https://nodejs.org/en/download"
echo   Then close this window and double-click DateSort.bat again.
echo.
pause
exit /b 1

:no_npm
echo   [--]   Node is installed but looks incomplete - npm is missing.
echo.
echo   Reinstalling Node fixes this. Opening the download page.
echo.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:pnpm_failed
echo.
echo   [--]   Could not set up the build tool.
echo   Nothing is broken and none of your work is affected.
echo   This is usually the internet dropping. Try again.
echo   If it keeps happening, send Claude the lines above.
echo.
pause
exit /b 1
