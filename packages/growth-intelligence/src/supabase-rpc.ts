// HlbosRpc over a signed-in Supabase session — the production path.
//
// Server-side only. The client must be created with the USER's access token
// (or a website's service-account session), never the service-role key: every
// call then runs as that user, and the database's permission checks and
// row-level security decide what it may do. Nothing here widens access.
//
// Only the schemas and functions in REVENUE_API_SURFACE are reachable. Anything
// else is refused here before a request is made, so exposing the `revenue`
// schema to the API does not by itself expose every function in it.

import type { HlbosRpc } from "./revenue-center.ts";

/** The structural subset of supabase-js this adapter uses (no dependency on the package). */
export interface SupabaseLike {
  schema(name: string): {
    rpc(
      fn: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    from(table: string): {
      select(cols: string): {
        match(
          m: Record<string, string>,
        ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
}

/**
 * The allow-list. Functions: what the Revenue Center calls. Tables: what it
 * reads (RLS still filters rows). comms and workflows stay unexposed: the
 * Revenue Center reaches them only through revenue.* functions.
 */
export const REVENUE_API_SURFACE = {
  functions: new Set([
    "revenue.register_prospect",
    "revenue.adopt_prospect",
    "revenue.set_prospect_status",
    "revenue.send_to_review",
    "revenue.draft_proposal",
    "revenue.submit_proposal",
    "revenue.approve_commercial",
    "revenue.queue_outreach",
    "revenue.upsert_campaign",
    "revenue.set_campaign_status",
    "revenue.begin_discovery_run",
    "revenue.finish_discovery_run",
    "revenue.set_discovery_limits",
    "revenue.ingest_inquiry",
    "revenue.resolve_inquiry",
    "revenue.refer_prospect",
    "revenue.decide_referral",
    "revenue.record_response",
    "revenue.content_sha256",
    "revenue.message_sha256",
    "revenue.approval_detail",
    "revenue.release_outreach",
  ]),
  tables: new Set([
    "revenue.prospect_profiles",
    "revenue.campaigns",
    "revenue.discovery_runs",
    "revenue.assessment_evidence",
    "revenue.review_requests",
    "revenue.approval_bindings",
    "revenue.proposal_links",
    "revenue.inquiries",
    "revenue.referrals",
    "revenue.responses",
    "revenue.industries",
    "revenue.industry_summary",
    "revenue.business_lines",
    "revenue.identity_keys",
    "revenue.open_approvals",
    "revenue.outreach_messages",
    "visibility.prospects",
    "visibility.assessments",
    "visibility.recommendations",
    "visibility.content_assets",
  ]),
} as const;

/** Functions and reads that need a schema other than `revenue`/`visibility` exposed — not allowed through this adapter. */
export class SurfaceError extends Error {
  constructor(what: string) {
    super(`${what} is not part of the Revenue Center API surface.`);
    this.name = "SurfaceError";
  }
}

function split(qualified: string): [string, string] {
  const i = qualified.indexOf(".");
  return [qualified.slice(0, i), qualified.slice(i + 1)];
}

/**
 * `actor` is informational here: identity comes from the session the client
 * was created with. Callers must create one client per signed-in user.
 */
export function supabaseRpc(client: SupabaseLike): HlbosRpc {
  return {
    async call<T>(
      _actor: string,
      fn: string,
      args: Record<string, unknown>,
    ): Promise<T> {
      if (!REVENUE_API_SURFACE.functions.has(fn)) throw new SurfaceError(fn);
      const [schema, name] = split(fn);
      const { data, error } = await client.schema(schema).rpc(name, args);
      if (error) throw new Error(error.message);
      return data as T;
    },
    async rows<T>(
      _actor: string,
      table: string,
      match: Record<string, string>,
    ): Promise<T[]> {
      if (!REVENUE_API_SURFACE.tables.has(table)) throw new SurfaceError(table);
      const [schema, name] = split(table);
      const { data, error } = await client
        .schema(schema)
        .from(name)
        .select("*")
        .match(match);
      if (error) throw new Error(error.message);
      return (data ?? []) as T[];
    },
  };
}
