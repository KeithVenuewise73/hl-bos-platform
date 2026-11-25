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
function Start-Box($owned, $out, $ownerTitle = 'Copying...') {
  # The title has spaces: Start-Process does not quote array items, so quote it here.
  $a = @('-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', $helper, '-Out', $out, '-OwnerTitle', ('"' + $ownerTitle + '"'))
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

# 1b. Ours, but Windows has retitled its progress window to a percentage: still closed.
$out1b = Join-Path $T 'box-percent.txt'; Remove-Item $out1b -ErrorAction SilentlyContinue
$p1b = Start-Box $true $out1b '37% complete'
$saidB = $null
for ($i = 0; $i -lt 100 -and -not $saidB; $i++) { Start-Sleep -Milliseconds 300; $saidB = [DateSortDialogs]::DismissCopyError() }
Write-Host "retitled (37% complete) box: dismissal said: [$saidB]"
if (-not $saidB) { Write-Host "FAIL: the box over a '37% complete' window was left open"; $ok = $false }
for ($i = 0; $i -lt 50 -and -not (Test-Path $out1b); $i++) { Start-Sleep -Milliseconds 200 }
if (-not (Test-Path $out1b)) { Write-Host "FAIL: the retitled box never closed"; $ok = $false } else { Write-Host "retitled box result: $(Get-Content $out1b)" }
if (-not $p1b.HasExited) { $p1b.Kill() }

# 2b. Owned by someone else's window (a Notepad title): left alone.
$out2b = Join-Path $T 'box-notepad.txt'; Remove-Item $out2b -ErrorAction SilentlyContinue
$p2b = Start-Box $true $out2b 'Untitled - Notepad'
Start-Sleep -Seconds 3
$touchedB = $null
for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 300; $r = [DateSortDialogs]::DismissCopyError(); if ($r) { $touchedB = $r } }
if ($touchedB) { Write-Host "FAIL: closed a box owned by an unrelated window: [$touchedB]"; $ok = $false }
if (Test-Path $out2b) { Write-Host "FAIL: the box owned by an unrelated window was closed"; $ok = $false }
if ($p2b.HasExited) { Write-Host "FAIL: the unrelated box's process ended"; $ok = $false } else { Write-Host "box over an unrelated window: still open, as it should be"; $p2b.Kill() }

# 2. Not ours: left open for ten seconds of trying.
$out2 = Join-Path $T 'box-unowned.txt'; Remove-Item $out2 -ErrorAction SilentlyContinue
$p2 = Start-Box $false $out2
Start-Sleep -Seconds 3   # let it appear
$touched = $null
for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 300; $r = [DateSortDialogs]::DismissCopyError(); if ($r) { $touched = $r } }
if ($touched) { Write-Host "FAIL: closed a box that does not belong to a copy window: [$touched]"; $ok = $false }
if (Test-Path $out2) { Write-Host "FAIL: the unowned box was closed"; $ok = $false }
if ($p2.HasExited) { Write-Host "FAIL: the unowned box's process ended"; $ok = $false } else { Write-Host "unowned box: still open, as it should be"; $p2.Kill() }

# 3. The watcher: a box that appears while nothing is looking is closed all the same, and what it
#    said is left to be collected (this is what happens while Windows' copy call waits for a click).
$out3 = Join-Path $T 'box-watched.txt'; Remove-Item $out3 -ErrorAction SilentlyContinue
[DateSortDialogs]::StartWatching()
$p3 = Start-Box $true $out3
$said3 = $null
for ($i = 0; $i -lt 100 -and -not $said3; $i++) { Start-Sleep -Milliseconds 300; $said3 = [DateSortDialogs]::TakeMessage() }
Write-Host "watched box: collected [$said3]"
if (-not $said3) { Write-Host "FAIL: the watcher did not close the box and keep what it said"; $ok = $false }
elseif ($said3 -notmatch 'requested value cannot be determined') { Write-Host "FAIL: the watcher did not keep the box's words"; $ok = $false }
for ($i = 0; $i -lt 50 -and -not (Test-Path $out3); $i++) { Start-Sleep -Milliseconds 200 }
if (-not (Test-Path $out3)) { Write-Host "FAIL: the watched box never closed"; $ok = $false } else { Write-Host "watched box result: $(Get-Content $out3)" }
if (-not $p3.HasExited) { $p3.Kill() }
$none = [DateSortDialogs]::TakeMessage()
if ($none) { Write-Host "FAIL: a message was left over after collecting it: [$none]"; $ok = $false }

if ($ok) { Write-Host "ALL GOOD"; exit 0 } else { exit 1 }
