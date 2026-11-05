// Discovery sources and backfill.
//
// A DiscoverySource returns candidate leads for an industry. Two exist:
//   - mockDiscovery: DEVELOPMENT ONLY. Fictitious businesses ("Synthetic …",
//     .test domains, 555-01xx numbers) run through the REAL Presence Scanner
//     pipeline with the network switched off. Every record it produces is
//     stored with is_synthetic = true and source 'mock'.
//   - The Presence Scanner itself (Google Places or an imported list), which the
//     console already runs. Live Places discovery has never been run (no key).
// Nothing here pretends a mock result came from a live search.

import { randomUUID } from "node:crypto";

import { runMarketScan, type Prospect, type WebEgress } from "@hl-bos/presence-scanner";

import { planBackfill, type BackfillPlan, type Industry } from "./industries.ts";
import type {
  DiscoverySource as SourceKind,
  PersistResult,
  RevenueCenter,
} from "./revenue-center.ts";

export interface LeadSource {
  kind: SourceKind;
  isSynthetic: boolean;
  /** Up to `count` candidates for the industry, starting at `offset` (for paging). */
  discover(industry: Industry, count: number, offset: number): Promise<Prospect[]>;
}

const OFFLINE: WebEgress = {
  fetch: () => Promise.reject(new Error("network disabled for mock discovery")),
} as unknown as WebEgress;

export function mockDiscovery(now: () => Date = () => new Date()): LeadSource {
  return {
    kind: "mock",
    isSynthetic: true,
    async discover(industry, count, offset) {
      const rows = Array.from({ length: count }, (_, i) => {
        const n = offset + i + 1;
        // Unique per industry and number; .test is a reserved, undeliverable domain.
        const email = `synthetic-${industry.key.replace(/_/g, "-")}-${n}@example.test`;
        return `Synthetic ${industry.label} ${n},none,${email},${n} Test Street Buffalo NY`;
      });
      const out = await runMarketScan(
        {
          market: "Buffalo, NY (synthetic)",
          zip: undefined,
          radiusMiles: 10,
          vertical: industry.scannerVertical,
          maxResults: count,
          searchTerms: undefined,
          source: "import",
          importText: ["name,website,email,address", ...rows].join("\n"),
        },
        {
          places: null,
          egress: OFFLINE,
          now,
          newId: () => randomUUID(),
          existing: [],
          actor: "mock discovery",
        },
      );
      return out.prospects;
    },
  };
}

export interface BackfillResult {
  plan: BackfillPlan;
  added: string[];
  duplicatesSkipped: number;
  needsReview: number;
}

/**
 * Bring one industry up to its target of open prospects. Duplicates (same
 * dedupe key, including rejected records) are skipped, never re-added; the
 * source is paged until the deficit is filled or `maxPages` is reached.
 */
export async function backfillIndustry(
  rc: RevenueCenter,
  actor: string,
  industry: Industry,
  campaignKey: string,
  source: LeadSource,
  opts: { maxPages?: number; pageSize?: number } = {},
): Promise<BackfillResult> {
  const counts = await rc.industryCounts(actor, {
    includeSynthetic: source.isSynthetic,
  });
  const [plan] = planBackfill(counts, [industry]);
  if (!plan) throw new Error("no plan");
  const result: BackfillResult = {
    plan,
    added: [],
    duplicatesSkipped: 0,
    needsReview: 0,
  };
  const pageSize = opts.pageSize ?? Math.max(plan.deficit, 1);
  let offset = 0;
  for (
    let page = 0;
    page < (opts.maxPages ?? 5) && result.added.length < plan.deficit;
    page++
  ) {
    const candidates = await source.discover(industry, pageSize, offset);
    offset += pageSize;
    if (candidates.length === 0) break;
    for (const lead of candidates) {
      if (result.added.length >= plan.deficit) break;
      const r: PersistResult = await rc.persistDiscovered(actor, lead, {
        industryKey: industry.key,
        campaignKey,
        source: source.kind,
        isSynthetic: source.isSynthetic,
      });
      if (r.status === "persisted") result.added.push(r.prospectId);
      else if (r.status === "duplicate") result.duplicatesSkipped++;
      else result.needsReview++;
    }
  }
  return result;
}
