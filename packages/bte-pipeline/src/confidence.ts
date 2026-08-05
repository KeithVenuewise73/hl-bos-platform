/**
 * Confidence mapping.
 *
 * @hl-bos/bti-engine already classifies every claim it makes as FACT /
 * INFERENCE / OPINION. The BTE evidence-confidence model maps those onto the
 * CEO directive's four levels, and folds in the truthful "could-not-observe"
 * case that the engine cannot produce on its own (it only speaks about signals
 * it was given). The mapping is total and lossless in one direction:
 *
 *   fact       -> verified            (first-hand observed evidence)
 *   inference  -> inferred            (defensible, labelled inference)
 *   opinion    -> needs_confirmation  (a recommendation the owner must confirm)
 *   (no data)  -> unavailable         (an explicit gap — never a guess)
 */

import type { consulting } from "@hl-bos/bti-engine";
import type { BteFinding, ConfidenceSummary, FindingConfidence } from "./types.ts";

export function confidenceFromClaimType(type: consulting.ClaimType): FindingConfidence {
  switch (type) {
    case "fact":
      return "verified";
    case "inference":
      return "inferred";
    case "opinion":
      return "needs_confirmation";
  }
}

const RANK: Record<FindingConfidence, number> = {
  verified: 0,
  inferred: 1,
  needs_confirmation: 2,
  unavailable: 3,
};

/**
 * The confidence of a finding built from several claims is its STRONGEST basis:
 * a constraint that rests on an observed fact is `verified`, even though the
 * recommendation attached to it is (separately) an opinion. A finding with no
 * fact and no inference — only an opinion — is `needs_confirmation`.
 */
export function strongest(levels: readonly FindingConfidence[]): FindingConfidence {
  if (levels.length === 0) return "needs_confirmation";
  return levels.reduce((best, l) => (RANK[l] < RANK[best] ? l : best), levels[0]!);
}

export function summarize(findings: readonly BteFinding[]): ConfidenceSummary {
  const summary: ConfidenceSummary = {
    verified: 0,
    inferred: 0,
    needsConfirmation: 0,
    unavailable: 0,
  };
  for (const f of findings) {
    switch (f.confidence) {
      case "verified":
        summary.verified++;
        break;
      case "inferred":
        summary.inferred++;
        break;
      case "needs_confirmation":
        summary.needsConfirmation++;
        break;
      case "unavailable":
        summary.unavailable++;
        break;
    }
  }
  return summary;
}

/** One-line, honest confidence statement for a notification / report header. */
export function confidenceLine(s: ConfidenceSummary): string {
  return (
    `${s.verified} verified, ${s.inferred} inferred, ` +
    `${s.needsConfirmation} need owner confirmation, ${s.unavailable} unavailable`
  );
}
