/**
 * The Shop Analysis page's SQL and its row mappings.
 *
 * Deliberately free of `server-only`, secrets and `fetch`: everything here is a
 * pure function of its arguments, so the statements can be run against a real
 * PostgreSQL carrying the same migrations and the mappings can be unit-tested.
 * The transport that needs a token lives in shop-audit.ts.
 */

export type SqlRunner = (sql: string) => Promise<Record<string, unknown>[]>;

/** The agency tenant that owns HLD's own prospect and audit data. */
export const HLD_TENANT_SLUG = "herman-legacy-digital";

// ---------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------

export type RunStatus =
  "running" | "completed" | "partially_completed" | "failed" | "not_analysed";

export interface ShopRow {
  prospectId: string;
  sourceRow: number;
  name: string;
  locality: string | null;
  phone: string | null;
  websiteUrl: string | null;
  runId: string | null;
  status: RunStatus;
  /** null is a real answer: not analysed, or analysed and not scoreable. */
  score: number | null;
  confidence: string | null;
  hook: string | null;
  /**
   * TRUE only when the analysis actually tried to read the site and could not.
   *
   * Distinguishes it from a shop we never tried to fetch -- one whose whole
   * analysis came from the prospect list. Both have no score and both are
   * 'unknown' confidence, so without this the page would tell the CEO that a
   * shop's site "could not be read" when nobody had ever opened it.
   */
  unreachable: boolean;
  /** Capability keys this shop's analysis points at. */
  capabilities: string[];
}

export interface CampaignSummary {
  key: string;
  name: string;
  shops: number;
  analysed: number;
  awaiting: number;
  /** Shops with a URL and no run — the ones only this console can do. */
  fetchable: number;
  completed: number;
  partial: number;
}

/**
 * A database value as text, or null.
 *
 * Never `String(v)` on an unknown: a jsonb column that came back as an object
 * would silently render as "[object Object]" in front of the CEO. Anything that
 * is not already a primitive is treated as absent instead.
 */
export function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

const str = text;
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

/** Maps a raw SQL row onto a ShopRow. Pure, so it is unit-tested. */
export function toShopRow(r: Record<string, unknown>): ShopRow {
  const runId = str(r["run_id"]);
  const caps = str(r["capabilities"]);
  return {
    prospectId: String(r["prospect_id"]),
    sourceRow: Number(r["source_row"] ?? 0),
    name: text(r["business_name"]) ?? "",
    locality: str(r["locality"]),
    phone: str(r["phone"]),
    websiteUrl: str(r["website_url"]),
    runId,
    // A shop with no run is NOT "pending" or "queued" -- it has not been
    // analysed, and the list says so rather than showing a hopeful spinner.
    status:
      runId === null ? "not_analysed" : ((str(r["status"]) ?? "running") as RunStatus),
    score: num(r["score"]),
    confidence: str(r["confidence"]),
    hook: str(r["hook"]),
    unreachable: r["unreachable"] === true || r["unreachable"] === "true",
    capabilities: caps === null || caps === "" ? [] : caps.split(","),
  };
}

export function summarise(key: string, name: string, rows: ShopRow[]): CampaignSummary {
  return {
    key,
    name,
    shops: rows.length,
    analysed: rows.filter((s) => s.status !== "not_analysed").length,
    awaiting: rows.filter((s) => s.status === "not_analysed").length,
    fetchable: rows.filter((s) => s.status === "not_analysed" && s.websiteUrl !== null)
      .length,
    completed: rows.filter((s) => s.status === "completed").length,
    partial: rows.filter((s) => s.status === "partially_completed").length,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Every shop in a campaign with its LATEST run, if it has one.
 *
 * A left join, deliberately: a shop with no run must still appear. Dropping it
 * would make the list quietly shorter than the spreadsheet and imply the
 * missing ones were fine.
 */
export const SHOPS_SQL = (tenantSlug: string, campaignKey: string) => `
with t as (select id from platform.tenants where slug = ${lit(tenantSlug)}),
     c as (select id from transform_audit.campaigns
            where tenant_id = (select id from t) and key = ${lit(campaignKey)}),
     latest as (
       select distinct on (r.prospect_id) r.*
         from transform_audit.runs r
        where r.campaign_id = (select id from c)
        order by r.prospect_id, r.started_at desc)
select sp.prospect_id, sp.source_row, sp.locality,
       p.business_name, p.phone, p.website_url,
       lr.id as run_id, lr.status::text as status,
       lr.composite_score as score, lr.outreach_hook as hook,
       ds.confidence::text as confidence,
       (select string_agg(distinct rc.capability_key::text, ',')
          from transform_audit.recommendations rc
         where rc.run_id = lr.id) as capabilities,
       exists (select 1 from transform_audit.findings f
                where f.run_id = lr.id and f.code = 'website_unreachable') as unreachable
  from transform_audit.shop_profiles sp
  join visibility.prospects p on p.id = sp.prospect_id
  left join latest lr on lr.prospect_id = sp.prospect_id
  left join transform_audit.dimension_scores ds
         on ds.run_id = lr.id and ds.dimension = 'website'
 where sp.tenant_id = (select id from t)
 order by sp.source_row`;

/** One shop's full analysis, assembled from stored rows only. */
export const REPORT_SQL = (tenantSlug: string, prospectId: string) => `
with t as (select id from platform.tenants where slug = ${lit(tenantSlug)}),
     lr as (select r.* from transform_audit.runs r
             where r.prospect_id = ${lit(prospectId)}::uuid
               and r.tenant_id = (select id from t)
             order by r.started_at desc limit 1)
select p.business_name, p.phone, p.website_url, sp.locality, sp.address_line1,
       sp.postal_code, sp.source_row, sp.source_file,
       lr.id as run_id, lr.status::text as status, lr.composite_score as score,
       lr.outreach_hook as hook, lr.started_at, lr.finished_at,
       lr.dimensions_scored, lr.dimensions_possible,
       (select jsonb_agg(jsonb_build_object(
          'dimension', ds.dimension, 'score', ds.score,
          'confidence', ds.confidence, 'note', ds.note,
          'rubric', ds.rubric_version) order by ds.dimension)
          from transform_audit.dimension_scores ds where ds.run_id = lr.id) as scorecard,
       (select jsonb_agg(jsonb_build_object(
          'code', f.code, 'statement', f.statement, 'severity', f.severity,
          'confidence', f.confidence, 'evidence_url', f.evidence_url) order by f.id)
          from transform_audit.findings f where f.run_id = lr.id) as findings,
       (select jsonb_agg(jsonb_build_object(
          'priority', rc.priority, 'title', rc.title, 'detail', rc.detail,
          'capability_key', rc.capability_key, 'rank', rc.rank)
          order by (rc.priority <> 'structural'), rc.rank, rc.id)
          from transform_audit.recommendations rc where rc.run_id = lr.id) as recommendations,
       (select jsonb_agg(jsonb_build_object(
          'key', c.key, 'name', c.name, 'status', c.status,
          'shipped', (c.status = 'available')) order by c.key)
          from (select distinct rc.capability_key from transform_audit.recommendations rc
                 where rc.run_id = lr.id and rc.capability_key is not null) k
          join barberos.capabilities c on c.key = k.capability_key) as bundle
  from transform_audit.shop_profiles sp
  join visibility.prospects p on p.id = sp.prospect_id
  left join lr on true
 where sp.prospect_id = ${lit(prospectId)}::uuid
   and sp.tenant_id = (select id from t)`;

/** Campaign name, or null when the campaign does not exist yet. */
export const CAMPAIGN_SQL = (tenantSlug: string, campaignKey: string) => `
select c.key::text as key, c.name
  from transform_audit.campaigns c
  join platform.tenants t on t.id = c.tenant_id
 where t.slug = ${lit(tenantSlug)} and c.key = ${lit(campaignKey)}`;

/**
 * Single-quote a value for inlining into SQL.
 *
 * The Management API's SQL endpoint takes a statement, not parameters, so
 * values have to be inlined. Everything passed here is an internal identifier
 * (a tenant slug, a campaign key, a UUID from our own database) rather than
 * free text, and the UUID cast makes a malformed id fail rather than run.
 */
export function lit(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}
