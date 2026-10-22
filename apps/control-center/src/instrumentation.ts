/**
 * Runs once when the console's server starts.
 *
 * Puts the Control Center and DateSort icons on the Windows desktop the
 * first time HL-BOS starts on a computer, so the CEO never has to find a
 * file in a folder to open either. The work is scripts/desktop-shortcut.mjs
 * (shared with DateSort.bat); it makes each icon at most once, never throws,
 * and is not awaited, so it can never delay or break the console starting.
 */
export async function register(): Promise<void> {
  // NEXT_RUNTIME is set by Next itself (not configuration): this hook also
  // runs in the edge runtime, where child processes do not exist.
  // eslint-disable-next-line no-restricted-properties -- framework runtime flag, not config
  if (process.env["NEXT_RUNTIME"] !== "nodejs" || process.platform !== "win32") return;
  // Not while building: only a console that is actually starting places it.
  // eslint-disable-next-line no-restricted-properties -- framework phase flag, not config
  if (process.env["NEXT_PHASE"] === "phase-production-build") return;
  const { cmd } = await import("./lib/shell");
  void cmd("node", ["scripts/desktop-shortcut.mjs"], { timeoutMs: 60_000 }).then(
    (r) => {
      console.log(r.output || "Desktop icon: no answer from the icon step");
    },
  );
}
