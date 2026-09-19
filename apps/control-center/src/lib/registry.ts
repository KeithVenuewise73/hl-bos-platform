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
      "Built in this repository and proven by running it: the engine parses a resume and a posting, matches every requirement to real evidence, scores the fit, generates a tailored resume and writes real DOCX and PDF files. An unsupported claim cannot reach an exported file — that was tested by editing a line to an invented $250M P&L and confirming the export dropped it. Storage is a local JSON file; the PostgreSQL schema (migration 0048) is written and verified against a local PostgreSQL 16 but is UNAPPLIED, and nothing is deployed.",
    version: null,
    location: "this repository (apps/ats-resume-optimizer, packages/ats-resume)",
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
    name: "HighlightAI Football",
    stage: "development",
    status:
      "The football intelligence engine, the `highlight` database schema and the web app are built and tested locally (269 engine tests, 38 app tests, 66 database assertions, 77 worker tests \u2014 green). The app runs and every screen renders, but it runs in DEMO mode over a synthetic game: no real film has been uploaded, no computer-vision model is installed, and nothing has been applied to a live project.",
    version: null,
    location:
      "this repository (packages/highlight-football, apps/highlightai-football, services/highlight-cv, supabase/migrations 0049)",
  },
  {
    name: "SceneFlow AI",
    stage: "development",
    status:
      "The continuation engine is built and tested (204 tests): cast understanding, CharacterLock, SceneLock inheritance, the spatial map, the interaction graph, reciprocal affection, the story planner, the continuity engine and server-side prompt composition \u2014 plus the real-person safety boundary, which is enforced code and was verified by disabling it and watching tests fail. NOTHING GENERATES IMAGES: there is no image provider and no moderation provider in this repository, and the engine refuses to run without the latter. No database schema, no app, no mobile client, no payments.",
    version: null,
    location: "this repository (packages/sceneflow)",
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
