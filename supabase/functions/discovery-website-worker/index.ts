// discovery-website-worker — the Website Assessment Collector's runtime.
//
// STATUS: STRUCTURAL SCAFFOLDING, not deployed. Nothing in this file runs
// against a live target or a remote project in Checkpoint 5. It documents the
// exact production wiring and reuses the shared, fully-tested pieces:
//
//   * events.claim_deliveries / events.complete_delivery — the SHARED
//     dispatcher handler-invocation extension (migration 0021, validated by
//     supabase/tests/23_events_handlers.sql). This worker is one handler; the
//     mechanism is reusable by any consumer module.
//   * discovery.update_scan_progress / record_scan_finding / start_assessment /
//     set_scan_assessment / score_dimension / complete_scan — the scan
//     lifecycle + scoring RPCs (migrations 0020/0022, validated by
//     24_website_scan.sql). Every finding lands in the CANONICAL
//     discovery.evidence store and every score in discovery.profile_scores;
//     this worker creates no parallel store.
//   * runScan (../_shared/discovery/scan.ts) — deterministic, SSRF-safe,
//     prompt-injection-fenced scan core (validated by
//     ../tests/discovery_website.test.ts).
//
// The deterministic core (runScan) is exercised directly by the local test
// suite with injected fetch/resolve; it needs no deployment to be proven. This
// worker only adds the production plumbing around it, which stays inert until a
// separate, explicitly CEO-authorized deployment checkpoint.
//
// Every gated capability below (real DNS/fetch egress, Anthropic gateway,
// pg_cron/pg_net scheduling, edge deploy, PageSpeed) is named but NOT invoked.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { runScan } from "../_shared/discovery/scan.ts";

const HANDLER_REF = "discovery-website-worker";

// Production egress adapters. Left unset in every non-deployed environment;
// wiring them is a CEO-gated deployment step, not part of Checkpoint 5.
//
//   resolve(host)   -> a DNS resolver (e.g. Deno.resolveDns) whose answers are
//                      re-checked by resolveAndValidate (rebinding defense).
//   fetchPage(url)  -> an HTTP client that follows redirects manually, exposes
//                      the redirect chain, and enforces byte/timeout budgets so
//                      scan.ts can validate every hop.
//   analyze(req)    -> the shared AI gateway (ai-gateway fn) called through the
//                      Anthropic provider; MUST validate structured output.
type Egress = Parameters<typeof runScan>[0];
type ScanEgress = Pick<Egress, "resolve" | "fetchPage" | "analyze">;

// The event payload emitted by discovery.request_website_scan:
//   { scan: uuid, profile: uuid, url: normalized_url }
interface ScanDelivery {
  delivery_id: number;
  payload: { scan: string; profile: string; url: string };
}

// Map a scan terminal state to the two RPC status vocabularies. The scan core
// returns completed | partially_completed | failed; those are exactly the
// terminal states discovery.complete_scan accepts.
export async function handleDelivery(
  admin: ReturnType<typeof createClient>,
  delivery: ScanDelivery,
  egress: ScanEgress,
): Promise<void> {
  const { scan, profile, url } = delivery.payload;
  try {
    // 1. run the deterministic, SSRF-safe scan (AI optional, non-blocking).
    await admin
      .schema("discovery")
      .rpc("update_scan_progress", { p_scan: scan, p_status: "fetching" });
    const result = await runScan({ rawUrl: url, ...egress });

    // 2. record every deterministic finding as CANONICAL discovery evidence.
    for (const f of result.findings) {
      await admin.schema("discovery").rpc("record_scan_finding", {
        p_scan: scan,
        p_page_url: result.normalizedUrl,
        p_key: f.key,
        p_value: f.value,
        p_category: f.category,
        p_severity: f.severity,
        p_confidence: f.confidence,
        p_detection: f.detection,
      });
    }

    // 3. persist crawl counters + rubric/prompt versions on the scan row.
    await admin.schema("discovery").rpc("update_scan_progress", {
      p_scan: scan,
      p_status: "analyzing",
      p_stats: {
        pages_fetched: result.stats.pagesFetched,
        redirect_count: result.stats.redirectCount,
        bytes_downloaded: result.stats.bytes,
        findings_count: result.stats.findingsCount,
      },
    });

    // 4. open a discovery assessment, link it, and feed rubric-derived scores
    //    into the SHARED scoring framework (discovery.score_dimension ->
    //    profile_scores). Composite scores stay data-driven in the DB.
    const { data: assessmentId } = await admin
      .schema("discovery")
      .rpc("start_assessment", { p_profile: profile });
    await admin
      .schema("discovery")
      .rpc("set_scan_assessment", { p_scan: scan, p_assessment: assessmentId });
    for (const d of result.dimensions) {
      await admin.schema("discovery").rpc("score_dimension", {
        p_assessment: assessmentId,
        p_framework: d.framework,
        p_dimension: d.dimension,
        p_score: Math.round(d.score),
        p_note: `website rubric ${result.rubricVersion}; evidence: ${d.evidenceKeys.join(", ")}`,
      });
    }

    // 5. close the scan with the honest terminal state from the core. An AI
    //    failure yields partially_completed — deterministic findings stand.
    await admin.schema("discovery").rpc("complete_scan", {
      p_scan: scan,
      p_status: result.status,
      p_error: result.error ?? result.aiError ?? null,
    });

    // 6. mark the delivery done. If any step above threw, the catch marks it
    //    failed and the shared dispatcher retries/backs-off/dead-letters.
    await admin.schema("events").rpc("complete_delivery", {
      p_delivery: delivery.delivery_id,
      p_success: true,
      p_error: null,
    });
  } catch (e) {
    await admin.schema("events").rpc("complete_delivery", {
      p_delivery: delivery.delivery_id,
      p_success: false,
      p_error: `worker_error:${String(e).slice(0, 200)}`,
    });
  }
}

// Production entrypoint. Invoked on a schedule (CEO-gated pg_cron -> pg_net, or
// a scheduled edge trigger). Inert until deployed: no scheduler is enabled and
// no egress adapters are wired in Checkpoint 5.
Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Claim a small batch of due, unclaimed deliveries for this handler
  // (FOR UPDATE SKIP LOCKED under the hood — safe to run concurrently).
  const { data: claimed, error } = await admin
    .schema("events")
    .rpc("claim_deliveries", { p_handler_ref: HANDLER_REF, p_limit: 5 });
  if (error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Egress adapters are intentionally absent here. A deployed build supplies
  // real resolve/fetchPage/analyze and calls handleDelivery for each claim;
  // without them we process nothing and leave the claims to expire back.
  return new Response(
    JSON.stringify({
      claimed: (claimed as unknown[])?.length ?? 0,
      processed: 0,
      note: "inert: egress not wired",
    }),
    { headers: { "content-type": "application/json" } },
  );
});

export { HANDLER_REF };
