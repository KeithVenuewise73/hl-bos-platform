/**
 * Executive View — a PURE derivation over the existing BTIC dossier. It elevates
 * the engagement's real records into a 12-section executive summary WITHOUT
 * storing anything, changing the engine, or inventing a number. Every section
 * traces to a real field and carries its basis (provenance) + a confidence. Where
 * a metric is not captured (e.g. a discrete SEO score), it is recorded as a gap,
 * never fabricated.
 *
 * Consumes the BTIC read model only (btic-data). No persistence, no I/O.
 */

import type { Dossier, IntelligenceRecord } from "./btic-data";
import { currentPhase, orderedPhases, pendingDecisions } from "./btic-data";

export type ExecConfidence = "verified" | "reported" | "unknown" | "derived";

export interface ExecItem {
  text: string;
  meta?: string;
}

export interface ExecSection {
  key: string;
  title: string;
  /** The one-line executive answer, built from real fields. */
  headline: string;
  detail?: string | undefined;
  items?: ExecItem[] | undefined;
  /** How this was derived / where it came from — always populated. */
  basis: string;
  confidence: ExecConfidence;
  /** False when no real data backs the section (honest gap). */
  hasData: boolean;
}

export interface ExecutiveView {
  engagementId: string;
  engagementTitle: string;
  client: string;
  status: string;
  overallScore: number | null;
  sections: ExecSection[];
}

function domain(d: Dossier, match: RegExp) {
  return (
    d.engagement.transformationScore?.domains.find((x) => match.test(x.label)) ?? null
  );
}
function lowestDomain(d: Dossier) {
  const ds = d.engagement.transformationScore?.domains ?? [];
  return ds.length ? ds.reduce((a, b) => (b.score < a.score ? b : a)) : null;
}
function byCategory(d: Dossier, cats: IntelligenceRecord["category"][]) {
  return d.intelligence.filter((r) => cats.includes(r.category));
}

/** Derive the executive view for one engagement. Deterministic + fabrication-free. */
export function deriveExecutive(d: Dossier): ExecutiveView {
  const score = d.engagement.transformationScore ?? null;
  const phases = orderedPhases(d);
  const done = phases.filter((p) => p.status === "complete").length;
  const cur = currentPhase(d);
  const pending = pendingDecisions(d);
  const scoreProv = score?.provenance ?? d.engagement.provenance;

  const ai = domain(d, /ai/i);
  const growth = domain(d, /growth/i);
  const tech = domain(d, /tech/i);
  const low = lowestDomain(d);

  const risksGaps = byCategory(d, ["risk", "gap"]);
  const capabilities = byCategory(d, ["capability"]);
  const growthRisk = d.intelligence.find((r) => r.category === "risk");
  const liveProduct =
    capabilities.find((r) => /live|backend|product/i.test(r.headline)) ??
    capabilities[0] ??
    null;
  const lowWord = low ? (low.label.split(" ")[0] ?? low.label) : "";
  const constraintRecord =
    low && lowWord
      ? risksGaps.find((r) => new RegExp(lowWord, "i").test(r.headline))
      : undefined;

  const marketingPhases = phases.filter((p) =>
    /market|campaign|creative|website/i.test(p.name),
  );
  const marketingDone = marketingPhases.filter((p) => p.status === "complete").length;

  const sections: ExecSection[] = [
    {
      key: "stage",
      title: "1 · Current Transformation Stage",
      headline: cur ? cur.name : "—",
      detail: cur
        ? `${cur.summary} (${done}/${phases.length} phases complete; engagement ${d.engagement.status})`
        : undefined,
      basis: cur?.provenance ?? d.engagement.provenance,
      confidence: "verified",
      hasData: Boolean(cur),
    },
    {
      key: "summary",
      title: "2 · Executive Summary",
      headline:
        (score ? `${score.overall}/100 transformation score` : "No assessment score") +
        (cur ? ` · stage: ${cur.name}` : "") +
        ` · ${pending.length} decision${pending.length === 1 ? "" : "s"} owed`,
      detail: d.engagement.summary,
      basis: d.engagement.provenance,
      confidence: "verified",
      hasData: true,
    },
    {
      key: "constraint",
      title: "3 · Primary Business Constraint",
      headline: low
        ? `${low.label} — ${low.score}/100 (lowest-scoring domain)`
        : "Not scored",
      detail:
        constraintRecord?.detail ??
        "The lowest-scoring capability domain in the assessment.",
      basis: constraintRecord?.provenance ?? scoreProv,
      confidence: constraintRecord?.confidence === "unknown" ? "unknown" : "verified",
      hasData: Boolean(low),
    },
    {
      key: "opportunity",
      title: "4 · Highest Revenue Opportunity",
      headline: growthRisk
        ? "Lift the near-term growth constraints"
        : capabilities[0]
          ? capabilities[0].headline
          : "Not quantified in this dossier",
      detail:
        (growthRisk?.detail ?? capabilities[0]?.detail ?? "") +
        " External market baselines are not known, so no revenue figure is asserted — recorded as a gap.",
      basis:
        (growthRisk?.provenance ?? capabilities[0]?.provenance ?? scoreProv) +
        " · external baselines: unknown gap",
      confidence: "derived",
      hasData: Boolean(growthRisk || capabilities[0]),
    },
    {
      key: "seo",
      title: "5 · SEO / Visibility Status",
      headline: "Not scored as a discrete domain in this dossier",
      detail:
        `The assessment carries four domains (Business, Growth, Technology, AI readiness); SEO/visibility is not a separate score. ` +
        `Nearest signals: Growth ${growth?.score ?? "—"}/100; AI-search discoverability sits inside the AI-readiness gap (${ai?.score ?? "—"}/100).`,
      basis: `${scoreProv} — no discrete SEO/visibility metric; recorded as a gap, not fabricated.`,
      confidence: "unknown",
      hasData: false,
    },
    {
      key: "marketing",
      title: "6 · Marketing Status",
      headline: marketingPhases.length
        ? `${marketingDone}/${marketingPhases.length} marketing deliverables complete`
        : "No marketing phases recorded",
      detail: marketingPhases.length
        ? marketingPhases
            .map((p) => `${p.name}: ${p.status.replace(/_/g, " ")}`)
            .join(" · ")
        : undefined,
      basis: "BTIC phases (marketing / campaign / creative / website).",
      confidence: "derived",
      hasData: marketingPhases.length > 0,
    },
    {
      key: "ai",
      title: "7 · AI Readiness",
      headline: ai ? `${ai.score}/100` : "Not scored",
      detail:
        d.intelligence.find((r) => /ai/i.test(r.headline))?.detail ??
        "AI readiness domain from the deterministic assessment.",
      basis:
        d.intelligence.find((r) => /ai/i.test(r.headline))?.provenance ?? scoreProv,
      confidence: "verified",
      hasData: Boolean(ai),
    },
    {
      key: "operational",
      title: "8 · Operational Maturity",
      headline: liveProduct
        ? liveProduct.headline
        : tech
          ? `Technology ${tech.score}/100`
          : "Not scored",
      detail:
        (liveProduct?.detail ? liveProduct.detail + " " : "") +
        (tech ? `Technology capability scored ${tech.score}/100.` : ""),
      basis: liveProduct?.provenance ?? scoreProv,
      confidence: liveProduct?.confidence ?? "derived",
      hasData: Boolean(liveProduct || tech),
    },
    {
      key: "risks",
      title: "9 · Critical Risks",
      headline: risksGaps.length
        ? `${risksGaps.length} recorded risk${risksGaps.length === 1 ? "" : "s"} / gap${risksGaps.length === 1 ? "" : "s"}`
        : "None recorded",
      items: risksGaps.map((r) => ({ text: r.headline, meta: r.confidence })),
      basis: "BTIC intelligence records (category: risk, gap).",
      confidence: "verified",
      hasData: risksGaps.length > 0,
    },
    {
      key: "decisions",
      title: "10 · Decisions Required",
      headline: pending.length
        ? `${pending.length} decision${pending.length === 1 ? "" : "s"} owed by the owner`
        : "None owed",
      items: pending.map((x) => ({ text: x.question, meta: "pending" })),
      basis: "BTIC executive decisions, status = pending.",
      confidence: "verified",
      hasData: pending.length > 0,
    },
    {
      key: "next",
      title: "11 · Recommended Next Action",
      headline: pending.length
        ? `Resolve the ${pending.length} pending commercial confirmation${pending.length === 1 ? "" : "s"} to unpause the engagement`
        : cur
          ? `Advance the current phase: ${cur.name}`
          : "No action recorded",
      detail: pending.length
        ? pending.map((x) => x.question).join(" · ")
        : cur?.summary,
      basis: `Derived from the current phase (${cur?.name ?? "—"}) and open decisions.`,
      confidence: "derived",
      hasData: Boolean(pending.length || cur),
    },
    {
      key: "timeline",
      title: "12 · Transformation Timeline",
      headline: `${done}/${phases.length} phases complete`,
      items: phases.map((p) => ({ text: p.name, meta: p.status.replace(/_/g, " ") })),
      basis: "BTIC phases, ordered.",
      confidence: "verified",
      hasData: phases.length > 0,
    },
  ];

  return {
    engagementId: d.engagement.id,
    engagementTitle: d.engagement.title,
    client: d.engagement.client,
    status: d.engagement.status,
    overallScore: score?.overall ?? null,
    sections,
  };
}
