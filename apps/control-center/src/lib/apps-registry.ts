/**
 * Which local apps the console can start, and the pure decisions about them.
 *
 * Deliberately free of `server-only` and of any import that touches a process,
 * so it can be unit-tested — the same split as gpu.ts / gpu-report.ts. The
 * side-effecting half (fetching health, building, spawning) lives in apps.ts.
 */

export interface LocalApp {
  readonly key: string;
  readonly name: string;
  /** What it is for, in one sentence, in the CEO's language. */
  readonly what: string;
  readonly filter: string;
  readonly port: number;
  readonly healthPath: string;
  /**
   * The oldest Node it runs on, when that is newer than the console's own
   * minimum (22). Checked BEFORE building, so an old Node is named plainly
   * instead of surfacing as "started but never answered".
   */
  readonly minNode?: string;
}

export const LOCAL_APPS: readonly LocalApp[] = [
  {
    key: "ats-resume-optimizer",
    name: "ATS Resume Optimizer",
    what: "Compare a job posting against a resume, see every requirement matched against real evidence, and produce a tailored resume that invents nothing.",
    filter: "@hl-bos/ats-resume-optimizer",
    port: 4600,
    healthPath: "/api/health",
  },
  {
    key: "hype-video",
    name: "5-Star Hype Video",
    what: "Upload an athlete's photo or clip, enter their details, pick a style, and get a complete, fact-checked hype video package: scripts, voiceover, caption, hashtags and ready-to-use video and music prompts.",
    filter: "@hl-bos/hype-video-app",
    port: 4602,
    healthPath: "/api/health",
  },
  {
    key: "jersey-sort",
    name: "JerseySort AI",
    what: "Upload a game's photos and get them sorted into galleries by jersey number, player, event and date, with a fast review screen for the uncertain ones.",
    filter: "@hl-bos/jersey-sort-app",
    port: 4603,
    healthPath: "/api/health",
    // Its database is Node's built-in SQLite, available without a flag from 22.13.
    minNode: "22.13.0",
  },
];

/** Is `version` (e.g. "v22.12.0" or "22.12.0") at least `minimum`? */
export function nodeAtLeast(version: string, minimum: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const have = parse(version);
  const need = parse(minimum);
  for (let i = 0; i < 3; i++) {
    const a = have[i] ?? 0;
    const b = need[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

/** Why this app cannot run on this Node, in plain English; null when it can. */
export function nodeTooOld(app: LocalApp, version: string): string | null {
  if (app.minNode === undefined || nodeAtLeast(version, app.minNode)) return null;
  return `${app.name} needs Node ${app.minNode} or newer, and this computer has Node ${version.replace(/^v/, "")}. Nothing was started. Install the current LTS from nodejs.org (it replaces the old one safely), then close and reopen the Control Center.`;
}

export function findApp(key: string): LocalApp | undefined {
  return LOCAL_APPS.find((app) => app.key === key);
}

export function appUrl(app: LocalApp): string {
  return `http://localhost:${app.port}`;
}

/**
 * Turn a health probe into something worth showing him.
 *
 * Three states, not two: not running, running, and the awkward one — something
 * is answering on the port but is not healthy. Collapsing that third case into
 * "running" would put a link in front of him that leads to an error page.
 */
export function describeHealth(
  app: LocalApp,
  probe: { reached: boolean; ok: boolean },
): { running: boolean; detail: string } {
  if (!probe.reached) return { running: false, detail: "Not running. Start it below." };
  if (!probe.ok) {
    return {
      running: false,
      detail: `Something is answering on port ${app.port}, but it is not healthy.`,
    };
  }
  return { running: true, detail: "Running. Click to open it." };
}
