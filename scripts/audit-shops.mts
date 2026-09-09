/**
 * Analyse the shops in a campaign that have a website nobody has fetched yet.
 *
 * WHY THIS IS A SCRIPT AND NOT A SERVER ACTION. The Control Center already
 * shells out for everything that takes real time and real network -- git, pnpm,
 * the test suite -- and this is the same shape: it makes outbound HTTP requests
 * to third-party websites, one at a time, for as long as it takes. Running it
 * as a child process keeps the console responsive, keeps the engine importable
 * by anything else, and means it can be run and verified on its own.
 *
 * IT RUNS WHERE THE NETWORK IS. The build environment's egress policy denies
 * arbitrary hosts, so no shop site can be fetched from there. The CEO's machine
 * has ordinary internet access, which is exactly where the console runs.
 *
 * NOTHING IS BYPASSED. Every write impersonates the campaign's tenant owner and
 * goes through the same permission-checked SECURITY DEFINER functions the app
 * would call. The analysis itself is computed by the shared runner; this file
 * contributes a real fetch adapter and a transport, and no scoring logic.
 *
 *   node --experimental-strip-types scripts/audit-shops.mts \
 *     --campaign wny_barbers_50 [--limit 5] [--dry-run]
 *
 * Reads SUPABASE_ACCESS_TOKEN and HLBOS_SUPABASE_PROJECT_REF from the
 * environment. Prints one JSON object per line so a caller can follow along.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { analyseShop } from "../supabase/functions/_shared/transform_audit/run.ts";
import type {
  AuditNetwork,
  AuditStore,
  ShopInput,
} from "../supabase/functions/_shared/transform_audit/run.ts";
import type { FetchResult } from "../supabase/functions/_shared/discovery/scan.ts";
import {
  asOwner,
  lit,
  loadContext,
  runnerFromEnv,
  text,
  type SqlRunner,
} from "./lib/hlbos-sql.mts";

export type { SqlRunner };

const MAX_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// A real fetch adapter
//
// runScan() validates the target and EVERY redirect hop against the SSRF rules
// in _shared/discovery/url.ts, and re-validates the resolved IPs. That is why
// redirects are followed MANUALLY here: letting fetch() follow them would hand
// back only the final URL, and the hops in between would never be checked.
// ---------------------------------------------------------------------------

export function nodeNetwork(): AuditNetwork {
  return {
    resolve: async (host: string) => {
      const all = await dnsLookup(host, { all: true });
      return all.map((a) => a.address);
    },
    fetchPage: async (url: string): Promise<FetchResult> => {
      const chain: string[] = [];
      let current = url;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
        let res: Response;
        try {
          res = await fetch(current, {
            redirect: "manual",
            signal: ctl.signal,
            headers: {
              // Identify honestly. A shop owner reading their logs should be
              // able to tell who this was.
              "User-Agent":
                "HermanLegacyDigital-SiteAudit/0.1 (+https://hermanlegacy.digital; one request per shop)",
              Accept: "text/html,application/xhtml+xml",
            },
          });
        } finally {
          clearTimeout(timer);
        }

        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (loc === null) throw new Error(`redirect_without_location:${res.status}`);
          current = new URL(loc, current).toString();
          chain.push(current);
          continue;
        }

        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => (headers[k] = v));
        const buf = await res.arrayBuffer();
        if (buf.byteLength > MAX_BYTES) throw new Error("response_too_large");
        return {
          status: res.status,
          finalUrl: current,
          redirectChain: chain,
          headers,
          body: new TextDecoder().decode(buf),
          bytes: buf.byteLength,
          contentType: res.headers.get("content-type") ?? "",
        };
      }
      throw new Error("too_many_redirects");
    },
  };
}

// ---------------------------------------------------------------------------
// The store: every write goes through the permission-checked functions
// ---------------------------------------------------------------------------

interface Ctx {
  run: SqlRunner;
  campaignId: string;
  ownerId: string;
}

/**
 * Writes one shop's whole analysis in a SINGLE statement.
 *
 * Deliberately atomic: a run that got its findings but died before its
 * dimension score would sit in production as a half-analysis, and the schema
 * would let it because 'running' is a legal state. One statement means a shop
 * is either fully analysed or not analysed at all.
 */
export function writeAnalysisSql(
  ctx: Ctx,
  prospectId: string,
  analysis: unknown,
): string {
  return asOwner(
    ctx.ownerId,
    `declare
       v_a jsonb := ${lit(JSON.stringify(analysis))}::jsonb;
       v_run uuid; v_f jsonb; v_r jsonb; v_ids jsonb := '{}'::jsonb; v_fid bigint;
     begin
       v_run := transform_audit.start_run(${lit(ctx.campaignId)}::uuid, ${lit(prospectId)}::uuid);
       for v_f in select * from jsonb_array_elements(v_a->'findings') loop
         v_fid := transform_audit.record_finding(
           v_run, 'website', (v_f->>'code')::extensions.citext, v_f->>'statement',
           (v_f->>'confidence')::transform_audit.confidence,
           (v_f->>'severity')::transform_audit.severity,
           v_f->>'evidence_url', v_f->'observed', (v_f->>'detector')::extensions.citext);
         v_ids := v_ids || jsonb_build_object(v_f->>'code', v_fid);
       end loop;
       perform transform_audit.record_dimension(
         v_run, 'website', nullif(v_a->'dimension'->>'score','')::int,
         (v_a->'dimension'->>'confidence')::transform_audit.confidence,
         (v_a->'dimension'->>'rubric_version')::extensions.citext,
         v_a->'dimension'->>'note');
       for v_r in select * from jsonb_array_elements(v_a->'recommendations') loop
         perform transform_audit.add_recommendation(
           v_run, (v_r->>'priority')::transform_audit.priority, v_r->>'title',
           v_r->>'detail', (v_r->>'capability_key')::extensions.citext,
           (v_ids ->> (v_r->>'addresses_code'))::bigint, (v_r->>'rank')::int);
       end loop;
       if v_a->'hook' is not null and v_a->'hook' <> 'null'::jsonb then
         perform transform_audit.set_outreach_hook(
           v_run, (v_ids ->> (v_a->'hook'->>'code'))::bigint, v_a->'hook'->>'text');
       end if;
       perform transform_audit.finish_run(v_run);
     end;`,
  );
}

/** Collects what the runner decided, so it can be written in one statement. */
function capturingStore(): {
  store: AuditStore;
  analysis: {
    findings: unknown[];
    recommendations: unknown[];
    dimension: unknown;
    hook: unknown;
  };
} {
  const codeById = new Map<number, string>();
  let next = 1;
  const analysis = {
    findings: [] as unknown[],
    recommendations: [] as unknown[],
    dimension: null as unknown,
    hook: null as unknown,
  };
  const store: AuditStore = {
    startRun: () => Promise.resolve("pending"),
    recordFinding: (_r, f) => {
      const id = next++;
      codeById.set(id, f.code);
      analysis.findings.push({
        code: f.code,
        statement: f.statement,
        confidence: f.confidence,
        severity: f.severity,
        evidence_url: f.evidenceUrl,
        observed: f.observed,
        detector: f.detector,
      });
      return Promise.resolve(id);
    },
    recordDimension: (_r, d) => {
      analysis.dimension = {
        score: d.score,
        confidence: d.confidence,
        rubric_version: d.rubricVersion,
        note: d.note,
      };
      return Promise.resolve();
    },
    addRecommendation: (_r, x) => {
      analysis.recommendations.push({
        priority: x.priority,
        rank: x.rank,
        title: x.title,
        detail: x.detail,
        capability_key: x.capabilityKey,
        addresses_code:
          x.addressesFindingId !== null
            ? (codeById.get(x.addressesFindingId) ?? null)
            : null,
      });
      return Promise.resolve(next++);
    },
    setOutreachHook: (_r, fid, hook) => {
      analysis.hook = { code: codeById.get(fid) ?? null, text: hook };
      return Promise.resolve();
    },
    finishRun: () => Promise.resolve("completed"),
  };
  return { store, analysis };
}

// ---------------------------------------------------------------------------

export const PENDING_SQL = (campaignKey: string, tenantSlug: string, limit: number) => `
with t as (select id from platform.tenants where slug = ${lit(tenantSlug)}),
     c as (select id from transform_audit.campaigns
            where tenant_id = (select id from t) and key = ${lit(campaignKey)})
select sp.prospect_id::text, p.business_name, p.website_url, sp.locality
  from transform_audit.shop_profiles sp
  join visibility.prospects p on p.id = sp.prospect_id
 where sp.tenant_id = (select id from t)
   and p.website_url is not null
   and not exists (select 1 from transform_audit.runs r
                    where r.prospect_id = sp.prospect_id
                      and r.campaign_id = (select id from c))
 order by sp.source_row
 limit ${Math.max(1, Math.floor(limit))}`;

export interface AuditProgress {
  event: "start" | "shop" | "done" | "error";
  shop?: string;
  index?: number;
  total?: number;
  score?: number | null;
  confidence?: string;
  status?: string;
  message?: string;
}

/**
 * Analyse up to `limit` unfetched shops, one at a time.
 *
 * Sequential with a pause between shops on purpose: a burst of parallel
 * requests at fifty small businesses from one address is what makes a crawler
 * look like an attack.
 */
export async function auditPendingShops(opts: {
  run: SqlRunner;
  net: AuditNetwork;
  campaignKey: string;
  tenantSlug: string;
  limit?: number;
  delayMs?: number;
  dryRun?: boolean;
  onProgress?: (p: AuditProgress) => void;
}): Promise<{ analysed: number; failed: number }> {
  const {
    run,
    net,
    campaignKey,
    tenantSlug,
    limit = 100,
    delayMs = 1500,
    dryRun = false,
    onProgress = () => {},
  } = opts;

  const loaded = await loadContext(run, tenantSlug, campaignKey);
  if (loaded.campaignId === null) throw new Error(`campaign ${campaignKey} not found`);
  const ctx: Ctx = { run, campaignId: loaded.campaignId, ownerId: loaded.ownerId };

  const pending = await run(PENDING_SQL(campaignKey, tenantSlug, limit));
  onProgress({ event: "start", total: pending.length });

  let analysed = 0;
  let failed = 0;
  for (const [i, row] of pending.entries()) {
    const shop: ShopInput = {
      prospectId: text(row["prospect_id"]) ?? "",
      businessName: text(row["business_name"]) ?? "",
      websiteUrl: text(row["website_url"]),
      locality: text(row["locality"]),
    };
    try {
      const { store, analysis } = capturingStore();
      const outcome = await analyseShop(shop, store, net);
      if (!dryRun) await run(writeAnalysisSql(ctx, shop.prospectId, analysis));
      analysed++;
      onProgress({
        event: "shop",
        shop: shop.businessName,
        index: i + 1,
        total: pending.length,
        score: outcome.websiteScore,
        confidence: outcome.confidence,
      });
    } catch (e) {
      failed++;
      onProgress({
        event: "error",
        shop: shop.businessName,
        index: i + 1,
        total: pending.length,
        message: String(e),
      });
    }
    if (delayMs > 0 && i < pending.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  onProgress({ event: "done", total: pending.length, status: `${analysed} analysed` });
  return { analysed, failed };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedAs = process.argv[1] ?? "";
const isMain = invokedAs.endsWith("audit-shops.mts");

if (isMain) {
  const arg = (name: string): string | null => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? null : (process.argv[i + 1] ?? null);
  };
  const conn = runnerFromEnv();
  if (!conn.ok) {
    console.error(JSON.stringify({ event: "error", message: conn.reason }));
    process.exit(1);
  }
  const res = await auditPendingShops({
    run: conn.run,
    net: nodeNetwork(),
    campaignKey: arg("campaign") ?? "wny_barbers_50",
    tenantSlug: arg("tenant") ?? "herman-legacy-digital",
    limit: Number(arg("limit") ?? 100),
    dryRun: process.argv.includes("--dry-run"),
    onProgress: (p) => console.log(JSON.stringify(p)),
  });
  process.exit(res.failed > 0 && res.analysed === 0 ? 1 : 0);
}
