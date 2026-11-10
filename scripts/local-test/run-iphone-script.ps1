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
# Newer iPhones show month folders straight inside Internal Storage, no DCIM.
$monthPhone = Join-Path $T 'fake-months\Apple iPhone'
$months = Join-Path $monthPhone 'Internal Storage'
$dest = Join-Path $T 'kept\iPhone Photos'
Remove-Item -Recurse -Force (Join-Path $T 'fake-iphone'), (Join-Path $T 'fake-empty'), (Join-Path $T 'fake-months'), (Join-Path $T 'kept') -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $src '100APPLE'), (Join-Path $src '101APPLE'), (Join-Path $emptyPhone 'Internal Storage'), (Join-Path $months '202609_a'), (Join-Path $months '202610_a'), $dest | Out-Null
$fx = 'packages\date-sort\fixtures'
Copy-Item "$fx\iphone-style.mov" (Join-Path $src '100APPLE\IMG_0042.MOV')
Copy-Item "$fx\header-only.mp4" (Join-Path $src '100APPLE\IMG_0043.MP4')
Copy-Item "$fx\heic-all-three-differ.heic" (Join-Path $src '100APPLE\IMG_0044.HEIC')
Copy-Item "$fx\jpg-all-three-differ.jpg" (Join-Path $src '101APPLE\IMG_0050.JPG')
Copy-Item "$fx\header-only.mp4" (Join-Path $months '202609_a\IMG_0900.MP4')
Copy-Item "$fx\jpg-all-three-differ.jpg" (Join-Path $months '202610_a\IMG_1000.JPG')

node --experimental-strip-types -e "import('./apps/date-sort/src/lib/iphone-script.ts').then(m => process.stdout.write(Buffer.from(m.IPHONE_SCRIPT, 'utf16le').toString('base64')))" > (Join-Path $T 'iphone.b64')
$encoded = (Get-Content (Join-Path $T 'iphone.b64') -Raw).Trim()

function Run($label, $source, $into = $dest, $kind = '', $days = '', $size = '', $split = '', $preview = '') {
  $env:DS_DEST = $into
  $env:DS_KIND = $kind
  $env:DS_DAYS = $days
  $env:DS_SIZE = $size
  $env:DS_SPLIT_MB = $split
  $env:DS_PREVIEW = $preview
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
# A copy cut short by an earlier run sits in the folder: it must be reported,
# never counted as already there.
New-Item -ItemType Directory -Force (Join-Path $dest '202609_a') | Out-Null
$whole = [IO.File]::ReadAllBytes((Join-Path $months '202609_a\IMG_0900.MP4'))
[IO.File]::WriteAllBytes((Join-Path $dest '202609_a\IMG_0900.MP4'), $whole[0..999])
# A file that failed on an earlier run is tried last.
New-Item -ItemType Directory -Force (Join-Path $dest '.datesort-incoming') | Out-Null
Set-Content -LiteralPath (Join-Path $dest '.datesort-incoming\failed-before.txt') -Value '202609_a\IMG_0900.MP4'
# ...and so is one whose part-copy was left behind by an earlier failure.
Copy-Item "$fx\jpg-all-three-differ.jpg" (Join-Path $months '202610_a\IMG_1001.JPG')
[IO.File]::WriteAllBytes((Join-Path $dest '.datesort-incoming\IMG_1001.JPG'), [byte[]](1..50))
$month = Run 'month-folders' $monthPhone

# Photos and videos are brought in by separate buttons into separate folders.
$destP = Join-Path $T 'kept\Photos only'
$destV = Join-Path $T 'kept\Videos only'
$destR = Join-Path $T 'kept\Videos recent'
New-Item -ItemType Directory -Force $destP, $destV, $destR | Out-Null
$photosRun = Run 'photos-only' $phone $destP 'photos'
$videosRun = Run 'videos-only' $phone $destV 'videos'
# A video the phone dates years ago is left out of "the last 30 days", counted
# and reported, while the recent one comes across.
(Get-Item (Join-Path $src '100APPLE\IMG_0042.MOV')).LastWriteTime = (Get-Date).AddYears(-6)
$recentRun = Run 'videos-recent' $phone $destR 'videos' '30'
$sixRun = Run 'videos-days-all' $phone (Join-Path $T 'kept\Videos six years') 'videos' '4000'

# Three videos of different sizes (10 KB, 200 KB, 3 MB), laid out so that the
# order the phone lists them is NOT smallest first.
$sizePhone = Join-Path $T 'fake-sizes\Apple iPhone'
$sizeSrc = Join-Path $sizePhone 'Internal Storage\DCIM\100APPLE'
New-Item -ItemType Directory -Force $sizeSrc | Out-Null
foreach ($pair in @(@('a_big.MOV', 3145728), @('b_small.MOV', 10240), @('c_mid.MOV', 204800))) {
  $bytes = New-Object byte[] $pair[1]; (New-Object Random 7).NextBytes($bytes)
  [IO.File]::WriteAllBytes((Join-Path $sizeSrc $pair[0]), $bytes)
}
$destAll = Join-Path $T 'kept\Sizes all'
$destSmall = Join-Path $T 'kept\Sizes small'
$destLarge = Join-Path $T 'kept\Sizes large'
$destCheck = Join-Path $T 'kept\Sizes check'
$allRun = Run 'sizes-all' $sizePhone $destAll 'videos' '' 'all' '1'
$smallRun = Run 'sizes-small' $sizePhone $destSmall 'videos' '' 'small' '1'
$largeRun = Run 'sizes-large' $sizePhone $destLarge 'videos' '' 'large' '1'
$checkRun = Run 'sizes-check' $sizePhone $destCheck 'videos' '' 'all' '1' '1'

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
foreach ($f in '202610_a\IMG_1000.JPG') {
  $a = Join-Path $months $f; $b = Join-Path $dest $f
  if (-not (Test-Path $b) -or (Get-FileHash $a).Hash -ne (Get-FileHash $b).Hash) { Write-Host "MONTH LAYOUT, MISSING OR DIFFERENT: $f"; $ok = $false }
}
if ($month -notmatch '"result":"short","name":"IMG_0900.MP4"' -and $month -notmatch '"name":"IMG_0900.MP4"[^}]*"result":"short"') { Write-Host "a copy cut short earlier was not reported as short"; $ok = $false }
if ($month.IndexOf('IMG_1000.JPG') -lt 0 -or $month.IndexOf('"name":"IMG_0900.MP4"') -lt $month.IndexOf('"name":"IMG_1000.JPG"')) { Write-Host "a file that failed before was not tried last"; $ok = $false }
if ($month.IndexOf('"name":"IMG_1001.JPG"') -lt $month.IndexOf('"name":"IMG_1000.JPG"')) { Write-Host "a file with a part-copy left behind was not tried last"; $ok = $false }
if (-not (Test-Path (Join-Path $dest '202610_a\IMG_1001.JPG')) -or (Get-FileHash (Join-Path $months '202610_a\IMG_1001.JPG')).Hash -ne (Get-FileHash (Join-Path $dest '202610_a\IMG_1001.JPG')).Hash) { Write-Host "the file with a part-copy left behind was not copied whole on retry"; $ok = $false }
if ($month -notmatch '"type":"done"') { Write-Host "the month-folder phone never said done"; $ok = $false }
$names = { param($d) @(Get-ChildItem -Recurse -File $d | Where-Object { $_.FullName -notmatch '\.datesort-incoming' } | ForEach-Object { $_.Name } | Sort-Object) -join ',' }
$gotP = & $names $destP; $gotV = & $names $destV; $gotR = & $names $destR
if ($gotP -ne 'IMG_0044.HEIC,IMG_0050.JPG') { Write-Host "photos-only brought in the wrong files: $gotP"; $ok = $false }
if ($gotV -ne 'IMG_0042.MOV,IMG_0043.MP4') { Write-Host "videos-only brought in the wrong files: $gotV"; $ok = $false }
if ($gotR -ne 'IMG_0043.MP4') { Write-Host "last-30-days videos brought in the wrong files: $gotR"; $ok = $false }
if ($recentRun -notmatch '"older":1') { Write-Host "the old video was not counted as left on the phone"; $ok = $false }
if ($photosRun -notmatch '"type":"done"' -or $videosRun -notmatch '"type":"done"' -or $recentRun -notmatch '"type":"done"') { Write-Host "a photo or video run never said done"; $ok = $false }
if ((& $names (Join-Path $T 'kept\Videos six years')) -ne 'IMG_0042.MOV,IMG_0043.MP4') { Write-Host "a long enough range did not bring the old video too"; $ok = $false }
$order = [regex]::Matches($allRun, '"name":"([a-z]_[a-z]+\.MOV)"') | ForEach-Object { $_.Groups[1].Value }
if (($order -join ',') -ne 'b_small.MOV,c_mid.MOV,a_big.MOV') { Write-Host "files did not come smallest first: $($order -join ',')"; $ok = $false }
if ((& $names $destSmall) -ne 'b_small.MOV,c_mid.MOV') { Write-Host "small-only brought the wrong files: $(& $names $destSmall)"; $ok = $false }
if ((& $names $destLarge) -ne 'a_big.MOV') { Write-Host "large-only brought the wrong files: $(& $names $destLarge)"; $ok = $false }
if ($smallRun -notmatch '"held":1' -or $largeRun -notmatch '"held":2') { Write-Host "the files left for the other size were not counted"; $ok = $false }
if ($allRun -notmatch '"todo":3' -or $allRun -notmatch '"todoBytes":3360768') { Write-Host "the size still to come was not reported: $allRun"; $ok = $false }
if ($checkRun -notmatch '"type":"previewed"' -or $checkRun -notmatch '"todo":3') { Write-Host "the size check did not report what would come across"; $ok = $false }
if (Test-Path -LiteralPath $destCheck) { Write-Host "the size check created a folder: it must create nothing"; $ok = $false }
if ($ok) { Write-Host "ALL GOOD"; exit 0 } else { exit 1 }
