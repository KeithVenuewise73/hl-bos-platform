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
    name: "Shop Transformation Analysis Tool",
    stage: "development",
    status:
      'The pre-sale audit instrument. The `transform_audit` schema, the barbershop website rubric and the report assembly are LIVE in HL-BOS Core (applied 2026-09-09). It reuses the existing website scanner rather than adding a second one. LIVE and holding real data: the WNY 50-shop prospect list is imported and 40 shops have a complete stored analysis (35 with no website found, 5 on a booking platform they do not own; all 40 point at the owned_website module, which is now live). The other 10 carry a real URL and have no run at all -- no shop website has been fetched. The Control Center has a Shop Analysis page: the campaign worst-first, a full report per shop, a button that visits un-fetched websites from this machine, and a spreadsheet import. The sale is now TWO STAGES and both exist. The DISCOVERY CALL (migration 0054, applied 2026-09-11) records what a shop says it already runs -- the phones, the appointment book, what they keep on a regular -- which no crawler can see; every answer is three-state, so "nobody asked" never becomes "they do not have it". The PROPOSAL (migration 0055, applied 2026-09-11) is the document that comes out of it: a snapshot of the audit, the answers and the matched offer, frozen when it is drafted, sent from the console and printable as the PDF that goes to the shop. Its honesty rules are enforced by the database, not only by the composer -- no path can store a proposal that offers a module we decided not to build or sells a planned one as available, and a sent proposal cannot be edited by any route including a direct UPDATE. NOT YET TRUE: no shop has been called and no proposal has been drafted for a real shop.',
    version: null,
    location: "HL-BOS Core (migrations 0049/0050/0054/0055), _shared/transform_audit",
  },
  {
    name: "BarberOS",
    stage: "development",
    status:
      "Capability spine LIVE in HL-BOS Core (applied 2026-09-09), plus its first real module, LIVE since 2026-09-10. `owned_website` -- a page the shop owns, with hours, services, prices, address, tap-to-call and a booking link -- is applied to production (migration 0052) and is the only capability in the catalog marked 'available'. Every table in it is gated on the capability switch by a database trigger, so turning the capability off makes the rows unwritable rather than merely hidden. The pages are now SERVED, live: migration 0053 and the `site` edge function are both in production (the first edge function this platform has deployed). A slug returns the shop's page; robots.txt and a sitemap let search engines find it; only published pages are readable, and a draft is indistinguishable from a slug nobody has used. The pages are SERVED, live at shops.hermanlegacydigital.com since 2026-09-11, by apps/shop-pages on the Coolify server -- the SAME handler as the Supabase function, imported rather than copied. Supabase could not host them: it rewrites HTML to text/plain on its shared domain, and its custom-domain fix permits only ONE domain per project, which would have permanently ruled out a shop owning its own -- the audit finding this module exists to answer. Verified live: HTML arrives as real HTML with our own security policy. The SHOP'S OWN APP is live at app.hermanlegacydigital.com (apps/barbershop, deployed 2026-09-13), reaching the database through the ten public wrappers migration 0056 added -- until that migration PostgREST exposed only `public` and every barberos write function was unreachable from any application. THE SECOND MODULE, `client_crm`, SHIPPED 2026-09-13 (migration 0058): the client, their visits, the cut that was actually given -- guard lengths, fade, beard, line-up -- the tools used, lifetime value alongside the visits that have no price recorded, and the rhythm they come back on. The rhythm reports NULL until three visits exist, and says so in words, because \"overdue\" inferred from one haircut is how this module would lose a shop's trust in week one. Every guard was exercised against production inside an aborted transaction: a visit dated tomorrow, a guard length on a scissor top, a beard guard with no beard and a visit filed against another shop's client were all refused, and zero rows were left behind. NOT YET TRUE: no shop has either capability enabled, so no page has been published and no real client has been written down. Two of the CEO's twelve layers are built; the catalog names the other fourteen modules and what each is waiting on.",
    version: null,
    location:
      "HL-BOS Core (migrations 0048/0050/0052/0053/0056/0057/0058), supabase/functions/site (deployed), apps/shop-pages + apps/barbershop (deployed)",
  },
  {
    name: "SalonAI",
    stage: "not-started",
    status:
      "Planned as the second ServiceOS vertical, reusing the BarberOS capability catalog with a different starter bundle. No code yet.",
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
