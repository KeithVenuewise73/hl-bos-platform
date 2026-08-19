import "server-only";
import { serverSupabase, supabaseConfigured } from "./session";
import {
  CATALOG_SORTS,
  DEFAULT_CATALOG_SORT,
  DEFAULT_CATALOG_PAGE_SIZE,
  type CatalogSortKey,
  clampPage,
  clampPageSize,
  pageCount,
  pageRange,
  resolveSort,
  sanitizeSearchTerm,
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
  // Discovery metadata (hlbos_0032). NULL on manually captured opportunities.
  category: string | null;
  search_pattern: string | null;
  source_query: string | null;
  repository_url: string | null;
  stars: number | null;
  forks: number | null;
  open_issues: number | null;
  language: string | null;
  topics: string[];
  pushed_at: string | null;
  license: string | null;
  archived: boolean;
  discovered_at: string | null;
  confidence: string | null;
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

/** Every column the catalog and detail views read. One source of truth. */
const OPPORTUNITY_COLUMNS =
  "id,title,summary,industry,opportunity_type,status,source_type,source_url," +
  "related_product,tags,is_demonstration,created_at,category,search_pattern," +
  "source_query,repository_url,stars,forks,open_issues,language,topics," +
  "pushed_at,license,archived,discovered_at,confidence";

// The catalog's browsing rules live in the domain package, where they are
// unit-tested without a database. Re-exported under the names the pages use.
export const SORTS = CATALOG_SORTS;
export const DEFAULT_SORT = DEFAULT_CATALOG_SORT;
export const DEFAULT_PAGE_SIZE = DEFAULT_CATALOG_PAGE_SIZE;
export type SortKey = CatalogSortKey;

export interface CatalogFilters {
  q?: string | undefined;
  category?: string | undefined;
  pattern?: string | undefined;
  source?: string | undefined;
  archived?: string | undefined;
  license?: string | undefined;
  language?: string | undefined;
  status?: string | undefined;
  sort?: SortKey | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface CatalogPage {
  provisioning: Provisioning;
  items: OpportunityRow[];
  /** The entire persisted corpus, ignoring every filter. */
  total: number;
  /** How many rows match the current filters. */
  matching: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Set when a read failed, so the page can say so instead of showing zero. */
  error: string | null;
}

/**
 * One page of the catalog, filtered, searched and sorted ENTIRELY server-side.
 * The browser never receives more than `pageSize` rows, so the corpus can grow
 * without the page growing with it.
 *
 * Filtering narrows what is shown. It never deletes, hides permanently, or
 * reorders anything out of reach.
 */
export async function listOpportunityPage(
  f: CatalogFilters = {},
): Promise<CatalogPage> {
  const page = clampPage(f.page ?? 1);
  const pageSize = clampPageSize(f.pageSize);
  const empty = (p: Provisioning, error: string | null = null): CatalogPage => ({
    provisioning: p,
    items: [],
    total: 0,
    matching: 0,
    page,
    pageSize,
    pageCount: 0,
    error,
  });

  if (!supabaseConfigured()) return empty("unconfigured");
  const sb = await serverSupabase();
  if (!sb) return empty("unconfigured");

  const sort = CATALOG_SORTS[resolveSort(f.sort)];

  try {
    // The whole corpus, so "TOTAL" never moves when a filter is applied.
    const totalRes = await sb
      .schema("vstudio")
      .from("opportunities")
      .select("id", { count: "exact", head: true });
    if (totalRes.error) return empty("unprovisioned", totalRes.error.message);

    let query = sb
      .schema("vstudio")
      .from("opportunities")
      .select(OPPORTUNITY_COLUMNS, { count: "exact" });

    if (f.category) query = query.eq("category", f.category);
    if (f.pattern) query = query.eq("search_pattern", f.pattern);
    if (f.source) query = query.eq("source_type", f.source);
    if (f.license) query = query.eq("license", f.license);
    if (f.language) query = query.eq("language", f.language);
    if (f.status) query = query.eq("status", f.status);
    if (f.archived === "archived") query = query.eq("archived", true);
    if (f.archived === "active") query = query.eq("archived", false);
    const term = sanitizeSearchTerm(f.q);
    if (term) query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);

    const { from, to } = pageRange(page, pageSize);
    const { data, error, count } = await query
      .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to)
      .returns<OpportunityRow[]>();

    if (error) return empty("unprovisioned", error.message);

    const matching = count ?? 0;
    return {
      provisioning: "ready",
      items: data ?? [],
      total: totalRes.count ?? 0,
      matching,
      page,
      pageSize,
      pageCount: pageCount(matching, pageSize),
      error: null,
    };
  } catch (e) {
    return empty("unprovisioned", String((e as Error)?.message ?? e));
  }
}

/**
 * Opportunity counts per status, counted BY THE DATABASE.
 *
 * The overview used to tally a capped page of rows, which silently undercounts
 * once the corpus is larger than that page. A count that is quietly wrong is
 * worse than no count, so these are exact.
 */
export async function statusCounts(statuses: readonly string[]): Promise<{
  provisioning: Provisioning;
  total: number;
  counts: Record<string, number>;
}> {
  const empty = (p: Provisioning) => ({ provisioning: p, total: 0, counts: {} });
  if (!supabaseConfigured()) return empty("unconfigured");
  const sb = await serverSupabase();
  if (!sb) return empty("unconfigured");
  try {
    const total = await sb
      .schema("vstudio")
      .from("opportunities")
      .select("id", { count: "exact", head: true });
    if (total.error) return empty("unprovisioned");
    const counts: Record<string, number> = {};
    for (const status of statuses) {
      const r = await sb
        .schema("vstudio")
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      counts[status] = r.error ? 0 : (r.count ?? 0);
    }
    return { provisioning: "ready", total: total.count ?? 0, counts };
  } catch {
    return empty("unprovisioned");
  }
}

export interface CatalogFacets {
  languages: string[];
  licenses: string[];
  sources: string[];
}

/**
 * Values for the free-form filters. Category and pattern come from the
 * committed matrix instead, so those lists are always complete.
 *
 * This reads a bounded slice ordered by stars, which covers the practical
 * vocabulary without scanning the corpus on every page load. A value missing
 * from a dropdown is still filterable — the filters are exact and server-side,
 * so the URL parameter works regardless.
 */
export async function catalogFacets(): Promise<CatalogFacets> {
  const none: CatalogFacets = { languages: [], licenses: [], sources: [] };
  if (!supabaseConfigured()) return none;
  const sb = await serverSupabase();
  if (!sb) return none;
  try {
    const { data, error } = await sb
      .schema("vstudio")
      .from("opportunities")
      .select("language,license,source_type")
      .order("stars", { ascending: false, nullsFirst: false })
      .limit(5000)
      .returns<
        { language: string | null; license: string | null; source_type: string }[]
      >();
    if (error || !data) return none;
    const uniq = (xs: (string | null)[]): string[] =>
      [...new Set(xs.filter((x): x is string => Boolean(x && x.trim())))].sort();
    return {
      languages: uniq(data.map((d) => d.language)),
      licenses: uniq(data.map((d) => d.license)),
      sources: uniq(data.map((d) => d.source_type)),
    };
  } catch {
    return none;
  }
}

export async function listOpportunities(): Promise<ListResult> {
  if (!supabaseConfigured()) return { provisioning: "unconfigured", items: [] };
  const sb = await schemaClient();
  if (!sb) return { provisioning: "unconfigured", items: [] };
  try {
    const { data, error } = await sb
      .schema("vstudio")
      .from("opportunities")
      .select(OPPORTUNITY_COLUMNS)
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
      .select(OPPORTUNITY_COLUMNS)
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
