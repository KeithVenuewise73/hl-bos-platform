import type { GitHubState } from "./github";
import type { Health } from "./health";
import type { MilestoneState } from "./milestone";

/**
 * The approval queue.
 *
 * The design rule from the brief: "Every action should answer one question --
 * what business decision does the CEO need to make? If the answer is 'none',
 * automate it."
 *
 * So this list is built by SUBTRACTION. An item only appears when a human with
 * authority genuinely has to choose. Anything an engineer can decide is not
 * here. An empty queue is the goal state, not a bug.
 */
export interface Approval {
  title: string;
  why: string;
  action: string;
  /** Where to go, if anywhere. */
  href?: string;
  urgency: "now" | "soon" | "whenever";
}

export function approvalQueue(args: {
  gh: GitHubState;
  health: Health;
  milestone: MilestoneState | null;
}): Approval[] {
  const out: Approval[] = [];

  if (!args.gh.connected) {
    out.push({
      title: "Connect GitHub to this console",
      why: "Without it, this console cannot show pull requests or whether the software passed its checks. It is a one-time step.",
      action: "Add a GitHub access token",
      urgency: "soon",
    });
  }

  if (args.gh.connected) {
    for (const pr of args.gh.pulls) {
      const failing = pr.checks.filter(
        (c) =>
          c.status === "completed" &&
          c.conclusion !== null &&
          c.conclusion !== "success" &&
          c.conclusion !== "neutral" &&
          c.conclusion !== "skipped",
      );
      const running = pr.checks.filter((c) => c.status !== "completed");

      if (failing.length > 0 || running.length > 0 || pr.checks.length === 0) {
        // Not a decision yet. Engineering still owns it.
        continue;
      }
      out.push({
        title: `Approve and merge: ${pr.title}`,
        why: "Every automated check passed. This is a business decision: do you want this change in the product?",
        action: `Review pull request #${pr.number}`,
        href: pr.url,
        urgency: "now",
      });
    }
  }

  for (const b of args.milestone?.blockers ?? []) {
    if (b.owner === "ceo") {
      out.push({
        title: b.title,
        why: b.meaning,
        action: "Decide how to proceed",
        urgency: "soon",
      });
    }
  }

  return out;
}
