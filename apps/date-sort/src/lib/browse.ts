import "server-only";

import { execFile } from "node:child_process";

import {
  encodeForPowerShell,
  parsePickerOutput,
  pickerScript,
  type PickerOutcome,
} from "./picker-script";

/**
 * Show Windows' folder picker and wait for the choice.
 *
 * Runs only powershell.exe, with a fixed script (nothing the page sends is
 * put into it). One window at a time: a second click while it is open is
 * told so rather than stacking windows.
 */

let open = false;

/** Long enough to find a folder; short enough that a forgotten window ends. */
const PICK_TIMEOUT_MS = 15 * 60 * 1000;

export async function browseForFolder(): Promise<
  PickerOutcome | { kind: "busy" } | { kind: "unavailable"; reason: string }
> {
  if (process.platform !== "win32") {
    return {
      kind: "unavailable",
      reason:
        "The Browse window is a Windows feature. Type or paste the folder's path instead.",
    };
  }
  if (open) return { kind: "busy" };
  open = true;
  try {
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
          encodeForPowerShell(pickerScript()),
        ],
        { timeout: PICK_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, out, err) => {
          if (error) reject(new Error(`${error.message}\n${err}`.trim()));
          else resolve(out);
        },
      );
    });
    return parsePickerOutput(stdout);
  } catch (e) {
    return {
      kind: "failed",
      reason:
        `The folder window could not be opened. ${e instanceof Error ? e.message.split("\n")[0] : ""}`.trim(),
    };
  } finally {
    open = false;
  }
}
