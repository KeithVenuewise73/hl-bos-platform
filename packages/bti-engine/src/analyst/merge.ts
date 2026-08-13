// Merge site evidence across several pages of one website into a single, honest
// picture. A homepage-only scan reads "your front page"; reading the key pages of
// the site (services, about, contact, …) lets a finding speak for the whole site
// — "no lead-capture on ANY of 5 pages" is far more credible than "your homepage
// has no form." Nothing is invented: presence signals are OR-ed (true if seen on
// any page), catalogs are unioned, content/accessibility counts are summed, and
// homepage identity fields (title, meta, canonical) are kept as the canonical page.

import type { SiteEvidence } from "./extract.ts";

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Combine per-page evidence. The first entry is treated as the homepage (the
 * canonical page for identity signals). Returns a single SiteEvidence describing
 * the whole set of pages read.
 */
export function mergeEvidence(pages: SiteEvidence[]): SiteEvidence {
  if (pages.length === 0) throw new Error("mergeEvidence requires at least one page");
  const home = pages[0]!;
  if (pages.length === 1) return home;

  const anyTrue = (pick: (e: SiteEvidence) => boolean) => pages.some(pick);
  const maxOf = (pick: (e: SiteEvidence) => number) =>
    pages.reduce((m, e) => Math.max(m, pick(e)), 0);
  const sumOf = (pick: (e: SiteEvidence) => number) =>
    pages.reduce((s, e) => s + pick(e), 0);

  return {
    // Identity — from the homepage (the canonical page).
    url: home.url,
    https: home.https,
    title: home.title,
    titleLength: home.titleLength,
    metaDescription: home.metaDescription,
    metaDescriptionLength: home.metaDescriptionLength,
    lang: home.lang,
    canonical: anyTrue((e) => e.canonical),
    robotsMeta: home.robotsMeta,

    // Site-wide capabilities — present if seen on any page.
    hasViewport: anyTrue((e) => e.hasViewport),
    hasTel: anyTrue((e) => e.hasTel),
    hasMailto: anyTrue((e) => e.hasMailto),
    hasAddressSignal: anyTrue((e) => e.hasAddressSignal),

    // Best structural signal across pages.
    h1Count: maxOf((e) => e.h1Count),
    headingCount: maxOf((e) => e.headingCount),
    internalLinks: maxOf((e) => e.internalLinks),
    externalLinks: maxOf((e) => e.externalLinks),
    openGraphCount: maxOf((e) => e.openGraphCount),

    // Whole-site totals.
    imageCount: sumOf((e) => e.imageCount),
    imagesMissingAlt: sumOf((e) => e.imagesMissingAlt),
    forms: sumOf((e) => e.forms),
    wordCount: sumOf((e) => e.wordCount),

    // Catalogs — the union of what any page exposes.
    socialLinks: uniq(pages.flatMap((e) => e.socialLinks)),
    analyticsTags: uniq(pages.flatMap((e) => e.analyticsTags)),
    structuredDataTypes: uniq(pages.flatMap((e) => e.structuredDataTypes)),
  };
}
