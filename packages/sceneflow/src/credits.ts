// Credits (section 46).
//
// The rule that matters: a user is charged for an image they received. Not for
// a request we refused, not for a provider outage, not for a panel that failed
// halfway through a storyboard. Anything else is charging people for our
// mistakes, and it is the fastest way to make a product untrustworthy.
//
// The ledger is append-only. A refund is a second entry, never an edit of the
// first — so "what did this cost me" always has an auditable answer.

import type { GenerationType } from "./types";

export type CreditEventType =
  "grant" | "debit" | "refund" | "subscription-renewal" | "introductory-grant";

export interface CreditEntry {
  readonly amount: number;
  readonly eventType: CreditEventType;
  readonly generationJobId: string | null;
  readonly description: string;
}

/** Cost per generation type, in credits. Configuration, not a magic number. */
export const CREDIT_COSTS: Readonly<Record<GenerationType, number>> = {
  single: 1,
  "story-3": 3,
  "story-6": 6,
  variation: 1,
  regenerate: 1,
  continue: 1,
  branch: 1,
};

export function costOf(type: GenerationType): number {
  return CREDIT_COSTS[type];
}

/** Terminal states of a generation job, from the job-status list in section 39. */
export type JobOutcome =
  | "complete"
  | "partial"
  | "blocked"
  | "provider-failure"
  | "server-failure"
  | "output-rejected";

export interface SettlementInput {
  readonly type: GenerationType;
  readonly outcome: JobOutcome;
  readonly jobId: string;
  /** For a storyboard: how many panels were actually delivered. */
  readonly scenesDelivered?: number;
  readonly scenesRequested?: number;
}

export interface Settlement {
  /** Credits to charge. Never negative. */
  readonly charge: number;
  /** Credits to return from an earlier hold. Never negative. */
  readonly refund: number;
  readonly entries: readonly CreditEntry[];
  readonly reason: string;
}

/**
 * Settle a job that was authorised with a hold of `costOf(type)`.
 *
 * A partial storyboard charges for the panels that exist. Section 56 keeps
 * scenes 1-3 available when scene 4 fails; charging six credits for three
 * images would make the recovery path feel like a penalty.
 */
export function settle(input: SettlementInput): Settlement {
  const held = costOf(input.type);

  switch (input.outcome) {
    case "complete":
      return {
        charge: held,
        refund: 0,
        entries: [
          {
            amount: -held,
            eventType: "debit",
            generationJobId: input.jobId,
            description: `${input.type} generated`,
          },
        ],
        reason: "delivered",
      };

    case "blocked":
      // Section 43: "Blocked requests should not consume credits."
      return {
        charge: 0,
        refund: held,
        entries: [
          {
            amount: held,
            eventType: "refund",
            generationJobId: input.jobId,
            description: "Request was not generated — no credits used",
          },
        ],
        reason: "blocked_before_generation",
      };

    case "provider-failure":
    case "server-failure":
    case "output-rejected":
      return {
        charge: 0,
        refund: held,
        entries: [
          {
            amount: held,
            eventType: "refund",
            generationJobId: input.jobId,
            description: "Generation did not complete — credits returned",
          },
        ],
        reason: input.outcome,
      };

    case "partial": {
      const delivered = Math.max(0, input.scenesDelivered ?? 0);
      const requested = Math.max(1, input.scenesRequested ?? held);
      const perScene = held / requested;
      const charge = Math.min(held, Math.round(delivered * perScene));
      const refund = held - charge;
      const entries: CreditEntry[] = [];
      if (charge > 0) {
        entries.push({
          amount: -charge,
          eventType: "debit",
          generationJobId: input.jobId,
          description: `${delivered} of ${requested} scenes generated`,
        });
      }
      if (refund > 0) {
        entries.push({
          amount: refund,
          eventType: "refund",
          generationJobId: input.jobId,
          description: `${requested - delivered} scene(s) not generated — credits returned`,
        });
      }
      return { charge, refund, entries, reason: "partial_delivery" };
    }
  }
}

/** Running balance from an append-only ledger. */
export function balance(entries: readonly CreditEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

export interface AffordabilityCheck {
  readonly affordable: boolean;
  readonly required: number;
  readonly available: number;
  readonly shortfall: number;
}

export function canAfford(
  entries: readonly CreditEntry[],
  type: GenerationType,
): AffordabilityCheck {
  const required = costOf(type);
  const available = balance(entries);
  return {
    affordable: available >= required,
    required,
    available,
    shortfall: Math.max(0, required - available),
  };
}

/** Entitlements (section 45). Server-side, never trusted from the client. */
export type Entitlement = "free" | "plus" | "story_pro";

export interface EntitlementLimits {
  readonly maxScenesPerStory: 1 | 3 | 6;
  readonly continueFromHere: boolean;
  readonly maxCasts: number;
  readonly monthlyCredits: number;
}

export const ENTITLEMENTS: Readonly<Record<Entitlement, EntitlementLimits>> = {
  free: {
    maxScenesPerStory: 1,
    continueFromHere: false,
    maxCasts: 1,
    monthlyCredits: 0,
  },
  plus: {
    maxScenesPerStory: 3,
    continueFromHere: false,
    maxCasts: 3,
    monthlyCredits: 60,
  },
  story_pro: {
    maxScenesPerStory: 6,
    continueFromHere: true,
    maxCasts: 10,
    monthlyCredits: 150,
  },
};

export interface EntitlementRefusal {
  readonly allowed: false;
  readonly reason: "scene_count" | "continue_from_here";
  readonly requiredEntitlement: Entitlement;
  readonly message: string;
}

export type EntitlementCheck = { readonly allowed: true } | EntitlementRefusal;

/**
 * Whether an entitlement covers an action.
 *
 * Checked on the server for every protected action (section 47). A client that
 * hides the 6-scene button is a nicety; this is the gate.
 */
export function entitlementAllows(
  entitlement: Entitlement,
  action: { readonly type: GenerationType; readonly scenes?: number },
): EntitlementCheck {
  const limits = ENTITLEMENTS[entitlement];

  if (action.type === "continue" && !limits.continueFromHere) {
    return {
      allowed: false,
      reason: "continue_from_here",
      requiredEntitlement: "story_pro",
      message: "Continue From Here is part of Story Pro.",
    };
  }

  const scenes =
    action.scenes ??
    (action.type === "story-6" ? 6 : action.type === "story-3" ? 3 : 1);
  if (scenes > limits.maxScenesPerStory) {
    return {
      allowed: false,
      reason: "scene_count",
      requiredEntitlement: scenes > 3 ? "story_pro" : "plus",
      message: `${scenes}-scene stories are part of ${scenes > 3 ? "Story Pro" : "Plus"}.`,
    };
  }

  return { allowed: true };
}
