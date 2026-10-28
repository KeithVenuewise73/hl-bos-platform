# Runs DateSort's iPhone copy script (apps/date-sort/src/lib/iphone-script.ts)
# exactly as DateSort runs it (powershell.exe -STA -EncodedCommand, paths in
# DS_DEST / DS_TEST_SOURCE), against a folder laid out like an iPhone's DCIM,
# and checks the result. Prints every line the script says.
$ErrorActionPreference = 'Stop'
$T = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$src = Join-Path $T 'fake-iphone\DCIM'
$dest = Join-Path $T 'kept\iPhone Photos'
Remove-Item -Recurse -Force (Join-Path $T 'fake-iphone'), (Join-Path $T 'kept') -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $src '100APPLE'), (Join-Path $src '101APPLE'), $dest | Out-Null
$fx = 'packages\date-sort\fixtures'
Copy-Item "$fx\iphone-style.mov" (Join-Path $src '100APPLE\IMG_0042.MOV')
Copy-Item "$fx\header-only.mp4" (Join-Path $src '100APPLE\IMG_0043.MP4')
Copy-Item "$fx\heic-all-three-differ.heic" (Join-Path $src '100APPLE\IMG_0044.HEIC')
Copy-Item "$fx\jpg-all-three-differ.jpg" (Join-Path $src '101APPLE\IMG_0050.JPG')

node --experimental-strip-types -e "import('./apps/date-sort/src/lib/iphone-script.ts').then(m => process.stdout.write(Buffer.from(m.IPHONE_SCRIPT, 'utf16le').toString('base64')))" > (Join-Path $T 'iphone.b64')
$encoded = (Get-Content (Join-Path $T 'iphone.b64') -Raw).Trim()

function Run($label) {
  "--- $label"
  $env:DS_DEST = $dest
  $env:DS_TEST_SOURCE = $src
  $p = Start-Process powershell.exe -ArgumentList '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded `
    -RedirectStandardOutput (Join-Path $T "$label.out") -RedirectStandardError (Join-Path $T "$label.err") -PassThru -NoNewWindow
  if (-not $p.WaitForExit(120000)) { "TIMED OUT after 120 s"; $p.Kill() }
  "exit: $($p.ExitCode)"
  "stdout:"; Get-Content (Join-Path $T "$label.out") -ErrorAction SilentlyContinue
  "stderr:"; Get-Content (Join-Path $T "$label.err") -ErrorAction SilentlyContinue
  Get-Content (Join-Path $T "$label.out") -ErrorAction SilentlyContinue
}
$first = Run 'first'
$first
$files = Get-ChildItem -Recurse -File $dest | ForEach-Object { $_.FullName.Substring($dest.Length + 1) } | Sort-Object
"kept folder now holds:"; $files
$second = Run 'second'
$second
$ok = $true
foreach ($f in '100APPLE\IMG_0042.MOV', '100APPLE\IMG_0043.MP4', '100APPLE\IMG_0044.HEIC', '101APPLE\IMG_0050.JPG') {
  $a = Join-Path $src $f; $b = Join-Path $dest $f
  if (-not (Test-Path $b) -or (Get-FileHash $a).Hash -ne (Get-FileHash $b).Hash) { "MISSING OR DIFFERENT: $f"; $ok = $false }
}
if (-not (($first -join "`n") -match '"type":"done"')) { "first run never said done"; $ok = $false }
if (-not (($second -join "`n") -match '"result":"already"')) { "second run did not find them already there"; $ok = $false }
if (($second -join "`n") -match '"result":"copied"') { "second run copied again"; $ok = $false }
if ($ok) { "ALL GOOD"; exit 0 } else { exit 1 }
