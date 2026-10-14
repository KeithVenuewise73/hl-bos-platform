// The market scan, start to finish:
//   source (Google Places or an import) -> de-duplicate -> inspect each website
//   through the existing safe scanner -> findings -> qualify -> score -> rank.
//
// Storage is not this file's business: it receives the existing prospects and
// returns new/updated ones; a repository (repository.ts) persists them.

import { dedupeCandidates, identityKeys, type DedupeGroup } from "./dedupe.ts";
import { importFindings, placeFindings, reviewFigures } from "./findings.ts";
import { distanceMiles, resolveMarket, type LatLon } from "./geo.ts";
import { parseImport } from "./import.ts";
import { classifyUrl, formatPhone, normalizePhone, toUrl } from "./normalize.ts";
import {
  PLACES_MAX_RESULTS,
  placesConfigMessage,
  placesSnapshot,
  type PlacesClient,
} from "./places.ts";
import { effectiveQualification, qualify } from "./qualify.ts";
import {
  DEFAULT_SCORING_CONFIG,
  scoreOpportunity,
  type ScoringConfig,
} from "./score.ts";
import { suggestServices } from "./services.ts";
import { VERTICALS, isVertical } from "./verticals.ts";
import { inspectWebsite, offlineInspection, type WebEgress } from "./website.ts";
import type {
  ApiUsage,
  Candidate,
  Finding,
  MarketRef,
  Prospect,
  ScanRequest,
  ScanRun,
  Vertical,
  WebsiteStatus,
} from "./types.ts";

export interface ScanDeps {
  /** null = Google Places not configured; import mode still works. */
  places: PlacesClient | null;
  egress: WebEgress;
  now: () => Date;
  newId: () => string;
  /** Everything already stored, so a rescan updates instead of duplicating. */
  existing: Prospect[];
  actor: string;
  concurrency?: number;
  config?: ScoringConfig;
}

export interface ScanOutcome {
  run: ScanRun;
  /** New and updated prospects (to be saved). */
  prospects: Prospect[];
}

export const MAX_RADIUS_MILES = 50;

/** Check and clean a request. Returns the problems in plain English. */
export function validateRequest(r: ScanRequest): string[] {
  const errors: string[] = [];
  if (!isVertical(r.vertical)) errors.push("Choose a business vertical.");
  if (
    !Number.isFinite(r.maxResults) ||
    r.maxResults < 1 ||
    r.maxResults > PLACES_MAX_RESULTS
  )
    errors.push(
      `Maximum results must be between 1 and ${PLACES_MAX_RESULTS} (Google's limit for one search).`,
    );
  if (
    !Number.isFinite(r.radiusMiles) ||
    r.radiusMiles < 1 ||
    r.radiusMiles > MAX_RADIUS_MILES
  )
    errors.push(`Radius must be between 1 and ${MAX_RADIUS_MILES} miles.`);
  if (r.source === "google_places" && r.market.trim() === "" && !r.zip?.trim())
    errors.push("Enter a market (town) or a ZIP code to search Google.");
  if (r.source === "import" && !r.importText?.trim())
    errors.push("Paste at least one business to import.");
  if (r.zip && !/^\d{5}$/.test(r.zip.trim())) errors.push("ZIP code must be 5 digits.");
  return errors;
}

/** Run one market scan. Never throws for an expected problem; it reports it. */
export async function runMarketScan(
  req: ScanRequest,
  deps: ScanDeps,
): Promise<ScanOutcome> {
  const startedAt = deps.now();
  const id = deps.newId();
  const { importText: _omit, ...requestRecord } = req;
  const run: ScanRun = {
    id,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    request: requestRecord,
    scoringVersion: (deps.config ?? DEFAULT_SCORING_CONFIG).version,
    counts: {
      discovered: 0,
      duplicates: 0,
      unique: 0,
      inspected: 0,
      qualified: 0,
      excluded: 0,
      needsReview: 0,
    },
    apiUsage: undefined,
    warnings: [],
    error: undefined,
    prospectIds: [],
  };
  const finish = (prospects: Prospect[]): ScanOutcome => {
    run.finishedAt = deps.now().toISOString();
    return { run, prospects };
  };

  const problems = validateRequest(req);
  if (problems.length) {
    run.error = problems.join(" ");
    return finish([]);
  }

  const { centre, resolvedBy } = resolveMarket(req.market, req.zip);
  if (!centre)
    run.warnings.push(
      `Market centre unknown (${resolvedBy}), so the radius could not be applied.`,
    );
  const market: MarketRef = {
    label: req.market.trim() || `ZIP ${req.zip}`,
    zip: req.zip?.trim() || undefined,
    radiusMiles: req.radiusMiles,
  };

  // 1. Source
  let candidates: Candidate[];
  let apiUsage: ApiUsage | undefined;
  if (req.source === "google_places") {
    if (!deps.places) {
      run.error = placesConfigMessage(false);
      return finish([]);
    }
    const spec = VERTICALS[req.vertical];
    const textQuery = `${req.searchTerms?.trim() || spec.defaultQuery} in ${market.label}${market.zip && !market.label.includes(market.zip) ? ` ${market.zip}` : ""}`;
    const res = await deps.places.searchText({
      textQuery,
      centre,
      radiusMiles: req.radiusMiles,
      maxResults: req.maxResults,
    });
    apiUsage = res.usage;
    if (res.error) {
      if (res.places.length === 0) {
        run.apiUsage = apiUsage;
        run.error = res.error;
        return finish([]);
      }
      run.warnings.push(
        `${res.error} (kept the ${res.places.length} results already returned).`,
      );
    }
    candidates = res.places.map((p) => ({
      source: "google_places" as const,
      name: p.name ?? "(no name returned)",
      address: p.address,
      phone: p.phone,
      email: undefined,
      website: p.website,
      place: p,
      importedRating: undefined,
      importedReviewCount: undefined,
    }));
  } else {
    const parsed = parseImport(req.importText ?? "");
    for (const s of parsed.skipped)
      run.warnings.push(`Line ${s.line} skipped (${s.reason}): ${s.text.slice(0, 80)}`);
    candidates = parsed.candidates;
    if (candidates.length > req.maxResults) {
      run.warnings.push(
        `Imported the first ${req.maxResults} of ${candidates.length} businesses (the maximum-results setting).`,
      );
      candidates = candidates.slice(0, req.maxResults);
    }
  }
  run.apiUsage = apiUsage;

  // 2. De-duplicate within the scan.
  const groups = dedupeCandidates(candidates);
  run.counts.discovered = candidates.length;
  run.counts.duplicates = candidates.length - groups.length;
  run.counts.unique = groups.length;

  // 3-6. Inspect, find, qualify, score -- a few at a time.
  const now = deps.now();
  const online = await isOnline(deps.egress);
  if (!online && groups.some((g) => g.merged.website || g.merged.place?.website))
    run.warnings.push(
      "This computer could not reach the internet, so no website was inspected. Website-based parts of the score are 'not checked'. Rescan when online.",
    );
  const results: Prospect[] = new Array<Prospect>(groups.length);
  const concurrency = Math.max(1, deps.concurrency ?? 4);
  let next = 0;
  const worker = async () => {
    while (next < groups.length) {
      const i = next++;
      const g = groups[i]!;
      const existing = findExisting(deps.existing, g.keys);
      results[i] = await buildProspect(g, {
        vertical: req.vertical,
        market,
        centre,
        egress: deps.egress,
        now,
        newId: deps.newId,
        scanId: id,
        existing,
        actor: deps.actor,
        freshPlaces: req.source === "google_places",
        online,
        config: deps.config ?? DEFAULT_SCORING_CONFIG,
      });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, groups.length) }, worker),
  );

  for (const p of results) {
    if (["ok", "unreachable", "blocked"].includes(p.websiteStatus))
      run.counts.inspected++;
    const q = effectiveQualification(p.qualification);
    if (q === "qualified") run.counts.qualified++;
    else if (q === "excluded") run.counts.excluded++;
    else run.counts.needsReview++;
  }
  results.sort(rankProspects);
  run.prospectIds = results.map((p) => p.id);
  return finish(results);
}

const QUALIFICATION_RANK = { qualified: 0, needs_review: 1, excluded: 2 } as const;

/** Ranking: qualified leads first, then needs-review, then excluded; highest score first within each. */
export function rankProspects(a: Prospect, b: Prospect): number {
  return (
    QUALIFICATION_RANK[effectiveQualification(a.qualification)] -
      QUALIFICATION_RANK[effectiveQualification(b.qualification)] ||
    b.score.total - a.score.total ||
    a.name.localeCompare(b.name)
  );
}

async function isOnline(egress: WebEgress): Promise<boolean> {
  if (!egress.online) return true;
  try {
    return await egress.online();
  } catch {
    return false;
  }
}

export function prospectKeys(p: Prospect): string[] {
  return identityKeys({
    placeId: p.placeId,
    website: p.corrections.website ?? p.website,
    phone: p.corrections.phone ?? p.phone,
    name: p.name,
    address: p.address,
  });
}

function findExisting(existing: Prospect[], keys: string[]): Prospect | undefined {
  const want = new Set(keys);
  return existing.find(
    (p) =>
      p.dedupeKey &&
      (want.has(p.dedupeKey) || prospectKeys(p).some((k) => want.has(k))),
  );
}

interface BuildCtx {
  vertical: Vertical;
  market: MarketRef;
  centre: LatLon | undefined;
  egress: WebEgress;
  now: Date;
  newId: () => string;
  scanId: string;
  existing: Prospect | undefined;
  actor: string;
  /** True when the Places record in the group was just fetched from Google. */
  freshPlaces: boolean;
  config: ScoringConfig;
  /** False when the connectivity check failed: websites are not inspected. */
  online: boolean;
}

/** Inspect, find, qualify and score one de-duplicated business. */
export async function buildProspect(g: DedupeGroup, ctx: BuildCtx): Promise<Prospect> {
  const c = g.merged;
  const at = ctx.now.toISOString();
  const ex = ctx.existing;
  const place = c.place;

  // Which website address to inspect: a reviewer's correction wins.
  const corrected = ex?.corrections.website;
  const rawWebsite = corrected ?? c.website ?? place?.website;
  const assertedNone = rawWebsite !== undefined && /^\s*none\s*$/i.test(rawWebsite);
  const url = assertedNone ? undefined : toUrl(rawWebsite);
  const inspection =
    // Social and link-in-bio pages are classified from the address alone, so
    // only a real website needs the network.
    url && !ctx.online && classifyUrl(url).kind === "site"
      ? offlineInspection(url, ctx.now)
      : await inspectWebsite(url, ctx.egress, ctx.now);

  const findings: Finding[] = [];
  if (place)
    findings.push(
      ...placeFindings(
        place,
        ex?.places && !ctx.freshPlaces ? ex.places.observedAt : at,
      ),
    );
  findings.push(...importFindings(c, at));

  let websiteStatus: WebsiteStatus = inspection.status;
  if (url) {
    if (["ok", "unreachable", "blocked", "not_checked"].includes(inspection.status)) {
      const from = corrected
        ? "a reviewer's correction"
        : c.website && c.source === "import"
          ? "the imported list"
          : "Google Maps";
      findings.push({
        key: "website.exists",
        label: "Has a website address",
        status: "present",
        source: corrected
          ? "reviewer"
          : c.source === "import" && c.website
            ? "import"
            : "google_places",
        observedAt: at,
        evidence: `${url} (from ${from}).`,
        confidence: "high",
      });
    }
  } else if (assertedNone) {
    websiteStatus = "none";
    findings.push({
      key: "website.exists",
      label: "No website",
      status: "missing",
      source: corrected ? "reviewer" : "import",
      observedAt: at,
      evidence: corrected
        ? "A reviewer recorded that the business has no website."
        : 'Recorded as "none" in the imported list.',
      confidence: "medium",
    });
  } else if (place?.requestedFields.includes("places.websiteUri") && !place.website) {
    websiteStatus = "none";
    findings.push({
      key: "website.exists",
      label: "No website found",
      status: "missing",
      source: "google_places",
      observedAt: at,
      evidence:
        "Google Maps lists no website for this business and none was supplied. (A site Google does not know about would not be seen; a reviewer can add one.)",
      confidence: "medium",
    });
  }
  findings.push(...inspection.findings);

  const distance =
    ctx.centre && place?.location
      ? distanceMiles(ctx.centre, place.location)
      : undefined;
  const phone = ex?.corrections.phone ?? c.phone ?? place?.phone;
  const email = ex?.corrections.email ?? c.email;
  const qualification = qualify({
    name: c.name,
    vertical: ctx.vertical,
    source: c.source,
    place,
    phone,
    email,
    website: url,
    websiteStatus,
    distanceMiles: distance,
    radiusMiles: ctx.market.radiusMiles,
  });
  if (ex?.qualification.override) qualification.override = ex.qualification.override;

  const score = scoreOpportunity(
    {
      vertical: ctx.vertical,
      websiteStatus,
      findings,
      rubric: inspection.rubric?.dimensions,
      reviews: reviewFigures(place, c),
    },
    ctx.config,
  );

  const snapshot = place
    ? ctx.freshPlaces || !ex?.places
      ? placesSnapshot(place, ctx.now)
      : ex.places
    : undefined;

  return {
    id: ex?.id ?? ctx.newId(),
    dedupeKey: ex?.dedupeKey ?? g.key,
    placeId: place?.placeId ?? ex?.placeId,
    name: c.name,
    vertical: ctx.vertical,
    market: ctx.market,
    address: c.address ?? place?.address,
    phone:
      formatPhone(normalizePhone(c.phone ?? place?.phone)) ?? c.phone ?? place?.phone,
    email: c.email,
    website: url ?? (assertedNone ? undefined : rawWebsite),
    corrections: ex?.corrections ?? {},
    places: snapshot,
    importedRating: c.importedRating,
    importedReviewCount: c.importedReviewCount,
    distanceMiles: distance === undefined ? undefined : Math.round(distance * 10) / 10,
    websiteStatus,
    findings,
    score,
    qualification,
    services: suggestServices(score),
    stage: ex?.stage ?? "new",
    notes: ex?.notes ?? [],
    audit: [
      ...(ex?.audit ?? []),
      {
        at,
        by: ctx.actor,
        action: ex ? "rescanned" : "created",
        detail: `${ex ? "Rescanned" : "Found"} in scan ${ctx.scanId.slice(0, 8)}: score ${score.total} (${score.version}), website ${websiteStatus}.`,
      },
    ],
    firstSeenAt: ex?.firstSeenAt ?? at,
    lastScannedAt: at,
    scanIds: [...(ex?.scanIds ?? []), ctx.scanId],
  };
}

/**
 * Re-inspect one stored prospect (after a reviewer correction). Uses the stored
 * Google copy if it has not expired; never calls Google.
 */
export async function rescanProspect(
  p: Prospect,
  deps: Pick<ScanDeps, "egress" | "now" | "newId" | "actor" | "config">,
): Promise<Prospect> {
  const merged: Candidate = {
    source: p.places ? "google_places" : "import",
    name: p.name,
    address: p.address,
    phone: p.phone,
    email: p.email,
    website:
      p.website ?? (p.websiteStatus === "none" && !p.places ? "none" : undefined),
    place: p.places?.record,
    importedRating: p.importedRating,
    importedReviewCount: p.importedReviewCount,
  };
  const now = deps.now();
  return buildProspect(
    { key: p.dedupeKey, keys: prospectKeys(p), merged, members: [merged] },
    {
      vertical: p.vertical,
      market: p.market,
      centre: resolveMarket(p.market.label, p.market.zip).centre,
      egress: deps.egress,
      now,
      newId: deps.newId,
      scanId: `manual-${now.getTime()}`,
      existing: p,
      actor: deps.actor,
      freshPlaces: false,
      online: await isOnline(deps.egress),
      config: deps.config ?? DEFAULT_SCORING_CONFIG,
    },
  );
}
