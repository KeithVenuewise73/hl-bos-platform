import type { GitHubState } from "./github";
import type { SupabaseState } from "./supabase";
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
  /** Present when this approval can be executed in the console. */
  mergeable?: { number: number; title: string };
  urgency: "now" | "soon" | "whenever";
}

export function approvalQueue(args: {
  gh: GitHubState;
  sb: SupabaseState;
  health: Health;
  milestone: MilestoneState | null;
}): Approval[] {
  const out: Approval[] = [];

  // Connection prompts are derived from LIVE state, never hardcoded. The moment
  // a token is saved and works, its prompt disappears on the next render.
  if (!args.gh.connected) {
    out.push({
      title: "Connect GitHub to this console",
      why: "Without it, this console cannot show pull requests or whether the software passed its checks. It is a one-time step.",
      action: "Add a GitHub access token",
      urgency: "soon",
    });
  }

  if (!args.sb.connected) {
    out.push({
      title: "Connect Supabase to this console",
      why: args.sb.reason,
      action: "Add a Supabase access token and project reference",
      urgency: "soon",
    });
  }

  if (args.gh.connected) {
    // The token can list PRs but not read their checks (missing the "Checks"
    // permission). Surface it once: without it the console cannot show quality
    // results or offer an approve-merge decision.
    if (args.gh.pulls.some((pr) => !pr.checksReadable)) {
      out.push({
        title: "GitHub token can't read CI results",
        why: "The console can see your pull requests but not whether their checks passed, so it cannot offer an approve-merge decision. The token needs the 'Actions' read permission added (fine-grained tokens cannot use the Checks API).",
        action: "Add 'Actions: Read' to the GitHub token, then re-save it",
        urgency: "soon",
      });
    }

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

      if (
        !pr.checksReadable ||
        failing.length > 0 ||
        running.length > 0 ||
        pr.checks.length === 0
      ) {
        // Not a decision yet -- checks unreadable, still running, failing, or
        // none reported. Engineering (or a permission fix) still owns it.
        continue;
      }
      out.push({
        title: `Approve and merge: ${pr.title}`,
        why: "Every automated check passed. This is a business decision: do you want this change in the product?",
        action: `Approve pull request #${pr.number}`,
        href: pr.url,
        mergeable: { number: pr.number, title: pr.title },
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
