/**
 * Runs once when the console's server starts.
 *
 * Puts the Control Center and DateSort icons on the Windows desktop the
 * first time HL-BOS starts on a computer, so the CEO never has to find a
 * file in a folder to open either. The work is scripts/desktop-shortcut.mjs
 * (shared with DateSort.bat); it makes each icon at most once, never throws,
 * and is not awaited, so it can never delay or break the console starting.
 *
 * Nothing Node-specific may appear in this file. Next analyses it for every
 * runtime the hook can run in, the edge runtime included, and a Node API
 * named here fails that analysis even when a runtime guard means it is never
 * reached -- the guard decides at run time, and the complaint is about what
 * the bundle contains. Hence lib/desktop-icons.ts, reached by `await
 * import()` below: everything that touches the machine lives there.
 */
export async function register(): Promise<void> {
  // NEXT_RUNTIME is set by Next itself (not configuration): this hook also
  // runs in the edge runtime, where child processes do not exist.
  // process.env is available there; process.platform is not.
  // eslint-disable-next-line no-restricted-properties -- framework runtime flag, not config
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  // Not while building: only a console that is actually starting places it.
  // eslint-disable-next-line no-restricted-properties -- framework phase flag, not config
  if (process.env["NEXT_PHASE"] === "phase-production-build") return;
  const { placeDesktopIcons } = await import("./lib/desktop-icons");
  // Deliberately not awaited: the icons must never delay the console starting,
  // and a failure to make one must never stop it.
  void placeDesktopIcons();
}
