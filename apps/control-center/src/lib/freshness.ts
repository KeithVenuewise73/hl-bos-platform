/**
 * Is this console running the latest work, and if not, why not?
 *
 * This exists because of a wasted round trip. A fix was merged, he restarted
 * the console, pressed the button again and got the OLD failure message --
 * and neither of us could tell from the screen that his copy was still running
 * yesterday's code. The console reported "behind remote: 0" the whole time,
 * because that number was hardcoded to zero and had never been computed.
 *
 * A number that is always zero is worse than no number: it reads as a check
 * that passed.
 *
 * Pure. The caller does the git work and passes what it found.
 */

export interface Freshness {
  /** One sentence, no jargon. */
  readonly headline: string;
  /** What to do about it, or why nothing needs doing. */
  readonly meaning: string;
  /** True when what is running is NOT the latest. Drives the warning colour. */
  readonly stale: boolean;
}

export interface FreshnessFacts {
  /** False when git is missing -- a copy that came from a downloaded zip. */
  readonly hasGit: boolean;
  /**
   * Commits on origin/main that this copy does not have. -1 when it could not
   * be worked out (no origin/main reference yet, or git failed).
   */
  readonly behind: number;
  /** Short commit id of what is running, or "". */
  readonly short: string;
  /** Human-readable age of that commit, e.g. "2 hours ago", or "". */
  readonly when: string;
}

export function describeFreshness(facts: FreshnessFacts): Freshness {
  if (!facts.hasGit) {
    return {
      stale: true,
      headline: "This copy cannot collect updates, so it may be out of date.",
      meaning:
        "It was unpacked from a downloaded zip rather than linked to GitHub, which means finished work can never reach it and nothing here can tell you what version it is. Installing GitHub Desktop and cloning the repository fixes it permanently -- ask Claude to walk you through it once.",
    };
  }

  const running = describeRunning(facts);

  if (facts.behind < 0) {
    return {
      stale: false,
      headline: `Running ${running}. Whether newer work exists could not be checked.`,
      meaning:
        "The comparison against GitHub did not answer, usually because the internet dropped during startup. Closing this window and opening it again re-checks.",
    };
  }

  if (facts.behind === 0) {
    return {
      stale: false,
      headline: `Up to date, running ${running}.`,
      meaning: "Everything merged on GitHub is on this machine.",
    };
  }

  const commits = facts.behind === 1 ? "1 change" : `${facts.behind} changes`;
  return {
    stale: true,
    headline: `Out of date: ${commits} finished on GitHub are not on this machine.`,
    meaning: `It is running ${running}. Close this window and open control-center.bat again -- it collects updates on startup. If that does not change this line, tell Claude.`,
  };
}

function describeRunning(facts: FreshnessFacts): string {
  if (facts.short === "") return "an unknown version";
  return facts.when === ""
    ? `version ${facts.short}`
    : `${facts.when} (${facts.short})`;
}
