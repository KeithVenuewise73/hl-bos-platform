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

# The "Folder:" box. Its id is 1152 on current Windows; fall back to the Edit
# whose name starts with "Folder".
$isEdit = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Edit)
$edits = $win.FindAll($Scope::Descendants, $isEdit)
$box = $null
foreach ($e in $edits) { if ($e.Current.AutomationId -eq '1152') { $box = $e } }
if ($null -eq $box) { foreach ($e in $edits) { if ($e.Current.Name -like 'Folder*') { $box = $e } } }
if ($null -eq $box) {
  "dialog: no Folder box among $($edits.Count) edit boxes:"
  foreach ($e in $edits) { "  id=$($e.Current.AutomationId) name=$($e.Current.Name)" }
  exit 3
}
"dialog: Folder box found (id=$($box.Current.AutomationId))"

$isButton = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Button)
function Press-Ok {
  foreach ($b in $win.FindAll($Scope::Descendants, $isButton)) {
    if ($b.Current.AutomationId -eq '1') {
      $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
      return $true
    }
  }
  return $false
}

$value = $box.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
$value.SetValue($Folder)
"dialog: typed $Folder"
if (-not (Press-Ok)) { "dialog: no OK button"; exit 4 }
"dialog: pressed OK"

# Pressing OK with a full path either chooses it at once, or first opens it
# (Windows does that for some paths). If the window is still open, the folder
# is now the current one: clear the box and press OK again to choose it.
for ($i = 0; $i -lt 2; $i++) {
  Start-Sleep -Seconds 2
  if ($null -eq (Find-Window)) { "dialog: closed with a folder chosen"; exit 0 }
  "dialog: still open; choosing the folder it is showing"
  try { $value.SetValue('') } catch { }
  [void](Press-Ok)
}
Start-Sleep -Seconds 2
if ($null -eq (Find-Window)) { "dialog: closed with a folder chosen"; exit 0 }
"dialog: would not close"
exit 5
