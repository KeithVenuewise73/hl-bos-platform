/**
 * The PowerShell that shows Windows' own "choose a folder" window.
 *
 * It uses the modern Explorer-style folder picker (IFileOpenDialog with
 * FOS_PICKFOLDERS) — the same window File Explorer and Office use, with the
 * address bar, Quick Access and drives — rather than the old tree-view box.
 * The window is owned by an invisible, top-most form so it comes up in front
 * of the browser instead of hiding behind it.
 *
 * It only RETURNS A PATH. It reads nothing in the folder and changes nothing.
 * Output is one line of JSON: {"path":"D:\\Photos"} or {"cancelled":true}.
 *
 * Pure (a string builder), so it is testable on any platform.
 */

/** The title the window shows. The Windows CI test finds the window by it. */
export const PICKER_TITLE = "DateSort - choose the folder with your photos";

const CSHARP = String.raw`
using System;
using System.Runtime.InteropServices;
public static class DateSortFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
  private class FileOpenDialog {}

  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint count, IntPtr specs);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem item);
    void SetFolder(IShellItem item);
    void GetFolder(out IShellItem item);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
  }

  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint form, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    void GetAttributes(uint mask, out uint attributes);
    void Compare(IShellItem other, uint hint, out int order);
  }

  private const uint FOS_PICKFOLDERS = 0x20;
  private const uint FOS_FORCEFILESYSTEM = 0x40;
  private const uint FOS_PATHMUSTEXIST = 0x800;
  private const uint SIGDN_FILESYSPATH = 0x80058000;

  // Returns the chosen folder's path, or null if the window was closed.
  public static string Pick(IntPtr owner, string title) {
    IFileDialog dialog = (IFileDialog)new FileOpenDialog();
    try {
      uint options;
      dialog.GetOptions(out options);
      dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
      dialog.SetTitle(title);
      dialog.SetOkButtonLabel("Use this folder");
      if (dialog.Show(owner) != 0) return null;
      IShellItem item;
      dialog.GetResult(out item);
      string path;
      item.GetDisplayName(SIGDN_FILESYSPATH, out path);
      return path;
    } finally {
      Marshal.ReleaseComObject(dialog);
    }
  }
}
`;

function psSingleQuoted(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export function pickerScript(title: string = PICKER_TITLE): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "Add-Type -AssemblyName System.Windows.Forms",
    `Add-Type -TypeDefinition @'\n${CSHARP}\n'@`,
    "$owner = New-Object System.Windows.Forms.Form",
    "$owner.TopMost = $true",
    "$owner.ShowInTaskbar = $false",
    "$owner.Opacity = 0",
    "$owner.FormBorderStyle = 'None'",
    "$owner.StartPosition = 'CenterScreen'",
    "$owner.Size = New-Object System.Drawing.Size(1, 1)",
    "$owner.Show()",
    "$owner.Activate()",
    `$path = [DateSortFolderPicker]::Pick($owner.Handle, ${psSingleQuoted(title)})`,
    "$owner.Close()",
    "if ($null -eq $path) { '{\"cancelled\":true}' } else { @{ path = $path } | ConvertTo-Json -Compress }",
  ].join("\n");
}

/** powershell.exe's -EncodedCommand wants Base64 of UTF-16LE. */
export function encodeForPowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

export type PickerOutcome =
  | { readonly kind: "picked"; readonly path: string }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly reason: string };

/** Read the script's one line of output. */
export function parsePickerOutput(stdout: string): PickerOutcome {
  const line = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .pop();
  if (line === undefined)
    return { kind: "failed", reason: "The folder window gave no answer." };
  try {
    const parsed = JSON.parse(line) as { path?: unknown; cancelled?: unknown };
    if (parsed.cancelled === true) return { kind: "cancelled" };
    if (typeof parsed.path === "string" && parsed.path.length > 0) {
      return { kind: "picked", path: parsed.path };
    }
  } catch {
    // fall through
  }
  return {
    kind: "failed",
    reason: "The folder window gave an answer DateSort could not read.",
  };
}
