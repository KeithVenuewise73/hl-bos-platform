# Drives DateSort's real Windows folder window the way a person would:
# waits for the window, types the folder into its "Folder:" box, and presses
# its OK button ("Use this folder"). Used only by the Windows CI test.
#
# Prints what it did, one line per step. Exit 0 = the window closed after a
# folder was chosen; anything else = the window never appeared or never took
# the folder.
param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Folder,
  [int]$TimeoutSeconds = 90
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$CT = [System.Windows.Automation.ControlType]
$root = $AE::RootElement
$byTitle = New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $Title)

function Find-Window {
  $w = $root.FindFirst($Scope::Children, $byTitle)
  if ($null -eq $w) { $w = $root.FindFirst($Scope::Descendants, $byTitle) }
  return $w
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$win = $null
while ($null -eq $win -and (Get-Date) -lt $deadline) {
  $win = Find-Window
  if ($null -eq $win) { Start-Sleep -Milliseconds 500 }
}
if ($null -eq $win) { "dialog: never appeared"; exit 2 }
"dialog: appeared ($($win.Current.ClassName))"

# What a person does: bring the window to the front, type the folder's path
# into the "Folder:" box (which has the keyboard focus when the window
# opens), press Enter. UI Automation is used to find the window and, where
# Windows exposes them, the box and the OK button; the keyboard is the
# fallback, because on some Windows builds those controls are not exposed.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DateSortWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
'@
$hwnd = [IntPtr]$win.Current.NativeWindowHandle
$shots = $env:DATESORT_SCREENSHOTS
function Shot([string]$name) {
  if (-not $shots) { return }
  try {
    New-Item -ItemType Directory -Force -Path $shots | Out-Null
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $shots "$name.png"))
    $g.Dispose(); $bmp.Dispose()
  } catch { "dialog: screenshot failed: $($_.Exception.Message)" }
}
function Front { [void][DateSortWin]::ShowWindow($hwnd, 5); [void][DateSortWin]::SetForegroundWindow($hwnd); Start-Sleep -Milliseconds 300 }
function Keys([string]$k) { Front; [System.Windows.Forms.SendKeys]::SendWait($k) }
function Escape-Keys([string]$t) { [regex]::Replace($t, '[+^%~(){}\[\]]', '{$0}') }

# Everything UI Automation can see in the window, for the log.
$all = $win.FindAll($Scope::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
"dialog: $($all.Count) elements visible to UI Automation"
$i = 0
foreach ($e in $all) {
  if ($i++ -ge 60) { break }
  "  $($e.Current.ControlType.ProgrammaticName) id=$($e.Current.AutomationId) class=$($e.Current.ClassName) name=$($e.Current.Name)"
}
Shot "browse-1-open"

$box = $null
$ok = $null
foreach ($e in $all) {
  $id = $e.Current.AutomationId; $name = $e.Current.Name; $ct = $e.Current.ControlType
  if ($null -eq $box -and ($ct -eq $CT::ComboBox -or $ct -eq $CT::Edit) -and ($id -eq '1148' -or $id -eq '1152' -or $name -like 'Folder*')) {
    $p = $null
    if ($e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) { $box = $p }
  }
  if ($null -eq $ok -and $ct -eq $CT::Button -and $id -eq '1') {
    $p = $null
    if ($e.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) { $ok = $p }
  }
}

if ($null -ne $box) { $box.SetValue($Folder); "dialog: set the Folder box (UI Automation)" }
else { Keys '^a'; Keys (Escape-Keys $Folder); "dialog: typed the folder path (keyboard)" }
Shot "browse-2-typed"
if ($null -ne $ok) { $ok.Invoke(); "dialog: pressed OK (UI Automation)" }
else { Keys '{ENTER}'; "dialog: pressed Enter (keyboard)" }

# OK with a full path either chooses it at once, or first opens it. If the
# window is still open, the folder is now the current one: an empty Folder
# box plus OK chooses it.
for ($n = 0; $n -lt 3; $n++) {
  Start-Sleep -Seconds 2
  if ($null -eq (Find-Window)) { "dialog: closed with a folder chosen"; exit 0 }
  "dialog: still open; choosing the folder it is showing"
  Shot "browse-3-still-open-$n"
  if ($null -ne $box) { try { $box.SetValue('') } catch { } }
  if ($null -ne $ok) { try { $ok.Invoke() } catch { } } else { Keys '{ENTER}' }
}
Start-Sleep -Seconds 2
if ($null -eq (Find-Window)) { "dialog: closed with a folder chosen"; exit 0 }
Shot "browse-4-would-not-close"
"dialog: would not close"
exit 5
