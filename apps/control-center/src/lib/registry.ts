/**
 * The Herman Legacy software portfolio.
 *
 * DELIBERATELY HONEST. Several of these products do not exist yet, and this file
 * says so rather than rendering an invented health bar next to a name.
 *
 * HL-BOS principle 10: "Never invent successful runs, messages, payments, AI
 * results, customer interactions, or operational metrics." A pipeline view that
 * shows SalonAI as "healthy" when SalonAI has no code would break that on the
 * CEO's home screen -- the worst possible place for the platform to lie.
 *
 * A product moves off `not-started` when it has code -- in this repository, or
 * in another repository this account owns and this file names.
 *
 * Every claim below was verified on 2026-09-08 by reading the code, running the
 * suite (`pnpm test`: 779 passed, 1 skipped), building the sites, and cloning
 * the sibling repositories. Claims sourced from another repository's own README
 * rather than from a live system are labelled as such, because this console
 * cannot see those systems and must not pretend otherwise.
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
    name: "HL-BOS (platform core)",
    stage: "development",
    status:
      "Identity, tenancy, permissions and audit are merged. 47 migrations and a pgTAP suite; migrations 0001-0047 are written and tested, and a subset is applied to the canonical production project. Production has drifted from this repository (about forty migrations live there that are not in these files), so the one-click migration workflow is not safe to use until that is reconciled.",
    version: null,
    location: "this repository",
  },
  {
    name: "HSCS Consultation Website",
    stage: "development",
    status:
      "Builds green (17 routes): homepage, services hub, 11 service pages, industries hub, 5 industry pages, plus an honest holding page for the assessment request. NOT deployed anywhere. The public site at www.hermansupplychainsolutions.com is still the older hand-written HTML site in the separate `herman-supply-chain` repository, last changed 2026-06-18. Still to build: /experience, /method, /insights, /guides, /about, /contact, the legal and utility pages, sitemap.xml and robots.txt, and the assessment intake -- the primary call to action currently leads to a page that says the form is not ready, which is true but converts nobody.",
    version: null,
    location: "this repository (apps/hscs-website)",
  },
  {
    name: "HL-BTI (Business Transformation Intelligence)",
    stage: "development",
    status:
      "First product built by the HL-BOS Software Factory. The `bti` schema, executive scoring engine, engagement lifecycle, delivery/ROI and CEO dashboard are built and tested. Two front ends exist: an offline demo (hl-bti-alpha) and the authenticated cloud app (hl-bti), which is built but not deployed. Migration 0031 (the public intake front door) is written and tested but has NEVER been applied to any environment. No live customer engagement yet. Four open pull requests carry further transformation work that has not been merged or re-verified against today's main.",
    version: null,
    location:
      "this repository (supabase/migrations 0026, 0027, 0031; packages/bti-engine, bte-pipeline, transformation-intelligence; apps/hl-bti, hl-bti-alpha)",
  },
  {
    name: "HL Social Publishing",
    stage: "development",
    status:
      "The publishing spine (migrations 0046 and 0047, `social` schema, 6 tables, human approval gate, append-only attempt log) is APPLIED to canonical production. But no channel account is connected and the two edge functions are not deployed, so nothing has ever been published to a real audience.",
    version: null,
    location: "this repository (supabase/migrations 0046-0047, functions/social-*)",
  },
  {
    name: "Video Studio",
    stage: "development",
    status:
      "Works today inside the Control Center: a still composite image becomes a real .mp4 in the browser, with no account and no upload. Verified end to end in headless Chromium. Generated motion (a model that animates the picture) is named on the page but deliberately not built.",
    version: null,
    location: "this repository (packages/video-studio, control-center /video)",
  },
  {
    name: "Herman Legacy Executive Portal",
    stage: "development",
    status:
      "Secure, read-only executive app with HL-BOS auth and five roles. Built and tested; never deployed, so nobody outside this repository has ever opened it.",
    version: null,
    location: "this repository (apps/executive-portal)",
  },
  {
    name: "HLVS Venture Studio",
    stage: "development",
    status:
      "Rebuilt inside HL-BOS: the `vstudio` schema (migrations 0029-0045) carries a preserved 62,250-opportunity corpus, triage, portfolios, rising signals, pain clusters and capability intelligence, with a UI in this repository. Migrations 0030 and 0039-0045 are written and tested but UNAPPLIED. A separate, older HLVS also runs in the legacy Supabase project, which this console cannot see.",
    version: null,
    location: "this repository (apps/venture-studio, packages/venture-studio)",
  },
  {
    name: "HSCS Government Logistics (HSCS-GLP)",
    stage: "production",
    status:
      "Lives in its own repository, NOT in HL-BOS and not managed by this console. Its README reports an `hscs_glp` schema live on the Herman Legacy Supabase project, 129 passing tests, and seven deployed edge functions -- but also that the SAM.gov connector has never made a successful real call, AI analysis is mock by default, the FleetHuddle handoff transport is mock, and every seeded row is flagged demo data. Those are its own claims, read from its README; this console cannot verify them against the live system.",
    version: null,
    location: "KeithVenuewise73/hscs-glp (separate repository)",
  },
  {
    name: "AI Asset Recovery",
    stage: "production",
    status:
      "Live in the legacy Supabase project, with an open security finding (tables readable by any signed-in user). Not managed from here.",
    version: null,
    location: "legacy project (not reachable from this console)",
  },
  {
    name: "Delivery Service Provider course",
    stage: "not-started",
    status:
      "Named by the CEO as a pipeline item. There is NO code, NO specification, and NO repository for it anywhere in this account -- searched on 2026-09-08. Nothing can be estimated or built until it is defined: who it teaches, what it must certify, and whether it sells.",
    version: null,
    location: null,
  },
  {
    name: "OSPlatform",
    stage: "not-started",
    status:
      "Named by the CEO as a pipeline item. There is NO code, NO specification, and NO repository under this name anywhere in this account -- searched on 2026-09-08. It may be a new name for something already in this list; that has to be settled before any work starts.",
    version: null,
    location: null,
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
    status:
      "Referenced as the execution hand-off target by HSCS-GLP, whose transport to it is mock. No HL-BOS code yet.",
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
  "Verified 2026-09-08 by reading the code and running the suite. 'Development' here means the code exists and its tests pass -- it does not mean anyone outside this repository can use it: nothing in this list has been deployed for a customer. Anything marked 'No code' genuinely has none, and this console will not show a health bar for software that does not exist.";
