@echo off
setlocal EnableDelayedExpansion
REM ===========================================================================
REM  HL-BOS - Development Control Center
REM
REM  Double-click this. It sets itself up the first time, then starts.
REM
REM  It needs NOTHING on your PATH and no admin rights. It does not use
REM  corepack (that needs admin to write shims, and fails quietly when it
REM  cannot). It installs its own build tool inside this folder.
REM
REM  The only prerequisite is Node. If it is missing, this says so plainly
REM  and opens the one installer you need. No command prompt, ever.
REM
REM  Every check prints what it found. Nothing fails silently.
REM ===========================================================================
cd /d "%~dp0\.."
set "ROOT=%CD%"
set "TOOLCHAIN=%ROOT%\.hlbos\toolchain"
set "PNPM_CJS=%TOOLCHAIN%\node_modules\pnpm\bin\pnpm.cjs"
set "PNPM_VERSION=10.34.5"

cls
echo.
echo   HL-BOS Development Control Center
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

REM --- 4. Collect any finished work from GitHub -------------------------------
REM  This is how new work reaches this machine. Without it, a copy of the repo
REM  on this computer could never receive anything again without typing git
REM  commands, which the operating contract forbids.
REM  Exit code 10 means the code changed and must be rebuilt. Anything else
REM  means carry on -- it never blocks startup, and it never touches unsaved work.
set "FRESH_CODE="
if exist "%ROOT%\scripts\update.mjs" (
  "%NODE_EXE%" "%ROOT%\scripts\update.mjs"
  if errorlevel 10 set "FRESH_CODE=1"
) else (
  REM  BOOTSTRAP. This launcher can be dropped into an older copy of the folder
  REM  on its own -- that is the whole point, because a self-updating launcher
  REM  cannot deliver itself. When its Node helper is not here yet, it collects
  REM  it with git directly, once. Every start after this uses the helper above.
  REM
  REM  --ff-only is the safety: git refuses rather than overwrites, so unsaved
  REM  work and a diverged folder both stop it instead of being destroyed.
  echo   [..]   First update: collecting the rest of the console from GitHub...
  where git >nul 2>nul
  if errorlevel 1 (
    echo   [--]   git is not available on this computer, so this copy cannot
    echo          collect updates yet. Tell Claude and it will sort it out.
  ) else (
    git fetch origin --quiet
    git merge --ff-only
    if exist "%ROOT%\scripts\update.mjs" (
      set "FRESH_CODE=1"
      echo   [ok]   Collected. From now on this happens by itself.
    ) else (
      echo   [ok]   Nothing new to collect. Starting as-is.
    )
  )
)

REM --- 5. Libraries -----------------------------------------------------------
if exist "%ROOT%\node_modules" (
  if defined FRESH_CODE (
    echo   [..]   New code arrived: checking libraries...
    "%NODE_EXE%" "%PNPM_CJS%" install --frozen-lockfile
    if errorlevel 1 goto :install_failed
    echo   [ok]   Libraries up to date
  ) else (
    echo   [ok]   Libraries ready
  )
) else (
  echo   [..]   First run: downloading libraries. A few minutes, once.
  "%NODE_EXE%" "%PNPM_CJS%" install --frozen-lockfile
  if errorlevel 1 goto :install_failed
  echo   [ok]   Libraries installed
)

REM --- 6. Build ---------------------------------------------------------------
REM  Rebuild when the code changed, otherwise reuse what is already built so a
REM  normal start stays quick.
REM
REM  Written as separate flag lines on purpose. `if A if B (X) else (Y)` binds
REM  the else to the INNER if, so when A is false neither branch runs -- which
REM  in the first draft of this meant a fresh clone never built the console at
REM  all. Two plain `if`s setting one flag cannot go wrong that way.
set "NEED_BUILD="
if not exist "%ROOT%\apps\control-center\.next" set "NEED_BUILD=1"
if defined FRESH_CODE set "NEED_BUILD=1"

if defined NEED_BUILD (
  if defined FRESH_CODE (
    echo   [..]   Rebuilding the console with the new work...
  ) else (
    echo   [..]   Preparing the console...
  )
  "%NODE_EXE%" "%PNPM_CJS%" --filter @hl-bos/control-center build
  if errorlevel 1 goto :build_failed
  echo   [ok]   Console built
) else (
  echo   [ok]   Console ready
)

REM --- 7. Go ------------------------------------------------------------------
echo.
echo   Opening http://localhost:4000
echo   Leave this window open while you use it. Close it to shut down.
echo.
start "" "http://localhost:4000"
"%NODE_EXE%" "%PNPM_CJS%" --filter @hl-bos/control-center start
goto :eof

REM ===========================================================================
REM  Problems. Each says what happened and the ONE next step.
REM ===========================================================================
:need_node
echo   [--]   Node is not installed on this computer.
echo.
echo   Node is the engine HL-BOS runs on. It is an ordinary Windows installer:
echo   download it, double-click it, click Next until it finishes.
echo.
echo   Opening the download page now. Choose the green LTS button.
echo.
start "" "https://nodejs.org/en/download"
echo   When it has finished, close this window and double-click
echo   control-center.bat again. It will do everything else itself.
echo.
pause
exit /b 1

:node_too_old
echo   [--]   Node !NODE_VER! is installed, but HL-BOS needs 22 or newer.
echo.
echo   Opening the download page. Install the LTS version over the top of the
echo   old one - it replaces it safely.
echo.
start "" "https://nodejs.org/en/download"
echo   Then close this window and double-click control-center.bat again.
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

:install_failed
echo.
echo   [--]   Could not download the libraries.
echo   Nothing is broken and none of your work is affected.
echo   Usually the internet dropping. Try again.
echo   If it keeps happening, send Claude the lines above.
echo.
pause
exit /b 1

:build_failed
echo.
echo   [--]   Could not build the console.
echo   This is an engineering fault, not something you did.
echo   Your work is safe. Send Claude the lines above.
echo.
pause
exit /b 1
