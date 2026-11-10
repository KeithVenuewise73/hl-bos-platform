import "server-only";

import { execFile } from "node:child_process";

/**
 * Windows' own "choose a file" and "save as" windows.
 *
 * Runs only powershell.exe, with a fixed script; what the window says and where
 * it opens go in through environment variables, never pasted into the script.
 * It only RETURNS A PATH: it reads nothing in the file and changes nothing. The
 * window is owned by an invisible top-most form so it comes up in front of the
 * browser instead of hiding behind it.
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

export type PickOutcome =
  | { readonly kind: "picked"; readonly path: string }
  | { readonly kind: "cancelled" }
  | { readonly kind: "busy" }
  | { readonly kind: "failed"; readonly reason: string };

/** What the page may ask for. Anything else is refused. */
export type PickPurpose = "video-a" | "video-b" | "video" | "save";

const VIDEO_FILTER = "Video (*.mov;*.mp4;*.m4v)|*.mov;*.mp4;*.m4v|All files (*.*)|*.*";
const TITLES: Record<PickPurpose, string> = {
  "video-a": "Game Cut - choose the FIRST game video",
  "video-b": "Game Cut - choose the SECOND game video",
  video: "Game Cut - choose the game video",
  save: "Game Cut - save the finished video as",
};

/** Pure: the environment the script reads. */
export function pickEnvironment(
  purpose: PickPurpose,
  suggestedName: string,
  startFolder: string,
): Record<string, string> {
  return {
    GC_MODE: purpose === "save" ? "save" : "open",
    GC_TITLE: TITLES[purpose],
    GC_FILTER: purpose === "save" ? "MP4 video (*.mp4)|*.mp4" : VIDEO_FILTER,
    GC_NAME: suggestedName,
    GC_DIR: startFolder,
  };
}

export function parsePick(stdout: string): PickOutcome {
  const line = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .pop();
  if (line === undefined)
    return { kind: "failed", reason: "The file window gave no answer." };
  try {
    const j = JSON.parse(line) as { path?: unknown; cancelled?: unknown };
    if (typeof j.path === "string" && j.path !== "")
      return { kind: "picked", path: j.path };
    if (j.cancelled === true) return { kind: "cancelled" };
  } catch {
    // fall through
  }
  return {
    kind: "failed",
    reason: "The file window gave an answer that could not be read.",
  };
}

let open = false;
const PICK_TIMEOUT_MS = 15 * 60 * 1000;

export async function pickFile(
  purpose: PickPurpose,
  suggestedName = "",
  startFolder = "",
): Promise<PickOutcome> {
  if (process.platform !== "win32") {
    return {
      kind: "failed",
      reason:
        "The file window is a Windows feature. Type or paste the file's path instead.",
    };
  }
  if (open) return { kind: "busy" };
  open = true;
  try {
    // The child needs the normal Windows environment (PATH, SystemRoot...).
    // eslint-disable-next-line no-restricted-properties -- passed through whole to powershell.exe, not read as configuration
    const inherited: NodeJS.ProcessEnv = { ...process.env };
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-STA",
          "-ExecutionPolicy",
          "Bypass",
          "-EncodedCommand",
          Buffer.from(PICK_SCRIPT, "utf16le").toString("base64"),
        ],
        {
          timeout: PICK_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
          env: {
            ...inherited,
            ...pickEnvironment(purpose, suggestedName, startFolder),
          },
        },
        (error, out, err) => {
          if (error) reject(new Error(`${error.message}\n${err}`.trim()));
          else resolve(out);
        },
      );
    });
    return parsePick(stdout);
  } catch (e) {
    return {
      kind: "failed",
      reason:
        `The file window could not be opened. ${e instanceof Error ? e.message.split("\n")[0] : ""}`.trim(),
    };
  } finally {
    open = false;
  }
}
