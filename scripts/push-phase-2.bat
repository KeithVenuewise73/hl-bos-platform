@echo off
REM ===========================================================================
REM  HL-BOS - Push Phase 2 and open the Pull Request
REM
REM  Double-click this file. It does three things and stops:
REM    1. Pushes the Phase 2 branch to GitHub
REM    2. Opens the Pull Request page in your browser, pre-filled
REM    3. Tells you what to do next
REM
REM  It does NOT touch main. It does NOT touch Supabase. It cannot deploy.
REM  If anything looks wrong it stops and prints the reason.
REM ===========================================================================
setlocal
cd /d "%~dp0\.."

echo.
echo  HL-BOS - Pushing Phase 2
echo  =========================================
echo.

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%B
if not "%BRANCH%"=="feat/phase-2-identity-tenancy" (
  echo  STOP: you are on branch "%BRANCH%", not feat/phase-2-identity-tenancy.
  echo  Nothing was pushed. Send this message to Claude.
  echo.
  pause
  exit /b 1
)

echo  Branch : %BRANCH%
for /f %%C in ('git rev-list --count main..HEAD') do echo  Commits: %%C ahead of main
echo.
echo  Pushing to GitHub...
echo  (a browser window may open asking you to authorize - approve it as KeithVenuewise73)
echo.

git push -u origin feat/phase-2-identity-tenancy
if errorlevel 1 (
  echo.
  echo  Push did not complete. Nothing was broken - your work is safe locally.
  echo  Copy the message above and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo.
echo  Pushed successfully.
echo  Opening the Pull Request page...
start "" "https://github.com/KeithVenuewise73/hl-bos-platform/compare/main...feat/phase-2-identity-tenancy?expand=1"

echo.
echo  =========================================
echo   NEXT: on the page that just opened
echo     1. Paste the PR description (docs/operations/PR_BODY_phase2.md)
echo     2. Click "Create pull request"
echo     3. Wait for the checks to finish, then tell Claude
echo.
echo   Do NOT click Merge yet - that is your approval decision,
echo   and it comes after the checks are green.
echo  =========================================
echo.
pause
