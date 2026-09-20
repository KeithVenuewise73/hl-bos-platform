@echo off
setlocal EnableDelayedExpansion
REM ===========================================================================
REM  HL-BOS - FIRST TIME SETUP
REM
REM  Download this one file and double-click it. It puts HL-BOS on this
REM  computer and starts it. Everything after this is done from the console
REM  itself -- this file is needed exactly once.
REM
REM  It needs nothing on your PATH and no admin rights. The only prerequisite
REM  is Node; if it is missing this says so plainly and opens the one installer
REM  you need.
REM
REM  It never writes into a folder that already has something in it.
REM ===========================================================================
cls
echo.
echo   HL-BOS - first time setup
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

REM --- 2. Fetch the setup script ----------------------------------------------
REM  curl ships with Windows 10 and 11. The repository is public, so no
REM  sign-in and no token is needed.
set "SETUP=%TEMP%\hl-bos-setup.mjs"
set "SETUP_URL=https://raw.githubusercontent.com/KeithVenuewise73/hl-bos-platform/main/scripts/setup.mjs"
echo   [..]   Fetching the setup step
curl -fsSL -o "%SETUP%" "%SETUP_URL%"
if not exist "%SETUP%" goto :no_download
echo   [ok]   Ready

REM --- 3. Run it --------------------------------------------------------------
"%NODE_EXE%" "%SETUP%"
if errorlevel 1 goto :setup_failed

REM --- 4. Start the console ----------------------------------------------------
set "LAUNCHER=%USERPROFILE%\HL-BOS\scripts\control-center.bat"
if exist "%LAUNCHER%" (
  echo   Starting HL-BOS...
  echo.
  call "%LAUNCHER%"
) else (
  echo   HL-BOS is installed, but the launcher was not where expected:
  echo     %LAUNCHER%
  echo.
  pause
)
exit /b 0

:need_node
echo   [--]   Node is not installed on this computer.
echo.
echo   Node is the one thing HL-BOS needs. It is an ordinary Windows
echo   installer: double-click, then Next until it finishes.
echo.
echo   Opening the download page now. When it has finished installing,
echo   double-click this file again.
echo.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:node_too_old
echo   [--]   Node !NODE_VER! is too old. HL-BOS needs version 22 or newer.
echo.
echo   Opening the download page. Install it, then double-click this again.
echo.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:no_download
echo   [--]   Could not download the setup step.
echo.
echo   This usually means no internet connection. Check the connection
echo   and double-click this file again.
echo.
pause
exit /b 1

:setup_failed
echo.
echo   Setup did not finish. The reason is printed above.
echo.
pause
exit /b 1
