// Discovery sources and backfill.
//
// A LeadSource returns candidate businesses for an industry in a market:
//   - mockDiscovery: DEVELOPMENT ONLY. Fictitious businesses ("Synthetic …",
//     example.test addresses) run through the REAL Presence Scanner pipeline
//     with the network switched off. Stored with is_synthetic = true, source 'mock'.
//   - placesDiscovery: Google Places through the existing Presence Scanner
//     client. OFF unless `enabled: true` is passed AND the owner has set a paid
//     monthly allowance in revenue.discovery_limits (default 0). Never run here.
//   - an approved imported list goes through the Presence Scanner import mode.
//
// Backfill brings one campaign up to its target of open prospects:
//   campaign (from the database: industry, market, radius, target)
//   -> counts (from the database) -> deficit
//   -> revenue.begin_discovery_run (refused beyond the run and monthly limits)
//   -> candidates -> identity keys -> register (duplicates and rejected businesses are never re-added)
//   -> revenue.finish_discovery_run (what was spent, found, added, skipped)

import { randomUUID } from "node:crypto";

import {
  PLACES_PAGE_SIZE,
  PLACES_PRICING,
  runMarketScan,
  type PlacesClient,
  type Prospect,
  type WebEgress,
} from "@hl-bos/presence-scanner";

import {
  industry as industryByKey,
  planBackfill,
  type BackfillPlan,
  type Industry,
} from "./industries.ts";
import type {
  CampaignRow,
  DiscoverySource as SourceKind,
  PersistResult,
  RevenueCenter,
} from "./revenue-center.ts";
import type { BusinessLine } from "./types.ts";

export interface Market {
  label: string;
  zip: string | undefined;
  radiusMiles: number;
}

export interface LeadSource {
  kind: SourceKind;
  isSynthetic: boolean;
  /** Paid API requests a request for `count` candidates would make (0 for free sources). */
  paidRequestsFor(count: number): number;
  /** Estimated cost in US cents of those requests, at list price. */
  estimatedCostCents(paidRequests: number): number;
  /** Up to `count` candidates for the industry in the market, starting at `offset`. */
  discover(
    industry: Industry,
    market: Market,
    searchTerms: string,
    count: number,
    offset: number,
  ): Promise<Prospect[]>;
}

const OFFLINE: WebEgress = {
  resolve: () => Promise.reject(new Error("network disabled for mock discovery")),
  fetchPage: () => Promise.reject(new Error("network disabled for mock discovery")),
  fetchRobots: () => Promise.resolve(undefined),
};

export function mockDiscovery(now: () => Date = () => new Date()): LeadSource {
  return {
    kind: "mock",
    isSynthetic: true,
    paidRequestsFor: () => 0,
    estimatedCostCents: () => 0,
    async discover(industry, market, _terms, count, offset) {
      const rows = Array.from({ length: count }, (_, i) => {
        const n = offset + i + 1;
        // Unique per industry and number; example.test is reserved and undeliverable.
        const email = `synthetic-${industry.key.replace(/_/g, "-")}-${n}@example.test`;
        return `Synthetic ${industry.label} ${n},none,${email},${n} Test Street ${market.label}`;
      });
      const out = await runMarketScan(
        {
          market: `${market.label} (synthetic)`,
          zip: market.zip,
          radiusMiles: market.radiusMiles,
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

export class DiscoveryDisabledError extends Error {
  constructor() {
    super(
      "Google Places discovery is switched off. It needs the owner's approval and a paid allowance.",
    );
    this.name = "DiscoveryDisabledError";
  }
}

/**
 * Google Places via the existing Presence Scanner pipeline (search, website
 * inspection, scoring). Refuses to run unless explicitly enabled; the database
 * separately refuses a run beyond the owner's monthly allowance.
 */
export function placesDiscovery(opts: {
  enabled: boolean;
  places: PlacesClient;
  egress: WebEgress;
  now?: () => Date;
}): LeadSource {
  return {
    kind: "google_places",
    isSynthetic: false,
    paidRequestsFor: (count) => Math.ceil(count / PLACES_PAGE_SIZE),
    estimatedCostCents: (requests) =>
      Math.ceil((requests * PLACES_PRICING.usdPer1000 * 100) / 1000),
    async discover(industry, market, terms, count) {
      if (!opts.enabled) throw new DiscoveryDisabledError();
      const out = await runMarketScan(
        {
          market: market.label,
          zip: market.zip,
          radiusMiles: market.radiusMiles,
          vertical: industry.scannerVertical,
          maxResults: count,
          searchTerms: terms,
          source: "google_places",
          importText: undefined,
        },
        {
          places: opts.places,
          egress: opts.egress,
          now: opts.now ?? (() => new Date()),
          newId: () => randomUUID(),
          existing: [],
          actor: "places discovery",
        },
      );
      return out.prospects;
    },
  };
}

export interface BackfillResult {
  plan: BackfillPlan;
  runId: string | null;
  added: string[];
  duplicatesSkipped: number;
  needsReview: number;
  paidRequests: number;
}

/**
 * Bring one campaign up to its target of open prospects. Duplicates — by any
 * identity key, including rejected records — are skipped, never re-added.
 */
export async function backfillCampaign(
  rc: RevenueCenter,
  actor: string,
  line: BusinessLine,
  campaignKey: string,
  source: LeadSource,
  opts: { maxPages?: number; pageSize?: number } = {},
): Promise<BackfillResult> {
  const campaign: CampaignRow | undefined = (await rc.loadCampaigns(actor)).find(
    (c) => c.key === campaignKey && c.line === line,
  );
  if (!campaign)
    throw new Error(`Campaign ${campaignKey} not found for ${line.toUpperCase()}.`);
  const ind = industryByKey(campaign.industry_key);
  if (!ind) throw new Error(`Unknown industry ${campaign.industry_key}.`);
  const counts = await rc.industryCounts(actor, {
    includeSynthetic: source.isSynthetic,
    line,
  });
  const [plan] = planBackfill(counts, [ind], { [ind.key]: campaign.target_active });
  if (!plan) throw new Error("no plan");
  const result: BackfillResult = {
    plan,
    runId: null,
    added: [],
    duplicatesSkipped: 0,
    needsReview: 0,
    paidRequests: 0,
  };
  if (plan.deficit === 0) return result;

  const pageSize = opts.pageSize ?? plan.deficit;
  const maxPages = opts.maxPages ?? 5;
  const planned = source.paidRequestsFor(pageSize) * maxPages;
  result.runId = await rc.beginDiscoveryRun(
    actor,
    line,
    campaignKey,
    source.kind,
    pageSize,
    planned,
  );
  const market: Market = {
    label: campaign.market_label,
    zip: campaign.market_zip ?? undefined,
    radiusMiles: Number(campaign.radius_miles),
  };
  let candidates = 0;
  let error: string | undefined;
  try {
    let offset = 0;
    for (let page = 0; page < maxPages && result.added.length < plan.deficit; page++) {
      const batch = await source.discover(
        ind,
        market,
        campaign.search_terms ?? ind.searchTerms,
        pageSize,
        offset,
      );
      result.paidRequests += source.paidRequestsFor(pageSize);
      offset += pageSize;
      candidates += batch.length;
      if (batch.length === 0) break;
      for (const lead of batch) {
        if (result.added.length >= plan.deficit) break;
        const r: PersistResult = await rc.persistDiscovered(actor, lead, {
          industryKey: ind.key,
          campaignKey,
          source: source.kind,
          isSynthetic: source.isSynthetic,
          runId: result.runId,
        });
        if (r.status === "persisted") result.added.push(r.prospectId);
        else if (r.status === "duplicate") result.duplicatesSkipped++;
        else result.needsReview++;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await rc.finishDiscoveryRun(actor, result.runId, {
    paidRequests: result.paidRequests,
    estCostCents: source.estimatedCostCents(result.paidRequests),
    candidates,
    added: result.added.length,
    duplicates: result.duplicatesSkipped,
    needsReview: result.needsReview,
    error,
  });
  if (error) throw new Error(error);
  return result;
}
