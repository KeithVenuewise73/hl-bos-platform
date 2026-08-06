// Transformation Report view-model — the contract between the analysis engine
// and every customer-facing stage of the journey.
//
// WHY THIS EXISTS: the customer journey is a pipeline —
//   analysis → report → blueprint → implement → measure → subscription
// The report page reads THIS view-model, not the raw engine, so new stages
// consume a stable shape. Every field is derived from a REAL engine value:
//   • scores/benchmarks/confidence come from analyzeBusiness's scorecard
//   • findings, evidence, claims (FACT/INFERENCE/OPINION), roadmap come from
//     generateConsultingReport
//   • recommendations are evidence-gated (no finding → no recommendation)
// Nothing quantitative is invented. Anything the engine cannot measure is stated
// as "not yet measured" rather than converted into a confident claim. The only
// authored copy is qualitative EDITORIAL FRAMING of findings that already exist —
// never a number, and always shown beside the real evidence and claim class.

import type { analyst, consulting } from "@hl-bos/bti-engine";

type BusinessAnalysis = analyst.BusinessAnalysis;
type ScorecardEntry = analyst.ScorecardEntry;
type Finding = consulting.Finding;
type Priority = consulting.Priority;
type RoadmapItem = consulting.RoadmapItem;

// ---- Workflow stages (the expandable spine) -------------------------------

export type StageId =
  "analysis" | "report" | "blueprint" | "implement" | "measure" | "subscription";
export type StageStatus = "done" | "active" | "available" | "planned";
export interface WorkflowStage {
  id: StageId;
  title: string;
  blurb: string;
  status: StageStatus;
}

export function workflowStages(): WorkflowStage[] {
  return [
    {
      id: "analysis",
      title: "AI Business Scan",
      blurb: "We read your live website and score every dimension from real signals.",
      status: "done",
    },
    {
      id: "report",
      title: "Transformation Report",
      blurb: "Evidence-backed findings, business impact, and the fix for each.",
      status: "active",
    },
    {
      id: "blueprint",
      title: "Transformation Blueprint",
      blurb: "Your prioritized 30-day, 90-day, and 12-month plan.",
      status: "available",
    },
    {
      id: "implement",
      title: "Implement",
      blurb: "Turn each recommendation into a Herman Legacy engagement.",
      status: "available",
    },
    {
      id: "measure",
      title: "Measure Results",
      blurb: "Track revenue, visibility, leads, and your Transformation Score.",
      status: "planned",
    },
    {
      id: "subscription",
      title: "Executive Operating System",
      blurb: "The daily operating system that keeps improving your business.",
      status: "planned",
    },
  ];
}

// ---- View types -----------------------------------------------------------

export type ConfidenceLabel = "High" | "Moderate" | "Low";
export type ClaimClass = "Fact" | "Inference" | "Opinion";

export interface ClaimView {
  type: ClaimClass;
  text: string;
}

export interface ScorecardRow {
  label: string;
  dimension: string;
  score: number; // 0-100
  benchmark: number; // 0-100
  status: ScorecardEntry["status"];
  statusLabel: string;
  confidence: ConfidenceLabel;
  interpretation: string;
}

export interface ReportFinding {
  id: string;
  title: string;
  dimension: string;
  priority: Priority;
  severity: number;
  problem: string;
  evidence: string[];
  businessImpact: string;
  recommendedAction: string;
  expectedOutcome: string;
  effort: string;
  timeline: string;
  confidence: ConfidenceLabel;
  solutions: string[];
  claims: ClaimView[];
}

export interface PriorityRow {
  priority: Priority;
  issue: string;
  whyItMatters: string;
  action: string;
  solution: string;
  timing: string;
  confidence: ConfidenceLabel;
}

export interface RecommendedTransformation {
  product: string;
  outcome: string;
  whyRecommended: string;
  supportedBy: string[];
  effort: string;
  timeline: string;
  price: string; // "To be confirmed" — no fabricated pricing
  roi: string; // "Not quantified…" unless financials were supplied
  type: "recurring" | "one_time";
}

export interface HorizonPlan {
  key: "immediate" | "shortTerm" | "mediumTerm" | "longTerm";
  window: string;
  objective: string;
  actions: string[];
  expectedChange: string;
  solutions: string[];
  dependencies: string;
  evidenceRequired: string;
  items: { label: string; action: string; priority: Priority }[];
}

export interface RoiView {
  quantified: boolean;
  lines: { label: string; value: number | null; unit: string; note: string }[];
  note: string;
}

export interface ExecutiveBriefing {
  situation: string;
  primaryConstraint: string;
  businessConsequence: string;
  pathForward: string;
}

export interface TransformationReportView {
  business: { name: string; website: string; industry: string; location?: string };
  analyzedAtIso: string;
  score: number | null;
  scoreBand: string | null;
  headline: string;
  criticalHighCount: number;
  dimensionsBelowBenchmark: number;
  dimensionsTotal: number;
  evidenceLimitation: string;
  executiveBriefing: ExecutiveBriefing;
  scorecard: ScorecardRow[];
  findings: ReportFinding[];
  priorityTable: PriorityRow[];
  recommendedTransformations: RecommendedTransformation[];
  recommendedProducts: string[];
  roi: RoiView;
  horizons: HorizonPlan[];
  timelineSummary: string;
  coverageNote: string;
  stages: WorkflowStage[];
  next: { stage: StageId; cta: string; href: string };
  secondary: { cta: string; href: string };
  meta: {
    engineVersion: string;
    dimensionsRated: number;
    findingsGenerated: number;
    factCount: number;
    inferenceCount: number;
    opinionCount: number;
  };
}

// ---- Derivation helpers ---------------------------------------------------

const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const TIMELINE_LABEL: Record<string, string> = {
  immediate: "0–30 days",
  short_term: "30–90 days",
  medium_term: "3–6 months",
  long_term: "6–12 months",
};
const DIFFICULTY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Moderate",
  high: "High",
};
const CONFIDENCE_LABEL: Record<string, ConfidenceLabel> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
};
const STATUS_LABEL: Record<ScorecardEntry["status"], string> = {
  strength: "Strength",
  below_benchmark: "Below benchmark",
  critical: "Critical gap",
};

// Editorial framing for the website dimensions the engine actually rates. Each
// entry is a business-oriented headline + a plain-language problem statement for
// a finding that ALREADY EXISTS (weak dimensions only). Qualitative only — never
// a number — and always shown beside the engine's real evidence and claim class.
const DIMENSION_COPY: Record<string, { headline: string; problem: string }> = {
  ai_search_optimization: {
    headline: "Your business is hard for AI answer engines to cite",
    problem:
      "AI assistants increasingly answer buyer questions from structured data. With little on your site for them to read, you are often left out of the answer entirely.",
  },
  seo: {
    headline: "Search engines can't fully understand or rank your site",
    problem:
      "Weak on-page and technical SEO foundations keep you from ranking for the terms your buyers actually search.",
  },
  google_business_profile: {
    headline: "Your local presence is sending weak signals",
    problem:
      "Buyers searching locally lean on profile and location signals your site isn't reinforcing, so you surface less often at the moment of intent.",
  },
  social_media: {
    headline: "Your social presence is thin or unmanaged",
    problem:
      "Few visible social signals mean less reach and weaker trust while buyers are still researching you.",
  },
  content: {
    headline: "Your content gives buyers little reason to choose you",
    problem:
      "Limited, unstructured content leaves both buyers and search engines without the depth that builds authority and answers real questions.",
  },
  conversion: {
    headline: "Visitors have no clear path to act",
    problem:
      "Without a strong conversion path, the traffic you already earn tends to leave without converting into inquiries.",
  },
  lead_generation: {
    headline: "Your site isn't capturing leads",
    problem:
      "With no on-page capture, interested visitors have no easy way to become an inquiry — and you can't measure the demand you're losing.",
  },
  website: {
    headline: "Your website underperforms as a sales asset",
    problem:
      "Gaps in speed, clarity, or conversion blunt the impact of everything else you invest in growth.",
  },
  technology_stack: {
    headline: "Your growth technology is fragmented",
    problem:
      "A disconnected marketing stack makes it hard to attribute results and act on what's working.",
  },
  security: {
    headline: "Security gaps put customer trust at risk",
    problem:
      "Weaknesses in access control or data protection can undermine trust and expose the business to avoidable risk.",
  },
};

// Outcome framing for Herman Legacy products — the result each delivers, not a
// label. Products without an entry fall back to a rationale derived from the
// findings that justify them (still evidence-gated).
const PRODUCT_OUTCOME: Record<string, string> = {
  VisibilityAI: "Improve findability across traditional and AI-assisted search.",
  "Herman Legacy Digital": "Turn existing traffic into measurable inquiries.",
  "Website Transformation": "Turn existing traffic into measurable inquiries.",
  "Reputation Engine": "Strengthen trust and lift conversion at the decision point.",
  "Reputation Management":
    "Strengthen trust and lift conversion at the decision point.",
  "Marketing Studio":
    "Build consistent demand through evidence-led content and campaigns.",
  "Marketing Services":
    "Build consistent demand through evidence-led content and campaigns.",
  SEO: "Rank for the terms your buyers search and grow qualified organic traffic.",
  "AI Automation": "Remove manual work and speed up follow-up so fewer leads slip.",
};

function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : text).trim();
}

function scoreBand(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 80) return "Strong";
  if (score >= 60) return "Developing";
  if (score >= 40) return "At risk";
  return "Critical";
}

function findingTitle(f: Finding): string {
  return DIMENSION_COPY[f.dimension]?.headline ?? capitalize(f.rootCause);
}
function findingProblem(f: Finding): string {
  return DIMENSION_COPY[f.dimension]?.problem ?? f.businessImpact;
}
function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function mapFinding(f: Finding, i: number): ReportFinding {
  const evidence = f.supportingEvidence
    .filter((e) => e.startsWith("Attached evidence:"))
    .map((e) => e.replace(/^Attached evidence:\s*/, ""));
  const ratingEvidence = f.supportingEvidence.filter(
    (e) => !e.startsWith("Attached evidence:"),
  );
  return {
    id: `${f.domain}.${f.dimension}.${i}`,
    title: findingTitle(f),
    dimension: f.label,
    priority: f.priority,
    severity: f.severity,
    problem: findingProblem(f),
    evidence: evidence.length > 0 ? evidence : ratingEvidence,
    businessImpact: f.businessImpact,
    recommendedAction: f.recommendedAction,
    expectedOutcome:
      f.successMetrics.length > 0
        ? `Measured by: ${f.successMetrics.join("; ")}.`
        : "Improvement measured against benchmark.",
    effort: DIFFICULTY_LABEL[f.difficulty] ?? f.difficulty,
    timeline: TIMELINE_LABEL[f.timeline] ?? f.timeline,
    confidence: CONFIDENCE_LABEL[confidenceFromClaims(f)] ?? "Moderate",
    solutions: f.services,
    claims: f.claims.map((c) => ({
      type: capitalize(c.type) as ClaimClass,
      text: c.text,
    })),
  };
}

// Use the engine's own confidence signal: a finding backed by attached evidence
// reads High; a bare extreme rating reads Low; otherwise Moderate. (Mirrors
// consulting/priority.ts confidenceOf, applied to this finding's evidence.)
function confidenceFromClaims(f: Finding): "high" | "moderate" | "low" {
  const hasAttached = f.supportingEvidence.some((e) =>
    e.startsWith("Attached evidence:"),
  );
  if (hasAttached) return "high";
  if (f.rating === 0) return "low";
  return "moderate";
}

function buildExecutiveBriefing(
  view: {
    name: string;
    score: number | null;
    band: string | null;
    below: number;
    strengths: number;
    total: number;
  },
  findings: ReportFinding[],
  horizons: HorizonPlan[],
): ExecutiveBriefing {
  const scoreClause =
    view.score === null
      ? "was not scored"
      : `scores ${view.score} out of 100 (${view.band})`;
  const situation =
    `${view.name}'s website ${scoreClause}. Of the ${view.total} dimensions we can observe from your site, ` +
    `${view.below} sit below benchmark and ${view.strengths} are already at or above it.`;

  if (findings.length === 0) {
    return {
      situation,
      primaryConstraint:
        "No critical or high-priority weaknesses were detected in this website scan.",
      businessConsequence:
        "The larger opportunities are likely in operations, financials, or AI-readiness — areas a website scan cannot observe.",
      pathForward:
        "Maintain these strengths and book a deeper assessment (documents or a short interview) to quantify the next tier of opportunity.",
    };
  }

  const top = findings[0]!;
  const second = findings[1];
  const primaryConstraint = `Your most urgent constraint is in ${top.dimension.toLowerCase()}: ${top.title.toLowerCase()}.${second ? ` A related high-priority gap sits in ${second.dimension.toLowerCase()}.` : ""}`;
  const businessConsequence = `${top.businessImpact}${second ? ` Compounding this, ${second.businessImpact.toLowerCase()}` : ""}`;

  const immediate = horizons.find((h) => h.key === "immediate");
  const firstMoves =
    immediate && immediate.actions.length > 0
      ? immediate.actions.slice(0, 2)
      : findings.slice(0, 2).map((f) => f.recommendedAction);
  const pathForward = `The fastest return comes from the first moves in your Blueprint — ${firstMoves.map((a) => a.toLowerCase()).join("; ")} — each verifiable in the first 30 days.`;

  return { situation, primaryConstraint, businessConsequence, pathForward };
}

function mapHorizon(
  key: HorizonPlan["key"],
  window: string,
  objective: string,
  items: RoadmapItem[],
  findingsByDim: Map<string, ReportFinding>,
  isFirst: boolean,
): HorizonPlan {
  const solutions = [
    ...new Set(items.flatMap((i) => findingsByDim.get(i.dimension)?.solutions ?? [])),
  ];
  const dims = [...new Set(items.map((i) => i.label))];
  return {
    key,
    window,
    objective,
    actions: items.map((i) => i.action),
    expectedChange:
      dims.length > 0
        ? `Measurable improvement in ${dims.join(", ")}.`
        : "No scheduled change in this window.",
    solutions,
    dependencies: isFirst
      ? "None — can begin immediately."
      : "Builds on the prior phase.",
    evidenceRequired:
      items.length > 0
        ? "None — every action is grounded in observed website signals."
        : "Additional data required to plan this window.",
    items: items.map((i) => ({
      label: i.label,
      action: i.action,
      priority: i.priority,
    })),
  };
}

// ---- Main builder ---------------------------------------------------------

export function buildReportView(
  analysis: BusinessAnalysis,
  opts?: { analyzedAtIso?: string },
): TransformationReportView {
  const { report, business, proposal, coverageNote, scorecard } = analysis;

  const findings: ReportFinding[] = report.findings
    .slice()
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        b.severity - a.severity,
    )
    .map(mapFinding);

  const scorecardRows: ScorecardRow[] = scorecard
    .slice()
    .sort((a, b) => a.score - b.score)
    .map((s) => ({
      label: s.label,
      dimension: s.dimension,
      score: s.score,
      benchmark: s.benchmark,
      status: s.status,
      statusLabel: STATUS_LABEL[s.status],
      confidence: CONFIDENCE_LABEL[s.confidence] ?? "Moderate",
      interpretation: s.interpretation,
    }));

  const dimensionsBelowBenchmark = scorecard.filter((s) => !s.isStrength).length;
  const dimensionsTotal = scorecard.length;
  const strengths = dimensionsTotal - dimensionsBelowBenchmark;
  const criticalHighCount = findings.filter(
    (f) => f.priority === "critical" || f.priority === "high",
  ).length;

  // Findings indexed by dimension key for blueprint/solution joins.
  const findingsByDim = new Map<string, ReportFinding>();
  report.findings.forEach((f, i) => findingsByDim.set(f.dimension, mapFinding(f, i)));

  const horizons: HorizonPlan[] = [
    mapHorizon(
      "immediate",
      "First 30 days",
      "Fix the highest-severity, fastest-payback gaps.",
      report.roadmap.immediate,
      findingsByDim,
      true,
    ),
    mapHorizon(
      "shortTerm",
      "Days 31–90",
      "Convert visibility into measurable inquiries.",
      report.roadmap.shortTerm,
      findingsByDim,
      false,
    ),
    mapHorizon(
      "mediumTerm",
      "Months 4–6",
      "Deepen authority and operating discipline.",
      report.roadmap.mediumTerm,
      findingsByDim,
      false,
    ),
    mapHorizon(
      "longTerm",
      "Months 7–12",
      "Compound results and operate on intelligence.",
      report.roadmap.longTerm,
      findingsByDim,
      false,
    ),
  ];

  const executiveBriefing = buildExecutiveBriefing(
    {
      name: business.name,
      score: report.transformationScore,
      band: scoreBand(report.transformationScore),
      below: dimensionsBelowBenchmark,
      strengths,
      total: dimensionsTotal,
    },
    findings,
    horizons,
  );

  // ROI — honest. Quantified only when the customer supplied usable financials.
  const quantifiedLines = report.financial.filter((l) => l.value !== null);
  const roi: RoiView =
    quantifiedLines.length > 0
      ? {
          quantified: true,
          lines: report.financial,
          note: "Figures below are derived from the financial inputs you provided.",
        }
      : {
          quantified: false,
          lines: [],
          note: "Financial impact not yet quantified — add your monthly revenue and operating costs to express ROI in dollars. Each finding still shows its business impact and priority.",
        };

  // Recommendations — evidence-gated; framed as outcomes; no invented price/ROI.
  const findingByService = new Map<string, ReportFinding[]>();
  for (const f of findings)
    for (const s of f.solutions) {
      const arr = findingByService.get(s) ?? [];
      arr.push(f);
      findingByService.set(s, arr);
    }
  const recommendedTransformations: RecommendedTransformation[] = proposal.lines.map(
    (l) => {
      const supporting = findingByService.get(l.service) ?? [];
      const earliest = supporting
        .map((f) => f.timeline)
        .sort((a, b) => timelineRank(a) - timelineRank(b))[0];
      const efforts = [...new Set(supporting.map((f) => f.effort))];
      return {
        product: l.service,
        outcome:
          PRODUCT_OUTCOME[l.service] ??
          `Addresses ${l.supportedBy.length} finding(s) on your site.`,
        whyRecommended: `Recommended because ${l.supportedBy.length} finding(s) require it: ${l.supportedBy.join(", ")}.`,
        supportedBy: l.supportedBy,
        effort: efforts.length === 1 ? efforts[0]! : "Scoped during onboarding",
        timeline: earliest ?? "To be scheduled",
        price: "To be confirmed",
        roi: roi.quantified
          ? "See financial impact section"
          : "Not quantified without financial inputs",
        type: l.type,
      };
    },
  );

  const critical = criticalHighCount;
  const headline =
    findings.length === 0
      ? `${business.name}'s website shows no critical weaknesses in this scan.`
      : `${business.name} has ${findings.length} measurable ${findings.length === 1 ? "opportunity" : "opportunities"}${critical > 0 ? `, ${critical} of them high priority` : ""}.`;

  const immediateCount = report.roadmap.immediate.length;
  const timelineSummary =
    immediateCount > 0
      ? `${immediateCount} improvement${immediateCount === 1 ? "" : "s"} can begin in the first 30 days, with the full transformation staged across 12 months.`
      : "Your transformation is staged across the next 12 months.";

  const priorityTable: PriorityRow[] = findings.map((f) => ({
    priority: f.priority,
    issue: f.title,
    whyItMatters: firstSentence(f.businessImpact),
    action: f.recommendedAction,
    solution: f.solutions[0] ?? "—",
    timing: f.timeline,
    confidence: f.confidence,
  }));

  const evidenceLimitation =
    "This report is based on your public website only. Financial impact, competitor performance, live search rankings, Google Business Profile status, reviews, backlinks, and Core Web Vitals are not yet measured and are marked as such — never estimated.";

  return {
    business,
    analyzedAtIso: opts?.analyzedAtIso ?? "",
    score: report.transformationScore,
    scoreBand: scoreBand(report.transformationScore),
    headline,
    criticalHighCount,
    dimensionsBelowBenchmark,
    dimensionsTotal,
    evidenceLimitation,
    executiveBriefing,
    scorecard: scorecardRows,
    findings,
    priorityTable,
    recommendedTransformations,
    recommendedProducts: proposal.recommendedServices,
    roi,
    horizons,
    timelineSummary,
    coverageNote,
    stages: workflowStages(),
    next: {
      stage: "blueprint",
      cta: "Build My Transformation Blueprint",
      href: "/transformation-blueprint",
    },
    secondary: { cta: "Speak With a Herman Legacy Advisor", href: "/book" },
    meta: {
      engineVersion: report.meta.engineVersion,
      dimensionsRated: report.meta.dimensionsRated,
      findingsGenerated: report.meta.findingsGenerated,
      factCount: report.meta.factCount,
      inferenceCount: report.meta.inferenceCount,
      opinionCount: report.meta.opinionCount,
    },
  };
}

function timelineRank(label: string): number {
  const order = ["0–30 days", "30–90 days", "3–6 months", "6–12 months"];
  const i = order.indexOf(label);
  return i === -1 ? 99 : i;
}
