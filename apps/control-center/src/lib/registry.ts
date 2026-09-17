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
      "It now has an application. The database was already there \u2014 the shop, its owned website and the client book (14 tables behind 17 RPCs) plus the pre-sale diagnostic, the discovery call and the proposal (10 more tables), rebuilt into six migrations on 2026-09-17 and checked against the live database piece by piece until the two matched exactly. What was missing was anything that could call it. There is now an operator console (apps/barberos-cockpit) that runs the whole job: find a shop, call them, audit them, propose, record the sale, turn them into a real client with their own account, switch on what they bought, build their page, and keep their client book. One new migration (0056) was needed to reach the parts nothing could reach \u2014 the list of what we sell, creating the shop record, and turning an accepted proposal into a customer. It is WRITTEN AND TESTED BUT NOT APPLIED: it needs your approval before the console can be used against the live database. What works today: the 22 audit functions applied on 2026-09-17, so the 40 recorded audits can finally be read. What is still true and uncomfortable: only 2 of the 16 things we list as BarberOS capabilities have actually been built \u2014 the client book and the owned website \u2014 so a proposal cannot honestly offer anything else as available, and the console will not let one. The client book is empty (0 clients, 0 visits). All 45 findings across those 40 audits are inference with no evidence recorded, and all 40 carry a sales hook built on one of them; 35 of the runs scored 0 out of a possible 1 dimension and 5 scored nothing at all. The console shows that on every screen that quotes a number, rather than hiding it.",
    version: null,
    location:
      "this repository (supabase/migrations 0049\u20130056, apps/barberos-cockpit); 0049\u20130055 mirror or are applied to canonical production, 0056 is not applied anywhere",
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
