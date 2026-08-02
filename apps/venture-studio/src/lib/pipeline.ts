import "server-only";
import { serverSupabase, supabaseConfigured, getViewer } from "./session";
import { canManage } from "./authz";
import {
  analyzeReuse,
  computePriority,
  detectDuplicates,
  isRelationshipType,
  type OpportunityLike,
  type PriorityTier,
} from "@hl-bos/venture-studio";
import type { Provisioning } from "./data";
import type { WriteResult } from "./writes";

/**
 * Server-only data + write layer for the Opportunity Intelligence Pipeline.
 * Reads the EXISTING vstudio opportunity model (+ 0031 relationships) under the
 * viewer's session (RLS-enforced). Duplicate suggestions and suggested priority
 * are deterministic (pure package functions). Honest provisioning states.
 */

interface OppRow {
  id: string;
  title: string;
  summary: string;
  status: string;
  tags: string[];
  source_connector: string | null;
  priority_score: number | null;
  priority_tier: string | null;
  created_at: string;
}
interface RelRow {
  from_opportunity_id: string;
  to_opportunity_id: string;
  relationship_type: string;
}

const OPP_SELECT =
  "id,title,summary,status,tags,source_connector,priority_score,priority_tier,created_at";

export interface PipelineOpportunity {
  id: string;
  title: string;
  summary: string;
  status: string;
  sourceConnector: string | null;
  priorityScore: number | null;
  priorityTier: string | null;
  suggestedScore: number;
  suggestedTier: PriorityTier;
}

export interface DuplicateSuggestion {
  fromId: string;
  toId: string;
  fromTitle: string;
  toTitle: string;
  score: number;
  type: "duplicate_of" | "related_to";
}

export interface RelationshipView {
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  type: string;
}

export interface PipelineData {
  provisioning: Provisioning;
  inbox: PipelineOpportunity[];
  priorityQueue: PipelineOpportunity[];
  researchQueue: PipelineOpportunity[];
  duplicateSuggestions: DuplicateSuggestion[];
  relationships: RelationshipView[];
}

const EMPTY = (p: Provisioning): PipelineData => ({
  provisioning: p,
  inbox: [],
  priorityQueue: [],
  researchQueue: [],
  duplicateSuggestions: [],
  relationships: [],
});

function toPipelineOpp(r: OppRow): PipelineOpportunity {
  const reuse = analyzeReuse({ title: r.title, summary: r.summary });
  const p = computePriority({
    reuseScore: reuse.reuseScore,
    evidenceCount: 0,
    hasVerifiedEvidence: false,
    evaluationComposite: null,
    recommendation: null,
  });
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    status: r.status,
    sourceConnector: r.source_connector,
    priorityScore: r.priority_score,
    priorityTier: r.priority_tier,
    suggestedScore: p.score,
    suggestedTier: p.tier,
  };
}

function effectiveScore(o: PipelineOpportunity): number {
  return o.priorityScore ?? o.suggestedScore;
}

export async function loadPipeline(): Promise<PipelineData> {
  if (!supabaseConfigured()) return EMPTY("unconfigured");
  const sb = await serverSupabase();
  if (!sb) return EMPTY("unconfigured");
  try {
    const { data: rows, error } = await sb
      .schema("vstudio")
      .from("opportunities")
      .select(OPP_SELECT)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<OppRow[]>();
    if (error) return EMPTY("unprovisioned");
    const opps = (rows ?? []).map(toPipelineOpp);
    const titleById = new Map(opps.map((o) => [o.id, o.title]));

    const { data: rels } = await sb
      .schema("vstudio")
      .from("opportunity_relationships")
      .select("from_opportunity_id,to_opportunity_id,relationship_type")
      .returns<RelRow[]>();
    const relationships: RelationshipView[] = (rels ?? []).map((r) => ({
      fromId: r.from_opportunity_id,
      fromTitle: titleById.get(r.from_opportunity_id) ?? "(unknown)",
      toId: r.to_opportunity_id,
      toTitle: titleById.get(r.to_opportunity_id) ?? "(unknown)",
      type: r.relationship_type,
    }));
    const linked = new Set(
      (rels ?? []).flatMap((r) => [
        `${r.from_opportunity_id}|${r.to_opportunity_id}`,
        `${r.to_opportunity_id}|${r.from_opportunity_id}`,
      ]),
    );

    // Deterministic duplicate suggestions (pairwise), excluding existing links.
    const likes: OpportunityLike[] = (rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      tags: r.tags,
    }));
    const seenPair = new Set<string>();
    const duplicateSuggestions: DuplicateSuggestion[] = [];
    for (const o of likes) {
      const matches = detectDuplicates(
        o,
        likes.filter((x) => x.id !== o.id),
        { threshold: 40 },
      );
      for (const m of matches) {
        const pair = [o.id, m.opportunityId].sort().join("|");
        if (seenPair.has(pair)) continue;
        if (linked.has(`${o.id}|${m.opportunityId}`)) continue;
        seenPair.add(pair);
        duplicateSuggestions.push({
          fromId: o.id,
          toId: m.opportunityId,
          fromTitle: o.title,
          toTitle: titleById.get(m.opportunityId) ?? "(unknown)",
          score: m.score,
          type: m.suggestedType,
        });
      }
    }
    duplicateSuggestions.sort((a, b) => b.score - a.score);

    return {
      provisioning: "ready",
      inbox: opps.filter((o) => o.status === "inbox"),
      priorityQueue: [...opps].sort((a, b) => effectiveScore(b) - effectiveScore(a)),
      researchQueue: opps.filter((o) => o.status === "researching"),
      duplicateSuggestions: duplicateSuggestions.slice(0, 12),
      relationships,
    };
  } catch {
    return EMPTY("unprovisioned");
  }
}

// --- Write: relate two opportunities (e.g. accept a duplicate suggestion) ----

const FORBIDDEN: WriteResult = { ok: false, status: 403, error: "Not authorized." };

export async function relateOpportunities(body: unknown): Promise<WriteResult> {
  const viewer = await getViewer();
  if (!canManage(viewer.role)) return FORBIDDEN;

  const raw = (body ?? {}) as Record<string, unknown>;
  const from = typeof raw["from"] === "string" ? raw["from"] : "";
  const to = typeof raw["to"] === "string" ? raw["to"] : "";
  const type = raw["type"];
  const errors: string[] = [];
  if (!from) errors.push("Missing 'from' opportunity.");
  if (!to) errors.push("Missing 'to' opportunity.");
  if (from && to && from === to) errors.push("An opportunity cannot relate to itself.");
  if (!isRelationshipType(type)) errors.push("Invalid relationship type.");
  if (errors.length) return { ok: false, status: 422, errors };

  if (!supabaseConfigured())
    return { ok: false, status: 503, provisioning: "unconfigured" };
  const sb = await serverSupabase();
  if (!sb) return { ok: false, status: 503, provisioning: "unconfigured" };
  const { data, error } = await sb
    .schema("vstudio")
    .rpc("relate_opportunities", {
      p_from: from,
      p_to: to,
      p_type: type,
      p_attrs:
        typeof raw["similarity"] === "number" ? { similarity: raw["similarity"] } : {},
    })
    .returns<string>();
  if (error)
    return {
      ok: false,
      status: 503,
      provisioning: "unprovisioned",
      error: "Schema not yet provisioned.",
    };
  return {
    ok: true,
    status: 201,
    provisioning: "ready",
    ...(typeof data === "string" ? { id: data } : {}),
  };
}
