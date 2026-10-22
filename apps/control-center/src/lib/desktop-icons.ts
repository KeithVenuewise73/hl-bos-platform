import "server-only";

import { cmd } from "@/lib/shell";

/**
 * Putting the Control Center and DateSort icons on the Windows desktop.
 *
 * Split out of instrumentation.ts rather than living there, and the reason is
 * the build rather than tidiness. Next analyses the instrumentation hook for
 * every runtime it might run in, including the edge runtime, where Node APIs
 * do not exist. `process.platform` sitting in that file made the build print
 *
 *     A Node.js API is used (process.platform at line: 14) which is not
 *     supported in the Edge Runtime.
 *     Ecmascript file had an error
 *
 * on every build. The runtime guard above it was correct and did not help:
 * it decides at run time, and the complaint is about what the edge bundle
 * contains. Reached only through `await import()`, as this module is, the
 * symbol is never in that bundle -- which is why shell.ts has imported
 * node:child_process all along without a word of complaint.
 */
export async function placeDesktopIcons(): Promise<void> {
  // Windows only: there is no desktop to put an icon on anywhere else, and
  // the script that makes them is a Windows script.
  if (process.platform !== "win32") return;
  try {
    const result = await cmd("node", ["scripts/desktop-shortcut.mjs"], {
      timeoutMs: 60_000,
    });
    console.log(result.output || "Desktop icon: no answer from the icon step");
  } catch (error) {
    // Swallowed on purpose, and the only place it can be. The caller does not
    // await this, so anything thrown here would surface as an unhandled
    // rejection that takes the console's server down -- over an icon.
    console.log(
      `Desktop icon: skipped — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
