import "server-only";

import { spawn } from "node:child_process";

import { IPHONE_SCRIPT, parseIphoneLine, type IphoneLine } from "./iphone-script";
import { encodeForPowerShell } from "./picker-script";

/**
 * Run the iPhone copy (iphone-script.ts) into `folder`, reporting each line.
 * Runs only powershell.exe, with a fixed script; the folder goes in through
 * an environment variable. Windows only.
 */
export function copyFromIphone(
  folder: string,
  onLine: (line: IphoneLine) => void,
  signal: AbortSignal,
): Promise<void> {
  if (process.platform !== "win32") {
    onLine({
      type: "error",
      message:
        "Reading an iPhone is a Windows feature. Use DateSort on the Windows laptop.",
    });
    return Promise.resolve();
  }
  // The child needs the normal Windows environment (PATH, SystemRoot...).
  // eslint-disable-next-line no-restricted-properties -- passed through whole to powershell.exe, not read as configuration
  const inherited: NodeJS.ProcessEnv = { ...process.env };
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodeForPowerShell(IPHONE_SCRIPT),
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...inherited,
          DS_DEST: folder,
          // Windows CI only: an ordinary folder standing in for the phone,
          // walked through the same Shell calls (no CI machine has an iPhone).
          // Set by the CI workflow when it starts DateSort; never by the page.
          DS_TEST_SOURCE: inherited["DATESORT_IPHONE_TEST_SOURCE"] ?? "",
        },
      },
    );
    signal.addEventListener("abort", () => child.kill(), { once: true });
    let buffered = "";
    let errors = "";
    child.stdout.on("data", (d: Buffer) => {
      buffered += d.toString();
      let nl: number;
      while ((nl = buffered.indexOf("\n")) !== -1) {
        const parsed = parseIphoneLine(buffered.slice(0, nl));
        buffered = buffered.slice(nl + 1);
        if (parsed !== null) onLine(parsed);
      }
    });
    child.stderr.on("data", (d: Buffer) => (errors += d.toString()));
    child.on("error", (e) => {
      onLine({ type: "error", message: `The iPhone could not be read: ${e.message}` });
      resolve();
    });
    child.on("close", (code) => {
      const last = parseIphoneLine(buffered);
      if (last !== null) onLine(last);
      if (code !== 0 && code !== null && !signal.aborted && errors.trim() !== "") {
        onLine({
          type: "error",
          message: errors.trim().split(/\r?\n/)[0] ?? "The iPhone could not be read.",
        });
      }
      resolve();
    });
  });
}
