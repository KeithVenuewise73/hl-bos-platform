/**
 * CEO Notebook — the executive intelligence workspace (HLVS V2, Workstream B1).
 *
 * PURE domain logic. No I/O. This does NOT introduce a new store: it models the
 * reuse of `vstudio.notes` (extended additively in migration 0030) as typed
 * notebook entries, and composes the EXISTING Venture Studio capabilities
 * (evidence, related opportunities, reuse, factory readiness, decisions) into a
 * single "living intelligence object" per entry.
 *
 * It also declares the six permanent Intelligence Programs. These are
 * architectural placeholders: every future connector must belong to exactly one
 * program, so intelligence is organised rather than a pile of disconnected
 * connectors. Programs are marked honestly — "active" only where a real
 * capability exists today; "planned" where nothing is wired yet.
 */

import { NOTE_TYPES, type NoteType, type TaskStatus } from "./types";

// --- Notebook entry kinds ---------------------------------------------------

/** A notebook entry's kind IS a `vstudio.note_type` value (single vocabulary). */
export type NotebookEntryKind = NoteType;

/** Kinds whose status lifecycle is meaningful (they behave like tasks). */
const TASK_KINDS: readonly NotebookEntryKind[] = [
  "follow_up",
  "research_request",
  "ai_analysis_request",
  "personal_task",
];

export function isTaskKind(kind: NotebookEntryKind): boolean {
  return TASK_KINDS.includes(kind);
}

// --- Intelligence programs (permanent) --------------------------------------

export const INTELLIGENCE_PROGRAM_KEYS = [
  "opportunity",
  "acquisition",
  "research",
  "grant",
  "competitive",
  "portfolio",
] as const;
export type IntelligenceProgramKey = (typeof INTELLIGENCE_PROGRAM_KEYS)[number];

export interface IntelligenceProgram {
  key: IntelligenceProgramKey;
  name: string;
  mission: string;
  /** "active" = a real capability exists today; "planned" = placeholder only. */
  status: "active" | "planned";
  /** Honest description of what exists right now (no fabrication). */
  currentCapability: string;
  /** Architectural placeholders — future connectors that belong to this program. */
  futureConnectors: readonly string[];
}

export const INTELLIGENCE_PROGRAMS: readonly IntelligenceProgram[] = [
  {
    key: "opportunity",
    name: "Opportunity Intelligence",
    mission: "Surface and qualify software opportunities worth pursuing.",
    status: "active",
    currentCapability:
      "Manual opportunity capture, evidence, evaluation, reuse scoring and CEO decision (V2-1, live).",
    futureConnectors: ["GitHub", "Product Hunt", "Reddit", "Market signals"],
  },
  {
    key: "acquisition",
    name: "Acquisition Intelligence",
    mission: "Identify and evaluate acquisition targets.",
    status: "planned",
    currentCapability: "Placeholder — no connector wired yet.",
    futureConnectors: ["Acquisition marketplaces", "Valuation intelligence (HL-BTI)"],
  },
  {
    key: "research",
    name: "Research Intelligence",
    mission: "Turn open questions into evidence-backed answers.",
    status: "active",
    currentCapability:
      "Research requests and AI-analysis requests captured as notebook intents; executed by a human today (AI gateway automation is future).",
    futureConnectors: ["arXiv / papers", "Web research", "AI gateway automation"],
  },
  {
    key: "grant",
    name: "Grant Intelligence",
    mission: "Find and qualify grant and non-dilutive funding.",
    status: "planned",
    currentCapability: "Placeholder — no connector wired yet.",
    futureConnectors: ["Grants.gov", "SAM.gov", "Government intelligence (HL-BTI)"],
  },
  {
    key: "competitive",
    name: "Competitive Intelligence",
    mission: "Track competitors and positioning.",
    status: "planned",
    currentCapability: "Placeholder — no connector wired yet.",
    futureConnectors: ["Competitor monitoring", "Positioning intelligence"],
  },
  {
    key: "portfolio",
    name: "Portfolio Intelligence",
    mission: "Understand the Herman Legacy portfolio as one system.",
    status: "active",
    currentCapability:
      "Deterministic reuse scoring over the live HL-BOS catalog and the Knowledge Graph read model.",
    futureConnectors: [
      "Cross-portfolio rollups",
      "Dependency / blast-radius intelligence",
    ],
  },
];

export function programFor(
  key: IntelligenceProgramKey,
): IntelligenceProgram | undefined {
  return INTELLIGENCE_PROGRAMS.find((p) => p.key === key);
}

// --- Kind metadata ----------------------------------------------------------

export interface NotebookKindMeta {
  kind: NotebookEntryKind;
  label: string;
  description: string;
  isTask: boolean;
  program: IntelligenceProgramKey;
}

const KIND_LABEL: Record<NotebookEntryKind, [string, string, IntelligenceProgramKey]> =
  {
    observation: ["CEO Note", "A durable executive observation.", "opportunity"],
    hypothesis: ["Hypothesis", "A hypothesis to test with evidence.", "research"],
    risk: ["Risk", "A risk to track.", "opportunity"],
    decision_input: [
      "Decision Input",
      "Input that informs a CEO decision.",
      "opportunity",
    ],
    follow_up: ["Follow-up", "Something to return to.", "opportunity"],
    research_request: [
      "Research Request",
      "A topic to investigate — belongs to Research Intelligence.",
      "research",
    ],
    ai_analysis_request: [
      "AI Analysis Request",
      "A request queued for AI analysis (executed via the metered AI gateway; never fabricated).",
      "research",
    ],
    personal_task: ["Personal Task", "A personal executive task.", "opportunity"],
    executive_status: [
      "Executive Status",
      "A status note for the executive dashboard.",
      "portfolio",
    ],
  };

export const NOTEBOOK_KINDS: readonly NotebookKindMeta[] = NOTE_TYPES.map((kind) => {
  const [label, description, program] = KIND_LABEL[kind];
  return { kind, label, description, isTask: isTaskKind(kind), program };
});

export function kindMeta(kind: NotebookEntryKind): NotebookKindMeta {
  const [label, description, program] = KIND_LABEL[kind];
  return { kind, label, description, isTask: isTaskKind(kind), program };
}

// --- Task status transitions ------------------------------------------------

const ALLOWED_NEXT: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ["in_progress", "blocked", "done", "archived"],
  in_progress: ["blocked", "done", "archived", "open"],
  blocked: ["in_progress", "open", "archived"],
  done: ["archived", "open"],
  archived: ["open"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  return (ALLOWED_NEXT[from] ?? []).includes(to);
}

// --- The living intelligence object -----------------------------------------

export interface NotebookEntry {
  id: string;
  kind: NotebookEntryKind;
  title: string | null;
  body: string;
  status: TaskStatus;
  program: IntelligenceProgramKey | null;
  opportunityId: string | null;
  dueDate: string | null;
  createdAt: string;
}

export interface EvidenceFacetItem {
  id: string;
  title: string;
  evidenceType: string;
  reliability: string;
}
export interface RelatedOpportunityItem {
  id: string;
  title: string;
  status: string;
}
export interface ReuseFacet {
  score: number;
  verdict: string;
  formula: string;
}
export interface FactoryFacet {
  ready: boolean;
  reusableCapabilityCount: number;
  blockers: readonly string[];
}
export interface DecisionFacetItem {
  id: string;
  decision: string;
  decidedAt: string;
}

/** Context assembled by the app's data layer from EXISTING vstudio tables. */
export interface IntelligenceContext {
  siblingNotes?: readonly NotebookEntry[];
  evidence?: readonly EvidenceFacetItem[];
  relatedOpportunities?: readonly RelatedOpportunityItem[];
  reuse?: ReuseFacet | null;
  factory?: FactoryFacet | null;
  decisions?: readonly DecisionFacetItem[];
}

/** A facet is either present with data, or absent with an honest reason. */
export type FacetState<T> =
  { available: true; data: T } | { available: false; reason: string };

function present<T>(data: T): FacetState<T> {
  return { available: true, data };
}
function absent(reason: string): FacetState<never> {
  return { available: false, reason };
}

export interface IntelligenceObject {
  entry: NotebookEntry;
  program: IntelligenceProgram | undefined;
  facets: {
    ceoNotes: FacetState<readonly NotebookEntry[]>;
    researchRequest: FacetState<{ topic: string; detail: string; status: TaskStatus }>;
    aiAnalysisRequest: FacetState<{
      request: string;
      detail: string;
      status: TaskStatus;
    }>;
    evidenceCollection: FacetState<readonly EvidenceFacetItem[]>;
    relatedOpportunities: FacetState<readonly RelatedOpportunityItem[]>;
    reuseAnalysis: FacetState<ReuseFacet>;
    factoryReadiness: FacetState<FactoryFacet>;
    executiveStatus: FacetState<{ status: string }>;
    personalTasks: FacetState<{ status: TaskStatus; due: string | null }>;
    decisionHistory: FacetState<readonly DecisionFacetItem[]>;
  };
}

const UNLINKED = "not linked to an opportunity";

/**
 * Compose a notebook entry with the ten executive facets. Entry-intrinsic
 * facets reflect the entry's own kind; composed facets reflect its linked
 * opportunity (absent, with a reason, when nothing is linked). Deterministic;
 * never fabricates — a facet with no data says so.
 */
export function assembleIntelligenceObject(
  entry: NotebookEntry,
  ctx: IntelligenceContext = {},
): IntelligenceObject {
  const linked = entry.opportunityId !== null;
  const evidence = ctx.evidence ?? [];
  const related = ctx.relatedOpportunities ?? [];
  const decisions = ctx.decisions ?? [];
  const notes = ctx.siblingNotes ?? [];

  return {
    entry,
    program: entry.program ? programFor(entry.program) : undefined,
    facets: {
      ceoNotes: notes.length > 0 ? present(notes) : absent("no related notes"),
      researchRequest:
        entry.kind === "research_request"
          ? present({
              topic: entry.title ?? entry.body.slice(0, 80),
              detail: entry.body,
              status: entry.status,
            })
          : absent("this entry is not a research request"),
      aiAnalysisRequest:
        entry.kind === "ai_analysis_request"
          ? present({
              request: entry.title ?? entry.body.slice(0, 80),
              detail: entry.body,
              status: entry.status,
            })
          : absent("this entry is not an AI analysis request"),
      evidenceCollection:
        evidence.length > 0
          ? present(evidence)
          : absent(linked ? "no evidence attached yet" : UNLINKED),
      relatedOpportunities:
        related.length > 0
          ? present(related)
          : absent(linked ? "no related opportunities" : UNLINKED),
      reuseAnalysis: ctx.reuse ? present(ctx.reuse) : absent(UNLINKED),
      factoryReadiness: ctx.factory ? present(ctx.factory) : absent(UNLINKED),
      executiveStatus:
        entry.kind === "executive_status"
          ? present({ status: entry.body })
          : absent("this entry is not an executive status"),
      personalTasks: isTaskKind(entry.kind)
        ? present({ status: entry.status, due: entry.dueDate })
        : absent("this entry is not a task"),
      decisionHistory:
        decisions.length > 0
          ? present(decisions)
          : absent(linked ? "no decision recorded yet" : UNLINKED),
    },
  };
}
