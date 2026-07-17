import type { GitHubState, PullRequest } from "./github";

export type Health = "green" | "yellow" | "red" | "unknown";

export interface QualityGate {
  name: string;
  health: Health;
  /** Plain English. Never a raw status string. */
  summary: string;
}

/** The checks HL-BOS runs on every pull request, named as a human would. */
const GATE_LABELS: Record<string, string> = {
  Validate: "Code quality",
  "Secret scan": "Secret scan",
  "Migration checks": "Database rules",
  "Database tests (pgTAP)": "Database tests",
};

export function friendlyGateName(raw: string): string {
  return GATE_LABELS[raw] ?? raw;
}

function checkHealth(status: string, conclusion: string | null): Health {
  if (status !== "completed") return "yellow";
  if (conclusion === "success" || conclusion === "neutral" || conclusion === "skipped")
    return "green";
  return "red";
}

export function gatesFor(pr: PullRequest | null): QualityGate[] {
  if (!pr) return [];
  if (!pr.checksReadable) {
    // The token can see the PR but not its check results. Say so plainly instead
    // of rendering an empty "no checks" state that reads as "all clear".
    return [
      {
        name: "CI checks",
        health: "unknown",
        summary:
          "Can't read results — the GitHub token is missing the 'Actions' read permission.",
      },
    ];
  }
  return pr.checks.map((c) => {
    const h = checkHealth(c.status, c.conclusion);
    return {
      name: friendlyGateName(c.name),
      health: h,
      summary:
        h === "green"
          ? "Passing"
          : h === "yellow"
            ? "Still running"
            : "Failing — needs a fix",
    };
  });
}

/**
 * Overall health.
 *
 * `unknown` is a real answer and is never dressed up as green. A dashboard that
 * shows green when it cannot see is worse than one that admits it cannot see.
 */
export function overallHealth(
  gh: GitHubState,
  gates: QualityGate[],
): {
  health: Health;
  summary: string;
} {
  if (!gh.connected) {
    return {
      health: "unknown",
      summary: "Not connected to GitHub, so build results are not visible.",
    };
  }
  if (gates.length === 0) {
    return { health: "unknown", summary: "No checks have run yet." };
  }
  if (gates.some((g) => g.health === "red")) {
    const bad = gates.filter((g) => g.health === "red").map((g) => g.name);
    return {
      health: "red",
      summary: `${bad.join(" and ")} failing. Your AI engineer is on it.`,
    };
  }
  if (gates.some((g) => g.health === "yellow")) {
    return {
      health: "yellow",
      summary: "Checks are still running. Nothing to do yet.",
    };
  }
  if (gates.some((g) => g.health === "unknown")) {
    // Never let an unreadable gate fall through to "green" -- that would claim
    // a pass the console cannot actually see.
    return {
      health: "unknown",
      summary:
        "Check results can't be read. Grant the GitHub token the 'Actions' read permission to see them.",
    };
  }
  return { health: "green", summary: "Every check passed. Ready for your decision." };
}
