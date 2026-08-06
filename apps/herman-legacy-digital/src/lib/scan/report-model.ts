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
import { goalById, type DiscoveryGoal } from "./discovery";
import {
  optionsFor,
  classifyRootCause,
  recommend,
  type FindingReasoning,
} from "./reasoning";

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
  goalAligned: boolean; // this finding directly bears on the customer's stated goal
  reasoning: FindingReasoning; // root cause → options → comparative recommendation
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

// The Executive Discovery answer + the Current → Desired → Gap spine it drives.
export interface Discovery {
  hasGoal: boolean;
  goalLabel?: string; // the customer's own words / chosen goal
  desiredState?: string; // "what success looks like"
  ownWords?: string; // optional free-text the customer typed
  observable: boolean; // whether the website scan can substantially assess it
}

export interface TransformationSpine {
  currentState: string;
  desiredState: string; // present when a goal was captured; else a neutral prompt
  theGap: string;
}

export interface SynthesisTheme {
  name: string;
  summary: string;
  findings: string[]; // the finding titles that fall under this theme
  solutions: string[];
}

export interface TransformationScope {
  assessed: { area: string; note: string }[];
  notYetAssessed: { area: string; note: string }[];
}

// A consulting engagement the prospect can choose to begin with. This is a
// sales-process step, NOT a checkout: no prices are fabricated, and investment is
// scoped in a conversation.
export interface EngagementTrack {
  id: string;
  name: string;
  outcome: string; // the business result, not the service label
  covers: string[]; // the prospect's own findings/areas this track addresses
  timeline: string; // qualitative, honest
  investment: string; // engagement shape — never a fabricated price
  recommended: boolean; // the one "we'd begin here"
}

export interface EngagementPlan {
  recommendedId: string;
  recommendationReason: string;
  tracks: EngagementTrack[];
}

export interface TransformationReportView {
  business: { name: string; website: string; industry: string; location?: string };
  analyzedAtIso: string;
  pagesAnalyzed: number;
  score: number | null;
  scoreBand: string | null;
  scoreExplanation: string;
  headline: string;
  criticalHighCount: number;
  dimensionsBelowBenchmark: number;
  dimensionsTotal: number;
  evidenceLimitation: string;
  discovery: Discovery;
  transformation: TransformationSpine;
  executiveBriefing: ExecutiveBriefing;
  executiveOutcomes: string[];
  engagement: EngagementPlan;
  connectedInsight: string;
  synthesisThemes: SynthesisTheme[];
  transformationScope: TransformationScope;
  whyHermanLegacy: string[];
  beginNow: string;
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
const DIMENSION_COPY: Record<
  string,
  { headline: string; problem: string; impact: string }
> = {
  ai_search_optimization: {
    headline: "Your business is hard for AI answer engines to cite",
    problem:
      "AI assistants increasingly answer buyer questions from structured data. With little on your site for them to read, you are often left out of the answer entirely.",
    impact:
      "As buyers shift to AI-assisted search, demand that begins as an AI query never reaches you.",
  },
  seo: {
    headline: "Search engines can't fully understand or rank your site",
    problem:
      "Weak on-page and technical SEO foundations keep you from ranking for the terms your buyers actually search.",
    impact:
      "You miss qualified traffic from buyers who are actively searching for what you offer.",
  },
  google_business_profile: {
    headline: "Your local presence is sending weak signals",
    problem:
      "Buyers searching locally lean on profile and location signals your site isn't reinforcing, so you surface less often at the moment of intent.",
    impact: "You lose local buyers at the exact moment they are choosing who to call.",
  },
  social_media: {
    headline: "Your social presence is thin or unmanaged",
    problem:
      "Few visible social signals mean less reach and weaker trust while buyers are still researching you.",
    impact:
      "You forfeit reach and social proof while prospects are still deciding whether to trust you.",
  },
  content: {
    headline: "Your content gives buyers little reason to choose you",
    problem:
      "Limited, unstructured content leaves both buyers and search engines without the depth that builds authority and answers real questions.",
    impact:
      "Without depth, prospects can't tell why you're the better choice — and neither can search engines.",
  },
  conversion: {
    headline: "Visitors have no clear path to act",
    problem:
      "Without a strong conversion path, the traffic you already earn tends to leave without converting into inquiries.",
    impact:
      "Traffic you already pay for or earn leaves without ever becoming a conversation.",
  },
  lead_generation: {
    headline: "Your site isn't capturing leads",
    problem:
      "With no on-page capture, interested visitors have no easy way to become an inquiry — and you can't measure the demand you're losing.",
    impact:
      "Interested visitors have no way to raise their hand, so demand goes uncounted and uncaptured.",
  },
  website: {
    headline: "Your website underperforms as a sales asset",
    problem:
      "Gaps in speed, clarity, or conversion blunt the impact of everything else you invest in growth.",
    impact:
      "Every marketing dollar works harder or softer depending on this — and right now it's leaking.",
  },
  technology_stack: {
    headline: "Your growth technology is fragmented",
    problem:
      "A disconnected marketing stack makes it hard to attribute results and act on what's working.",
    impact:
      "You can't see what's working, so budget and effort flow to places you can't measure.",
  },
  security: {
    headline: "Security gaps put customer trust at risk",
    problem:
      "Weaknesses in access control or data protection can undermine trust and expose the business to avoidable risk.",
    impact:
      "A trust or security lapse can cost a deal — or a reputation — in an instant.",
  },
};

// Business themes that connect individual website findings into one story — so
// the report reads as Business Transformation, not a channel-by-channel audit.
// Each dimension maps to exactly one theme.
const THEMES: { key: string; name: string; dims: string[]; summary: string }[] = [
  {
    key: "visibility",
    name: "Visibility & Findability",
    dims: ["ai_search_optimization", "seo", "google_business_profile"],
    summary:
      "How easily buyers find you at the moment of intent — in search, on maps, and now in AI answers.",
  },
  {
    key: "acquisition",
    name: "Customer Acquisition & Conversion",
    dims: ["lead_generation", "conversion", "website"],
    summary:
      "Whether the interest you earn turns into inquiries you can measure and win.",
  },
  {
    key: "reputation",
    name: "Content, Brand & Reputation",
    dims: ["content", "social_media"],
    summary:
      "The authority and trust that make a buyer choose you over the alternative.",
  },
  {
    key: "foundation",
    name: "Digital Foundation & Security",
    dims: ["technology_stack", "security"],
    summary: "The reliability and instrumentation everything else depends on.",
  },
];

// The full Business Transformation surface. A website scan can only observe the
// digital front door; these deeper areas are HONESTLY marked not-yet-assessed —
// unknown stays unknown — and are the reason Herman Legacy is a transformation
// partner, not an SEO vendor.
const TRANSFORMATION_SCOPE_UNSEEN: { area: string; note: string }[] = [
  {
    area: "Operations & Workflow",
    note: "Not yet assessed — requires a short operations review.",
  },
  {
    area: "AI Readiness & Automation",
    note: "Not yet assessed — requires a look at your tools and workflows.",
  },
  {
    area: "Internal Efficiency",
    note: "Not yet assessed — requires a process walkthrough.",
  },
  {
    area: "Financial Performance & ROI",
    note: "Not yet assessed — requires your financial inputs.",
  },
  {
    area: "Long-term Growth Strategy",
    note: "Not yet assessed — defined in a full Transformation Assessment.",
  },
];

const WHY_HERMAN_LEGACY: string[] = [
  "We connect the whole business — visibility, acquisition, reputation, operations, and AI — not one channel in isolation.",
  "Every finding is backed by evidence from your own site and labeled fact, inference, or opinion. We never invent a number.",
  "You leave with a staged plan — 30 days, 90 days, 12 months — not a list of problems.",
  "We implement, not just advise: the team that finds it fixes it, and keeps improving it month over month.",
];

// The business OUTCOME each weak dimension maps to — for the Executive Opportunity
// Summary ("outcomes we believe we can realistically improve"). Qualitative only,
// no fabricated numbers; framed as what a CEO buys, not what an SEO does.
const OUTCOME_BY_DIM: Record<string, string> = {
  ai_search_optimization:
    "Show up when buyers ask AI assistants for a business like yours.",
  seo: "Rank for the searches your buyers are already making.",
  google_business_profile:
    "Win more local buyers at the moment they're choosing who to call.",
  lead_generation: "Capture more of the interest your site already attracts.",
  conversion: "Turn more of your visitors into real inquiries.",
  content: "Give buyers a clear reason to choose you over the alternative.",
  social_media: "Build visible trust while buyers are still deciding.",
  website: "Make your website a measurable sales asset, not a brochure.",
  technology_stack: "See what's working so budget flows to what performs.",
  security: "Protect the trust your brand depends on.",
};

// The consulting engagements a prospect can begin with. `dims` ties each track to
// the prospect's real findings so the recommendation is evidence-driven, never a
// blind upsell. Investment is an engagement SHAPE, never a fabricated price.
const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};
interface TrackDef {
  id: string;
  name: string;
  outcome: string;
  dims: string[]; // empty = spans everything (the complete program)
  timeline: string;
  investment: string;
}
const SPRINT_INVEST =
  "A focused sprint or an ongoing monthly partnership — scoped with you in the strategy session.";
const TRACK_DEFS: TrackDef[] = [
  {
    id: "visibility_seo",
    name: "Visibility & SEO",
    outcome: "Get found by buyers in search, on maps, and in AI answers.",
    dims: ["ai_search_optimization", "seo", "google_business_profile"],
    timeline: "First visibility gains in 30–90 days; compounding over 3–6 months.",
    investment: SPRINT_INVEST,
  },
  {
    id: "ai_transformation",
    name: "AI Business Transformation",
    outcome: "Put AI to work in how you're found and how you operate.",
    dims: ["ai_search_optimization", "technology_stack"],
    timeline: "First AI-readiness wins in 30–90 days; staged over 6–12 months.",
    investment: SPRINT_INVEST,
  },
  {
    id: "reputation",
    name: "Reputation",
    outcome: "Build the trust and proof that make buyers choose you.",
    dims: ["content", "social_media"],
    timeline: "Momentum builds over 60–90 days as proof accumulates.",
    investment: SPRINT_INVEST,
  },
  {
    id: "crm_automation",
    name: "CRM & Automation",
    outcome: "Capture every lead and follow up automatically.",
    dims: ["lead_generation", "conversion"],
    timeline: "Live in 30–60 days; refined over the first quarter.",
    investment: SPRINT_INVEST,
  },
  {
    id: "website",
    name: "Website Modernization",
    outcome: "Turn your website into a measurable sales asset.",
    dims: ["website", "conversion", "technology_stack"],
    timeline: "A modern, converting site in 45–90 days.",
    investment: SPRINT_INVEST,
  },
  {
    id: "lead_generation",
    name: "Lead Generation",
    outcome: "Create a repeatable flow of qualified inquiries.",
    dims: ["lead_generation", "conversion", "google_business_profile"],
    timeline: "First measurable lift in 30–90 days.",
    investment: SPRINT_INVEST,
  },
  {
    id: "complete",
    name: "Complete Business Transformation",
    outcome:
      "Transform the whole business — visibility, acquisition, reputation, and operations — in one coordinated program.",
    dims: [],
    timeline: "Staged across 12 months, with the first wins in the first 30 days.",
    investment:
      "An ongoing transformation partnership — scoped with you in the strategy session.",
  },
];

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
function findingImpact(f: Finding): string {
  return DIMENSION_COPY[f.dimension]?.impact ?? f.businessImpact;
}
function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function mapFinding(f: Finding, i: number, goal?: DiscoveryGoal): ReportFinding {
  const goalDims = goal?.dims ?? [];
  const attached = f.supportingEvidence.filter((e) =>
    e.startsWith("Attached evidence:"),
  );
  const evidence = attached.map((e) => e.replace(/^Attached evidence:\s*/, ""));
  const ratingEvidence = f.supportingEvidence.filter(
    (e) => !e.startsWith("Attached evidence:"),
  );
  const confidence = CONFIDENCE_LABEL[confidenceFromClaims(f)] ?? "Moderate";
  const goalAligned = goalDims.includes(f.dimension);
  const options = optionsFor(f.dimension);
  const reasoning: FindingReasoning = {
    rootCause: classifyRootCause(f.rootCause, attached.length > 0),
    options,
    recommendation: recommend(options, f.severity, confidence, {
      ...(evidence[0] ? { evidenceHint: evidence[0] } : {}),
      rootCause: f.rootCause,
      successMetrics: f.successMetrics,
      fallbackAction: f.recommendedAction,
      ...(goal
        ? {
            goal: {
              desiredState: goal.desiredState,
              observable: goal.observable,
              aligned: goalAligned,
            },
          }
        : {}),
    }),
  };
  return {
    id: `${f.domain}.${f.dimension}.${i}`,
    title: findingTitle(f),
    dimension: f.label,
    priority: f.priority,
    severity: f.severity,
    problem: findingProblem(f),
    evidence: evidence.length > 0 ? evidence : ratingEvidence,
    businessImpact: findingImpact(f),
    recommendedAction: f.recommendedAction,
    expectedOutcome:
      f.successMetrics.length > 0
        ? `Measured by: ${f.successMetrics.join("; ")}.`
        : "Improvement measured against benchmark.",
    effort: DIFFICULTY_LABEL[f.difficulty] ?? f.difficulty,
    timeline: TIMELINE_LABEL[f.timeline] ?? f.timeline,
    confidence,
    solutions: f.services,
    claims: f.claims.map((c) => ({
      type: capitalize(c.type) as ClaimClass,
      text: c.text,
    })),
    goalAligned,
    reasoning,
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

// Group findings into business themes so the report reads as one connected story.
function buildThemes(
  engineFindings: Finding[],
  byDim: Map<string, ReportFinding>,
): SynthesisTheme[] {
  const out: SynthesisTheme[] = [];
  for (const t of THEMES) {
    const present = engineFindings.filter((f) => t.dims.includes(f.dimension));
    if (present.length === 0) continue;
    const findingTitles = present.map((f) => byDim.get(f.dimension)?.title ?? f.label);
    const solutions = [
      ...new Set(
        present.flatMap((f) => byDim.get(f.dimension)?.solutions ?? f.services),
      ),
    ];
    out.push({ name: t.name, summary: t.summary, findings: findingTitles, solutions });
  }
  return out;
}

// A synthesized paragraph connecting the themes — qualitative, no fabricated
// numbers. This is what makes the report read as transformation, not an audit.
function buildConnectedInsight(
  themes: SynthesisTheme[],
  findings: ReportFinding[],
  name: string,
): string {
  if (findings.length === 0 || themes.length === 0) {
    return `${name}'s website is fundamentally sound. The highest-value opportunities are most likely in areas a website scan cannot see — operations, AI readiness, and financial performance — which a full Transformation Assessment would surface.`;
  }
  const names = themes.map((t) => t.name.toLowerCase());
  const themeList =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
      : names[0]!;
  const count = findings.length;
  return `These are not isolated website issues. Across ${themes.length} connected area${themes.length === 1 ? "" : "s"} of your business — ${themeList} — ${count} finding${count === 1 ? "" : "s"} point to the same pattern: growth is lost between the moment a buyer looks for you and the moment they decide. Fixed together and in sequence, they compound; fixed piecemeal, they don't. That is the difference between a website project and a business transformation.`;
}

function buildTransformationScope(themes: SynthesisTheme[]): TransformationScope {
  return {
    assessed: themes.map((t) => ({
      area: t.name,
      note: "Assessed from your website in this scan.",
    })),
    notYetAssessed: TRANSFORMATION_SCOPE_UNSEEN,
  };
}

function buildBeginNow(findings: ReportFinding[]): string {
  if (findings.length === 0) {
    return "Your digital foundation is strong — the opportunity now is to extend that discipline into the parts of the business a website cannot show. The sooner that is mapped, the sooner it compounds.";
  }
  return "These gaps compound. As buyers move to AI-assisted and local search, every month an un-cited, hard-to-find site stays that way is demand that quietly goes elsewhere. The fastest-payback fixes can begin within 30 days — the sooner they are live, the sooner they work in your favor.";
}

// The Executive Opportunity Summary — the handful of business outcomes we believe
// we can realistically improve, derived from the real top findings. What a CEO
// buys, not a list of title tags.
function buildExecutiveOutcomes(engineFindings: Finding[]): string[] {
  const outcomes = engineFindings
    .map((f) => OUTCOME_BY_DIM[f.dimension])
    .filter((o): o is string => Boolean(o));
  const unique = [...new Set(outcomes)].slice(0, 5);
  if (unique.length > 0) return unique;
  return [
    "Extend your strong digital foundation into operations and AI.",
    "Turn your visibility advantage into a measurable pipeline.",
    "Instrument the business so every improvement can be proven.",
  ];
}

// "Choose Your Starting Point" — recommend the engagement to begin with based on
// the prospect's actual findings, so the recommendation feels inevitable, not
// sold. Deterministic; no fabricated prices.
function buildEngagement(
  engineFindings: Finding[],
  byDim: Map<string, ReportFinding>,
  distinctWeakThemes: number,
  goal: DiscoveryGoal | undefined,
): EngagementPlan {
  const scoreFor = (dims: string[]): number =>
    engineFindings
      .filter((f) => dims.includes(f.dimension))
      .reduce((s, f) => s + (PRIORITY_WEIGHT[f.priority] ?? 0), 0);

  const totalCritical = engineFindings.filter((f) => f.priority === "critical").length;

  let recommendedId: string;
  let recommendationReason: string;

  // When the customer told us their goal AND their findings support the track it
  // points to (and the picture isn't broadly critical), we begin exactly where
  // they asked — the recommendation becomes their own words made actionable.
  const goalTrack = goal ? TRACK_DEFS.find((t) => t.id === goal.trackId) : undefined;
  const goalTrackHasSupport =
    goalTrack && goalTrack.dims.length > 0 && scoreFor(goalTrack.dims) > 0;

  if (engineFindings.length === 0) {
    recommendedId = goal?.trackId ?? "ai_transformation";
    recommendationReason = goal
      ? `You told us you want ${goal.desiredState}. Your website is already strong, so we'd begin extending that strength toward exactly that outcome.`
      : "Your website is already strong, so we'd begin where the next advantage is: putting AI to work across how you're found and how you operate.";
  } else if (distinctWeakThemes >= 3 || totalCritical >= 2) {
    recommendedId = "complete";
    recommendationReason = goal
      ? `You want ${goal.desiredState}. Because the gaps span ${distinctWeakThemes} connected areas of your business, a coordinated program is the fastest path to that outcome.`
      : `Because the gaps span ${distinctWeakThemes} connected areas of your business, a coordinated program will out-perform fixing one channel at a time.`;
  } else if (goalTrackHasSupport && goalTrack) {
    recommendedId = goalTrack.id;
    recommendationReason = `You told us you want ${goal!.desiredState}. Your findings cluster in exactly the area this addresses, so it's the fastest path to that outcome.`;
  } else {
    const focused = TRACK_DEFS.filter((t) => t.dims.length > 0);
    let best = focused[0]!;
    let bestScore = -1;
    for (const t of focused) {
      const sc = scoreFor(t.dims);
      if (sc > bestScore) {
        bestScore = sc;
        best = t;
      }
    }
    recommendedId = best.id;
    recommendationReason = goal
      ? `You want ${goal.desiredState}. Your highest-priority findings cluster here, so this is the fastest path to that outcome.`
      : `Your highest-priority findings cluster here, so this is the fastest path to a result you can measure.`;
  }

  const tracks: EngagementTrack[] = TRACK_DEFS.map((t) => {
    const covers =
      t.dims.length === 0
        ? [
            `All ${engineFindings.length} finding${engineFindings.length === 1 ? "" : "s"} across your business`,
          ]
        : engineFindings
            .filter((f) => t.dims.includes(f.dimension))
            .map((f) => byDim.get(f.dimension)?.title ?? f.label);
    return {
      id: t.id,
      name: t.name,
      outcome: t.outcome,
      covers,
      timeline: t.timeline,
      investment: t.investment,
      recommended: t.id === recommendedId,
    };
  });

  return { recommendedId, recommendationReason, tracks };
}

// Answer "why was my business scored 47?" before the customer can ask it — the
// overall score is the roll-up of the dimensions below, and the biggest drag is
// named explicitly. Nothing here is invented; it reads straight off the scorecard.
function buildScoreExplanation(score: number | null, rows: ScorecardRow[]): string {
  if (score === null || rows.length === 0) return "";
  const weakest = rows
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((r) => `${r.label} (${r.score})`);
  return `Your ${score}/100 is the roll-up of the ${rows.length} dimensions below — each scored from real signals on your site. The biggest drag came from ${weakest.join(", ")}. Raise those and the score rises with them.`;
}

// The consulting spine: Current State → Desired State → The Gap. The Desired State
// is the customer's own goal (Executive Discovery); the Gap connects it to what
// the scan actually found. Qualitative, evidence-anchored, no invented numbers.
function buildTransformationSpine(
  name: string,
  score: number | null,
  band: string | null,
  scorecardRows: ScorecardRow[],
  goalAlignedFindings: ReportFinding[],
  allFindings: ReportFinding[],
  goal: DiscoveryGoal | undefined,
): TransformationSpine {
  const strengths = scorecardRows.filter((r) => r.status === "strength");
  const weakest = scorecardRows
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((r) => r.label);
  const scoreClause =
    score === null ? "was not scored in this scan" : `scores ${score}/100 (${band})`;
  const currentState =
    `Today, ${name}'s digital presence ${scoreClause}. ` +
    (strengths.length > 0
      ? `You're already strong in ${strengths
          .slice(0, 2)
          .map((s) => s.label)
          .join(" and ")}; `
      : "") +
    (weakest.length > 0 ? `the clearest drag is ${weakest.join(" and ")}.` : "");

  if (!goal) {
    return {
      currentState,
      desiredState:
        "Tell us what a better business looks like for you and we'll frame the gap against exactly that goal.",
      theGap: "",
    };
  }

  const goalFindingTitles = goalAlignedFindings.slice(0, 3).map((f) => f.title);
  const gapCore =
    goalAlignedFindings.length > 0
      ? `The gaps standing most directly between you and that goal: ${goalFindingTitles.join("; ")}.`
      : allFindings.length > 0
        ? `Your website doesn't show an obvious block to that goal, but ${allFindings.length} related gap${allFindings.length === 1 ? "" : "s"} still hold back the surrounding fundamentals.`
        : "Your website shows no obvious block to that goal.";
  const unseen = goal.observable
    ? ""
    : " Part of this goal lives in operations or finance a website scan can't see — we map that in a full assessment, and never estimate what we haven't measured.";
  const theGap = `You want ${goal.desiredState}. ${gapCore}${unseen} Closing them is the path from where you are to where you want to be.`;

  return { currentState, desiredState: goal.desiredState, theGap };
}

// ---- Main builder ---------------------------------------------------------

export function buildReportView(
  analysis: BusinessAnalysis,
  opts?: { analyzedAtIso?: string; goalId?: string; goalOwnWords?: string },
): TransformationReportView {
  const { report, business, proposal, coverageNote, scorecard } = analysis;
  const goal = goalById(opts?.goalId);
  const goalDims = goal?.dims ?? [];

  const findings: ReportFinding[] = report.findings
    .slice()
    .sort((a, b) => {
      const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (p !== 0) return p;
      // Within the same priority, findings that bear on the customer's goal first.
      const ga =
        Number(goalDims.includes(b.dimension)) - Number(goalDims.includes(a.dimension));
      if (ga !== 0) return ga;
      return b.severity - a.severity;
    })
    .map((f, i) => mapFinding(f, i, goal));

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
  report.findings.forEach((f, i) =>
    findingsByDim.set(f.dimension, mapFinding(f, i, goal)),
  );

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

  const synthesisThemes = buildThemes(report.findings, findingsByDim);
  const connectedInsight = buildConnectedInsight(
    synthesisThemes,
    findings,
    business.name,
  );
  const transformationScope = buildTransformationScope(synthesisThemes);
  const beginNow = buildBeginNow(findings);
  const executiveOutcomes = buildExecutiveOutcomes(report.findings);
  const engagement = buildEngagement(
    report.findings,
    findingsByDim,
    synthesisThemes.length,
    goal,
  );

  const scoreExplanation = buildScoreExplanation(
    report.transformationScore,
    scorecardRows,
  );
  const goalAlignedFindings = findings.filter((f) => f.goalAligned);
  const transformation = buildTransformationSpine(
    business.name,
    report.transformationScore,
    scoreBand(report.transformationScore),
    scorecardRows,
    goalAlignedFindings,
    findings,
    goal,
  );
  const ownWords = (opts?.goalOwnWords ?? "").trim();
  const discovery: Discovery = {
    hasGoal: Boolean(goal),
    ...(goal ? { goalLabel: goal.label, desiredState: goal.desiredState } : {}),
    ...(ownWords ? { ownWords } : {}),
    observable: goal?.observable ?? true,
  };

  return {
    business,
    analyzedAtIso: opts?.analyzedAtIso ?? "",
    pagesAnalyzed: analysis.pagesAnalyzed,
    score: report.transformationScore,
    scoreBand: scoreBand(report.transformationScore),
    scoreExplanation,
    headline,
    criticalHighCount,
    dimensionsBelowBenchmark,
    dimensionsTotal,
    evidenceLimitation,
    discovery,
    transformation,
    executiveBriefing,
    executiveOutcomes,
    engagement,
    connectedInsight,
    synthesisThemes,
    transformationScope,
    whyHermanLegacy: WHY_HERMAN_LEGACY,
    beginNow,
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
