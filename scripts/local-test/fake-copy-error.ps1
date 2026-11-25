# Stands in for Windows' "Error Copying File or Folder" box, for the Windows
# test of DateSort's automatic dismissal (run-dialog-dismiss.ps1).
#   -Owned : the box belongs to a window titled "Copying..." (as Windows' own
#            does, over its copy progress window).
#   -OwnerTitle: what the owning window is called ("37% complete" is what Windows retitles its
#            copy progress window to while it works).
#   no -Owned : the same box with no owner (something else's dialog).
# Writes "closed:<button>" to -Out once the box has been closed.
param([switch]$Owned, [string]$Out, [string]$OwnerTitle = 'Copying...')
Add-Type -AssemblyName System.Windows.Forms
if ($Owned) {
  $owner = New-Object System.Windows.Forms.Form
  $owner.Text = $OwnerTitle
  $owner.Show()
  $r = [System.Windows.Forms.MessageBox]::Show($owner, 'The requested value cannot be determined.', 'Error Copying File or Folder', 'OK', 'Error')
} else {
  $r = [System.Windows.Forms.MessageBox]::Show('The requested value cannot be determined.', 'Error Copying File or Folder', 'OK', 'Error')
}
Set-Content -LiteralPath $Out -Value "closed:$r"
