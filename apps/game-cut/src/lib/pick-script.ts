/**
 * The PowerShell that shows Windows' "choose a file" and "save as" windows, and the
 * file-type filters it uses. Plain text with no server code, so a Windows check
 * can load it on its own and confirm PowerShell accepts it.
 *
 * Names, titles and folders reach it through environment variables, never pasted in.
 */

export const PICK_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Show()
$owner.Activate()
try {
  if ($env:GC_MODE -eq 'save') {
    $d = New-Object System.Windows.Forms.SaveFileDialog
    $d.OverwritePrompt = $true
    $d.DefaultExt = 'mp4'
    $d.AddExtension = $true
    $d.FileName = $env:GC_NAME
  } else {
    $d = New-Object System.Windows.Forms.OpenFileDialog
    $d.CheckFileExists = $true
    $d.Multiselect = $false
  }
  $d.Title = $env:GC_TITLE
  $d.Filter = $env:GC_FILTER
  if ($env:GC_DIR -and (Test-Path -LiteralPath $env:GC_DIR)) { $d.InitialDirectory = $env:GC_DIR }
  if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.WriteLine((@{ path = $d.FileName } | ConvertTo-Json -Compress))
  } else {
    [Console]::Out.WriteLine('{"cancelled":true}')
  }
} finally { $owner.Close() }
`;

/** "Name (patterns)|patterns|..." as Windows' file windows want it; a bad one throws. */
export const VIDEO_FILTER =
  "Video (*.mov;*.mp4;*.m4v)|*.mov;*.mp4;*.m4v|All files (*.*)|*.*";
export const SAVE_FILTER = "MP4 video (*.mp4)|*.mp4";
