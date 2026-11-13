/**
 * What "Update from GitHub" says, in plain English.
 *
 * The work itself is done by scripts/update.mjs -- the same safe updater the
 * launcher runs at startup (fast-forward only, never touches unsaved work,
 * never rewrites history, never waits at a password prompt). The console does
 * not get its own, second idea of what "safe" means: it asks that script, in
 * its --json mode, and translates the answer.
 *
 * Pure: it takes the script's stdout and returns what to show.
 */

export interface UpdateReport {
  readonly ok: boolean;
  readonly headline: string;
  readonly meaning: string;
}

interface UpdaterAnswer {
  readonly kind: "updated" | "current" | "blocked";
  readonly message: string;
}

/** The last line that parses as the updater's answer, or null. */
function parseAnswer(stdout: string): UpdaterAnswer | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"));
  for (const line of lines.reverse()) {
    try {
      const v = JSON.parse(line) as Partial<UpdaterAnswer>;
      if (
        (v.kind === "updated" || v.kind === "current" || v.kind === "blocked") &&
        typeof v.message === "string"
      ) {
        return { kind: v.kind, message: v.message };
      }
    } catch {
      // Not our line. Keep looking.
    }
  }
  return null;
}

export function describeUpdate(stdout: string): UpdateReport {
  const answer = parseAnswer(stdout);
  if (answer === null) {
    // Never invent a result. If the updater did not answer, say that.
    return {
      ok: false,
      headline: "Could not check for updates.",
      meaning:
        "The updater did not give an answer, so nothing is known about whether newer work exists and nothing was changed. Try again in a minute; if it keeps happening, tell Claude.",
    };
  }
  switch (answer.kind) {
    case "updated":
      return {
        ok: true,
        headline: "The update was collected from GitHub.",
        meaning: `${answer.message} The new code is on this computer, but this window is still running the old version. Close it and double-click control-center.bat — it rebuilds the console with the new code and opens it again (about a minute). Nothing else to do.`,
      };
    case "current":
      return {
        ok: true,
        headline: "Already up to date.",
        meaning: `${answer.message} Everything finished on GitHub is already on this computer.`,
      };
    case "blocked":
      return {
        ok: false,
        headline: "Nothing was updated.",
        meaning: answer.message,
      };
  }
}
