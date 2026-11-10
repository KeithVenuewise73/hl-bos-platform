# Windows test of the automatic dismissal (apps/date-sort/src/lib/iphone-script.ts,
# DIALOG_CSHARP): compiles the SAME C# DateSort uses, then checks that
#   1. a "Error Copying File or Folder" box owned by a "Copying..." window is
#      closed, and what it said is reported;
#   2. the same box with no owner (someone else's dialog) is left alone.
$ErrorActionPreference = 'Stop'
$T = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$cs = Join-Path $T 'dialogs.cs'
node --experimental-strip-types -e "import('./apps/date-sort/src/lib/iphone-script.ts').then(m => process.stdout.write(m.DIALOG_CSHARP))" > $cs
Add-Type -TypeDefinition (Get-Content -Raw $cs)

$helper = Join-Path $PSScriptRoot 'fake-copy-error.ps1'
function Start-Box($owned, $out) {
  $a = @('-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', $helper, '-Out', $out)
  if ($owned) { $a += '-Owned' }
  Start-Process powershell.exe -ArgumentList $a -PassThru
}
$ok = $true

# 1. Ours: closed, and its words reported.
$out1 = Join-Path $T 'box-owned.txt'; Remove-Item $out1 -ErrorAction SilentlyContinue
$p1 = Start-Box $true $out1
$said = $null
for ($i = 0; $i -lt 100 -and -not $said; $i++) { Start-Sleep -Milliseconds 300; $said = [DateSortDialogs]::DismissCopyError() }
Write-Host "owned box: dismissal said: [$said]"
if (-not $said) { Write-Host "FAIL: the box owned by a Copying window was not found and closed"; $ok = $false }
elseif ($said -notmatch 'requested value cannot be determined') { Write-Host "FAIL: its words were not reported"; $ok = $false }
for ($i = 0; $i -lt 50 -and -not (Test-Path $out1); $i++) { Start-Sleep -Milliseconds 200 }
if (-not (Test-Path $out1)) { Write-Host "FAIL: the box never closed"; $ok = $false } else { Write-Host "owned box result: $(Get-Content $out1)" }
if (-not $p1.HasExited) { $p1.Kill() }

# 2. Not ours: left open for ten seconds of trying.
$out2 = Join-Path $T 'box-unowned.txt'; Remove-Item $out2 -ErrorAction SilentlyContinue
$p2 = Start-Box $false $out2
Start-Sleep -Seconds 3   # let it appear
$touched = $null
for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 300; $r = [DateSortDialogs]::DismissCopyError(); if ($r) { $touched = $r } }
if ($touched) { Write-Host "FAIL: closed a box that does not belong to a copy window: [$touched]"; $ok = $false }
if (Test-Path $out2) { Write-Host "FAIL: the unowned box was closed"; $ok = $false }
if ($p2.HasExited) { Write-Host "FAIL: the unowned box's process ended"; $ok = $false } else { Write-Host "unowned box: still open, as it should be"; $p2.Kill() }

if ($ok) { Write-Host "ALL GOOD"; exit 0 } else { exit 1 }
