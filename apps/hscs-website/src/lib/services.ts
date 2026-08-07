/**
 * HSCS service catalog — the typed model behind the /services hub and every
 * /services/<slug> page. Routes and the service set are the APPROVED catalog
 * from the Website IA §1 and Website Page Specifications §4.2 (frozen Phase 1
 * Baseline). Slugs are used verbatim from the approved IA — none are invented.
 *
 * Copy here is authored to each page's approved Page Specification (purpose,
 * audience, sections, CTAs, trust, linking). HONESTY: no invented metrics,
 * results, testimonials, or endorsements; operating experience uses the
 * name-free treatment (company names withheld until permission-cleared).
 *
 * DOCTRINE: operations lead, technology supports. The named tools
 * (FleetHuddle/DispatchAI/TransportationAI/Executive Dashboards/AI-supported
 * Operational Intelligence) appear only as engagement enhancers via `toolsNote`
 * — never as products: no pricing, no buy/try/signup, no standalone product page.
 */

import { ASSESSMENT_HREF, COMING_SOON, type Cta } from "./content";
import { INDUSTRIES, INDUSTRIES_BASE } from "./industries";

export const SERVICES_BASE = "/services";
/** The approved front-door service (Operations Assessment) — a real built page. */
export const ASSESSMENT_SERVICE_HREF = "/services/operations-assessment";

export interface ServiceFaq {
  readonly q: string;
  readonly a: string;
}

export interface ServiceLink {
  readonly label: string;
  /** Real built route, or /coming-soon for not-yet-built destinations. */
  readonly href: string;
}

export interface ServicePage {
  /** Approved IA slug (path is `/services/<slug>`). */
  readonly slug: string;
  /** Internal reference code (S0–S9 / practice). Never shown in the URL. */
  readonly code: string;
  readonly name: string;
  readonly eyebrow: string;
  /** Hero H1 — the outcome promise. */
  readonly headline: string;
  /** Hero supporting line. */
  readonly lede: string;
  /** Section 2 — the problem this solves (operator framing). */
  readonly problem: string;
  /** Section 3 — what the engagement covers. */
  readonly scope: readonly string[];
  /** Section 5 — relevant operating experience/proof (name-free). */
  readonly experience: string;
  /** Section 6 — related industries (bridge). Industries pages aren't built yet. */
  readonly relatedIndustries: readonly ServiceLink[];
  /** Section 7 — what you get (deliverable). */
  readonly whatYouGet: readonly string[];
  /** Section 8 — FAQ (objections + SEO). */
  readonly faq: readonly ServiceFaq[];
  /** Optional: tools that can support this engagement (enhancers only, no CTA). */
  readonly toolsNote?: string;
  /** Whether this is the front-door Operations Assessment. */
  readonly startHere?: boolean;
  /** Whether this is a consulting practice area (not a standard service tier). */
  readonly practiceArea?: boolean;
  /** Secondary CTA (prefers a real built target). */
  readonly secondaryCta: Cta;
  readonly seoTitle: string;
  readonly seoDescription: string;
}

// Related-industries links resolve to the built industry pages (Milestone 2C).
// Labels map to the approved industry routes by name; an unmapped label would be
// a wiring bug, so it falls back to the honest /coming-soon rather than a 404.
const INDUSTRY_HREF_BY_NAME = new Map<string, string>(
  INDUSTRIES.map((i) => [i.name, `${INDUSTRIES_BASE}/${i.slug}`]),
);

function ind(label: string): ServiceLink {
  return { label, href: INDUSTRY_HREF_BY_NAME.get(label) ?? COMING_SOON };
}

// Most service pages send their secondary CTA to the real, built Operations
// Assessment page (the front door). The Assessment page itself points onward to
// the assessment request.
const START_WITH_ASSESSMENT: Cta = {
  label: "Start with an Operations Assessment",
  href: ASSESSMENT_SERVICE_HREF,
};

export const SERVICES: readonly ServicePage[] = [
  {
    slug: "operations-assessment",
    code: "S0",
    name: "Operations Assessment",
    eyebrow: "START HERE",
    headline: "Find out where your operation is losing money — with evidence.",
    lede: "The Operations Assessment is the front door to everything we do: an AI-accelerated, evidence-backed read of where your operation stands and what to fix first.",
    problem:
      "You can feel that something in the operation is costing you — in cost, in service, in the hours your team spends firefighting — but you can't yet put a number or a priority on it. Guessing is expensive; a full transformation before you know the real problem is worse.",
    scope: [
      "A structured review of your operation across the domains that matter — operations, transportation and fleet, warehousing and distribution, technology, growth, financial, and AI-readiness.",
      "AI-accelerated analysis that reads across your operation faster than a team could, with an operator interpreting what it means.",
      "A prioritized, evidence-backed findings list — what's costing you, and what to fix first.",
      "A recommended sequence of moves, each traced to a rating, a measurement, or a stated assumption.",
    ],
    experience:
      "The assessment is run by an operator with thirty-five years across the complete supply chain — manufacturing, warehousing, middle mile, distribution, final mile, and white glove — not a consultant reading about your operation from the outside.",
    relatedIndustries: [
      ind("Warehousing & Fulfillment"),
      ind("Middle-Mile Logistics"),
      ind("Final-Mile Retail Delivery"),
    ],
    whatYouGet: [
      "A scored current-state of your operation, domain by domain.",
      "Prioritized, evidence-backed findings — ranked by impact.",
      "A recommended sequence of moves, with the success metrics we'd measure.",
      "An executive summary you keep and can put in front of your team.",
    ],
    faq: [
      {
        q: "Is the assessment a sales call?",
        a: "No. It's real work you keep — a scored, evidence-backed picture of your operation and what to do first. It's the first step, not a commitment to a program.",
      },
      {
        q: "How is AI used in the assessment?",
        a: "AI reads across your operation and surfaces patterns faster than a team could; an operator frames the questions and decides what the findings mean. AI enhances the analysis — it does not replace the operator's judgment.",
      },
      {
        q: "What if you don't have data for something?",
        a: "We say so, and show how we'd measure it. We won't present an assumption as a fact or hand you a number we can't stand behind.",
      },
    ],
    startHere: true,
    secondaryCta: { label: "See how we work", href: COMING_SOON },
    seoTitle: "Operations Assessment — HSCS",
    seoDescription:
      "An AI-accelerated, evidence-backed operations assessment: a scored current-state and a prioritized, evidence-backed list of what to fix first. The front door to HSCS consulting.",
  },
  {
    slug: "transportation-fleet-optimization",
    code: "S1",
    name: "Transportation & Fleet Optimization",
    eyebrow: "TRANSPORTATION & FLEET",
    headline: "Move more, for less, without breaking service.",
    lede: "Routing, utilization, dispatch, and network design — reviewed by an operator who has run middle-mile at national scale and retail final mile.",
    problem:
      "Transportation cost is creeping up, assets sit underused, and dispatch is heroics rather than a system. Every fix seems to trade cost against service — and no one has the time to prove which levers actually move the number.",
    scope: [
      "Routing and network design — how loads, lanes, and nodes are structured.",
      "Asset and driver utilization — where capacity is wasted and why.",
      "Dispatch — turning day-to-day heroics into a measurable, repeatable system.",
      "Mode and carrier strategy — what to run, what to buy, what to outsource.",
    ],
    experience:
      "Built from operating national middle-mile logistics and retail final-mile delivery — the connective network between the warehouse and the customer's door.",
    relatedIndustries: [
      ind("Middle-Mile Logistics"),
      ind("Final-Mile Retail Delivery"),
    ],
    whatYouGet: [
      "A clear read on where transportation cost and service are actually being lost.",
      "A prioritized set of routing, utilization, and dispatch moves.",
      "A recommended sequence with the success metrics we'd measure.",
    ],
    faq: [
      {
        q: "Do I have to buy software to work with you?",
        a: "No. We're vendor-neutral. Where analysis tooling helps an engagement we use it to sharpen the work — you're never buying a product from us.",
      },
      {
        q: "Can you work with our existing TMS and telematics?",
        a: "Yes. We work from the operation and the data you already have, and give you an operator's read on whether your current tools are earning their place.",
      },
    ],
    toolsNote:
      "Where it sharpens the analysis, a transportation engagement can draw on our operational tools — transportation and dispatch analysis, and fleet visibility. These support the consulting; they are not products we sell.",
    secondaryCta: START_WITH_ASSESSMENT,
    seoTitle: "Transportation & Fleet Optimization Consulting — HSCS",
    seoDescription:
      "Transportation and fleet optimization consulting: routing, utilization, dispatch, and network design from an operator who has run national middle-mile and retail final-mile logistics.",
  },
  {
    slug: "warehousing-distribution-improvement",
    code: "S2",
    name: "Warehousing & Distribution Improvement",
    eyebrow: "WAREHOUSING & DISTRIBUTION",
    headline: "Get more throughput out of the four walls you already have.",
    lede: "Throughput, labor productivity, layout and slotting, and inventory flow — from an operator who has run warehousing and distribution inside a major food manufacturer.",
    problem:
      "Throughput is capped, labor cost per unit keeps climbing, and the building always feels one bad day from a backlog. The fixes on the table are expensive and slow — and no one is sure which ones actually change the numbers on the floor.",
    scope: [
      "Throughput and flow — where product and people wait, and why.",
      "Labor productivity — the work content behind cost per unit.",
      "Layout and slotting — putting the fast movers where the labor is.",
      "Inventory flow — keeping the rest of the chain supplied, on time and intact.",
    ],
    experience:
      "Built from running warehousing and distribution operations inside a major food manufacturer — the source end of the chain, where throughput and inventory flow set the constraints everything downstream inherits.",
    relatedIndustries: [
      ind("Warehousing & Fulfillment"),
      ind("Direct-to-Customer / Cold-Chain"),
    ],
    whatYouGet: [
      "A read on where throughput and labor productivity are actually being lost.",
      "Prioritized layout, slotting, and process moves you can act on this quarter.",
      "A recommended sequence with the success metrics we'd measure.",
    ],
    faq: [
      {
        q: "Do your recommendations require stopping the operation?",
        a: "No. We prioritize practical, floor-level moves you can start without halting throughput, sequenced by impact.",
      },
      {
        q: "Will this work for a distribution center, not just a plant?",
        a: "Yes. The disciplines — throughput, labor, layout, inventory flow — apply across warehousing and distribution, which is exactly where this experience was built.",
      },
    ],
    secondaryCta: START_WITH_ASSESSMENT,
    seoTitle: "Warehousing & Distribution Improvement Consulting — HSCS",
    seoDescription:
      "Warehouse and distribution consulting: throughput, labor productivity, layout and slotting, and inventory flow from an operator who ran distribution inside a major food manufacturer.",
  },
  {
    slug: "final-mile-white-glove-delivery",
    code: "S3",
    name: "Final-Mile & White-Glove Delivery",
    eyebrow: "FINAL MILE & WHITE GLOVE",
    headline: "Make the last touch the one customers remember for the right reason.",
    lede: "High-touch delivery, service design, and damage control — from an operator who has run retail final mile and white-glove home delivery.",
    problem:
      "The last mile is where the promise is kept or broken — and where cost, damage, and missed appointments hide. It's the most visible part of your operation to the customer and often the least systematized.",
    scope: [
      "Final-mile network and appointment design — the routing and scheduling reality of home delivery.",
      "White-glove service design — handling quality where every touch is visible to the customer.",
      "Damage and claims — finding the cost that hides in the last mile.",
      "Retailer service expectations — meeting them without over-serving.",
    ],
    experience:
      "Built from running retail final-mile delivery across major retailers and white-glove, in-home delivery — the final, most demanding touch in the chain.",
    relatedIndustries: [
      ind("Final-Mile Retail Delivery"),
      ind("White-Glove & High-Touch Delivery"),
    ],
    whatYouGet: [
      "A read on where final-mile cost, damage, and service are being lost.",
      "Prioritized moves for routing, handling, and the customer experience.",
      "A recommended sequence with the success metrics we'd measure.",
    ],
    faq: [
      {
        q: "Do you cover big-and-bulky and in-home delivery?",
        a: "Yes. That's exactly the operating experience behind this service — retail big-and-bulky final mile and white-glove, in-home delivery.",
      },
    ],
    secondaryCta: START_WITH_ASSESSMENT,
    seoTitle: "Final-Mile & White-Glove Delivery Consulting — HSCS",
    seoDescription:
      "Final-mile and white-glove delivery consulting: appointment and routing complexity, handling quality, and damage control from an operator who has run retail final mile and in-home delivery.",
  },
  {
    slug: "operational-turnaround-margin-recovery",
    code: "S4",
    name: "Operational Turnaround & Margin Recovery",
    eyebrow: "TURNAROUND & MARGIN",
    headline: "Stabilize the operation, then recover the margin — in that order.",
    lede: "For operations under margin or service pressure: rapid diagnosis, stabilization, and a measured recovery plan.",
    problem:
      "Margin is compressing or service is slipping, and the pressure to act is high — which is exactly when a wrong move is most expensive. You need a fast, honest diagnosis before you commit to a plan.",
    scope: [
      "Rapid diagnosis — what's actually driving the margin or service problem.",
      "Stabilization — stopping the bleeding without breaking what still works.",
      "A measured recovery plan — sequenced, with success metrics defined up front.",
      "Honest reporting at each stage — met or not.",
    ],
    experience:
      "Built from thirty-five years of running operations across the complete supply chain, where margin and service are recovered on the floor, not in a slide deck.",
    relatedIndustries: [
      ind("Warehousing & Fulfillment"),
      ind("Middle-Mile Logistics"),
      ind("Final-Mile Retail Delivery"),
    ],
    whatYouGet: [
      "A fast, evidence-backed diagnosis of the margin or service problem.",
      "A stabilization plan and a sequenced recovery roadmap.",
      "Success metrics defined up front and reported honestly at each stage.",
    ],
    faq: [
      {
        q: "How fast can you move?",
        a: "The diagnosis is deliberately fast — the point is to know the real problem before committing to a plan. Recovery is sequenced by impact, not by big-bang.",
      },
    ],
    secondaryCta: START_WITH_ASSESSMENT,
    seoTitle: "Operational Turnaround & Margin Recovery — HSCS",
    seoDescription:
      "Operations turnaround and margin recovery: rapid diagnosis, stabilization, and a measured recovery plan for operations under margin or service pressure.",
  },
  {
    slug: "operations-technology-advisory",
    code: "S5",
    name: "Operations Technology Advisory",
    eyebrow: "TECHNOLOGY ADVISORY",
    headline: "An operator's independent read on the software you're weighing.",
    lede: "Vendor-neutral advice on TMS, WMS, routing, and telematics — what to buy, what to skip, and how to make a stalled rollout work.",
    problem:
      "A vendor is promising the world, an implementation is stalled, or you're not sure the tool you're paying for earns its place. You need an honest read from someone who runs operations, not someone selling the license.",
    scope: [
      "Evaluating a TMS/WMS/routing/telematics decision against your operation's real needs.",
      "Diagnosing why a rollout has stalled — and what it takes to make it work.",
      "Deciding what to buy, what to skip, and what to fix in the operation first.",
    ],
    experience:
      "Built from running operations that depend on this software every day — an operator's-eye view of whether a tool actually helps the floor.",
    relatedIndustries: [ind("Middle-Mile Logistics"), ind("Warehousing & Fulfillment")],
    whatYouGet: [
      "An independent, outcomes-first read on the technology decision in front of you.",
      "A clear recommendation — buy, skip, or fix the operation first.",
      "If a rollout is stalled: what it will take to make it work.",
    ],
    faq: [
      {
        q: "Are you reselling any software?",
        a: "No. This advisory is vendor-neutral — we advise on outcomes, not licenses. We don't sell you a product.",
      },
      {
        q: "How is this different from the vendor's own advice?",
        a: "We've run the operation the software is meant to serve, so the read is about your outcomes, not the sale.",
      },
    ],
    secondaryCta: START_WITH_ASSESSMENT,
    seoTitle: "Operations Technology Advisory (TMS/WMS/Routing) — HSCS",
    seoDescription:
      "Vendor-neutral operations technology advisory: an operator's independent read on TMS, WMS, routing, and telematics — what to buy, what to skip, and how to fix a stalled rollout.",
  },
  {
    slug: "operations-transformation-program",
    code: "S6",
    name: "Operations Transformation Program",
    eyebrow: "TRANSFORMATION PROGRAM",
    headline: "Execute the roadmap — sequenced, measured, and reported honestly.",
    lede: "A multi-quarter program that executes the assessment's roadmap, with success metrics defined up front and reported at each stage.",
    problem:
      "You know the direction, but execution stalls between quarters — priorities drift, metrics go quiet, and the transformation becomes a document instead of a result.",
    scope: [
      "Sequenced execution of the roadmap from your Operations Assessment.",
      "Success metrics defined up front for each stage.",
      "Honest stage-by-stage reporting — met or not.",
      "An operator driving the work, not just advising on it.",
    ],
    experience:
      "Built from thirty-five years of running operations end to end — the difference between a plan and a result is execution on the floor.",
    relatedIndustries: [ind("Warehousing & Fulfillment"), ind("Middle-Mile Logistics")],
    whatYouGet: [
      "A sequenced transformation program tied to your assessment's findings.",
      "Defined success metrics per stage, reported honestly.",
      "An operator accountable for the outcome.",
    ],
    faq: [
      {
        q: "Do we need an assessment first?",
        a: "Yes — the program executes the roadmap the Operations Assessment produces. Start there.",
      },
    ],
    secondaryCta: START_WITH_ASSESSMENT,
    seoTitle: "Operations Transformation Program — HSCS",
    seoDescription:
      "A sequenced, multi-quarter operations transformation program that executes your assessment roadmap, with success metrics defined up front and reported honestly at each stage.",
  },
  {
    slug: "ai-enablement-for-operations",
    code: "S7",
    name: "AI-Enablement for Operations",
    eyebrow: "AI-ENABLEMENT",
    headline: "Put AI to work inside the operation — with the operator in charge.",
    lede: "Identifying and piloting high-value, guard-railed AI and automation inside your operation. AI enhances the operation; the operator governs every deployment.",
    problem:
      "AI is everywhere in the pitch deck and nowhere on your floor. You want the productivity, but not a black box making operational decisions no one can explain.",
    scope: [
      "Identifying where guard-railed AI and automation can safely add value.",
      "Piloting high-value use cases with the operator governing each deployment.",
      "Framing ROI honestly — measured, not asserted.",
    ],
    experience:
      "Grounded in the same doctrine that runs the whole firm: AI enhances analysis, validation, and decision-making; it never replaces the operator's judgment.",
    relatedIndustries: [ind("Middle-Mile Logistics"), ind("Warehousing & Fulfillment")],
    whatYouGet: [
      "A prioritized set of high-value, guard-railed AI and automation opportunities.",
      "A pilot plan with the operator in control and ROI measured, not assumed.",
    ],
    faq: [
      {
        q: "Is AI making the decisions?",
        a: "No. AI reads, correlates, and validates faster than a team; the operator decides. Technology supports the consulting — it never replaces it.",
      },
    ],
    toolsNote:
      "Where it helps, engagements can draw on our AI-supported operational intelligence to read and validate across the chain. It supports the consulting; it is not a product we sell.",
    secondaryCta: START_WITH_ASSESSMENT,
    seoTitle: "AI-Enablement for Operations — HSCS",
    seoDescription:
      "AI-enablement for operations: identifying and piloting high-value, guard-railed AI and automation with the operator governing every deployment. AI is not the product — operational expertise is.",
  },
  {
    slug: "advisory-operations-leadership",
    code: "S8",
    name: "Advisory & Operations Leadership",
    eyebrow: "ADVISORY & LEADERSHIP",
    headline: "An operator's judgment, on call for your leadership team.",
    lede: "Recurring, operator-level advisory for leadership teams that need experienced operating judgment on call.",
    problem:
      "Your team is capable, but some decisions need someone who has actually run the operation — and hiring that experience full-time isn't always the right move.",
    scope: [
      "Recurring, operator-level advisory for your leadership team.",
      "Experienced judgment on the operational decisions that matter most.",
      "A relationship, not a one-off engagement.",
    ],
    experience:
      "Thirty-five years of running operations across the complete supply chain — judgment built on having carried the P&L, not read about one.",
    relatedIndustries: [
      ind("Warehousing & Fulfillment"),
      ind("Middle-Mile Logistics"),
      ind("Final-Mile Retail Delivery"),
    ],
    whatYouGet: [
      "Ongoing access to an operator's judgment on your key decisions.",
      "A trusted outside perspective grounded in having run the work.",
    ],
    faq: [
      {
        q: "Is this a fixed engagement or ongoing?",
        a: "It's a recurring advisory relationship — operating judgment on call, sized to what your leadership team needs.",
      },
    ],
    secondaryCta: START_WITH_ASSESSMENT,
    seoTitle: "Advisory & Operations Leadership — HSCS",
    seoDescription:
      "Fractional, operator-level operations advisory: experienced operating judgment on call for leadership teams, from an operator with 35 years across the supply chain.",
  },
  {
    slug: "executive-operations-dashboards",
    code: "S9",
    name: "Executive Operations Dashboards",
    eyebrow: "EXECUTIVE DASHBOARDS",
    headline: "Honest, ongoing visibility into your operation — measured vs. unknown.",
    lede: "Ongoing, evidence-based operational visibility for your leadership, as the instrument of an engagement — never a software subscription sold on its own.",
    problem:
      "Leadership dashboards too often show a green number that isn't true. You need visibility you can trust — one that shows what's measured, and says plainly what isn't yet.",
    scope: [
      "Ongoing, evidence-based visibility into the operation during and after an engagement.",
      "An honest split between what's measured and what's still unknown.",
      "Visibility framed as the instrument of the consulting work, not a product.",
    ],
    experience:
      "Grounded in the honesty guarantee that governs the whole firm: where a baseline isn't measured, the dashboard says so — it never shows a number we can't stand behind.",
    relatedIndustries: [ind("Warehousing & Fulfillment"), ind("Middle-Mile Logistics")],
    whatYouGet: [
      "Ongoing, evidence-based operational visibility for your leadership.",
      "An honest measured-vs-unknown view — no invented metrics.",
    ],
    faq: [
      {
        q: "Is this a software product I subscribe to?",
        a: "No. Executive Dashboards are the ongoing instrument of a consulting engagement — not a standalone product with a price tag.",
      },
    ],
    toolsNote:
      "Executive Dashboards are how an engagement stays visible to your leadership over time. They support the consulting relationship; they are not a product sold on their own.",
    secondaryCta: START_WITH_ASSESSMENT,
    seoTitle: "Executive Operations Dashboards — HSCS",
    seoDescription:
      "Executive operations dashboards: ongoing, evidence-based visibility for leadership as the instrument of an engagement — an honest measured-vs-unknown view, never invented metrics.",
  },
  {
    slug: "government-logistics",
    code: "PRACTICE",
    name: "Government Logistics",
    eyebrow: "CONSULTING PRACTICE",
    headline:
      "Operations consulting for the distinct demands of public-sector logistics.",
    lede: "Government logistics is a consulting practice within HSCS — the same operator's method applied to public-sector compliance, accountability, and service obligations. The practice leads; software supports it.",
    problem:
      "Public-sector logistics carries requirements commercial work doesn't — compliance, accountability, and service obligations — but the operational fundamentals still decide whether the mission is met on time and on budget.",
    scope: [
      "The same operator's-eye assessment and method applied to government logistics.",
      "Attention to the compliance, accountability, and service requirements that differ from commercial work.",
      "Operational fundamentals — transportation, warehousing, distribution — under public-sector constraints.",
    ],
    experience:
      "Thirty-five years of running operations across the complete supply chain, applied to the public-sector context. HSCS's existing government-logistics capability supports this practice — the practice comes first; the software supports it, never the reverse.",
    relatedIndustries: [ind("Warehousing & Fulfillment"), ind("Middle-Mile Logistics")],
    whatYouGet: [
      "An operator's assessment of the operation under public-sector requirements.",
      "A prioritized, evidence-backed plan that respects compliance and accountability.",
    ],
    faq: [
      {
        q: "Is this a software platform?",
        a: "No. Government logistics is a consulting practice within HSCS. Our existing government-logistics capability can support an engagement, but the practice — the consulting — leads.",
      },
    ],
    practiceArea: true,
    secondaryCta: START_WITH_ASSESSMENT,
    seoTitle: "Government Logistics Consulting Practice — HSCS",
    seoDescription:
      "Government logistics as a consulting practice within HSCS: the operator's method applied to public-sector compliance, accountability, and service. The practice leads; software supports it.",
  },
];

export function serviceBySlug(slug: string): ServicePage | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export const SERVICE_SLUGS: readonly string[] = SERVICES.map((s) => s.slug);

/** Hub page copy (T-Hub). */
export const SERVICES_HUB = {
  eyebrow: "SERVICES",
  headline: "Operations consulting, from an operator who has run it.",
  lede: "Every engagement starts the same way — with an Operations Assessment that tells you, with evidence, where your operation is losing money and what to fix first. From there, the work goes as deep as it needs to.",
  startHereHref: ASSESSMENT_SERVICE_HREF,
  primaryCta: {
    label: "Request an Operations Assessment",
    href: ASSESSMENT_HREF,
  } as Cta,
  seoTitle: "Services — Transportation & Operations Consulting — HSCS",
  seoDescription:
    "HSCS transportation & operations consulting services: start with an Operations Assessment, then transportation and fleet, warehousing and distribution, final-mile, turnaround, technology advisory, transformation, AI-enablement, advisory, and the government logistics practice.",
} as const;
