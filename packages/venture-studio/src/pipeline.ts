/**
 * Opportunity Intelligence Pipeline (HLVS V2, Workstream B2) — the successor to
 * the HLVS Think Tank. PURE domain logic. No I/O.
 *
 * ASSEMBLE, do not rebuild:
 *  - Connectors are a code REGISTRY that maps each external source to the reused
 *    `integrations` connector framework + a `discovery` collector. Adding a
 *    source is a registry entry (+ an edge-function collector) — no redesign.
 *    All are `stubbed` until a CEO-approved credential (Vault reference) exists.
 *  - Reuse scoring stays in @hl-bos/catalog (`analyzeReuse`); the advisory
 *    recommendation stays in `recommendation.ts`; both are reused here, not
 *    reimplemented.
 *  - Duplicate detection and priority scoring are deterministic (no AI, no I/O).
 *
 * AI stays advisory; nothing here fabricates numbers — estimates carry a
 * measured/estimated/unknown status.
 */

import type { Confidence, Estimate, Recommendation } from "./types";
import { unknownEstimate } from "./types";
import { analyzeReuse, type ReuseAnalysis } from "./reuse";
import { advisory, type AdvisoryRecommendation } from "./recommendation";
import type { IntelligenceProgramKey } from "./notebook";

// --- Connector registry -----------------------------------------------------

export const OPPORTUNITY_CONNECTOR_KEYS = [
  "github",
  "reddit",
  "producthunt",
  "hackernews",
  "acquire",
  "appsumo",
  "microns",
  "flippa",
  "grants_gov",
  "uspto",
  "google_patents",
] as const;
export type OpportunityConnectorKey = (typeof OPPORTUNITY_CONNECTOR_KEYS)[number];

export type ConnectorCategory =
  "code" | "community" | "launch" | "marketplace" | "grant" | "patent";
export type CredentialType = "none" | "api_key" | "oauth";
export type ConnectorIntegration = "rest" | "rss" | "graphql" | "scrape";

export interface OpportunityConnector {
  key: OpportunityConnectorKey;
  name: string;
  category: ConnectorCategory;
  /** Which permanent Intelligence Program this source feeds. */
  program: IntelligenceProgramKey;
  credentialType: CredentialType;
  /** How it connects when activated (reuses `integrations` + a `discovery` collector). */
  integration: ConnectorIntegration;
  /** Every connector is a stub until a CEO-approved credential exists. */
  status: "stubbed";
  homepage: string;
}

export const OPPORTUNITY_CONNECTORS: readonly OpportunityConnector[] = [
  {
    key: "github",
    name: "GitHub",
    category: "code",
    program: "opportunity",
    credentialType: "api_key",
    integration: "rest",
    status: "stubbed",
    homepage: "https://github.com",
  },
  {
    key: "reddit",
    name: "Reddit",
    category: "community",
    program: "opportunity",
    credentialType: "oauth",
    integration: "rest",
    status: "stubbed",
    homepage: "https://reddit.com",
  },
  {
    key: "producthunt",
    name: "Product Hunt",
    category: "launch",
    program: "opportunity",
    credentialType: "oauth",
    integration: "graphql",
    status: "stubbed",
    homepage: "https://producthunt.com",
  },
  {
    key: "hackernews",
    name: "Hacker News",
    category: "community",
    program: "opportunity",
    credentialType: "none",
    integration: "rest",
    status: "stubbed",
    homepage: "https://news.ycombinator.com",
  },
  {
    key: "acquire",
    name: "Acquire.com",
    category: "marketplace",
    program: "acquisition",
    credentialType: "api_key",
    integration: "rest",
    status: "stubbed",
    homepage: "https://acquire.com",
  },
  {
    key: "appsumo",
    name: "AppSumo",
    category: "marketplace",
    program: "opportunity",
    credentialType: "none",
    integration: "scrape",
    status: "stubbed",
    homepage: "https://appsumo.com",
  },
  {
    key: "microns",
    name: "Microns.io",
    category: "marketplace",
    program: "acquisition",
    credentialType: "none",
    integration: "scrape",
    status: "stubbed",
    homepage: "https://microns.io",
  },
  {
    key: "flippa",
    name: "Flippa",
    category: "marketplace",
    program: "acquisition",
    credentialType: "api_key",
    integration: "rest",
    status: "stubbed",
    homepage: "https://flippa.com",
  },
  {
    key: "grants_gov",
    name: "Grants.gov",
    category: "grant",
    program: "grant",
    credentialType: "none",
    integration: "rest",
    status: "stubbed",
    homepage: "https://grants.gov",
  },
  {
    key: "uspto",
    name: "USPTO",
    category: "patent",
    program: "research",
    credentialType: "none",
    integration: "rest",
    status: "stubbed",
    homepage: "https://uspto.gov",
  },
  {
    key: "google_patents",
    name: "Google Patents",
    category: "patent",
    program: "research",
    credentialType: "api_key",
    integration: "rest",
    status: "stubbed",
    homepage: "https://patents.google.com",
  },
];

export function connectorFor(
  key: OpportunityConnectorKey,
): OpportunityConnector | undefined {
  return OPPORTUNITY_CONNECTORS.find((c) => c.key === key);
}

export function isConnectorKey(v: unknown): v is OpportunityConnectorKey {
  return (
    typeof v === "string" &&
    (OPPORTUNITY_CONNECTOR_KEYS as readonly string[]).includes(v)
  );
}

const CONNECTOR_CATEGORY_LABEL: Record<ConnectorCategory, string> = {
  code: "SaaS / open source",
  community: "community signal",
  launch: "product launch",
  marketplace: "acquisition marketplace",
  grant: "grant / funding",
  patent: "patent / IP",
};
export function connectorCategoryLabel(c: ConnectorCategory): string {
  return CONNECTOR_CATEGORY_LABEL[c];
}

// --- Relationship vocabulary (mirrors vstudio.relationship_type) ------------

export const RELATIONSHIP_TYPES = [
  "duplicate_of",
  "related_to",
  "supersedes",
  "depends_on",
  "merged_into",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export function isRelationshipType(v: unknown): v is RelationshipType {
  return typeof v === "string" && (RELATIONSHIP_TYPES as readonly string[]).includes(v);
}

// --- Duplicate detection (deterministic) ------------------------------------

export interface OpportunityLike {
  id: string;
  title: string;
  summary?: string;
  tags?: readonly string[];
}
export interface DuplicateMatch {
  opportunityId: string;
  score: number; // 0..100 token overlap
  suggestedType: Extract<RelationshipType, "duplicate_of" | "related_to">;
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
function textOf(o: {
  title: string;
  summary?: string;
  tags?: readonly string[];
}): string {
  return `${o.title} ${o.summary ?? ""} ${(o.tags ?? []).join(" ")}`;
}

/**
 * Deterministic duplicate/relationship suggestions by token overlap. A
 * suggestion is exactly that — an operator confirms it (the `duplicate_of` link
 * is written only via the RPC). Threshold default 30; ≥70 suggests duplicate.
 */
export function detectDuplicates(
  candidate: { title: string; summary?: string; tags?: readonly string[] },
  existing: readonly OpportunityLike[],
  opts: { threshold?: number; duplicateAt?: number } = {},
): DuplicateMatch[] {
  const threshold = opts.threshold ?? 30;
  const duplicateAt = opts.duplicateAt ?? 70;
  const cand = tokens(textOf(candidate));
  return existing
    .map((o): DuplicateMatch => {
      const score = Math.round(jaccard(cand, tokens(textOf(o))) * 100);
      return {
        opportunityId: o.id,
        score,
        suggestedType: score >= duplicateAt ? "duplicate_of" : "related_to",
      };
    })
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

// --- Executive priority scoring (deterministic) -----------------------------

export interface PrioritySignals {
  reuseScore: number; // 0..100
  evidenceCount: number;
  hasVerifiedEvidence: boolean;
  evaluationComposite: number | null; // 0..100 or null
  recommendation: Recommendation | null;
}
export type PriorityTier = "now" | "soon" | "later" | "watch";
export interface Priority {
  score: number; // 0..100
  tier: PriorityTier;
  rationale: string;
}

const REC_WEIGHT: Record<Recommendation, number> = {
  build: 100,
  buy: 70,
  partner: 60,
  watch: 30,
  ignore: 0,
};

/**
 * Deterministic executive priority: a weighted blend of measured reuse,
 * evaluation composite (or a neutral prior when unknown), evidence weight, and
 * the advisory recommendation. No AI, no randomness.
 */
export function computePriority(s: PrioritySignals): Priority {
  const reusePart = s.reuseScore * 0.4;
  const evalPart = (s.evaluationComposite ?? 40) * 0.3;
  const evidencePart =
    Math.min(100, s.evidenceCount * 20 + (s.hasVerifiedEvidence ? 20 : 0)) * 0.1;
  const recPart = (s.recommendation ? REC_WEIGHT[s.recommendation] : 40) * 0.2;
  const score = Math.max(
    0,
    Math.min(100, Math.round(reusePart + evalPart + evidencePart + recPart)),
  );
  const tier: PriorityTier =
    score >= 75 ? "now" : score >= 50 ? "soon" : score >= 25 ? "later" : "watch";
  return {
    score,
    tier,
    rationale: `reuse ${s.reuseScore}, eval ${s.evaluationComposite ?? "n/a"}, evidence ${s.evidenceCount}${s.hasVerifiedEvidence ? " (verified)" : ""}, rec ${s.recommendation ?? "none"}`,
  };
}

// --- Discovery record (what every discovery produces) -----------------------

export interface DiscoveryInput {
  source: OpportunityConnectorKey;
  title: string;
  summary: string;
  url?: string | null;
  category?: string;
  buildEffort?: Estimate;
  revenuePotential?: Estimate;
}

export interface DiscoveryRecord {
  summary: string;
  source: OpportunityConnectorKey;
  url: string | null;
  category: string;
  confidence: Confidence;
  relatedOpportunities: DuplicateMatch[];
  reuseOpportunities: { capabilityId: string; displayName: string; score: number }[];
  estimatedBuildEffort: Estimate;
  estimatedRevenuePotential: Estimate;
  recommendation: AdvisoryRecommendation; // NON-authoritative by construction
}

function recommendationFromReuse(reuse: ReuseAnalysis): AdvisoryRecommendation {
  let rec: Recommendation;
  let conf: Confidence;
  if (reuse.reuseScore >= 60) {
    rec = "build";
    conf = "medium";
  } else if (reuse.reuseScore >= 30) {
    rec = "partner";
    conf = "low";
  } else {
    rec = "watch";
    conf = "low";
  }
  return advisory(
    rec,
    `Deterministic reuse ${reuse.reuseScore}/100 (${reuse.verdict}); advisory only — not a decision.`,
    conf,
  );
}

/**
 * Produce the ten canonical fields for a discovery. Reuse is measured; the
 * recommendation is advisory; effort/revenue default to an honest `unknown`
 * estimate (never a fabricated number) unless a real estimate is supplied.
 */
export function assembleDiscovery(
  input: DiscoveryInput,
  existing: readonly OpportunityLike[] = [],
): DiscoveryRecord {
  const reuse = analyzeReuse({ title: input.title, summary: input.summary });
  return {
    summary: input.summary,
    source: input.source,
    url: input.url ?? null,
    category: input.category ?? connectorFor(input.source)?.category ?? "",
    confidence: reuse.confidence,
    relatedOpportunities: detectDuplicates(
      { title: input.title, summary: input.summary },
      existing,
    ),
    reuseOpportunities: reuse.matches.slice(0, 6).map((m) => ({
      capabilityId: m.capabilityId,
      displayName: m.displayName,
      score: m.score,
    })),
    estimatedBuildEffort:
      input.buildEffort ??
      unknownEstimate(
        "weeks",
        "No estimate yet — requires evaluation; never fabricated.",
      ),
    estimatedRevenuePotential:
      input.revenuePotential ??
      unknownEstimate("USD/yr", "No estimate yet — projections require an evaluation."),
    recommendation: recommendationFromReuse(reuse),
  };
}
