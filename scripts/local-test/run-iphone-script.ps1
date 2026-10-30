# Runs DateSort's iPhone copy script (apps/date-sort/src/lib/iphone-script.ts)
# exactly as DateSort runs it (powershell.exe -STA -EncodedCommand, paths in
# DS_DEST / DS_TEST_SOURCE), against folders laid out like an iPhone
# ("Apple iPhone\Internal Storage\DCIM\100APPLE"), and checks the result.
# Prints every line the script says.
$ErrorActionPreference = 'Stop'
$T = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$phone = Join-Path $T 'fake-iphone\Apple iPhone'
$src = Join-Path $phone 'Internal Storage\DCIM'
$emptyPhone = Join-Path $T 'fake-empty\Apple iPhone'
$dest = Join-Path $T 'kept\iPhone Photos'
Remove-Item -Recurse -Force (Join-Path $T 'fake-iphone'), (Join-Path $T 'fake-empty'), (Join-Path $T 'kept') -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $src '100APPLE'), (Join-Path $src '101APPLE'), (Join-Path $emptyPhone 'Internal Storage'), $dest | Out-Null
$fx = 'packages\date-sort\fixtures'
Copy-Item "$fx\iphone-style.mov" (Join-Path $src '100APPLE\IMG_0042.MOV')
Copy-Item "$fx\header-only.mp4" (Join-Path $src '100APPLE\IMG_0043.MP4')
Copy-Item "$fx\heic-all-three-differ.heic" (Join-Path $src '100APPLE\IMG_0044.HEIC')
Copy-Item "$fx\jpg-all-three-differ.jpg" (Join-Path $src '101APPLE\IMG_0050.JPG')

node --experimental-strip-types -e "import('./apps/date-sort/src/lib/iphone-script.ts').then(m => process.stdout.write(Buffer.from(m.IPHONE_SCRIPT, 'utf16le').toString('base64')))" > (Join-Path $T 'iphone.b64')
$encoded = (Get-Content (Join-Path $T 'iphone.b64') -Raw).Trim()

function Run($label, $source) {
  $env:DS_DEST = $dest
  $env:DS_TEST_SOURCE = $source
  $p = Start-Process powershell.exe -ArgumentList '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded `
    -RedirectStandardOutput (Join-Path $T "$label.out") -RedirectStandardError (Join-Path $T "$label.err") -PassThru -NoNewWindow
  if (-not $p.WaitForExit(120000)) { Write-Host "TIMED OUT after 120 s"; $p.Kill() }
  $out = @(Get-Content (Join-Path $T "$label.out") -ErrorAction SilentlyContinue)
  Write-Host "--- $label (exit $($p.ExitCode))"
  $out | ForEach-Object { Write-Host $_ }
  return ($out -join "`n")
}
$first = Run 'first' $phone
Write-Host "kept folder now holds:"
Get-ChildItem -Recurse -File $dest | ForEach-Object { Write-Host $_.FullName.Substring($dest.Length + 1) }
$second = Run 'second' $phone
$empty = Run 'empty-storage' $emptyPhone

$ok = $true
foreach ($f in '100APPLE\IMG_0042.MOV', '100APPLE\IMG_0043.MP4', '100APPLE\IMG_0044.HEIC', '101APPLE\IMG_0050.JPG') {
  $a = Join-Path $src $f; $b = Join-Path $dest $f
  if (-not (Test-Path $b) -or (Get-FileHash $a).Hash -ne (Get-FileHash $b).Hash) { Write-Host "MISSING OR DIFFERENT: $f"; $ok = $false }
}
if ($first -notmatch '"type":"done"') { Write-Host "first run never said done"; $ok = $false }
if ($first -notmatch '"type":"looking"') { Write-Host "first run never said which folder it was reading"; $ok = $false }
if ($second -notmatch '"result":"already"') { Write-Host "second run did not find them already there"; $ok = $false }
if ($second -match '"result":"copied"') { Write-Host "second run copied again"; $ok = $false }
if ($empty -notmatch '"type":"locked"' -or $empty -notmatch 'Internal Storage: \(nothing\)') { Write-Host "a phone showing nothing was not reported with what Windows saw"; $ok = $false }
if ($ok) { Write-Host "ALL GOOD"; exit 0 } else { exit 1 }
