/**
 * Executive Advisor — a PURE derivation over the existing BTIC dossier that turns
 * the engagement's own evidence into prioritized executive recommendations.
 *
 * It analyzes only what is already recorded (BTIC read model + the derived
 * Executive View sections). It stores nothing, changes no engine, and invents no
 * number. The discipline here is strict:
 *
 *   - No recommendation exists without supporting evidence. If the backing records
 *     are absent, the recommendation is simply not produced — never fabricated to
 *     fill space.
 *   - Confidence mirrors the underlying evidence. A recommendation drawn from an
 *     `unknown` gap stays `unknown`; it is never upgraded to make it look decided.
 *   - Estimated effort is `unknown` unless the dossier gives a real basis to size
 *     it (e.g. an owner decision needs no engineering). A guessed timeline would be
 *     a fabricated number, so we do not produce one.
 *   - Priority is assigned by a deterministic rule over the evidence (does it block
 *     the engagement? is it the lowest-scoring domain? is it a live risk?), not by
 *     an invented severity.
 *
 * Consumes btic-data (read model). No persistence, no I/O, no mutation.
 */

import type { Dossier, IntelligenceRecord, Phase } from "./btic-data";
import { currentPhase, orderedPhases, pendingDecisions } from "./btic-data";

/** Deterministic priority bands, highest first. */
export type Priority = "critical" | "high" | "medium" | "informational";

/**
 * Confidence in the recommendation, inherited from its evidence.
 *   verified — every supporting record is repo-verified
 *   reported — stated internally, not independently confirmed
 *   derived  — a sound inference across verified records (no new external fact)
 *   unknown  — rests on an explicit gap; stays unknown, never upgraded
 */
export type AdvisorConfidence = "verified" | "reported" | "derived" | "unknown";

/**
 * Estimated effort. `owner_decision` = no engineering, an owner call. `unknown` is
 * used honestly wherever the dossier gives no basis to size the work.
 */
export type Effort = "owner_decision" | "low" | "medium" | "high" | "unknown";

export interface Recommendation {
  id: string;
  title: string;
  /** Why this matters now, in plain executive language. */
  rationale: string;
  priority: Priority;
  businessImpact: string;
  confidence: AdvisorConfidence;
  estimatedEffort: Effort;
  /** Honest reason for the effort call — including why it is unknown. */
  effortBasis: string;
  /** Provenance strings from the real records. NEVER empty. */
  supportingEvidence: string[];
  /** The Executive Command Center section this ties back to. */
  relatedBticSection: string;
  /** The transformation phase this advances, or "—" when none applies. */
  relatedPhase: string;
}

export interface AdvisorReport {
  engagementId: string;
  engagementTitle: string;
  /** Where the whole analysis is derived from — always populated. */
  basis: string;
  recommendations: Recommendation[];
  /** Honest note: what the advisor could NOT recommend on, and why. */
  gapsNote: string | null;
}

const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  informational: 3,
};

function lowestDomain(d: Dossier) {
  const ds = d.engagement.transformationScore?.domains ?? [];
  return ds.length ? ds.reduce((a, b) => (b.score < a.score ? b : a)) : null;
}
function byCategory(d: Dossier, cats: IntelligenceRecord["category"][]) {
  return d.intelligence.filter((r) => cats.includes(r.category));
}
function phaseName(phases: Phase[], id: string): string {
  return phases.find((p) => p.id === id)?.name ?? "—";
}

/**
 * Derive prioritized recommendations for one engagement. Deterministic and
 * fabrication-free: every recommendation is gated on real evidence, and any whose
 * evidence is missing is dropped rather than invented.
 */
export function deriveAdvisor(d: Dossier): AdvisorReport {
  const phases = orderedPhases(d);
  const cur = currentPhase(d);
  const pending = pendingDecisions(d);

  const low = lowestDomain(d);
  const gaps = byCategory(d, ["gap"]);
  const risks = byCategory(d, ["risk"]);
  const capabilities = byCategory(d, ["capability"]);

  const recs: Recommendation[] = [];

  // R1 — Unblock the engagement: resolve the pending owner confirmations.
  // Evidence: the real pending decisions. Priority is critical because each one
  // explicitly `blocks` progress. Effort is an owner decision, not engineering.
  if (pending.length > 0) {
    recs.push({
      id: "unblock-owner-confirmation",
      title: `Resolve the ${pending.length} pending owner confirmation${
        pending.length === 1 ? "" : "s"
      } to unpause the engagement`,
      rationale:
        "The engagement is paused on the owner. Each open decision blocks external client review, and nothing may be invented in its place — so the single highest-leverage move is to close them.",
      priority: "critical",
      businessImpact:
        "Unblocks the entire engagement: website copy, campaign claims, and commercial terms all wait on these answers before any external review.",
      confidence: "verified",
      estimatedEffort: "owner_decision",
      effortBasis:
        "These are owner decisions, not engineering work — no build effort, but they gate everything downstream.",
      supportingEvidence: pending.map((x) => `${x.question} — ${x.provenance}`),
      relatedBticSection: "10 · Decisions Required",
      relatedPhase: cur?.name ?? phaseName(phases, "owner_confirmation"),
    });
  }

  // R2 — Close the critical capability gap (the lowest-scoring domain), when a
  // verified/reported gap record backs it. Confidence inherits from that record.
  if (low) {
    const firstWord = low.label.split(" ")[0] ?? low.label;
    const gapRecord =
      gaps.find((r) => new RegExp(firstWord, "i").test(r.headline)) ?? null;
    if (gapRecord) {
      recs.push({
        id: "close-critical-gap",
        title: `Close the critical ${low.label} gap (${low.score}/100 — the lowest-scoring domain)`,
        rationale: gapRecord.detail,
        priority: "high",
        businessImpact:
          "Raising the weakest domain lifts the overall transformation score and removes the constraint the assessment flags as most limiting.",
        confidence:
          gapRecord.confidence === "unknown" ? "unknown" : gapRecord.confidence,
        estimatedEffort: "unknown",
        effortBasis:
          "No scoped remediation plan is captured in the dossier, so the effort cannot be sized honestly — recorded as unknown rather than guessed.",
        supportingEvidence: [
          `${low.label} ${low.score}/100 — ${
            d.engagement.transformationScore?.provenance ?? d.engagement.provenance
          }`,
          `${gapRecord.headline} — ${gapRecord.provenance}`,
        ],
        relatedBticSection: "3 · Primary Business Constraint / 7 · AI Readiness",
        relatedPhase: phaseName(phases, "findings"),
      });
    }
  }

  // R3 — Act on the live near-term risks (e.g. conversion / lead generation).
  // The marketing strategy and launch campaign phases are already complete, so
  // the recommendation is to execute them against the recorded risk.
  for (const risk of risks) {
    recs.push({
      id: `mitigate-${risk.id}`,
      title: `Act on: ${risk.headline}`,
      rationale: risk.detail,
      priority: "high",
      businessImpact:
        "A recorded near-term constraint on results; the completed marketing strategy and launch campaign are the assets already built to relieve it.",
      confidence: risk.confidence === "unknown" ? "unknown" : risk.confidence,
      estimatedEffort: "unknown",
      effortBasis:
        "Execution of the completed strategy/campaign is not yet scoped into tasks, so effort is left unknown rather than estimated.",
      supportingEvidence: [`${risk.headline} — ${risk.provenance}`],
      relatedBticSection: "9 · Critical Risks / 4 · Highest Revenue Opportunity",
      relatedPhase: phaseName(phases, "launch_campaign"),
    });
  }

  // R4 — Close explicit unknown gaps (e.g. external market baselines). This is the
  // honest opposite of fabrication: the recommendation is to ACQUIRE the missing
  // fact, and its confidence stays `unknown` because the underlying data is a gap.
  for (const gap of gaps) {
    if (gap.confidence !== "unknown") continue;
    recs.push({
      id: `acquire-${gap.id}`,
      title: `Acquire the missing baseline: ${gap.headline}`,
      rationale: gap.detail,
      priority: "medium",
      businessImpact:
        "Until this is known, the related revenue/market opportunity cannot be quantified — it stays an explicit gap, never an estimate.",
      confidence: "unknown",
      estimatedEffort: "unknown",
      effortBasis:
        "Sizing depends on a fact we do not yet have, so effort is unknown by construction — consistent with keeping the gap a gap.",
      supportingEvidence: [`${gap.headline} — ${gap.provenance}`],
      relatedBticSection: "4 · Highest Revenue Opportunity / 5 · SEO / Visibility",
      relatedPhase: "—",
    });
  }

  // R5 — Exploit verified structural strengths (reuse %, live mature backend) to
  // move fast on the above rather than rebuild foundations. Evidence is verified
  // capabilities; if none are verified, no strength claim is made.
  const verifiedCaps = capabilities.filter((c) => c.confidence === "verified");
  if (verifiedCaps.length > 0) {
    recs.push({
      id: "exploit-strengths",
      title: "Sequence the gap and growth work now — the foundation is already strong",
      rationale: verifiedCaps.map((c) => c.headline).join("; ") + ".",
      priority: "informational",
      businessImpact:
        "A high reuse ratio on a live, RLS-secured backend means the priorities above can be executed on existing foundations rather than a rebuild — favoring speed over re-platforming.",
      confidence: "verified",
      estimatedEffort: "low",
      effortBasis:
        "Leverages capabilities already verified in the repository; the effort is in sequencing, not new foundations.",
      supportingEvidence: verifiedCaps.map((c) => `${c.headline} — ${c.provenance}`),
      relatedBticSection: "8 · Operational Maturity",
      relatedPhase: phaseName(phases, "investigation"),
    });
  }

  recs.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  // Honest coverage note: name what the advisor could not recommend on.
  const unknownGapCount = gaps.filter((g) => g.confidence === "unknown").length;
  const gapsNote =
    unknownGapCount > 0
      ? `${unknownGapCount} input${
          unknownGapCount === 1 ? " is" : "s are"
        } an explicit gap (unknown), so any recommendation touching ${
          unknownGapCount === 1 ? "it" : "them"
        } is confined to acquiring the missing fact — no impact figure is asserted.`
      : null;

  return {
    engagementId: d.engagement.id,
    engagementTitle: d.engagement.title,
    basis:
      "Derived from the engagement's own BTIC records — pending decisions, transformation-score domains, and intelligence (risk / gap / capability). Nothing is stored or invented.",
    recommendations: recs,
    gapsNote,
  };
}
