/**
 * Evidence collection.
 *
 * The pipeline never fetches anything itself (no network in this core). A
 * `SiteFetchResult` is produced by an injected adapter — in production that
 * adapter is the existing SSRF-safe discovery scanner
 * (`supabase/functions/_shared/discovery/scan.ts`) or `discovery.website_scans`;
 * in tests it is a fake. This module's only job is to turn that outcome, plus
 * the client-supplied intake, into truthful `EvidenceRecord`s and the parsed
 * `SiteEvidence` the analyzer reasons over.
 *
 * The honest rule: if a site blocks automated access we record `blocked` and
 * observe nothing — we do NOT fabricate a clean scan.
 */

import { analyst } from "@hl-bos/bti-engine";
import type { EvidenceRecord, NormalizedIntake } from "./types.ts";

export type SiteFetchOutcome = "ok" | "blocked" | "unreachable" | "no_url";

export interface SiteFetchResult {
  outcome: SiteFetchOutcome;
  /** Present only when outcome === "ok". */
  html?: string;
  /** HTTP status or a short machine reason (e.g. "403", "dns", "timeout"). */
  reason?: string;
}

export interface CollectedEvidence {
  records: EvidenceRecord[];
  /** Parsed website signals when the homepage was collected, else null. */
  site: analyst.SiteEvidence | null;
  /** True when we have enough to analyze (a site OR a described business). */
  analyzable: boolean;
}

const WEBSITE_KEY = "website.homepage";

export function collectEvidence(
  intake: NormalizedIntake,
  fetch: SiteFetchResult,
  observedAt: string,
): CollectedEvidence {
  const records: EvidenceRecord[] = [];
  let site: analyst.SiteEvidence | null = null;

  // --- Website homepage -----------------------------------------------------
  if (!intake.website || fetch.outcome === "no_url") {
    records.push({
      key: WEBSITE_KEY,
      label: "Website homepage",
      status: "unavailable",
      detail: "No website URL was supplied at intake.",
      source: "intake",
      observedAt,
    });
  } else if (fetch.outcome === "ok" && fetch.html !== undefined) {
    site = analyst.analyzeHtml(fetch.html, intake.website);
    records.push({
      key: WEBSITE_KEY,
      label: "Website homepage",
      status: "collected",
      detail:
        `Fetched ${intake.website}: title ${site.title ? `"${site.title.slice(0, 60)}"` : "MISSING"}, ` +
        `meta description ${site.metaDescription ? `${site.metaDescriptionLength} chars` : "MISSING"}, ` +
        `${site.headingCount} headings, ${site.forms} form(s), ` +
        `${site.socialLinks.length} social link(s), ` +
        `structured data: ${site.structuredDataTypes.join(", ") || "none"}, ` +
        `analytics: ${site.analyticsTags.join(", ") || "none"}.`,
      source: intake.website,
      observedAt,
    });
  } else if (fetch.outcome === "blocked") {
    records.push({
      key: WEBSITE_KEY,
      label: "Website homepage",
      status: "blocked",
      detail:
        `${intake.website} denied automated access` +
        `${fetch.reason ? ` (${fetch.reason})` : ""}. No page content was read; ` +
        `a person can review it manually.`,
      source: intake.website,
      observedAt,
    });
  } else {
    records.push({
      key: WEBSITE_KEY,
      label: "Website homepage",
      status: "requires_human_review",
      detail:
        `${intake.website} was unreachable` +
        `${fetch.reason ? ` (${fetch.reason})` : ""}. The URL may be wrong or the site may be down.`,
      source: intake.website,
      observedAt,
    });
  }

  // --- Client-supplied social links ----------------------------------------
  if (intake.socialLinks && intake.socialLinks.length > 0) {
    records.push({
      key: "social.links",
      label: "Public social links",
      status: "client_supplied",
      detail: `Client supplied ${intake.socialLinks.length} social link(s): ${intake.socialLinks.join(", ")}.`,
      source: "intake",
      observedAt,
    });
  }

  // --- Client-stated challenge (always client-supplied, needs confirmation) --
  if (intake.mainChallenge) {
    records.push({
      key: "intake.main_challenge",
      label: "Client-stated primary challenge",
      status: "client_supplied",
      detail: intake.mainChallenge,
      source: "intake",
      observedAt,
    });
  }

  // Analyzable if we parsed a site OR we at least have a described business to
  // reason about (industry/challenge). We never claim to analyze nothing.
  const analyzable = site !== null || Boolean(intake.industry || intake.mainChallenge);

  return { records, site, analyzable };
}

/** Convenience: did the website evidence come back blocked? */
export function websiteWasBlocked(records: readonly EvidenceRecord[]): boolean {
  return records.some((r) => r.key === WEBSITE_KEY && r.status === "blocked");
}
