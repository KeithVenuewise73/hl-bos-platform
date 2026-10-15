// Shared shapes for the HLG Presence Scanner.
//
// The one idea that runs through every type here: a fact carries where it came
// from, when it was seen, and how sure we are -- and "we did not look" is a
// different answer from "we looked and it is not there". A lead that is scored
// on guesses is worse than no lead, because the CEO acts on it.

export type Vertical =
  "contractor" | "salon_barber" | "restaurant_bar" | "trainer_coach" | "youth_sports";

/**
 * What we know about one fact.
 *
 *   present      observed (e.g. a tel: link on the homepage)
 *   missing      an authoritative source says it is absent (Google lists no
 *                website for this place; the business has no website at all)
 *   not_found    we inspected and did not see it -- but only the homepage was
 *                inspected, so it may exist elsewhere
 *   blocked      we tried and could not inspect (robots.txt, 403, unsafe address)
 *   not_checked  no source we used covers this fact
 */
export type FindingStatus =
  "present" | "missing" | "not_found" | "blocked" | "not_checked";

export type FindingSource = "google_places" | "website" | "import" | "reviewer";

export type Confidence = "high" | "medium" | "low";

export interface Finding {
  key: string;
  /** Plain English, written for the CEO, not for an engineer. */
  label: string;
  status: FindingStatus;
  source: FindingSource;
  /** ISO timestamp the fact was observed. */
  observedAt: string;
  /** What was actually seen (or not), in words a person can check. */
  evidence: string;
  confidence: Confidence;
}

export type WebsiteStatus =
  | "none" // the business has no website (authoritative or reviewer-asserted)
  | "social_only" // the "website" is a Facebook / Instagram / similar page
  | "link_in_bio" // the "website" is a Linktree-style link page
  | "retired_google_site" // a business.site address; Google retired these in 2024
  | "ok" // the homepage was fetched and inspected
  | "unreachable" // the address does not answer, errors or is not a web page
  | "blocked" // we may not or could not inspect it (robots.txt, 401/403/429, unsafe)
  | "not_checked"; // no website address was available to us

/** A place as returned by Google Places, normalized. Absent = not returned. */
export interface PlaceRecord {
  placeId: string;
  name: string | undefined;
  primaryType: string | undefined;
  primaryTypeLabel: string | undefined;
  types: string[];
  address: string | undefined;
  phone: string | undefined;
  website: string | undefined;
  mapsUrl: string | undefined;
  rating: number | undefined;
  reviewCount: number | undefined;
  businessStatus: string | undefined;
  hasHours: boolean | undefined;
  /** Google returns at most 10 photo references, so this is capped at 10. */
  photoCount: number | undefined;
  location: { lat: number; lon: number } | undefined;
  /** Fields that were in the request's field mask (so absence means "missing"). */
  requestedFields: string[];
}

/** One business, before de-duplication, from whichever source found it. */
export interface Candidate {
  source: "google_places" | "import";
  name: string;
  address: string | undefined;
  phone: string | undefined;
  email: string | undefined;
  /** Raw website text as given. "none" (import only) asserts there is no website. */
  website: string | undefined;
  place: PlaceRecord | undefined;
  /** Import only: rating / review count typed in by the reviewer, if any. */
  importedRating: number | undefined;
  importedReviewCount: number | undefined;
}

export type ComponentKey =
  "website" | "conversion" | "reviews" | "profile" | "search" | "social";

export interface Contribution {
  /** Stable rule identifier, e.g. "W.no_site". Versioned with the rubric. */
  ruleId: string;
  label: string;
  points: number;
  /** Keys of the findings that justify these points. Never empty. */
  findingKeys: string[];
}

export interface ComponentScore {
  component: ComponentKey;
  label: string;
  max: number;
  awarded: number;
  /** not_checked: no evidence for this component, so it is not scored at all. */
  status: "scored" | "partial" | "not_checked";
  contributions: Contribution[];
  note: string;
}

export interface OpportunityScore {
  version: string;
  /** 0-100. Sum of awarded points over the components that were checked. */
  total: number;
  /** How many of the 100 points had evidence behind them either way. */
  checkedMax: number;
  components: ComponentScore[];
}

export type QualificationOutcome = "pass" | "fail" | "uncertain" | "unverified";

export interface QualificationCheck {
  code: "operating" | "vertical" | "contact" | "chain" | "radius";
  label: string;
  outcome: QualificationOutcome;
  detail: string;
}

export type QualificationStatus = "qualified" | "excluded" | "needs_review";

export interface Qualification {
  /** The automatic result. */
  computed: QualificationStatus;
  checks: QualificationCheck[];
  /** A reviewer's decision, which wins over `computed`. */
  override:
    { status: QualificationStatus; by: string; at: string; note: string } | undefined;
}

export type LeadStage =
  | "new"
  | "reviewed"
  | "qualified"
  | "demo_requested"
  | "demo_built"
  | "contacted"
  | "interested"
  | "proposal"
  | "client"
  | "lost"
  | "disqualified";

export interface AuditEntry {
  at: string;
  by: string;
  action:
    | "created"
    | "rescanned"
    | "stage"
    | "note"
    | "qualification_override"
    | "qualification_override_cleared"
    | "correction";
  detail: string;
}

export interface SuggestedService {
  /** The HL service name, from the BTI growth map. Never a price. */
  service: string;
  dimension: string;
  priority: "critical" | "high" | "medium" | "low";
  rationale: string;
}

/** Places-sourced content kept only temporarily (see places.ts on storage). */
export interface PlacesSnapshot {
  record: PlaceRecord;
  observedAt: string;
  /** After this, everything but the place ID is purged until re-fetched. */
  expiresAt: string;
}

export interface MarketRef {
  label: string;
  zip: string | undefined;
  radiusMiles: number;
}

export interface Prospect {
  id: string;
  /** The strongest identity we have, e.g. "place:ChIJ..." or "domain:acme.com". */
  dedupeKey: string;
  /** Kept indefinitely -- Google permits storing place IDs. */
  placeId: string | undefined;
  name: string;
  vertical: Vertical;
  market: MarketRef;
  address: string | undefined;
  phone: string | undefined;
  email: string | undefined;
  website: string | undefined;
  /** Reviewer corrections. They win over every automatic source. */
  corrections: { website?: string; phone?: string; email?: string };
  places: PlacesSnapshot | undefined;
  importedRating: number | undefined;
  importedReviewCount: number | undefined;
  /** Straight-line miles from the market centre, if both were known. */
  distanceMiles: number | undefined;
  websiteStatus: WebsiteStatus;
  findings: Finding[];
  score: OpportunityScore;
  qualification: Qualification;
  services: SuggestedService[];
  stage: LeadStage;
  notes: { at: string; by: string; text: string }[];
  audit: AuditEntry[];
  firstSeenAt: string;
  lastScannedAt: string;
  scanIds: string[];
}

export type ScanSource = "google_places" | "import";

export interface ScanRequest {
  market: string;
  zip: string | undefined;
  radiusMiles: number;
  vertical: Vertical;
  maxResults: number;
  searchTerms: string | undefined;
  source: ScanSource;
  /** Import mode: the pasted list or CSV text. */
  importText: string | undefined;
}

export interface ApiUsage {
  requests: number;
  sku: string;
  /** List price at the first pricing tier, before any free monthly allowance. */
  estimatedCostUsd: number;
  note: string;
}

export interface ScanRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  request: Omit<ScanRequest, "importText">;
  scoringVersion: string;
  counts: {
    discovered: number;
    duplicates: number;
    unique: number;
    inspected: number;
    qualified: number;
    excluded: number;
    needsReview: number;
  };
  apiUsage: ApiUsage | undefined;
  /** Plain-English problems that did not stop the scan. */
  warnings: string[];
  /** Set when the scan could not run at all. */
  error: string | undefined;
  prospectIds: string[];
}
