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
    key: "dispatchos-match",
    name: "DispatchOS Match",
    what: "Find backhaul freight worth taking on the way home, ranked by what each load actually earns, with a plain reason for every load it turns down. Runs on sample data.",
    filter: "@hl-bos/dispatchos-match",
    port: 4700,
    healthPath: "/api/health",
  },
];

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
