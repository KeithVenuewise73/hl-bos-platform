// Transformation Report view-model — the contract between the analysis engine
// and every customer-facing stage of the journey.
//
// WHY THIS EXISTS (the "build the architecture, not every screen" instruction):
// the customer journey is a pipeline —
//   analysis → report → blueprint → implement → measure → subscription
// The engine (@hl-bos/bti-engine `analyzeBusiness`) produces stage 1-2 today.
// Rather than let the report page read the raw engine output, it reads THIS
// view-model. New stages (blueprint, marketplace, operating system) consume the
// same stable shape, so the workflow expands without reshaping what already
// ships. Every field below is derived from a REAL engine value — nothing is
// invented, and anything the engine cannot quantify stays explicitly unknown.

import type { analyst, consulting } from "@hl-bos/bti-engine";

type BusinessAnalysis = analyst.BusinessAnalysis;
type Finding = consulting.Finding;
type Priority = consulting.Priority;
type RoadmapItem = consulting.RoadmapItem;

// ---- Workflow stages (the expandable spine) -------------------------------

export type StageId =
  | "analysis"
  | "report"
  | "blueprint"
  | "implement"
  | "measure"
  | "subscription";

export type StageStatus = "done" | "active" | "available" | "planned";

export interface WorkflowStage {
  id: StageId;
  title: string;
  blurb: string;
  status: StageStatus;
}

/** The canonical journey. Status reflects what actually ships today. */
export function workflowStages(): WorkflowStage[] {
  return [
    {
      id: "analysis",
      title: "AI Business Scan",
      blurb: "We read your live website and score ten dimensions from real signals.",
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

// ---- The report view ------------------------------------------------------

export type ConfidenceLabel = "High" | "Moderate" | "Low";

export interface ReportFinding {
  id: string;
  title: string;
  dimension: string;
  priority: Priority;
  severity: number;
  businessImpact: string;
  whyItMatters: string;
  opportunity: string;
  evidence: string[];
  recommendedAction: string;
  difficulty: string;
  timeline: string;
  confidence: ConfidenceLabel;
  solutions: string[]; // Herman Legacy products that address it
}

export interface RecommendedTransformation {
  product: string;
  type: "recurring" | "one_time";
  supportedBy: string[];
}

export interface HorizonPlan {
  key: "immediate" | "shortTerm" | "mediumTerm" | "longTerm";
  window: string;
  items: { label: string; action: string; priority: Priority }[];
}

export interface RoiView {
  quantified: boolean;
  /** Present only when the customer supplied financials the engine could use. */
  lines: { label: string; value: number | null; unit: string; note: string }[];
  note: string;
}

export interface TransformationReportView {
  business: { name: string; website: string; industry: string; location?: string };
  score: number | null;
  scoreBand: string | null;
  headline: string;
  findings: ReportFinding[];
  recommendedTransformations: RecommendedTransformation[];
  recommendedProducts: string[];
  roi: RoiView;
  horizons: HorizonPlan[];
  timelineSummary: string;
  coverageNote: string;
  stages: WorkflowStage[];
  next: { stage: StageId; cta: string; href: string };
  meta: {
    engineVersion: string;
    dimensionsRated: number;
    findingsGenerated: number;
    factCount: number;
    inferenceCount: number;
    opinionCount: number;
  };
}

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

/**
 * Confidence is DERIVED transparently from the finding's own claim composition
 * and evidence — never invented. A finding grounded in FACT claims with
 * supporting evidence reads High; one resting on inference reads Moderate; an
 * opinion with no evidence reads Low. This mirrors how the engine already
 * classifies each claim (FACT / INFERENCE / OPINION).
 */
function deriveConfidence(f: Finding): ConfidenceLabel {
  const hasEvidence = f.supportingEvidence.length > 0;
  const hasFact = f.claims.some((c) => c.type === "fact");
  const onlyOpinion =
    f.claims.length > 0 && f.claims.every((c) => c.type === "opinion");
  if (hasFact && hasEvidence) return "High";
  if (onlyOpinion || !hasEvidence) return "Low";
  return "Moderate";
}

function scoreBand(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 80) return "Strong";
  if (score >= 60) return "Developing";
  if (score >= 40) return "At risk";
  return "Critical";
}

function mapHorizon(
  key: HorizonPlan["key"],
  window: string,
  items: RoadmapItem[],
): HorizonPlan {
  return {
    key,
    window,
    items: items.map((i) => ({
      label: i.label,
      action: i.action,
      priority: i.priority,
    })),
  };
}

/** Build the customer-facing report view from a live engine analysis. */
export function buildReportView(
  analysis: BusinessAnalysis,
): TransformationReportView {
  const { report, business, proposal, coverageNote } = analysis;

  const findings: ReportFinding[] = report.findings
    .slice()
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.severity - a.severity)
    .map((f, i) => ({
      id: `${f.domain}.${f.dimension}.${i}`,
      title: f.finding,
      dimension: f.label,
      priority: f.priority,
      severity: f.severity,
      businessImpact: f.businessImpact,
      whyItMatters: f.businessRisk,
      opportunity: f.opportunity,
      evidence: f.supportingEvidence,
      recommendedAction: f.recommendedAction,
      difficulty: f.difficulty,
      timeline: TIMELINE_LABEL[f.timeline] ?? f.timeline,
      confidence: deriveConfidence(f),
      solutions: f.services,
    }));

  const recommendedTransformations: RecommendedTransformation[] = proposal.lines.map(
    (l) => ({ product: l.service, type: l.type, supportedBy: l.supportedBy }),
  );

  // ROI — honest. The engine only produces financial figures when the customer
  // supplied financials; otherwise we quantify nothing and say so plainly.
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
          note: "Add your financials (monthly revenue and operating costs) to quantify ROI in dollars. Until then, each finding shows its business impact and priority.",
        };

  const horizons: HorizonPlan[] = [
    mapHorizon("immediate", "First 30 days", report.roadmap.immediate),
    mapHorizon("shortTerm", "30–90 days", report.roadmap.shortTerm),
    mapHorizon("mediumTerm", "3–6 months", report.roadmap.mediumTerm),
    mapHorizon("longTerm", "6–12 months", report.roadmap.longTerm),
  ];

  const immediateCount = report.roadmap.immediate.length;
  const timelineSummary =
    immediateCount > 0
      ? `${immediateCount} improvement${immediateCount === 1 ? "" : "s"} can begin in the first 30 days, with the full transformation staged across 12 months.`
      : "Your transformation is staged across the next 12 months.";

  const critical = findings.filter(
    (f) => f.priority === "critical" || f.priority === "high",
  ).length;
  const headline =
    findings.length === 0
      ? `${business.name}'s website shows no critical weaknesses in this scan.`
      : `${business.name} has ${findings.length} measurable ${findings.length === 1 ? "opportunity" : "opportunities"}${critical > 0 ? `, ${critical} of them high priority` : ""}.`;

  return {
    business,
    score: report.transformationScore,
    scoreBand: scoreBand(report.transformationScore),
    headline,
    findings,
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
