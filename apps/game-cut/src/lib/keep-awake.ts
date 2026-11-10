import "server-only";

import { spawn } from "node:child_process";

/**
 * Keep Windows from going to sleep while photos are being read or copied.
 *
 * A laptop that sleeps mid-copy drops the page's connection, and Game Cut
 * stops (cleanly: every photo already copied is whole and checked). A scan or
 * copy of thousands of photos easily outlasts the sleep timer, so while one
 * runs this holds Windows' "system required" AND "display required" flags,
 * the same requests a video player makes.
 *
 * The screen is kept on deliberately. On many current laptops (Windows'
 * "Modern Standby"), the screen turning off is what starts standby, so
 * "system required" alone may not be enough. A laptop did go to sleep
 * during a real camera download on 2026-11-05 (with only "system required",
 * and with the scan not covered at all). Which of the two caused it was
 * not confirmed; both are closed here: the screen stays on, and scanning
 * holds the request too, until the job ends.
 *
 * Closing the lid is not covered: Windows treats that as an instruction, not
 * idleness, and sleeps anyway.
 *
 * The flag belongs to a small PowerShell process that holds it until Game Cut
 * closes its input, or until Game Cut itself exits, so it can never outlive
 * Game Cut and keep the laptop awake for nothing.
 */

export interface Awake {
  /** True only when Windows confirmed the request. */
  readonly held: boolean;
  release(): void;
}

// ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED (see above for why the screen too).
export const AWAKE_SCRIPT = `
$k = Add-Type -Name Power -Namespace Game Cut -PassThru -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
if ($k::SetThreadExecutionState([uint32]"0x80000003") -eq 0) { exit 3 }
[Console]::Out.WriteLine("awake")
[Console]::Out.Flush()
[void][Console]::In.ReadToEnd()
`;

const NOT_HELD: Awake = { held: false, release: () => undefined };

export function keepAwake(timeoutMs = 15_000): Promise<Awake> {
  if (process.platform !== "win32") return Promise.resolve(NOT_HELD);
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        Buffer.from(AWAKE_SCRIPT, "utf16le").toString("base64"),
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    );
    const release = () => {
      child.stdin.end();
      setTimeout(() => child.kill(), 2_000).unref();
    };
    const finish = (held: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (held) resolve({ held: true, release });
      else {
        child.kill();
        resolve(NOT_HELD);
      }
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      if (d.toString().includes("awake")) finish(true);
    });
    child.on("error", () => finish(false));
    child.on("exit", () => finish(false));
  });
}
