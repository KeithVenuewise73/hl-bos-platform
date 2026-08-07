/**
 * The real Venuewise engagement — evidence harvested read-only from the repo.
 *
 * TRUTH MODE. Sources: docs/products/venuewise-backend-harvest/* and
 * docs/products/venuewise-capability-harvest/* (read-only harvests dated
 * 2026-07-31). Every fact is labeled at its true confidence tier. The product
 * itself lives in a legacy Supabase project that is out of scope and was NOT
 * independently reachable — so product facts are `observed` (front-end read +
 * harvested row counts), never `verified` against a running system by us.
 *
 * A deliberate Truth-Mode modeling choice: the near-zero commercial numbers
 * (subscriptions = 1, leads = 0, forms = 0) are recorded as real data but are
 * left UNTAGGED — they are signal-neutral, not a `[weak]` gap. Absence of
 * revenue is a symptom of the goal not being met; it does NOT by itself
 * identify the binding constraint (the cause could be customer, offer,
 * acquisition, or value-proof). Tagging them `[weak]` would let the engine
 * "recommend" a revenue fix without investigating go-to-market — exactly what
 * this mission forbids.
 */

import type { StartupEngagement } from "./types.ts";

const H = "venuewise-backend-harvest (2026-07-31)";
const C = "venuewise-capability-harvest (2026-07-31)";

export const VENUEWISE_ENGAGEMENT: StartupEngagement = {
  engagementId: "eng-venuewise-0001",
  business: "Venuewise (Venuewise Core / Huddle ecosystem)",
  asOf: "2026-08-07",
  goal: {
    // CEO-stated intent, taken as an explicit assumption (no formal goal interview).
    statement: "Become a commercially successful, recurring-revenue business.",
    metric: "paying customers and recurring revenue",
    guardrail: "without confusing a built product for a working business",
    confidence: "assumed",
  },
  discoveryQuestions: [
    "What exact Venuewise offer should be sold first, and to whom?",
    "Who is the first paying customer, and what is their buying trigger?",
    "What parts have been demonstrated to a real organization outside the family/dev team?",
    "What price has a real prospect accepted or rejected?",
    "What is the shortest path from interest to onboarding?",
    "What is currently deployed and usable without engineering intervention?",
    "What measurable outcome defines success over the next 30, 60, and 90 days?",
  ],
  evidence: [
    // --- Problem / Solution / Product: the built side (strengths) ---
    {
      id: "vw-problem",
      fact: "[strong] A real, specific problem: fragmented apps for managing youth-sports schedules and activities — validated by the founder's own use and by real (if small) usage (703 page views, 284 SMS sent).",
      link: "problem",
      quality: "observed",
      sources: [H, C],
      asset: "verified_working",
    },
    {
      id: "vw-solution",
      fact: "[strong] A coherent multi-tenant coordination platform (Venuewise Core / Huddle) directly addresses the problem — 'One Core, many Workspaces', configuration over custom code.",
      link: "solution",
      quality: "observed",
      sources: [C],
      asset: "verified_present_unproven",
    },
    {
      id: "vw-product",
      fact: "[strong] Technically mature product: 73 migrations, full RLS, cron automation; HomeHuddle live at venuewise.net with a Playwright smoke suite against production; 33 of 62 pages call the backend; 8 capabilities in genuine production (identity, calendar, SMS, family, payments, analytics, workflow, admin).",
      link: "product",
      quality: "observed",
      sources: [H, C],
      asset: "verified_present_unproven",
    },
    {
      id: "vw-value-delivery",
      fact: "[strong] Real value delivered at family/pilot scale: 284 SMS sent, 93 calendar events, 118 events, 51 athlete events — the product does work for its handful of users.",
      link: "value_delivery",
      quality: "estimated",
      sources: [H],
      asset: "verified_present_unproven",
    },

    // --- The commercial side: near-zero results, recorded, cause UNCONFIRMED ---
    {
      id: "vw-customer",
      fact: "Target paying customer not identified; ~7 users total, largely family/pilot. No evidence of a defined first customer or buying trigger.",
      link: "customer",
      quality: "unknown",
      sources: [H],
      asset: "unknown",
    },
    {
      id: "vw-activation",
      fact: "Onboarding/activation for new outside users is unproven: Forms engine 0 submissions, Documents 0, CRM/leads 0 rows despite all being built — the engines await usage.",
      link: "activation",
      quality: "observed", // real datum, but untagged → signal-neutral (does not name the binding gap)
      value: 0,
      valueUnit: "form submissions",
      sources: [H],
      asset: "verified_present_unproven",
    },
    {
      id: "vw-retention",
      fact: "No retention or cohort evidence; no proof of repeat use outside the family/dev team.",
      link: "retention",
      quality: "unknown",
      sources: [H],
      asset: "unknown",
    },
    {
      id: "vw-revenue",
      fact: "Full Stripe suite (checkout/portal/webhook) is active, but subscriptions = 1 — the product is essentially unmonetized. Near-zero recurring revenue.",
      link: "revenue",
      quality: "observed", // real datum, untagged → symptom of the goal gap, NOT a confirmed binding constraint
      value: 1,
      valueUnit: "paying subscriptions",
      sources: [H],
      asset: "verified_present_unproven",
    },
    {
      id: "vw-acquisition",
      fact: "No repeatable acquisition channel is evidenced; the leads table exists with 0 rows.",
      link: "acquisition",
      quality: "observed",
      value: 0,
      valueUnit: "leads",
      sources: [H],
      asset: "verified_present_unproven",
    },
    {
      id: "vw-sales",
      fact: "No sales process or interest→signed conversion is documented or observable.",
      link: "sales",
      quality: "unknown",
      sources: [H],
      asset: "unknown",
    },
    {
      id: "vw-fulfillment",
      fact: "Deployability without engineering is unproven: the platform layer (/shared, /platform, /workspaces) is a scaffold 'adopted by nothing yet'; the live part is the HomeHuddle app beneath it.",
      link: "fulfillment",
      quality: "unknown",
      sources: [C],
      asset: "partial",
    },
    {
      id: "vw-scale",
      fact: "Scale economics are unknown — no multi-customer operating evidence.",
      link: "scale",
      quality: "unknown",
      asset: "unknown",
    },
    {
      id: "vw-margin",
      fact: "Pricing and margin model is unknown — no commercial pricing evidence.",
      link: "margin",
      quality: "unknown",
      asset: "unknown",
    },

    // --- Context: ecosystem breadth & unverified concepts ---
    {
      id: "vw-breadth",
      fact: "Ecosystem breadth is a focus risk: beyond live HomeHuddle, the AthleteHuddle/CoachesHuddle/FacilityHuddle/Tournament/Organization concepts, Marketplace, and CoachAI/BroadcastAI/HighlightAI are mostly scaffolds or 0-usage. CoachesHuddle's repo is a bare create-next-app scaffold; the AI edge functions' purpose could not be determined from metadata.",
      link: "context",
      quality: "observed",
      sources: [C, H],
      asset: "documented_only",
    },
    {
      id: "vw-backend-caveat",
      fact: "The real Huddle backend (Supabase 'Venuewise Platform') was not independently reachable by the harvest's credentials; backend maturity is inferred from the front-end and the repo's own status docs, not verified against the database.",
      link: "context",
      quality: "assumed",
      sources: [C],
      asset: "documented_only",
    },
  ],
};
