// The audit runner: one shop in, one complete stored analysis out.
//
// This is the piece between the rubric (barber_web.ts, which decides what a
// page MEANS) and the database (migration 0049, which decides what may be
// stored). It owns the ORDER of operations, and that order is not arbitrary --
// the schema enforces it:
//
//   1. start the run
//   2. record every finding FIRST, because a dimension cannot be scored
//      'verified' until a finding on that run carries an evidence URL
//   3. score the dimension
//   4. add recommendations, each linked to the finding it answers
//   5. set the outreach hook, citing a finding of this run
//   6. finish the run, which decides completed vs partially_completed by
//      whether every weighted dimension got a verdict
//
// Everything the runner touches is INJECTED -- fetching, DNS, and every write.
// That keeps it deterministic and offline in tests, and lets the same code run
// wherever the network actually is: the Control Center on the CEO's own
// machine, or an edge function. It does not choose.
//
// WEBSITE ONLY. This is Phase 1. The Google Business Profile, social and
// competitor dimensions are modelled in the schema and weightable in a
// campaign, but no collector exists for them, so this runner scores exactly
// one dimension. A campaign that weights the others will close
// 'partially_completed' and the report will name them as unreached. That is
// the honest outcome and it is why finish_run has that status at all.

import type { FetchResult } from "../discovery/scan.ts";
import { runScan } from "../discovery/scan.ts";
import { extractFindings } from "../discovery/extract.ts";
import type {
  AuditFinding,
  BarberWebAudit,
  Confidence,
  Priority,
  Severity,
} from "./barber_web.ts";
import {
  auditWithoutPage,
  hostedPlatform,
  outreachHook,
  recommendFrom,
  scoreBarberWebsite,
} from "./barber_web.ts";

export interface ShopInput {
  prospectId: string;
  businessName: string;
  /** null means the prospect list records no site — itself a finding. */
  websiteUrl: string | null;
  locality?: string | null;
}

/** Every database write the runner performs, as an injectable port. */
export interface AuditStore {
  startRun(prospectId: string): Promise<string>;
  recordFinding(
    runId: string,
    f: {
      dimension: string;
      code: string;
      statement: string;
      confidence: Confidence;
      severity: Severity;
      evidenceUrl: string | null;
      observed: Record<string, unknown>;
      detector: string;
    },
  ): Promise<number>;
  recordDimension(
    runId: string,
    d: {
      dimension: string;
      score: number | null;
      confidence: Confidence;
      rubricVersion: string;
      note: string;
    },
  ): Promise<void>;
  addRecommendation(
    runId: string,
    r: {
      priority: Priority;
      rank: number;
      title: string;
      detail: string;
      capabilityKey: string | null;
      addressesFindingId: number | null;
    },
  ): Promise<number>;
  setOutreachHook(runId: string, findingId: number, hook: string): Promise<void>;
  finishRun(runId: string, error?: string | null): Promise<string>;
  /** Record the hosting platform we detected back onto the shop profile. */
  noteWebsitePlatform?(prospectId: string, platform: string | null): Promise<void>;
}

export interface AuditNetwork {
  fetchPage(url: string): Promise<FetchResult>;
  resolve(host: string): Promise<string[]>;
}

export interface AuditOutcome {
  runId: string;
  status: string;
  websiteScore: number | null;
  confidence: Confidence;
  findingCount: number;
  failingCount: number;
  recommendationCount: number;
  /** Capability keys the analysis points at, deduplicated, in priority order. */
  recommendedCapabilities: string[];
  outreachHook: string | null;
  hostedPlatform: string | null;
  /** Set only when the site could not be read. Never invented. */
  fetchError?: string;
}

/**
 * Audit one shop's website and store the whole analysis.
 *
 * Throws only if the RUN ITSELF cannot be recorded. A shop whose site is
 * missing or unreachable is a normal, storable outcome — it produces a report
 * that says so, which is exactly the report the outreach motion wants.
 */
export async function analyseShop(
  shop: ShopInput,
  store: AuditStore,
  net: AuditNetwork,
): Promise<AuditOutcome> {
  const runId = await store.startRun(shop.prospectId);

  let audit: BarberWebAudit;
  let platform: string | null = null;
  let fetchError: string | undefined;

  const url = (shop.websiteUrl ?? "").trim();
  if (url === "") {
    // The prospect list records no site. That is an observation about the
    // shop, not a failure of ours, and it is the single strongest finding a
    // local business audit can produce.
    audit = auditWithoutPage("absent", { source: "prospect list" });
  } else {
    const scan = await runScan({
      rawUrl: url,
      resolve: net.resolve,
      fetchPage: net.fetchPage,
    });
    if (scan.status === "failed") {
      // We do not know what is on the page, so we say we do not know.
      fetchError = scan.error;
      audit = auditWithoutPage("unreachable", { url, error: scan.error ?? null });
    } else {
      const page = await net.fetchPage(scan.normalizedUrl);
      const findings = extractFindings(page.body, page.headers, page.finalUrl);
      platform = hostedPlatform(page.finalUrl);
      audit = scoreBarberWebsite({
        html: page.body,
        findings,
        finalUrl: page.finalUrl,
        locality: shop.locality ?? null,
      });
    }
  }

  // --- 2. Findings first. The dimension cannot claim 'verified' until one of
  // these carries an evidence URL, so this order is load-bearing.
  const findingIdByCode = new Map<string, number>();
  for (const f of audit.findings) {
    const id = await store.recordFinding(runId, {
      dimension: "website",
      code: f.code,
      statement: f.statement,
      confidence: f.confidence,
      severity: f.severity,
      evidenceUrl: f.evidenceUrl,
      observed: f.observed,
      detector: f.detector,
    });
    findingIdByCode.set(f.code, id);
  }

  // --- 3. The dimension score.
  await store.recordDimension(runId, {
    dimension: "website",
    score: audit.score,
    confidence: audit.confidence,
    rubricVersion: audit.rubricVersion,
    note:
      audit.confidence === "unknown"
        ? `Site not read: ${fetchError ?? "no reason recorded"}.`
        : `${audit.checksEvaluated} of ${audit.checksPossible} checks were evaluable on this page.`,
  });

  // --- 4. Recommendations — judgment, and only for what actually failed.
  const recommendations = recommendFrom(audit.findings);
  for (const r of recommendations) {
    await store.addRecommendation(runId, {
      priority: r.priority,
      rank: r.rank,
      title: r.title,
      detail: r.detail,
      capabilityKey: r.capabilityKey,
      addressesFindingId:
        r.addressesCode !== null
          ? (findingIdByCode.get(r.addressesCode) ?? null)
          : null,
    });
  }

  // --- 5. The outreach hook, if there is a real observation behind one.
  const hook = outreachHook(audit.findings);
  if (hook) {
    const fid = findingIdByCode.get(hook.code);
    if (fid !== undefined) await store.setOutreachHook(runId, fid, hook.hook);
  }

  if (platform !== null && store.noteWebsitePlatform) {
    await store.noteWebsitePlatform(shop.prospectId, platform);
  }

  // --- 6. Close it. finish_run decides completed vs partially_completed by
  // whether every weighted dimension got a verdict; the runner does not.
  const status = await store.finishRun(runId, null);

  const failing = audit.findings.filter((f) => f.severity !== "info");
  const caps: string[] = [];
  for (const r of recommendations) {
    if (r.capabilityKey && !caps.includes(r.capabilityKey)) caps.push(r.capabilityKey);
  }

  return {
    runId,
    status,
    websiteScore: audit.score,
    confidence: audit.confidence,
    findingCount: audit.findings.length,
    failingCount: failing.length,
    recommendationCount: recommendations.length,
    recommendedCapabilities: caps,
    outreachHook: hook?.hook ?? null,
    hostedPlatform: platform,
    ...(fetchError !== undefined ? { fetchError } : {}),
  };
}

/**
 * Audit a list of shops, one at a time.
 *
 * Sequential on purpose: this points real HTTP requests at small businesses'
 * websites, and a burst of parallel fetches from one address is what makes a
 * crawler look like an attack. `delayMs` is the gap between shops.
 *
 * One shop failing never stops the batch — its outcome carries the error and
 * the rest continue.
 */
export async function analyseShops(
  shops: readonly ShopInput[],
  store: AuditStore,
  net: AuditNetwork,
  opts: {
    delayMs?: number;
    onProgress?: (done: number, total: number, shop: ShopInput) => void;
  } = {},
): Promise<Array<{ shop: ShopInput; outcome: AuditOutcome | null; error?: string }>> {
  const delay = opts.delayMs ?? 1000;
  const results: Array<{
    shop: ShopInput;
    outcome: AuditOutcome | null;
    error?: string;
  }> = [];
  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i];
    try {
      results.push({ shop, outcome: await analyseShop(shop, store, net) });
    } catch (e) {
      results.push({ shop, outcome: null, error: String(e) });
    }
    opts.onProgress?.(i + 1, shops.length, shop);
    if (delay > 0 && i < shops.length - 1) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return results;
}

/** Findings that failed, worst first — the "areas of improvement" list. */
export function areasForImprovement(findings: readonly AuditFinding[]): AuditFinding[] {
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, info: 3 };
  return findings
    .filter((f) => f.severity !== "info")
    .sort((a, b) => order[a.severity] - order[b.severity]);
}
