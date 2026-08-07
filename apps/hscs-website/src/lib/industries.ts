/**
 * HSCS industry catalog — the typed model behind the /industries hub and every
 * /industries/<slug> page. Routes and the industry set are the APPROVED catalog
 * from the Website IA §1 (sitemap) and Website Page Specifications §4.3 (frozen
 * Phase 1 Baseline). Slugs are used verbatim from the approved IA — none are
 * invented, and no industry outside the approved five appears here.
 *
 * Copy here is authored to the approved T-Industry template (Page Specs §3):
 * hero → operating proof → lifecycle placement → operational challenges →
 * mapped services (the §6.2 bridge) → what you get → FAQ → conversion band.
 *
 * HONESTY (non-negotiable): the operating proof uses the NAME-FREE treatment —
 * the operating record is described as experience, never endorsement, and the
 * real company names stay withheld until permission-cleared (Foundation G4).
 * No fabricated metrics, testimonials, case studies, or customer logos.
 *
 * DOCTRINE: operations lead, technology supports. Each industry links back to
 * the service(s) it proves; the single primary conversion is Request an
 * Operations Assessment.
 */

import { ASSESSMENT_HREF, COMING_SOON, type Cta } from "./content";

export const INDUSTRIES_BASE = "/industries";

/** Mapped service routes (the §6.2 service↔industry bridge). Real built pages. */
const S1_TRANSPORTATION = "/services/transportation-fleet-optimization";
const S2_WAREHOUSING = "/services/warehousing-distribution-improvement";
const S3_FINAL_MILE = "/services/final-mile-white-glove-delivery";

export interface IndustryFaq {
  readonly q: string;
  readonly a: string;
}

export interface IndustryLink {
  readonly label: string;
  /** Real built route, or /coming-soon for not-yet-built destinations. */
  readonly href: string;
}

export interface IndustryPage {
  /** Approved IA slug (path is `/industries/<slug>`). */
  readonly slug: string;
  readonly name: string;
  readonly eyebrow: string;
  /** Hero H1 — "we've operated here". */
  readonly headline: string;
  /** Hero supporting line. */
  readonly lede: string;
  /** Section 2 — the operating proof (name-free; experience, not endorsement). */
  readonly operatingProof: string;
  /** Section 3 — where this vertical sits in the end-to-end lifecycle. */
  readonly lifecyclePlacement: string;
  /** Section 4 — operational challenges we address in this vertical. */
  readonly challenges: readonly string[];
  /** Section 5 — mapped services (the §6.2 bridge). Real service routes. */
  readonly mappedServices: readonly IndustryLink[];
  /** Section 6 — what you get. */
  readonly whatYouGet: readonly string[];
  /** Section 7 — FAQ (objections + SEO). */
  readonly faq: readonly IndustryFaq[];
  /** Secondary CTA — the mapped service page (T-Industry spec §4.3.7). */
  readonly secondaryCta: Cta;
  readonly seoTitle: string;
  readonly seoDescription: string;
}

// The lifecycle-placement section points at the Experience page's matching
// stage anchor. Experience is NOT built in this milestone, so the "see the full
// operating lifecycle" link honestly resolves to /coming-soon.
export const LIFECYCLE_HREF = COMING_SOON;

// Listed in supply-chain (lifecycle) order per IA §2.3 — reinforcing the
// end-to-end operating story from the source of the chain to the customer's door.
export const INDUSTRIES: readonly IndustryPage[] = [
  {
    slug: "warehousing-fulfillment",
    name: "Warehousing & Fulfillment",
    eyebrow: "WAREHOUSING & FULFILLMENT",
    headline: "We've run the four walls — not just advised on them.",
    lede: "Operations consulting for warehousing and fulfillment, from an operator who has run distribution inside a major food manufacturer — the source end of the chain, where throughput and inventory flow set the constraints everything downstream inherits.",
    operatingProof:
      "The experience behind this vertical was built running warehousing and distribution operations inside a major food manufacturer — real responsibility for throughput, labor, and inventory flow, not a study of someone else's floor. We describe that record as operating experience, not endorsement; the companies are named only once permission is cleared.",
    lifecyclePlacement:
      "Warehousing and fulfillment sit at the source of the chain. What happens on this floor — how product moves, how labor is spent, how inventory flows out — sets the cost and service constraints every downstream stage inherits.",
    challenges: [
      "Throughput capped by flow problems no one has had time to isolate.",
      "Labor cost per unit climbing without a clear read on the work content behind it.",
      "Layout and slotting that put the fast movers in the wrong place.",
      "Inventory flow that keeps the rest of the chain waiting — or short.",
    ],
    mappedServices: [
      { label: "Warehousing & Distribution Improvement", href: S2_WAREHOUSING },
    ],
    whatYouGet: [
      "An operator's read on where throughput and labor productivity are actually being lost.",
      "Prioritized layout, slotting, and process moves you can act on this quarter.",
      "A recommended sequence with the success metrics we'd measure.",
    ],
    faq: [
      {
        q: "Do your recommendations require stopping the operation?",
        a: "No. We prioritize practical, floor-level moves you can start without halting throughput, sequenced by impact.",
      },
      {
        q: "Is this experience real, or read from a book?",
        a: "Real. It comes from running warehousing and distribution operations inside a major food manufacturer — we just withhold the company name until permission is cleared.",
      },
    ],
    secondaryCta: {
      label: "See the mapped service: Warehousing & Distribution",
      href: S2_WAREHOUSING,
    },
    seoTitle: "Warehouse Operations Consulting by Industry — HSCS",
    seoDescription:
      "Warehouse and fulfillment operations consulting from an operator who ran distribution inside a major food manufacturer: throughput, labor productivity, layout and slotting, and inventory flow.",
  },
  {
    slug: "middle-mile-logistics",
    name: "Middle-Mile Logistics",
    eyebrow: "MIDDLE-MILE LOGISTICS",
    headline: "We've run the network in the middle — at national scale.",
    lede: "Operations consulting for middle-mile logistics, from an operator who has run national middle-mile networks — the connective tissue between the warehouse and the last mile.",
    operatingProof:
      "The experience behind this vertical was built operating middle-mile logistics at national scale — the lanes, nodes, and handoffs that move volume between facilities. That is operating experience, not endorsement; the companies stay unnamed until permission is cleared.",
    lifecyclePlacement:
      "Middle mile is the connective network between the source and the customer. It rarely gets the attention the ends of the chain do — which is exactly why cost and service quietly leak here.",
    challenges: [
      "Transportation cost creeping up with no clear read on which lanes drive it.",
      "Assets and capacity underused between nodes.",
      "Dispatch run as day-to-day heroics instead of a measurable system.",
      "Network design that grew by accretion, never by intent.",
    ],
    mappedServices: [
      { label: "Transportation & Fleet Optimization", href: S1_TRANSPORTATION },
    ],
    whatYouGet: [
      "A clear read on where middle-mile cost and service are actually being lost.",
      "A prioritized set of routing, utilization, and dispatch moves.",
      "A recommended sequence with the success metrics we'd measure.",
    ],
    faq: [
      {
        q: "Can you work with our existing TMS and telematics?",
        a: "Yes. We work from the operation and the data you already have, and give you an operator's read on whether your current tools are earning their place.",
      },
      {
        q: "Do I have to buy software to work with you?",
        a: "No. We're vendor-neutral. Where analysis tooling sharpens an engagement we use it — you're never buying a product from us.",
      },
    ],
    secondaryCta: {
      label: "See the mapped service: Transportation & Fleet",
      href: S1_TRANSPORTATION,
    },
    seoTitle: "Middle-Mile Logistics Consulting — HSCS",
    seoDescription:
      "Middle-mile logistics consulting from an operator who has run national middle-mile networks: routing, utilization, dispatch, and network design — vendor-neutral, outcomes-first.",
  },
  {
    slug: "direct-to-customer-cold-chain",
    name: "Direct-to-Customer / Cold-Chain",
    eyebrow: "D2C & COLD-CHAIN",
    headline: "We've run distribution where temperature and time don't forgive.",
    lede: "Operations consulting for direct-to-customer and cold-chain distribution, from an operator who has run temperature-controlled D2C distribution — where a broken chain is a lost product, not just a late one.",
    operatingProof:
      "The experience behind this vertical was built running direct-to-customer cold-chain distribution — moving temperature-sensitive product to the customer with the chain intact. We hold that up as operating experience, not endorsement, and withhold the company name until permission is cleared.",
    lifecyclePlacement:
      "D2C and cold-chain distribution sit between the warehouse and the customer, with an added constraint most distribution doesn't carry: the product degrades if the chain breaks. Time and temperature turn ordinary distribution problems into unforgiving ones.",
    challenges: [
      "Temperature integrity that has to hold across every handoff, every time.",
      "Distribution cost that climbs when routes and cut-offs aren't designed for the constraint.",
      "Service windows that leave no room for a bad day.",
      "Waste and shrink that hide inside a chain no one is measuring end to end.",
    ],
    mappedServices: [
      { label: "Warehousing & Distribution Improvement", href: S2_WAREHOUSING },
    ],
    whatYouGet: [
      "A read on where distribution cost, waste, and service are actually being lost.",
      "Prioritized moves for routing, cut-offs, and chain integrity.",
      "A recommended sequence with the success metrics we'd measure.",
    ],
    faq: [
      {
        q: "Do you understand temperature-controlled distribution specifically?",
        a: "Yes — that's the operating experience behind this vertical: running direct-to-customer cold-chain distribution where the chain has to stay intact from source to door.",
      },
    ],
    secondaryCta: {
      label: "See the mapped service: Warehousing & Distribution",
      href: S2_WAREHOUSING,
    },
    seoTitle: "Direct-to-Customer & Cold-Chain Distribution Consulting — HSCS",
    seoDescription:
      "Direct-to-customer and cold-chain distribution consulting from an operator who has run temperature-controlled D2C distribution: routing, cut-offs, chain integrity, waste, and service.",
  },
  {
    slug: "final-mile-retail-delivery",
    name: "Final-Mile Retail Delivery",
    eyebrow: "FINAL-MILE RETAIL",
    headline: "We've run the last mile for big-and-bulky retail.",
    lede: "Operations consulting for retail final-mile and big-and-bulky delivery, from an operator who has run retail final mile across major retailers — the most visible, least systematized part of the operation.",
    operatingProof:
      "The experience behind this vertical was built running retail final-mile delivery across major retailers — the routing, appointments, and handling reality of big-and-bulky home delivery. That is operating experience, not endorsement; the retailers stay unnamed until permission is cleared.",
    lifecyclePlacement:
      "Final-mile retail is where the operation meets the customer. It's the most visible part of the chain and often the least systematized — which is why cost, damage, and missed appointments hide here.",
    challenges: [
      "Appointment and routing complexity that no schedule seems to fully absorb.",
      "Damage and claims that quietly eat the margin on every delivery.",
      "Retailer service expectations met by over-serving instead of by design.",
      "A last touch that decides the customer's whole impression — left to chance.",
    ],
    mappedServices: [
      { label: "Final-Mile & White-Glove Delivery", href: S3_FINAL_MILE },
    ],
    whatYouGet: [
      "A read on where final-mile cost, damage, and service are being lost.",
      "Prioritized moves for routing, handling, and the customer experience.",
      "A recommended sequence with the success metrics we'd measure.",
    ],
    faq: [
      {
        q: "Do you cover big-and-bulky retail delivery specifically?",
        a: "Yes. That's exactly the operating experience behind this vertical — retail big-and-bulky final-mile delivery across major retailers.",
      },
    ],
    secondaryCta: {
      label: "See the mapped service: Final-Mile & White-Glove",
      href: S3_FINAL_MILE,
    },
    seoTitle: "Retail Final-Mile & Big-and-Bulky Delivery Consulting — HSCS",
    seoDescription:
      "Retail final-mile and big-and-bulky delivery consulting from an operator who has run retail final mile: appointment and routing complexity, handling quality, and damage control.",
  },
  {
    slug: "white-glove-high-touch-delivery",
    name: "White-Glove & High-Touch Delivery",
    eyebrow: "WHITE-GLOVE DELIVERY",
    headline: "We've run the white-glove touch — inside the customer's home.",
    lede: "Operations consulting for white-glove and high-touch delivery, from an operator who has run white-glove, in-home delivery — where every touch is visible to the customer and quality is the product.",
    operatingProof:
      "The experience behind this vertical was built running white-glove, in-home delivery — the final, most demanding touch in the chain, where handling quality is the whole promise. We present that as operating experience, not endorsement, and withhold the company name until permission is cleared.",
    lifecyclePlacement:
      "White-glove is the very end of the chain — the touch the customer remembers. Everything upstream is invisible to them; this is the moment the operation is judged.",
    challenges: [
      "Handling quality that has to be consistent when every touch is watched.",
      "In-home service design that balances care against cost and time.",
      "Damage where it's most expensive — the last touch, in front of the customer.",
      "A delivery experience that carries the brand, run without a system.",
    ],
    mappedServices: [
      { label: "Final-Mile & White-Glove Delivery", href: S3_FINAL_MILE },
    ],
    whatYouGet: [
      "A read on where white-glove cost, damage, and service are being lost.",
      "Prioritized moves for handling quality and the in-home experience.",
      "A recommended sequence with the success metrics we'd measure.",
    ],
    faq: [
      {
        q: "Do you understand in-home, high-touch delivery specifically?",
        a: "Yes — that's the operating experience behind this vertical: running white-glove, in-home delivery where handling quality is the entire promise.",
      },
    ],
    secondaryCta: {
      label: "See the mapped service: Final-Mile & White-Glove",
      href: S3_FINAL_MILE,
    },
    seoTitle: "White-Glove & High-Touch Delivery Operations Consulting — HSCS",
    seoDescription:
      "White-glove and high-touch delivery operations consulting from an operator who has run in-home delivery: handling quality, in-home service design, and damage control where every touch is visible.",
  },
];

export function industryBySlug(slug: string): IndustryPage | undefined {
  return INDUSTRIES.find((i) => i.slug === slug);
}

export const INDUSTRY_SLUGS: readonly string[] = INDUSTRIES.map((i) => i.slug);

/** Hub page copy (T-Hub, §4.3). */
export const INDUSTRIES_HUB = {
  eyebrow: "INDUSTRIES",
  headline: "We've operated in your world — end to end.",
  lede: "HSCS is a firm of operators who consult. Across thirty-five years, the founder ran every stage of the chain — from the warehouse floor to the customer's door. Find your vertical below, and see where the operating record meets your operation.",
  primaryCta: {
    label: "Request an Operations Assessment",
    href: ASSESSMENT_HREF,
  } as Cta,
  /** Secondary CTA — the full operating lifecycle (Experience, not built yet). */
  lifecycleHref: LIFECYCLE_HREF,
  seoTitle: "Industries — Transportation & Operations Consulting — HSCS",
  seoDescription:
    "HSCS transportation & operations consulting by industry: warehousing & fulfillment, middle-mile logistics, direct-to-customer & cold-chain, retail final-mile, and white-glove delivery — from an operator who has run each end to end.",
} as const;
