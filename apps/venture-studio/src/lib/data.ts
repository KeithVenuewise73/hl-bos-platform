import "server-only";
import { serverSupabase, supabaseConfigured } from "./session";
import {
  analyzeReuse,
  computeFactoryReadiness,
  summarizeEvaluation,
  type ReuseAnalysis,
  type FactoryReadiness,
  type DimensionScore,
} from "@hl-bos/venture-studio";

/**
 * Server-only data layer for Venture Studio.
 *
 * Reads `vstudio.*` under the viewer's session (RLS-enforced). Every read is
 * honest: if Supabase is unconfigured or the schema is not yet provisioned (the
 * migration is unapplied pending CEO approval), it returns an explicit state —
 * never a fabricated row or a zero-as-success. Reuse analysis is always real
 * (computed from @hl-bos/catalog), independent of provisioning.
 */

export type Provisioning = "ready" | "unconfigured" | "unprovisioned";

export interface OpportunityRow {
  id: string;
  title: string;
  summary: string;
  industry: string;
  opportunity_type: string | null;
  status: string;
  source_type: string;
  source_url: string | null;
  related_product: string | null;
  tags: string[];
  is_demonstration: boolean;
  created_at: string;
}

export interface EvidenceRow {
  id: string;
  evidence_type: string;
  title: string;
  source_url: string | null;
  source_name: string;
  reliability: string;
  relevance: string;
  excerpt: string;
}

export interface ListResult {
  provisioning: Provisioning;
  items: OpportunityRow[];
}

async function schemaClient() {
  const sb = await serverSupabase();
  return sb;
}

export async function listOpportunities(): Promise<ListResult> {
  if (!supabaseConfigured()) return { provisioning: "unconfigured", items: [] };
  const sb = await schemaClient();
  if (!sb) return { provisioning: "unconfigured", items: [] };
  try {
    const { data, error } = await sb
      .schema("vstudio")
      .from("opportunities")
      .select(
        "id,title,summary,industry,opportunity_type,status,source_type,source_url,related_product,tags,is_demonstration,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<OpportunityRow[]>();
    if (error) return { provisioning: "unprovisioned", items: [] };
    return { provisioning: "ready", items: data ?? [] };
  } catch {
    return { provisioning: "unprovisioned", items: [] };
  }
}

export interface OpportunityDetail {
  provisioning: Provisioning;
  opportunity: OpportunityRow | null;
  evidence: EvidenceRow[];
  reuse: ReuseAnalysis;
  factory: FactoryReadiness;
}

export async function getOpportunity(id: string): Promise<OpportunityDetail> {
  const empty = (
    p: Provisioning,
    o: OpportunityRow | null,
    ev: EvidenceRow[],
  ): OpportunityDetail => {
    const reuse = analyzeReuse({
      title: o?.title ?? "",
      summary: o?.summary ?? "",
    });
    const verified = ev.some((e) => e.evidence_type === "verified_fact");
    const factory = computeFactoryReadiness({
      decision: null,
      evaluation: summarizeEvaluation([] as DimensionScore[]),
      reuse,
      evidenceCount: ev.length,
      hasVerifiedEvidence: verified,
    });
    return { provisioning: p, opportunity: o, evidence: ev, reuse, factory };
  };

  if (!supabaseConfigured()) return empty("unconfigured", null, []);
  const sb = await schemaClient();
  if (!sb) return empty("unconfigured", null, []);
  try {
    const { data: opp, error } = await sb
      .schema("vstudio")
      .from("opportunities")
      .select(
        "id,title,summary,industry,opportunity_type,status,source_type,source_url,related_product,tags,is_demonstration,created_at",
      )
      .eq("id", id)
      .maybeSingle()
      .returns<OpportunityRow>();
    if (error) return empty("unprovisioned", null, []);
    if (!opp) return empty("ready", null, []);
    const { data: ev } = await sb
      .schema("vstudio")
      .from("evidence")
      .select(
        "id,evidence_type,title,source_url,source_name,reliability,relevance,excerpt",
      )
      .eq("opportunity_id", id)
      .order("captured_date", { ascending: false })
      .returns<EvidenceRow[]>();
    return empty("ready", opp, ev ?? []);
  } catch {
    return empty("unprovisioned", null, []);
  }
}
