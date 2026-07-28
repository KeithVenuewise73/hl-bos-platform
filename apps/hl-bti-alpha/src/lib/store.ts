// HL-BTI Alpha — the local workspace store.
//
// This is the presentation/workflow layer's data model. It REUSES the canonical
// deterministic engine (@hl-bos/bti-engine) for all scoring, lifecycle, growth
// and blueprint logic — it does not re-implement any of it. Persistence is the
// browser's localStorage ("Alpha local workspace"), NOT a live database. When
// the bti schema is applied to a project, these same operations map 1:1 to the
// bti.* RPCs (open_engagement, rate_dimension, compute_scores, advance_stage, …).
//
// Honesty: nothing here fabricates a score, a metric, or a customer interaction.
// Scores come only from ratings actually entered; empty things read as empty.
// The one exception is Venuewise, seeded as a clearly-labelled DEMONSTRATION.

import {
  DOMAINS,
  DOMAIN_WEIGHTS,
  canAdvance,
  computeScorecard,
  analyzeGrowth,
  assembleExecutiveBlueprint,
  nextStage,
  type DomainKey,
  type Stage,
  type EngagementMode,
  type DimensionRating,
  type ExecutiveScorecard,
  type ExecutiveBlueprint,
  type GrowthIntelligenceResult,
} from "@hl-bos/bti-engine";

export const WORKSPACE_VERSION = 3;

export interface Business {
  id: string;
  key: string;
  name: string;
  industry: string;
  pack: string;
  analysisOnly: boolean;
  dashboardVisible: boolean;
  demo: boolean;
}

export interface EvidenceItem {
  domain: DomainKey;
  dimension: string;
  label: string;
}

export interface Assessment {
  ratings: Partial<Record<DomainKey, Record<string, number>>>;
  notes: Partial<Record<DomainKey, string>>;
  evidence: EvidenceItem[];
  completed: boolean;
}

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
}
export type MilestoneStatus = "pending" | "active" | "completed" | "blocked";
export interface Milestone {
  id: string;
  name: string;
  status: MilestoneStatus;
  tasks: Task[];
}
export type ProjectStatus = "planned" | "active" | "on_hold" | "completed";
export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  milestones: Milestone[];
}

export type RoiStatus = "baseline" | "projected" | "realized";
export interface RoiMetric {
  id: string;
  label: string;
  unit: string;
  baseline: number | null;
  projected: number | null;
  realized: number | null;
  status: RoiStatus;
}

export interface ProposalLine {
  label: string;
  type: "one_time" | "recurring";
  amount: number;
}
export interface Proposal {
  status: "draft" | "internal_review" | "ready_for_customer" | "accepted" | "declined";
  signatureStatus: "not_sent" | "sent" | "signed";
  lines: ProposalLine[];
}

export interface TimelineEntry {
  at: string;
  label: string;
}

export interface Engagement {
  id: string;
  businessId: string;
  mode: EngagementMode;
  stage: Stage;
  assessment: Assessment;
  projects: Project[];
  roi: RoiMetric[];
  proposal: Proposal | null;
  notes: string;
  demo: boolean;
  timeline: TimelineEntry[];
}

export interface Workspace {
  version: number;
  businesses: Business[];
  engagements: Engagement[];
}

// A stable id generator that does not use Date.now/Math.random at module load.
let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}${(counter * 2654435761).toString(36).slice(-4)}`;
}

function emptyAssessment(): Assessment {
  return { ratings: {}, notes: {}, evidence: [], completed: false };
}

// ---- reads (pure) ---------------------------------------------------------

export function businessById(ws: Workspace, id: string): Business | undefined {
  return ws.businesses.find((b) => b.id === id);
}
export function engagementById(ws: Workspace, id: string): Engagement | undefined {
  return ws.engagements.find((e) => e.id === id);
}
export function engagementsForBusiness(
  ws: Workspace,
  businessId: string,
): Engagement[] {
  return ws.engagements.filter((e) => e.businessId === businessId);
}
export function latestEngagement(
  ws: Workspace,
  businessId: string,
): Engagement | undefined {
  const list = engagementsForBusiness(ws, businessId);
  return list.length ? list[list.length - 1] : undefined;
}

function ratingList(a: Assessment): DimensionRating[] {
  const out: DimensionRating[] = [];
  for (const domain of DOMAINS) {
    const r = a.ratings[domain.key];
    if (!r) continue;
    for (const dim of domain.dimensions) {
      const v = r[dim.key];
      if (typeof v === "number")
        out.push({
          domain: domain.key,
          dimension: dim.key,
          rating: v,
          weight: dim.weight,
        });
    }
  }
  return out;
}

export function scorecardFor(a: Assessment): ExecutiveScorecard {
  return computeScorecard(ratingList(a), DOMAIN_WEIGHTS);
}

export function growthFor(a: Assessment): GrowthIntelligenceResult {
  const g = a.ratings.growth ?? {};
  return analyzeGrowth(
    Object.entries(g).map(([dimension, rating]) => ({ dimension, rating })),
  );
}

export function blueprintFor(e: Engagement): ExecutiveBlueprint {
  const scores = scorecardFor(e.assessment);
  const growth = growthFor(e.assessment);
  const recommendations = growth.recommendations.map((r) => ({
    title: `${r.label}: ${r.recommendedService}`,
    priority: r.priority,
    estimatedRoi: r.estimatedRoi,
    recommendedService: r.recommendedService,
  }));
  const roiMetrics = e.roi.map((m) => {
    const base: { label: string; unit: string; baseline?: number; projected?: number } =
      {
        label: m.label,
        unit: m.unit,
      };
    if (m.baseline !== null) base.baseline = m.baseline;
    if (m.projected !== null) base.projected = m.projected;
    return base;
  });
  return assembleExecutiveBlueprint({ scores, growth, recommendations, roiMetrics });
}

export interface AssessmentProgress {
  total: number;
  rated: number;
  perDomain: Record<DomainKey, { total: number; rated: number }>;
}
export function assessmentProgress(a: Assessment): AssessmentProgress {
  const perDomain = {} as Record<DomainKey, { total: number; rated: number }>;
  let total = 0;
  let rated = 0;
  for (const domain of DOMAINS) {
    const r = a.ratings[domain.key] ?? {};
    const dTotal = domain.dimensions.length;
    const dRated = domain.dimensions.filter((d) => typeof r[d.key] === "number").length;
    perDomain[domain.key] = { total: dTotal, rated: dRated };
    total += dTotal;
    rated += dRated;
  }
  return { total, rated, perDomain };
}

export function projectCompletion(p: Project): number {
  const tasks = p.milestones.flatMap((m) => m.tasks);
  if (tasks.length === 0) return 0;
  return Math.round(
    (tasks.filter((t) => t.status === "done").length / tasks.length) * 100,
  );
}

// ---- writes (mutate a draft; the provider replaces state) -----------------

export function openEngagement(ws: Workspace, businessId: string): Engagement {
  const b = businessById(ws, businessId);
  if (!b) throw new Error("unknown business");
  const e: Engagement = {
    id: newId("eng"),
    businessId,
    mode: b.analysisOnly ? "analysis_only" : "full_transformation",
    stage: "prospect",
    assessment: emptyAssessment(),
    projects: [],
    roi: [],
    proposal: null,
    notes: "",
    demo: false,
    timeline: [{ at: "", label: "Engagement opened" }],
  };
  ws.engagements.push(e);
  return e;
}

export type AdvanceResult = { ok: true } | { ok: false; reason: string };

export function advanceEngagement(e: Engagement, to: Stage): AdvanceResult {
  const res = canAdvance(e.stage, to, e.mode);
  if (!res.ok) {
    const reason =
      res.code === "analysis_only_cap"
        ? "Analysis-only engagement may not advance past the blueprint — HL-BTI advises only."
        : res.code === "not_one_step"
          ? "Stages advance one step at a time."
          : "Cannot advance forward from a side state.";
    return { ok: false, reason };
  }
  e.stage = to;
  e.timeline.push({ at: "", label: `Advanced to ${to}` });
  return { ok: true };
}

export function suggestedNextStage(e: Engagement): Stage | null {
  return nextStage(e.stage, e.mode);
}

export function setRating(
  e: Engagement,
  domain: DomainKey,
  dimension: string,
  rating: number,
): void {
  const r = e.assessment.ratings[domain] ?? {};
  r[dimension] = rating;
  e.assessment.ratings[domain] = r;
}

export function setDomainNote(e: Engagement, domain: DomainKey, note: string): void {
  e.assessment.notes[domain] = note;
}

export function addEvidence(
  e: Engagement,
  domain: DomainKey,
  dimension: string,
  label: string,
): void {
  e.assessment.evidence.push({ domain, dimension, label });
}

export function completeAssessment(e: Engagement): void {
  e.assessment.completed = true;
  e.timeline.push({ at: "", label: "Assessment completed" });
}

export function createProject(e: Engagement, name: string): Project | null {
  if (e.mode === "analysis_only") return null;
  const p: Project = { id: newId("prj"), name, status: "active", milestones: [] };
  e.projects.push(p);
  return p;
}
export function addMilestone(p: Project, name: string): Milestone {
  const m: Milestone = { id: newId("mst"), name, status: "active", tasks: [] };
  p.milestones.push(m);
  return m;
}
export function addTask(m: Milestone, title: string): Task {
  const t: Task = { id: newId("tsk"), title, status: "todo" };
  m.tasks.push(t);
  return t;
}

export function recordRoi(
  e: Engagement,
  label: string,
  unit: string,
  baseline: number,
  projected: number,
): RoiMetric | null {
  if (e.mode === "analysis_only") return null;
  const m: RoiMetric = {
    id: newId("roi"),
    label,
    unit,
    baseline,
    projected,
    realized: null,
    status: projected ? "projected" : "baseline",
  };
  e.roi.push(m);
  return m;
}
export function realizeRoi(m: RoiMetric, realized: number): void {
  m.realized = realized;
  m.status = "realized";
}

export function generateProposal(e: Engagement): Proposal | null {
  if (e.mode === "analysis_only") return null;
  const growth = growthFor(e.assessment);
  const lines: ProposalLine[] = growth.recommendations.slice(0, 6).map((r) => ({
    label: r.recommendedService,
    type: r.estimatedRoi === "high" ? "recurring" : "one_time",
    amount: 0, // pricing is a CEO decision — never invented
  }));
  e.proposal = { status: "draft", signatureStatus: "not_sent", lines };
  return e.proposal;
}
