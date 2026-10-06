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

# The "Folder:" box. On current Windows it is an editable ComboBox (id 1148)
# whose text can be set directly; on some builds an Edit (id 1152, or named
# "Folder..."). If neither is exposed, fall back to typing: the box has the
# keyboard focus when the window opens.
$isEdit = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Edit)
$isCombo = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::ComboBox)
$candidates = @()
foreach ($e in $win.FindAll($Scope::Descendants, $isCombo)) { $candidates += $e }
foreach ($e in $win.FindAll($Scope::Descendants, $isEdit)) { $candidates += $e }
$box = $null
foreach ($e in $candidates) {
  $id = $e.Current.AutomationId; $name = $e.Current.Name
  if ($null -eq $box -and ($id -eq '1148' -or $id -eq '1152' -or $name -like 'Folder*')) {
    $p = $null
    if ($e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) { $box = $p; "dialog: Folder box found ($($e.Current.ControlType.ProgrammaticName) id=$id)" }
  }
}

function Type-Into-Focus([string]$text) {
  Add-Type -AssemblyName System.Windows.Forms
  try { $win.SetFocus() } catch { }
  $escaped = [regex]::Replace($text, '[+^%~(){}\[\]]', '{$0}')
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait($escaped)
}

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

if ($null -ne $box) {
  $box.SetValue($Folder)
  "dialog: set the Folder box to $Folder"
} else {
  "dialog: no settable Folder box; typing instead. Controls seen:"
  foreach ($e in $candidates) { "  $($e.Current.ControlType.ProgrammaticName) id=$($e.Current.AutomationId) name=$($e.Current.Name)" }
  Type-Into-Focus $Folder
  "dialog: typed $Folder"
}
if (-not (Press-Ok)) { "dialog: no OK button"; exit 4 }
"dialog: pressed OK"

# Pressing OK with a full path either chooses it at once, or first opens it
# (Windows does that for some paths). If the window is still open, the folder
# is now the current one: clear the box and press OK again to choose it.
for ($i = 0; $i -lt 2; $i++) {
  Start-Sleep -Seconds 2
  if ($null -eq (Find-Window)) { "dialog: closed with a folder chosen"; exit 0 }
  "dialog: still open; choosing the folder it is showing"
  if ($null -ne $box) { try { $box.SetValue('') } catch { } } else { Type-Into-Focus '' }
  [void](Press-Ok)
}
Start-Sleep -Seconds 2
if ($null -eq (Find-Window)) { "dialog: closed with a folder chosen"; exit 0 }
"dialog: would not close"
exit 5
