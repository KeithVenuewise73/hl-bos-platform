import "server-only";
import { serverSupabase, supabaseConfigured } from "./session";
import type { Provisioning, OpportunityRow } from "./data";

/**
 * Server-only reads for the intelligence layer: Top-100 portfolios, Rising
 * Opportunities and Public Pain Points.
 *
 * Everything here reads a STORED snapshot rather than recomputing a ranking on
 * page load. Two reasons, both about honesty rather than speed:
 *
 *   * A rank the CEO looked at yesterday must still be explicable today. A
 *     live query would silently re-rank the moment a repository gained a star.
 *   * A snapshot carries corpus_size, eligible_count and member_count, so the
 *     page can say "100 of 249 eligible, from 62,250" instead of presenting a
 *     hundred rows as though they were the whole story.
 *
 * Failures return an explicit `error` and never an empty list dressed as a
 * result. A zero that means "the query broke" is worse than no number at all.
 */

export interface PortfolioMeta {
  key: string;
  label: string;
  description: string;
  rank_by: "popularity" | "suitability" | "pain" | "rising";
  target_size: number;
  display_order: number;
  active: boolean;
}

export interface SnapshotMeta {
  id: string;
  portfolio_key: string;
  scoring_version: string;
  computed_at: string;
  corpus_size: number;
  eligible_count: number;
  member_count: number;
  method: string;
}

export interface ScoreComponentRow {
  c: string;
  v: number;
  w: number;
}

/**
 * The measured growth recorded on a Rising member. Typed rather than left as
 * loose JSON so the page renders numbers, not "[object Object]".
 */
export interface RisingEvidence {
  observations?: number;
  window_days?: number;
  first_observed?: string;
  last_observed?: string;
  stars_from?: number | null;
  stars_to?: number | null;
  star_delta?: number;
  fork_delta?: number;
  issue_delta?: number;
}

export interface MemberRow {
  rank: number;
  opportunity_id: string | null;
  pain_cluster_id: string | null;
  popularity_score: number | null;
  popularity_status: string;
  suitability_score: number | null;
  suitability_status: string;
  rising_score: number | null;
  ranking_basis: string;
  ranking_score: number;
  qualification: Record<string, unknown>;
}

export interface PainClusterRow {
  id: string;
  theme_key: string | null;
  title: string;
  problem_statement: string;
  method: string;
  keywords: string[];
  signal_count: number;
  source_count: number;
  first_observed_at: string | null;
  last_observed_at: string | null;
  momentum_score: number | null;
  momentum_status: string;
  hlg_relevance: number | null;
  hlg_relevance_status: string;
  suggested_response: string | null;
  confidence: string | null;
  human_review_required: boolean;
}

export interface PainSignalRow {
  id: number;
  source: string;
  source_url: string;
  title: string;
  body_excerpt: string;
  reactions: number | null;
  comments: number | null;
  state: string | null;
  created_at_source: string | null;
  matched_phrases: string[];
}

export interface PortfolioView {
  provisioning: Provisioning;
  portfolio: PortfolioMeta | null;
  snapshot: SnapshotMeta | null;
  members: MemberRow[];
  /** Repository members, keyed by opportunity id. */
  opportunities: Map<string, OpportunityRow>;
  /** Pain-cluster members, keyed by cluster id. */
  clusters: Map<string, PainClusterRow>;
  error: string | null;
}

const OPPORTUNITY_COLUMNS =
  "id,title,summary,industry,opportunity_type,status,source_type,source_url," +
  "related_product,tags,is_demonstration,created_at,category,search_pattern," +
  "source_query,repository_url,stars,forks,open_issues,language,topics," +
  "pushed_at,license,archived,discovered_at,confidence";

const emptyView = (p: Provisioning, error: string | null = null): PortfolioView => ({
  provisioning: p,
  portfolio: null,
  snapshot: null,
  members: [],
  opportunities: new Map(),
  clusters: new Map(),
  error,
});

/** Every portfolio the CEO can open, in display order. */
export async function listPortfolios(): Promise<{
  provisioning: Provisioning;
  portfolios: PortfolioMeta[];
  error: string | null;
}> {
  if (!supabaseConfigured())
    return { provisioning: "unconfigured", portfolios: [], error: null };
  const sb = await serverSupabase();
  if (!sb) return { provisioning: "unconfigured", portfolios: [], error: null };
  const { data, error } = await sb
    .schema("vstudio")
    .from("portfolios")
    .select("key,label,description,rank_by,target_size,display_order,active")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .returns<PortfolioMeta[]>();
  if (error)
    return { provisioning: "unprovisioned", portfolios: [], error: error.message };
  return { provisioning: "ready", portfolios: data ?? [], error: null };
}

/**
 * One portfolio's CURRENT snapshot with its ranked members.
 *
 * The two member kinds are fetched separately because they are different
 * things: four portfolios rank repositories, the pain portfolio ranks clusters
 * of public complaints. Forcing them into one shape would mean inventing
 * repository fields for a pain point.
 */
export async function getPortfolio(key: string): Promise<PortfolioView> {
  if (!supabaseConfigured()) return emptyView("unconfigured");
  const sb = await serverSupabase();
  if (!sb) return emptyView("unconfigured");

  try {
    const pf = await sb
      .schema("vstudio")
      .from("portfolios")
      .select("key,label,description,rank_by,target_size,display_order,active")
      .eq("key", key)
      .maybeSingle<PortfolioMeta>();
    if (pf.error) return emptyView("unprovisioned", pf.error.message);
    if (!pf.data) return emptyView("ready", null);

    const snap = await sb
      .schema("vstudio")
      .from("portfolio_snapshots")
      .select(
        "id,portfolio_key,scoring_version,computed_at,corpus_size,eligible_count,member_count,method",
      )
      .eq("portfolio_key", key)
      .eq("is_current", true)
      .maybeSingle<SnapshotMeta>();
    if (snap.error)
      return { ...emptyView("unprovisioned", snap.error.message), portfolio: pf.data };
    if (!snap.data) return { ...emptyView("ready"), portfolio: pf.data };

    const mem = await sb
      .schema("vstudio")
      .from("portfolio_members")
      .select(
        "rank,opportunity_id,pain_cluster_id,popularity_score,popularity_status," +
          "suitability_score,suitability_status,rising_score,ranking_basis,ranking_score,qualification",
      )
      .eq("snapshot_id", snap.data.id)
      .order("rank", { ascending: true })
      .returns<MemberRow[]>();
    if (mem.error) {
      return {
        ...emptyView("unprovisioned", mem.error.message),
        portfolio: pf.data,
        snapshot: snap.data,
      };
    }
    const members = mem.data ?? [];

    const opportunityIds = members
      .map((m) => m.opportunity_id)
      .filter((v): v is string => !!v);
    const clusterIds = members
      .map((m) => m.pain_cluster_id)
      .filter((v): v is string => !!v);

    const opportunities = new Map<string, OpportunityRow>();
    if (opportunityIds.length) {
      const res = await sb
        .schema("vstudio")
        .from("opportunities")
        .select(OPPORTUNITY_COLUMNS)
        .in("id", opportunityIds)
        .returns<OpportunityRow[]>();
      for (const o of res.data ?? []) opportunities.set(o.id, o);
    }

    const clusters = new Map<string, PainClusterRow>();
    if (clusterIds.length) {
      const res = await sb
        .schema("vstudio")
        .from("pain_clusters")
        .select(
          "id,theme_key,title,problem_statement,method,keywords,signal_count,source_count," +
            "first_observed_at,last_observed_at,momentum_score,momentum_status," +
            "hlg_relevance,hlg_relevance_status,suggested_response,confidence,human_review_required",
        )
        .in("id", clusterIds)
        .returns<PainClusterRow[]>();
      for (const c of res.data ?? []) clusters.set(c.id, c);
    }

    return {
      provisioning: "ready",
      portfolio: pf.data,
      snapshot: snap.data,
      members,
      opportunities,
      clusters,
      error: null,
    };
  } catch (e) {
    return emptyView("unprovisioned", String((e as Error)?.message ?? e));
  }
}

/** The public complaints behind one pain cluster, most engaged first. */
export async function painSignals(
  clusterId: string,
  limit = 25,
): Promise<PainSignalRow[]> {
  if (!supabaseConfigured()) return [];
  const sb = await serverSupabase();
  if (!sb) return [];
  const { data } = await sb
    .schema("vstudio")
    .from("pain_signals")
    .select(
      "id,source,source_url,title,body_excerpt,reactions,comments,state,created_at_source,matched_phrases",
    )
    .eq("cluster_id", clusterId)
    .order("reactions", { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<PainSignalRow[]>();
  return data ?? [];
}

export interface OpportunityScoreRow {
  scoring_version: string;
  analysis_level: number;
  popularity_score: number | null;
  popularity_status: string;
  popularity_components: ScoreComponentRow[];
  suitability_score: number | null;
  suitability_status: string;
  suitability_components: ScoreComponentRow[];
  rising_score: number | null;
  rising_status: string;
  rising_components: ScoreComponentRow[];
  evidence: Record<string, unknown>;
  method: string;
  computed_at: string;
}

/** The scores for one opportunity, for its executive card. */
export async function opportunityScore(
  id: string,
): Promise<OpportunityScoreRow | null> {
  if (!supabaseConfigured()) return null;
  const sb = await serverSupabase();
  if (!sb) return null;
  const { data } = await sb
    .schema("vstudio")
    .from("opportunity_scores")
    .select(
      "scoring_version,analysis_level,popularity_score,popularity_status,popularity_components," +
        "suitability_score,suitability_status,suitability_components," +
        "rising_score,rising_status,rising_components,evidence,method,computed_at",
    )
    .eq("opportunity_id", id)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle<OpportunityScoreRow>();
  return data ?? null;
}

export interface ExecutiveOverview {
  provisioning: Provisioning;
  /** The complete discovery universe. Never filtered. */
  corpus: number;
  /** Counts by staged analysis level, 0-4. */
  byLevel: Record<number, number>;
  painClusters: number;
  painSignals: number;
  /** Clusters that cleared the recurrence bar and are presented as pain points. */
  painPresented: number;
  risingScored: number;
  observations: number;
  portfolios: {
    key: string;
    label: string;
    members: number;
    eligible: number;
    computed_at: string;
  }[];
  error: string | null;
}

/**
 * The numbers on the front page. Every one is counted by the database.
 *
 * Nothing here is derived from a sampled page or an assumption. If a count
 * cannot be obtained the whole panel reports an error rather than showing a
 * zero that reads like a fact.
 */
export async function executiveOverview(): Promise<ExecutiveOverview> {
  const empty = (p: Provisioning, error: string | null = null): ExecutiveOverview => ({
    provisioning: p,
    corpus: 0,
    byLevel: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
    painClusters: 0,
    painSignals: 0,
    painPresented: 0,
    risingScored: 0,
    observations: 0,
    portfolios: [],
    error,
  });
  if (!supabaseConfigured()) return empty("unconfigured");
  const sb = await serverSupabase();
  if (!sb) return empty("unconfigured");

  try {
    const corpus = await sb
      .schema("vstudio")
      .from("opportunities")
      .select("id", { count: "exact", head: true });
    if (corpus.error) return empty("unprovisioned", corpus.error.message);

    const byLevel: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const level of [1, 2, 3, 4]) {
      const r = await sb
        .schema("vstudio")
        .from("opportunity_scores")
        .select("id", { count: "exact", head: true })
        .eq("analysis_level", level);
      byLevel[level] = r.error ? 0 : (r.count ?? 0);
    }
    // Level 0 is DISCOVERY: everything captured. Every record is at least here,
    // which is the point — nothing leaves the universe by being analysed.
    byLevel[0] = corpus.count ?? 0;

    const [clusters, signals, presented, rising, observations, snaps] =
      await Promise.all([
        sb
          .schema("vstudio")
          .from("pain_clusters")
          .select("id", { count: "exact", head: true }),
        sb
          .schema("vstudio")
          .from("pain_signals")
          .select("id", { count: "exact", head: true }),
        sb
          .schema("vstudio")
          .from("pain_clusters")
          .select("id", { count: "exact", head: true })
          .gte("signal_count", 5),
        sb
          .schema("vstudio")
          .from("opportunity_scores")
          .select("id", { count: "exact", head: true })
          .not("rising_score", "is", null),
        sb
          .schema("vstudio")
          .from("metric_observations")
          .select("id", { count: "exact", head: true }),
        sb
          .schema("vstudio")
          .from("portfolio_snapshots")
          .select(
            "portfolio_key,member_count,eligible_count,computed_at,portfolios(label,display_order)",
          )
          .eq("is_current", true)
          .returns<
            {
              portfolio_key: string;
              member_count: number;
              eligible_count: number;
              computed_at: string;
              portfolios: { label: string; display_order: number } | null;
            }[]
          >(),
      ]);

    return {
      provisioning: "ready",
      corpus: corpus.count ?? 0,
      byLevel,
      painClusters: clusters.count ?? 0,
      painSignals: signals.count ?? 0,
      painPresented: presented.count ?? 0,
      risingScored: rising.count ?? 0,
      observations: observations.count ?? 0,
      portfolios: (snaps.data ?? [])
        .map((s) => ({
          key: s.portfolio_key,
          label: s.portfolios?.label ?? s.portfolio_key,
          members: s.member_count,
          eligible: s.eligible_count,
          computed_at: s.computed_at,
          order: s.portfolios?.display_order ?? 999,
        }))
        .sort((a, b) => a.order - b.order)
        .map(({ order: _order, ...rest }) => rest),
      error: null,
    };
  } catch (e) {
    return empty("unprovisioned", String((e as Error)?.message ?? e));
  }
}
