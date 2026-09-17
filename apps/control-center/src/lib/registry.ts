/**
 * The Herman Legacy software portfolio.
 *
 * DELIBERATELY HONEST. Most of these products do not exist yet, and this file
 * says so rather than rendering an invented health bar next to a name.
 *
 * HL-BOS principle 10: "Never invent successful runs, messages, payments, AI
 * results, customer interactions, or operational metrics." A pipeline view that
 * shows SalonAI as "healthy" when SalonAI has no code would break that on the
 * CEO's home screen -- the worst possible place for the platform to lie.
 *
 * A product moves off `not-started` when it has code in this repository.
 */

export type Stage =
  "not-started" | "development" | "testing" | "preview" | "production";

export interface Product {
  name: string;
  stage: Stage;
  /** Plain-English truth about where this actually is. */
  status: string;
  /** null until something real ships. Never a placeholder version number. */
  version: string | null;
  /** Where its code lives, if anywhere. */
  location: string | null;
}

export const PORTFOLIO: readonly Product[] = [
  {
    name: "HL-BOS",
    stage: "development",
    status:
      "Phase 2 (identity, tenancy, permissions, audit) is merged. The database is built and tested but has never been applied to a live project.",
    version: null,
    location: "this repository",
  },
  {
    name: "HL-BTI (Business Transformation Intelligence)",
    stage: "development",
    status:
      "First product built by the HL-BOS Software Factory (PCO #1). The `bti` schema, executive scoring engine, engagement lifecycle, delivery/ROI and CEO dashboard are built and tested (47 database + 11 edge tests, green locally). Never applied to a live project; no live customer engagement yet.",
    version: null,
    location: "this repository (supabase/migrations 0026, _shared/bti)",
  },
  {
    name: "HLVS Venture Studio",
    stage: "production",
    status:
      "Live in the legacy Supabase project, built before HL-BOS. Not managed from here, and this console cannot see it.",
    version: null,
    location: "legacy project (not reachable from this console)",
  },
  {
    name: "HSCS Government Logistics",
    stage: "production",
    status:
      "Live in the legacy Supabase project. 74 tables. Not managed from here, and this console cannot see it.",
    version: null,
    location: "legacy project (not reachable from this console)",
  },
  {
    name: "AI Asset Recovery",
    stage: "production",
    status:
      "Live in the legacy Supabase project, with an open security finding (tables readable by any signed-in user).",
    version: null,
    location: "legacy project (not reachable from this console)",
  },
  {
    name: "ATS Resume Optimizer",
    stage: "development",
    status:
      "Built in this repository and proven by running it: the engine parses a resume and a posting, matches every requirement to real evidence, scores the fit, generates a tailored resume and writes real DOCX and PDF files. An unsupported claim cannot reach an exported file — that was tested by editing a line to an invented $250M P&L and confirming the export dropped it. Storage is a local JSON file. Its PostgreSQL schema (migration 0048) HAS been applied to canonical production — verified 2026-09-17 by reading the live migration ledger — though the app does not yet use it, and nothing is deployed.",
    version: null,
    location: "this repository (apps/ats-resume-optimizer, packages/ats-resume)",
  },
  {
    name: "BarberOS",
    stage: "development",
    status:
      'Half of it is now in this repository, and half is not. The barberos schema \u2014 the shop, its owned website and the client book, 14 tables behind 17 RPCs \u2014 was rebuilt into four migrations on 2026-09-17 and checked against the live database piece by piece until the two matched exactly, so it can finally be tested and rebuilt rather than only running. 74 tests now cover it. Nothing was applied: production already had it. Still outside source control is the diagnostic engine, which holds 40 audit runs against 50 real Western New York barbershops. What works: a shop and service catalogue, an owned-website builder that can publish and unpublish, a client book, and an engine that learns a client\'s usual haircut interval and ranks who is overdue. What does not: the client book is empty (0 clients, 0 visits), the only shop is "Herman Legacy Test Shop" and its site is unpublished, nothing can read those 40 diagnostic runs because that schema has no public API, and every finding they produced is inferred with no evidence and a score of 0 \u2014 the diagnostic has never actually fetched a website. No BarberOS application exists in this repository for those 17 RPCs to have a caller.',
    version: null,
    location:
      "this repository (supabase/migrations 0049\u20130052) for the shop, website and client book; canonical production only for the diagnostic engine",
  },
  {
    name: "SalonAI",
    stage: "not-started",
    status: "Planned as the first HL-BOS vertical. No code yet.",
    version: null,
    location: null,
  },
  {
    name: "LandscapeAI",
    stage: "not-started",
    status: "Planned. No code yet.",
    version: null,
    location: null,
  },
  {
    name: "FleetHuddle",
    stage: "not-started",
    status: "One integration point exists in the legacy project. No HL-BOS code yet.",
    version: null,
    location: null,
  },
  {
    name: "CoachAI",
    stage: "not-started",
    status: "Planned. No code yet.",
    version: null,
    location: null,
  },
  {
    name: "Venuewise",
    stage: "not-started",
    status: "Planned. No code yet.",
    version: null,
    location: null,
  },
];

export const PORTFOLIO_NOTE =
  "Only HL-BOS is built and managed from this console. The legacy products are live but were built before HL-BOS and are not connected to it. Everything marked 'No code yet' genuinely has none — this console will not show a health bar for software that does not exist.";
