// Starting Business Profiles for two HLG-owned companies: HLG Business
// Transformation and Herman Supply Chain Solutions (HSCS).
//
// Every field says where it came from. A field is "verified" only when the
// CEO supplied it (the Phase 3A brief and the Phase 3B brief, both
// 2026-10-15), it is in an approved HLG document in this repository (the HSCS
// Commercial Foundation and Design System), or it is a matter of record (a
// domain in a CNAME file, a product's status in the portfolio registry).
// Everything else is "unverified" (entered, to confirm) or "required" (not
// supplied). Nothing is copied from the current HSCS site's statistics,
// testimonials or contact details: none of them could be verified.

import {
  emptyProfile,
  type BusinessProfile,
  type ProfileItem,
  type ProfileList,
  type ProfileValue,
} from "./profile.ts";

const BRIEF = "CEO, Phase 3A brief (2026-10-15)";
const BRIEF_3B = "CEO, Phase 3B brief (2026-10-15)";
const HLG_SITE = "hermanlegacygroup.com source (GitHub hermanlegacygroup @ 57ee5b9)";
const HSCS_SITE =
  "hermansupplychainsolutions.com source (GitHub herman-supply-chain @ 0971d06)";
const HSCS_FOUNDATION =
  "HSCS Commercial Foundation v1.0 (docs/products/hscs-commercial-foundation; owner: CEO)";
const REGISTRY =
  "HL-BOS portfolio registry (apps/control-center/src/lib/registry.ts), 2026-10-15";

const v = (value: string, source: string): ProfileValue => ({
  value,
  status: "verified",
  source,
});
const u = (value: string, source: string): ProfileValue => ({
  value,
  status: "unverified",
  source,
});
const list = (
  status: ProfileList["status"],
  source: string,
  items: [string, string, ProfileItem["status"]?][],
): ProfileList => ({
  status,
  source,
  items: items.map(([name, description, st]) => ({
    name,
    description,
    ...(st ? { status: st } : {}),
  })),
});

export const HLG_BT_ID = "hlg-business-transformation";
export const HSCS_ID = "herman-supply-chain-solutions";

export function hlgBusinessTransformationProfile(now: Date): BusinessProfile {
  const p = emptyProfile(HLG_BT_ID, "professional_services", now);
  p.subtype = "business_transformation";
  p.design = { theme: "atelier" };
  Object.assign(p.fields, {
    brandName: v("HLG Business Transformation", BRIEF),
    tagline: v(
      "Better digital presence, customer acquisition and operating systems.",
      `${BRIEF_3B}: the approved positioning, condensed to a headline; review in the design review`,
    ),
    description: v(
      "HLG Business Transformation helps local and service-based businesses improve their digital presence, customer acquisition and operating systems.",
      `${BRIEF_3B}: approved positioning, verbatim`,
    ),
    businessType: v(
      "Business transformation",
      `${BRIEF}: the business's name and positioning`,
    ),
    phone: v("716-220-7354", `${BRIEF}: business phone confirmed by the CEO`),
    logoText: v("HLG", `${HLG_SITE}: the HLG brand mark`),
    brandColor: v("#c0892d", `${HLG_SITE}: the HLG brass accent`),
    primaryCta: v(
      "Request a Business Transformation Assessment",
      `${BRIEF_3B}: primary CTA`,
    ),
    secondaryCta: v("Call HLG", `${BRIEF_3B}: secondary CTA`),
    plannedDomain: v(
      "transform.hermanlegacygroup.com",
      `${BRIEF_3B}: suggested future address, for display and readiness planning only (not configured)`,
    ),
    serviceArea: u(
      "Western New York",
      "The parent site hermanlegacygroup.com lists Western New York; confirm for this business.",
    ),
  });
  Object.assign(p.lists, {
    services: list(
      "verified",
      `Service names: ${BRIEF_3B}. One-line descriptions restate each name.`,
      [
        [
          "Digital-presence assessments",
          "A clear picture of how customers find the business online, and where they drop away.",
        ],
        [
          "Website strategy and development",
          "Websites planned around what customers need to do, then built and launched.",
        ],
        [
          "Google presence",
          "A complete, accurate Google Business Profile that matches the website.",
        ],
        ["Lead capture", "Calls, forms and messages captured, routed and followed up."],
        [
          "Customer communication",
          "Clear, timely contact with customers before and after the sale.",
        ],
        [
          "Booking and ordering systems",
          "Online booking and ordering connected to how the business runs.",
        ],
        [
          "Operational improvement",
          "Practical changes to the everyday work behind sales and service.",
        ],
        [
          "AI-assisted business tools",
          "Tools that take repetitive work off the team, with people in charge.",
        ],
        ["Industry-specific solutions", "Systems shaped around one kind of business."],
        [
          "Ongoing managed services",
          "Looking after the website and tools after launch.",
        ],
      ],
    ),
    industries: list(
      "unverified",
      "Inferred by HLG engineering from the planned product list; CEO to confirm.",
      [
        ["Contractors and home services", "Trades and home service businesses."],
        ["Salons and barbers", "Appointment-based personal services."],
        ["Restaurants and takeout", "Food and hospitality businesses."],
        ["Other local service businesses", "Owner-led local businesses."],
      ],
    ),
    products: list(
      "verified",
      `Each product's status: ${REGISTRY}. Pilot = in use with HLG's own businesses, not yet offered.`,
      [
        [
          "HLG Presence Scanner",
          "Finds where a local business's online presence falls short, with evidence.",
          "pilot",
        ],
        [
          "HLG Instant Site Builder",
          "Builds a private website draft from a presence assessment.",
          "pilot",
        ],
        ["TakeoutOS", "Ordering and operations for takeout restaurants.", "planned"],
        [
          "SalonOS / BarberOS",
          "Booking and operations for salons and barbers.",
          "planned",
        ],
        [
          "Contractor Performance System",
          "Lead and job tracking for contractors.",
          "planned",
        ],
      ],
    ),
  });
  p.internalNotes = [
    "No website of its own was found. The parent site hermanlegacygroup.com does not mention Business Transformation.",
    "The parent site lists (716) 555-0142, which is in the 555 exchange reserved for examples, and hello@hermanlegacygroup.com; neither is verified for this business, so neither is used.",
    "Legal or operating name: confirm whether HLG Business Transformation trades as part of Herman Legacy Group.",
    "Products marked Planned have no product yet; the Presence Scanner and Instant Site Builder are a Pilot (used on HLG's own businesses only).",
  ].join("\n");
  return p;
}

export function hscsProfile(now: Date): BusinessProfile {
  const p = emptyProfile(HSCS_ID, "professional_services", now);
  p.subtype = "transport_operations";
  p.design = { theme: "meridian" };
  Object.assign(p.fields, {
    brandName: v("Herman Supply Chain Solutions", BRIEF),
    tagline: v(
      "Transportation & Operations Consulting Supported by AI",
      `${BRIEF_3B}: approved primary headline`,
    ),
    credibility: v(
      "35 Years of Operational Experience. Enhanced by AI.",
      `${BRIEF_3B}: approved credibility statement; ${HSCS_FOUNDATION} §3.2 primary tagline`,
    ),
    description: v(
      "HSCS is a transportation & operations consulting firm built by a business owner and designed for operators. Thirty-five years of operational experience, enhanced by AI.",
      `${HSCS_FOUNDATION} §3.1 canonical positioning statement, verbatim`,
    ),
    businessType: v(
      "Transportation & operations consulting",
      `${BRIEF}: approved positioning`,
    ),
    phone: v("716-220-7354", `${BRIEF_3B}: verified phone for HSCS`),
    website: v(
      "https://www.hermansupplychainsolutions.com",
      `${HSCS_SITE}: CNAME file`,
    ),
    logoText: v("HSCS", `${BRIEF}: the business's short name`),
    brandColor: v(
      "#006d77",
      `${BRIEF_3B}: controlled teal accent (the teal of the current HSCS site)`,
    ),
    primaryCta: v(
      "Request an operations assessment",
      `${HSCS_FOUNDATION} §4.1 call to action`,
    ),
    secondaryCta: v(
      "Call HSCS",
      "HLG engineering, following the Phase 3B brief's Call pattern",
    ),
    plannedDomain: v(
      "hermansupplychainsolutions.com",
      `${BRIEF_3B}: suggested future domain, for display and readiness planning only (not configured)`,
    ),
    serviceArea: u(
      "All 48 continental states",
      "Stated on the current HSCS site only; not verified.",
    ),
  });
  Object.assign(p.lists, {
    services: list(
      "verified",
      `${HSCS_FOUNDATION} §6 service catalog (names and descriptions condensed). Pricing: to be established.`,
      [
        [
          "Operations Assessment",
          "An evidence-backed diagnostic: a scored current state, prioritized findings and a recommended sequence of moves.",
        ],
        [
          "Transportation & Fleet Optimization",
          "Routing, utilization, dispatch, middle- and final-mile network design, carrier strategy and fleet cost.",
        ],
        [
          "Warehousing & Distribution Improvement",
          "Throughput, labor productivity, layout and slotting, inventory flow and network design.",
        ],
        [
          "Final-Mile & White-Glove Delivery Excellence",
          "High-touch delivery operations, customer experience and damage and claims reduction.",
        ],
        [
          "Operational Turnaround & Margin Recovery",
          "Rapid diagnosis, stabilization and a measured recovery plan for operations under pressure.",
        ],
        [
          "Operations Technology Advisory",
          "Vendor-neutral evaluation of TMS, WMS, routing and telematics: what to buy, what to skip.",
        ],
        [
          "Operations Transformation Program",
          "A sequenced, multi-quarter program executing the assessment's roadmap, reported honestly.",
        ],
        [
          "AI-Enablement for Operations",
          "Guard-railed AI and automation inside the operation, with the operator's judgment in charge.",
        ],
        [
          "Fractional Operations Leadership",
          "Recurring operator-level advisory for leadership teams.",
        ],
        [
          "Executive Operations Dashboards",
          "Ongoing, evidence-based visibility into the operation, as part of an engagement.",
        ],
      ],
    ),
    process: list("verified", `${HSCS_FOUNDATION} §9 the HSCS method`, [
      [
        "Assess",
        "Structured current state across defined domains. Every rating has a source.",
      ],
      [
        "Analyze",
        "AI reads across the evidence; the operator frames the questions and interprets.",
      ],
      [
        "Recommend",
        "Prioritized moves, each with impact, priority and success metrics; fact, inference and opinion labelled.",
      ],
      [
        "Transform",
        "Sequenced execution with success metrics defined up front and reported honestly.",
      ],
    ]),
    industries: list(
      "verified",
      `${HSCS_FOUNDATION} §7.1 tier-1 verticals (no employer or client names)`,
      [
        [
          "White-glove and high-touch delivery",
          "Delivery operations leaders and home-goods retailers.",
        ],
        [
          "Direct-to-customer and cold-chain distribution",
          "D2C and cold-chain distribution leaders.",
        ],
        ["Middle-mile logistics", "Middle-mile and network operations leaders."],
        ["Final-mile retail delivery", "Retail final-mile and big-and-bulky leaders."],
        [
          "Warehousing and fulfillment",
          "Warehouse, distribution-center and plant leaders.",
        ],
      ],
    ),
    experience: list(
      "verified",
      `${BRIEF_3B} (experience areas) and ${HSCS_FOUNDATION} §3.1 and §4.6. No clients or results are stated.`,
      [
        ["Manufacturing", ""],
        ["Warehousing", ""],
        ["Middle mile", ""],
        ["Distribution", ""],
        ["Final mile", ""],
        ["White glove", ""],
      ],
    ),
    pillars: list("verified", `${HSCS_FOUNDATION} §4.2 the four value pillars`, [
      [
        "Experience",
        "We've run the operation you're trying to fix, across the whole chain.",
      ],
      ["Evidence", "Every recommendation is backed by data and reasoning."],
      ["Outcomes", "We measure what we recommend."],
      [
        "Enhancement",
        "AI makes the analysis faster and more rigorous. It doesn't replace the operator.",
      ],
    ]),
  });
  p.internalNotes = [
    "The current HSCS site (saved copy, GitHub herman-supply-chain @ 0971d06) shows claims that could not be verified and are NOT used: 'Est. 1994', '30 years', '$2.4M+ average annual savings', '18.3% average cost reduction', '200+ engagements', '$180M+ recovered', '98.2% client retention', and client testimonials.",
    "Its phone number 1-800-555-1234 is in the 555 exchange reserved for examples, and its email info@hermansupplychain.com is on a different domain from the site. Neither is used.",
    "The Commercial Foundation names past employers (Amazon, Lowe's, Sears, Bob's Discount Furniture, Arctic Glacier, Herman Movers, Sorrento / Lactalis) as operating proof. They are not shown: naming them on the site is a CEO decision.",
    "Business email: CEO input required.",
  ].join("\n");
  return p;
}

export function hlgInternalProfiles(now: Date): BusinessProfile[] {
  return [hlgBusinessTransformationProfile(now), hscsProfile(now)];
}
