/**
 * The PowerShell that copies an iPhone's photos and videos to a folder.
 *
 * An iPhone plugged in by USB has no drive letter on Windows: it appears in
 * This PC as "Apple iPhone", reachable only through Windows' Shell. This
 * script asks the Shell for it, walks Internal Storage\DCIM\<folders> (or the
 * month folders newer iPhones show straight inside Internal Storage), and
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
 * Which files: DS_KIND is "photos" (HEIC, JPG, PNG, DNG...), "videos" (MOV,
 * MP4, M4V) or empty for everything. DS_DAYS, when a number, leaves out files
 * the phone dates older than that many days (a file whose date the phone does
 * not give is kept, never silently dropped). Photos and videos are kept in
 * separate folders, so each has its own .datesort-incoming and its own list of
 * earlier failures.
 *
 * DS_SIZE is "all", "small" or "large": small is up to DS_SPLIT_MB (1 GB if
 * not given), large is over it. Files are always brought in smallest first, so
 * a day's worth of short clips is across long before the giant ones start, and
 * the giant ones can be left for the night ("large"). DS_PREVIEW=1 only looks:
 * it reports what would come across and its size, then stops, copying and
 * creating nothing.
 *
 * While a file is copying, a Windows "Error Copying File or Folder" box that
 * belongs to OUR copy window is closed (the same as pressing OK), its words are
 * reported, and the file is counted as failed at once and tried last next time.
 * Without this an overnight run sits at that box until someone clicks OK. Only
 * a box with that exact title whose owner is a "Copying..." window is touched.
 *
 * Output: one line of JSON per event (see IphoneLine). Paths come in through
 * environment variables, never pasted into the script.
 *
 * DS_TEST_SOURCE (Windows CI only) stands an ordinary folder in for the
 * phone (<folder>\Internal Storage\DCIM\100APPLE\... or
 * <folder>\Internal Storage\202610_a\...) and walks it with the
 * same Shell calls, because no CI machine has an iPhone. Finding "Apple
 * iPhone" in This PC is the one part only a real phone can prove.
 */

/**
 * Closes the "Error Copying File or Folder" box that Windows opens over its own
 * "Copying..." window when the phone drops a file. Windows PowerShell 5.1
 * compiles this with an old C# compiler: no string interpolation, no newer
 * syntax. Exported so the Windows test can compile and run the same source.
 */
export const DIALOG_CSHARP = String.raw`
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class DateSortDialogs {
  private delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  private static string TitleOf(IntPtr h) {
    StringBuilder s = new StringBuilder(512);
    GetWindowText(h, s, 512);
    return s.ToString();
  }
  /// Closes one such box if there is one; returns what it said, or null.
  public static string DismissCopyError() {
    string found = null;
    EnumWindows(delegate (IntPtr h, IntPtr p) {
      if (found != null || !IsWindowVisible(h)) return true;
      if (TitleOf(h) != "Error Copying File or Folder") return true;
      IntPtr owner = GetWindow(h, 4); // GW_OWNER: the window the box belongs to
      if (owner == IntPtr.Zero || !TitleOf(owner).StartsWith("Copying")) return true;
      StringBuilder said = new StringBuilder();
      EnumChildWindows(h, delegate (IntPtr c, IntPtr q) {
        string t = TitleOf(c);
        if (t.Length > 2) { if (said.Length > 0) said.Append(" "); said.Append(t); }
        return true;
      }, IntPtr.Zero);
      PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero); // WM_CLOSE: same as OK on this box
      found = said.Length > 0 ? said.ToString() : "(Windows gave no words)";
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
`;

export const IPHONE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
function Say($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
$canDismiss = $false
try {
  Add-Type -TypeDefinition @'
${DIALOG_CSHARP}
'@
  $canDismiss = $true
} catch { }
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
  # Where the photos are: Apple iPhone\Internal Storage\DCIM\100APPLE on
  # some phones; on newer ones Windows shows month folders (202610_a)
  # straight inside Internal Storage, with no DCIM. A phone just unlocked or
  # just trusted can show its storage empty for a moment, so look a few
  # times. What Windows showed is reported back, so a phone laid out
  # differently can be seen (and fixed) rather than guessed at.
  $root = $null; $seen = @()
  for ($try = 0; $try -lt 5 -and -not $root; $try++) {
    if ($try -gt 0) { Start-Sleep -Seconds 2 }
    $seen = @(); $months = $null
    $top = @($dev.GetFolder.Items())
    if ($top.Count -eq 0) { $seen += '(nothing)' }
    foreach ($s in $top) {
      if ($s.Name -eq 'DCIM') { $root = $s.GetFolder; break }
      $g = $s.GetFolder
      $inside = if ($g) { @($g.Items()) } else { @() }
      $seen += ($s.Name + ': ' + $(if ($inside.Count -eq 0) { '(nothing)' } else { (@($inside | Select-Object -First 5 | ForEach-Object { $_.Name }) -join ', ') }))
      $d = @($inside | Where-Object { $_.Name -eq 'DCIM' }) | Select-Object -First 1
      if ($d) { $root = $d.GetFolder; break }
      if (-not $months -and (@($inside | Where-Object { $_.GetFolder } | Select-Object -First 1)).Count -gt 0) { $months = $g }
    }
    if (-not $root -and $months) { $root = $months }
  }
  if (-not $root) { Say @{ type = 'locked'; device = $device; seen = ($seen -join '; ') }; exit 0 }

  $kind = [string]$env:DS_KIND
  $days = 0
  [void][int]::TryParse([string]$env:DS_DAYS, [ref]$days)
  $cutoff = $null
  if ($days -gt 0) { $cutoff = (Get-Date).AddDays(-$days) }
  $videoExt = '\.(mov|mp4|m4v)$'
  $photoExt = '\.(heic|heif|jpg|jpeg|png|dng|gif|tif|tiff)$'
  $older = 0
  $size = [string]$env:DS_SIZE
  $splitMb = 1024
  [void][int]::TryParse([string]$env:DS_SPLIT_MB, [ref]$splitMb)
  if ($splitMb -le 0) { $splitMb = 1024 }
  $split = [int64]$splitMb * 1048576
  $held = 0
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
      if ($kind -eq 'videos' -and $name -notmatch $videoExt) { continue }
      if ($kind -eq 'photos' -and $name -notmatch $photoExt) { continue }
      if ($cutoff) {
        $when = $null
        try { $when = [datetime]$f.ModifyDate } catch { }
        if ($when -and $when.Year -gt 1980 -and $when -lt $cutoff) { $older += 1; continue }
      }
      # FolderItem.Size is 0 for files on an iPhone; the Size column Explorer shows
      # is the System.Size property, so ask for that and fall back to .Size.
      $sz = [int64]0
      try { $sz = [int64]$f.ExtendedProperty('System.Size') } catch { }
      if ($sz -le 0) { try { $sz = [int64]$f.Size } catch { } }
      if ($size -eq 'small' -and $sz -gt $split) { $held += 1; continue }
      if ($size -eq 'large' -and $sz -le $split) { $held += 1; continue }
      [void]$files.Add([pscustomobject]@{ folder = $sub.Name; item = $f; name = $name; size = $sz })
    }
  }
  # Smallest first: the quick ones are across before the big ones begin.
  $files = @($files | Sort-Object -Property size)
  $bytes = [int64]0
  foreach ($x in $files) { $bytes += $x.size }
  # How much is actually still to come: not counting what the folder already has.
  function Have($x) {
    $d = Join-Path $dest $x.folder
    if (Test-Path -LiteralPath (Join-Path $d $x.name)) { return $true }
    if ($x.name -match '^(.*)\.heic$') { return (Test-Path -LiteralPath (Join-Path $d ($Matches[1] + '.JPG'))) }
    return $false
  }
  $todo = 0; $todoBytes = [int64]0
  foreach ($x in $files) { if (-not (Have $x)) { $todo += 1; $todoBytes += $x.size } }
  Say @{ type = 'found'; device = $device; total = $files.Count; bytes = $bytes; older = $older; held = $held; todo = $todo; todoBytes = $todoBytes }
  if ($env:DS_PREVIEW -eq '1') { Say @{ type = 'previewed' }; exit 0 }

  $incoming = Join-Path $dest '.datesort-incoming'
  New-Item -ItemType Directory -Force -Path $incoming | Out-Null
  $inNs = $shell.NameSpace($incoming)
  # Files that failed on an earlier run (a big video Windows could not read
  # off the phone, say) go last, so one bad file cannot hold up the rest.
  # The list lives in DateSort's own .datesort-incoming folder.
  $failedList = Join-Path $incoming 'failed-before.txt'
  $pending = @{}
  if (Test-Path -LiteralPath $failedList) {
    foreach ($l in @(Get-Content -LiteralPath $failedList)) { if ($l) { $pending[$l] = $true } }
  }
  # A part-copied file left in .datesort-incoming is also an earlier failure
  # (from before this list was kept, or a run cut off).
  foreach ($x in $files) {
    if (Test-Path -LiteralPath (Join-Path $incoming $x.name)) { $pending[$x.folder + '\' + $x.name] = $true }
  }
  $files = @($files | Where-Object { -not $pending.ContainsKey($_.folder + '\' + $_.name) }) + @($files | Where-Object { $pending.ContainsKey($_.folder + '\' + $_.name) })
  # After a failed video, an iPhone can stop answering for every file that
  # follows. Three failures in a row end the run with a plain message,
  # rather than a Windows error box for each remaining file.
  $inARow = 0; $stuck = $false
  foreach ($x in $files) {
    $key = $x.folder + '\' + $x.name
    $dir = Join-Path $dest $x.folder
    $target = Join-Path $dir $x.name
    # An iPhone set to "Transfer to Mac or PC: Automatic" hands over its HEIC
    # photos already converted: IMG_0044.HEIC arrives as IMG_0044.JPG.
    $converted = $null
    if ($x.name -match '^(.*)\.heic$') { $converted = $Matches[1] + '.JPG' }
    if (Test-Path -LiteralPath $target) {
      $len = (Get-Item -LiteralPath $target).Length
      # Smaller than the phone's file: an earlier copy cut short (before
      # copies were held to the promised size). Reported by name, left alone.
      $result = if ($x.size -le 0 -or $len -eq $x.size) { 'already' } elseif ($len -lt $x.size) { 'short' } else { 'conflict' }
      if ($result -eq 'already') { $pending.Remove($key) }
      Say @{ type = 'file'; folder = $x.folder; name = $x.name; result = $result }
      continue
    }
    if ($converted -and (Test-Path -LiteralPath (Join-Path $dir $converted))) {
      $pending.Remove($key)
      Say @{ type = 'file'; folder = $x.folder; name = $converted; result = 'already' }
      continue
    }
    $part = Join-Path $incoming $x.name
    # 4 no progress window, 16 yes to all (replaces only our own leftover
    # partial in .datesort-incoming), 512 no folder prompt, 1024 no error UI.
    $inNs.CopyHere($x.item, 1556)
    # Wait for the copy. It is complete only at the size the phone promised.
    # Only when the phone gave no size, or handed a HEIC over as JPG (sizes
    # then differ), is "unchanged for 3 seconds" taken as complete. A copy
    # that stops part-way (Windows' "requested value cannot be determined",
    # an unplugged cable) is never kept as if whole: once nothing has grown
    # for 2 minutes the file is reported as not copied, and the next run
    # tries it again.
    $last = -1; $steady = 0; $ok = $false; $sure = ($x.size -gt 0)
    $moved = Get-Date
    while (((Get-Date) - $moved).TotalSeconds -lt 120) {
      Start-Sleep -Milliseconds 300
      # Windows' own error box over our copy window: close it, say what it said,
      # and count this file as failed now instead of waiting two minutes.
      if ($canDismiss) {
        $boxText = [DateSortDialogs]::DismissCopyError()
        if ($boxText) {
          Say @{ type = 'dialog'; folder = $x.folder; name = $x.name; text = $boxText }
          break
        }
      }
      if (-not (Test-Path -LiteralPath $part)) {
        if (-not $converted) { continue }
        $alt = Join-Path $incoming $converted
        if (-not (Test-Path -LiteralPath $alt)) { continue }
        $part = $alt; $target = Join-Path $dir $converted; $last = -1; $steady = 0; $sure = $false
      }
      $len = (Get-Item -LiteralPath $part).Length
      if ($len -ne $last) { $moved = Get-Date; $steady = 0 } else { $steady += 1 }
      $last = $len
      if ($sure -and $len -eq $x.size -and $steady -ge 2) { $ok = $true; break }
      if (-not $sure -and $len -gt 0 -and $steady -ge 10) { $ok = $true; break }
    }
    if (-not $ok) {
      Say @{ type = 'file'; folder = $x.folder; name = $x.name; result = 'failed' }
      $pending[$key] = $true; $inARow += 1
      if ($inARow -ge 3) { $stuck = $true; break }
      continue
    }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    # Windows may still hold the file for a moment; one file that cannot be
    # named yet is reported, not the end of the whole run.
    try { [System.IO.File]::Move($part, $target) } catch {
      Say @{ type = 'file'; folder = $x.folder; name = $x.name; result = 'failed' }
      $pending[$key] = $true; $inARow += 1
      if ($inARow -ge 3) { $stuck = $true; break }
      continue
    }
    $pending.Remove($key); $inARow = 0
    Say @{ type = 'file'; folder = $x.folder; name = (Split-Path -Leaf $target); result = 'copied'; bytes = (Get-Item -LiteralPath $target).Length }
  }
  if ($pending.Count -gt 0 -or (Test-Path -LiteralPath $failedList)) { Set-Content -LiteralPath $failedList -Value @($pending.Keys) }
  if ($stuck) { Say @{ type = 'stuck' }; exit 0 }
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
      /** Left out because the phone dates them older than the chosen days. */
      readonly older?: number;
      /** Left out because of the size choice (the other half, for another time). */
      readonly held?: number;
      /** Not in the folder yet, and how big they are together. */
      readonly todo?: number;
      readonly todoBytes?: number;
    }
  | {
      readonly type: "file";
      readonly folder: string;
      readonly name: string;
      readonly result: "copied" | "already" | "conflict" | "short" | "failed";
      readonly bytes?: number;
    }
  | { readonly type: "done" }
  /** Windows' error box over our copy was closed (as OK); this is what it said. */
  | {
      readonly type: "dialog";
      readonly folder: string;
      readonly name: string;
      readonly text: string;
    }
  /** Preview only: what would come across was reported, and nothing was copied. */
  | { readonly type: "previewed" }
  /** Several files in a row failed: the phone has stopped answering. */
  | { readonly type: "stuck" }
  | { readonly type: "error"; readonly message: string };

/**
 * What the page receives from /api/iphone: the script's lines, plus one line
 * DateSort itself adds (whether Windows agreed to stay awake, keep-awake.ts, and
 * that this copy is waiting for another). parseIphoneLine never accepts those two, so the
 * script cannot claim it.
 */
export type IphonePageLine =
  | IphoneLine
  | { readonly type: "awake"; readonly held: boolean }
  /** Another copy from this phone is running; this one starts when it ends. */
  | { readonly type: "waiting"; readonly for: IphoneKind }
  /**
   * Whether what is about to come across fits in the chosen folder's drive.
   * `free` is null when the drive's free space could not be read. When it does
   * not fit and this is a real copy (not "Check size first"), nothing is copied.
   */
  | {
      readonly type: "space";
      readonly needed: number;
      readonly free: number | null;
      readonly enough: boolean;
      /** False when the phone reported no sizes, so "needed" could not be known. */
      readonly sizeKnown?: boolean;
      /** The copy was stopped part-way: the drive was nearly full. `needed` is what was copied so far. */
      readonly live?: boolean;
    };

/** Photos and videos are brought in by separate buttons, into separate folders. */
export type IphoneKind = "photos" | "videos";

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
      case "previewed":
      case "dialog":
      case "stuck":
      case "error":
        return o as IphoneLine;
      default:
        return null;
    }
  } catch {
    return null;
  }
}
