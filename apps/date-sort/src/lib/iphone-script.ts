/**
 * The PowerShell that copies an iPhone's photos and videos to a folder.
 *
 * An iPhone plugged in by USB has no drive letter on Windows: it appears in
 * This PC as "Apple iPhone", reachable only through Windows' Shell. This
 * script asks the Shell for it, walks Internal Storage\DCIM\<folders>, and
 * copies each file the folder does not have yet:
 *
 *   - It only READS the phone. Nothing on the phone is moved, renamed or
 *     deleted (the Shell's CopyHere copies; no delete or move call exists
 *     here, and a test checks that).
 *   - Each file lands first in "<folder>\.datesort-incoming", and is given
 *     its real name ("<folder>\100APPLE\IMG_0042.MOV") only once complete, so
 *     a copy cut short (unplugged phone) is never mistaken for a photo.
 *   - A file already in the folder under its name is skipped: running it
 *     again only brings what is new. A different file with that name is
 *     left alone and reported.
 *
 * Output: one line of JSON per event (see IphoneLine). Paths come in through
 * environment variables, never pasted into the script.
 *
 * DS_TEST_SOURCE (Windows CI only) stands an ordinary folder in for the
 * phone (<folder>\Internal Storage\DCIM\100APPLE\...) and walks it with the
 * same Shell calls, because no CI machine has an iPhone. Finding "Apple iPhone" in This PC is the one part only a real
 * phone can prove.
 */

export const IPHONE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
function Say($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
try {
  $shell = New-Object -ComObject Shell.Application
  $dest = $env:DS_DEST
  if ($env:DS_TEST_SOURCE) {
    # A folder standing in for the phone: <it>\Internal Storage\DCIM\...
    $dev = $shell.NameSpace($env:DS_TEST_SOURCE).Self
  } else {
    $pc = $shell.NameSpace(17)
    $dev = @($pc.Items() | Where-Object { $_.Name -match 'iPhone|iPad' }) | Select-Object -First 1
  }
  if (-not $dev) { Say @{ type = 'none' }; exit 0 }
  $device = $dev.Name
  # Apple iPhone\Internal Storage\DCIM. A phone just unlocked or just
  # trusted can show its storage empty for a moment, so look a few times.
  # What Windows showed is reported back, so a phone laid out differently
  # can be seen (and fixed) rather than guessed at.
  $dcim = $null; $seen = @()
  for ($try = 0; $try -lt 5 -and -not $dcim; $try++) {
    if ($try -gt 0) { Start-Sleep -Seconds 2 }
    $seen = @()
    $top = @($dev.GetFolder.Items())
    if ($top.Count -eq 0) { $seen += '(nothing)' }
    foreach ($s in $top) {
      if ($s.Name -eq 'DCIM') { $dcim = $s; break }
      $g = $s.GetFolder
      $inside = if ($g) { @($g.Items()) } else { @() }
      $seen += ($s.Name + ': ' + $(if ($inside.Count -eq 0) { '(nothing)' } else { (@($inside | Select-Object -First 5 | ForEach-Object { $_.Name }) -join ', ') }))
      $d = @($inside | Where-Object { $_.Name -eq 'DCIM' }) | Select-Object -First 1
      if ($d) { $dcim = $d; break }
    }
  }
  if (-not $dcim) { Say @{ type = 'locked'; device = $device; seen = ($seen -join '; ') }; exit 0 }
  $root = $dcim.GetFolder

  $files = New-Object System.Collections.ArrayList
  foreach ($sub in @($root.Items())) {
    # A phone's folders do not always say IsFolder; one that opens is one.
    $subFolder = $sub.GetFolder
    if (-not $subFolder) { continue }
    Say @{ type = 'looking'; folder = $sub.Name; sofar = $files.Count }
    foreach ($f in @($subFolder.Items())) {
      if ($f.IsFolder) { continue }
      # The Shell's .Name hides the extension when Windows hides known
      # extensions (its default); System.FileName is the real file name.
      $name = $null
      try { $name = [string]$f.ExtendedProperty('System.FileName') } catch { }
      if (-not $name) { $name = $f.Name }
      [void]$files.Add([pscustomobject]@{ folder = $sub.Name; item = $f; name = $name; size = [int64]$f.Size })
    }
  }
  $bytes = [int64]0
  foreach ($x in $files) { $bytes += $x.size }
  Say @{ type = 'found'; device = $device; total = $files.Count; bytes = $bytes }

  $incoming = Join-Path $dest '.datesort-incoming'
  New-Item -ItemType Directory -Force -Path $incoming | Out-Null
  $inNs = $shell.NameSpace($incoming)
  foreach ($x in $files) {
    $dir = Join-Path $dest $x.folder
    $target = Join-Path $dir $x.name
    # An iPhone set to "Transfer to Mac or PC: Automatic" hands over its HEIC
    # photos already converted: IMG_0044.HEIC arrives as IMG_0044.JPG.
    $converted = $null
    if ($x.name -match '^(.*)\.heic$') { $converted = $Matches[1] + '.JPG' }
    if (Test-Path -LiteralPath $target) {
      $len = (Get-Item -LiteralPath $target).Length
      $same = ($x.size -le 0) -or ($len -eq $x.size)
      Say @{ type = 'file'; folder = $x.folder; name = $x.name; result = $(if ($same) { 'already' } else { 'conflict' }) }
      continue
    }
    if ($converted -and (Test-Path -LiteralPath (Join-Path $dir $converted))) {
      Say @{ type = 'file'; folder = $x.folder; name = $converted; result = 'already' }
      continue
    }
    $part = Join-Path $incoming $x.name
    # 4 no progress window, 16 yes to all (replaces only our own leftover
    # partial in .datesort-incoming), 512 no folder prompt, 1024 no error UI.
    $inNs.CopyHere($x.item, 1556)
    $limit = (Get-Date).AddSeconds([math]::Max(300, $x.size / 1MB))
    $last = -1; $steady = 0; $ok = $false
    while ((Get-Date) -lt $limit) {
      Start-Sleep -Milliseconds 300
      if (-not (Test-Path -LiteralPath $part)) {
        if (-not $converted) { continue }
        $alt = Join-Path $incoming $converted
        if (-not (Test-Path -LiteralPath $alt)) { continue }
        $part = $alt; $target = Join-Path $dir $converted; $last = -1; $steady = 0
      }
      $len = (Get-Item -LiteralPath $part).Length
      if ($x.size -gt 0 -and $len -eq $x.size) { $steady += 1 } elseif ($len -gt 0 -and $len -eq $last) { $steady += 1 } else { $steady = 0 }
      $last = $len
      # Complete: the size the phone promised, or (phones that convert HEIC
      # to JPG on the way, so sizes differ) unchanged for 3 seconds.
      if (($x.size -gt 0 -and $len -eq $x.size -and $steady -ge 2) -or ($steady -ge 10)) { $ok = $true; break }
    }
    if (-not $ok) { Say @{ type = 'file'; folder = $x.folder; name = $x.name; result = 'failed' }; continue }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    [System.IO.File]::Move($part, $target)
    Say @{ type = 'file'; folder = $x.folder; name = (Split-Path -Leaf $target); result = 'copied'; bytes = (Get-Item -LiteralPath $target).Length }
  }
  Say @{ type = 'done' }
} catch {
  Say @{ type = 'error'; message = $_.Exception.Message }
  exit 1
}
`;

export type IphoneLine =
  | { readonly type: "none" }
  | {
      readonly type: "locked";
      readonly device: string;
      /** What Windows showed inside the phone, e.g. "Internal Storage: (nothing)". */
      readonly seen?: string;
    }
  | { readonly type: "looking"; readonly folder: string; readonly sofar: number }
  | {
      readonly type: "found";
      readonly device: string;
      readonly total: number;
      readonly bytes: number;
    }
  | {
      readonly type: "file";
      readonly folder: string;
      readonly name: string;
      readonly result: "copied" | "already" | "conflict" | "failed";
      readonly bytes?: number;
    }
  | { readonly type: "done" }
  | { readonly type: "error"; readonly message: string };

/** One line of the script's output, or null for anything else it printed. */
export function parseIphoneLine(line: string): IphoneLine | null {
  try {
    const o = JSON.parse(line.trim()) as { type?: unknown };
    switch (o.type) {
      case "none":
      case "locked":
      case "looking":
      case "found":
      case "file":
      case "done":
      case "error":
        return o as IphoneLine;
      default:
        return null;
    }
  } catch {
    return null;
  }
}
