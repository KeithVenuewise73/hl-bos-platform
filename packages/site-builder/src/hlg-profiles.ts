// Starting Business Profiles for two HLG-owned companies: HLG Business
// Transformation and Herman Supply Chain Solutions (HSCS).
//
// Every field says where it came from. A field is "verified" only when the
// CEO supplied it (the Phase 3A brief, 2026-10-15) or it is a matter of record
// in HLG's own repositories (a domain in a CNAME file, a colour in a
// stylesheet, a product's status in the portfolio registry). Everything else
// is "unverified" (entered, to confirm) or "required" (not supplied). Nothing
// is copied from the current HSCS site's statistics, testimonials or contact
// details: none of them could be verified (see internalNotes).

import {
  emptyProfile,
  type BusinessProfile,
  type ProfileItem,
  type ProfileList,
  type ProfileValue,
} from "./profile.ts";

const BRIEF = "CEO, Phase 3A brief (2026-10-15)";
const HLG_SITE = "hermanlegacygroup.com source (GitHub hermanlegacygroup @ 57ee5b9)";
const HSCS_SITE =
  "hermansupplychainsolutions.com source (GitHub herman-supply-chain @ 0971d06)";
const HSCS_FOUNDATION =
  "HSCS Commercial Foundation v1.0 (docs/products/hscs-commercial-foundation; owner: CEO)";
const HSCS_DESIGN = "HSCS Design System v1.0 (docs/products/hscs-design-system) §4";
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
  Object.assign(p.fields, {
    brandName: v("HLG Business Transformation", BRIEF),
    description: v(
      "HLG Business Transformation helps local and service-based businesses strengthen their digital presence, improve lead capture, modernize customer interactions and implement practical business systems.",
      `${BRIEF}: approved positioning, verbatim`,
    ),
    businessType: v(
      "Business transformation services",
      `${BRIEF}: the business's name and positioning`,
    ),
    phone: v("716-220-7354", `${BRIEF}: business phone confirmed by the CEO`),
    logoText: v("HLG", `${HLG_SITE}: the HLG brand mark`),
    brandColor: v("#c0892d", `${HLG_SITE}: the HLG brass accent`),
    serviceArea: u(
      "Western New York",
      "The parent site hermanlegacygroup.com lists Western New York; confirm for this business.",
    ),
    primaryCta: u(
      "Request a digital-presence assessment",
      "Proposed by HLG engineering from the first approved service; CEO to confirm.",
    ),
    secondaryCta: u("See the services", "Proposed by HLG engineering; CEO to confirm."),
  });
  Object.assign(p.lists, {
    services: list(
      "verified",
      `Service names: ${BRIEF}. One-line descriptions restate each name.`,
      [
        [
          "Digital-presence assessments",
          "A clear picture of how customers find the business online.",
        ],
        [
          "Website creation and modernization",
          "New websites, and updates to existing ones.",
        ],
        [
          "Google-presence improvement",
          "A complete, accurate Google Business Profile.",
        ],
        ["Lead capture", "Making sure every enquiry is captured and followed up."],
        [
          "Booking, ordering and customer contact",
          "Systems for booking, ordering and staying in touch.",
        ],
        ["Business-process improvement", "Practical changes to everyday work."],
        ["AI-assisted business tools", "Tools that take repetitive work off the team."],
        [
          "Industry-specific operating systems",
          "Software shaped around one kind of business.",
        ],
        [
          "Website and customer-experience transformation",
          "The whole customer journey, online and off.",
        ],
        [
          "Ongoing managed digital services",
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
    products: list("verified", `Each product's status: ${REGISTRY}`, [
      [
        "HLG Presence Scanner",
        "Finds where a local business's online presence falls short, with evidence.",
        "in_development",
      ],
      [
        "HLG Instant Site Builder",
        "Builds a private website draft from a presence assessment.",
        "in_development",
      ],
      ["HL-BTI", "Business transformation assessment and scoring.", "in_development"],
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
    ]),
  });
  p.internalNotes = [
    "No website of its own was found. The parent site hermanlegacygroup.com does not mention Business Transformation.",
    "The parent site lists (716) 555-0142, which is in the 555 exchange reserved for examples, and hello@hermanlegacygroup.com; neither is verified for this business, so neither is used.",
    "Legal or operating name: confirm whether HLG Business Transformation trades as part of Herman Legacy Group.",
    "Products marked planned have no product yet; the page labels them Planned.",
  ].join("\n");
  return p;
}

export function hscsProfile(now: Date): BusinessProfile {
  const p = emptyProfile(HSCS_ID, "professional_services", now);
  p.subtype = "transport_operations";
  Object.assign(p.fields, {
    brandName: v("Herman Supply Chain Solutions", BRIEF),
    tagline: v(
      "Transportation & Operations Consulting supported with AI.",
      `${BRIEF}: approved positioning`,
    ),
    description: v(
      "HSCS is a transportation & operations consulting firm built by a business owner and designed for operators. Thirty-five years of operational experience, enhanced by AI.",
      `${HSCS_FOUNDATION} §3.1 canonical positioning statement, verbatim`,
    ),
    businessType: v(
      "Transportation & operations consulting",
      `${BRIEF}: approved positioning`,
    ),
    website: v(
      "https://www.hermansupplychainsolutions.com",
      `${HSCS_SITE}: CNAME file`,
    ),
    logoText: v("HSCS", `${BRIEF}: the business's short name`),
    brandColor: v(
      "#34506b",
      `${HSCS_DESIGN}: steel, the secondary brand colour for accents`,
    ),
    serviceArea: u(
      "All 48 continental states",
      "Stated on the current HSCS site; not verified.",
    ),
    primaryCta: u(
      "Request an operational assessment",
      "Proposed by HLG engineering from the approved experience areas; CEO to confirm.",
    ),
  });
  Object.assign(p.lists, {
    services: list(
      "verified",
      `Approved experience areas: ${BRIEF}. One-line descriptions restate each name.`,
      [
        [
          "Operational assessments",
          "A structured look at how the operation runs today.",
        ],
        [
          "Dispatch and routing",
          "Planning routes and dispatch so the day runs as designed.",
        ],
        [
          "Transportation operations",
          "Day-to-day running of transportation operations.",
        ],
        [
          "Final-mile and middle-mile delivery",
          "Delivery operations from the network to the customer.",
        ],
        ["Warehousing", "How goods are received, stored and sent out."],
        [
          "Contractor and driver performance",
          "Clear measures and routines for the people doing the work.",
        ],
        [
          "Practical AI-supported improvement",
          "Using AI where it makes the operation simpler to run.",
        ],
      ],
    ),
    experience: list(
      "verified",
      `${BRIEF} (experience areas) and ${HSCS_FOUNDATION} §3.1 and §4.6. No clients or results are stated.`,
      [
        [
          "Thirty-five years of operational experience",
          "Across the complete supply chain.",
        ],
        ["Manufacturing and warehousing", ""],
        ["Middle mile and distribution", ""],
        ["Final mile and white-glove delivery", ""],
        ["Direct-to-customer distribution", ""],
        ["Dispatch and routing", ""],
        ["Transportation operations", ""],
        ["Contractor and driver performance", ""],
      ],
    ),
    industries: list("unverified", "Listed on the current HSCS site; not verified.", [
      ["Foodservice and beverage distribution", "Distribution operations."],
      ["Third-party logistics providers", "Third-party logistics operations."],
      ["Retail and e-commerce fulfillment", "Retail delivery and fulfillment."],
      ["Last-mile delivery networks", "Final-mile delivery operations."],
    ]),
  });
  p.internalNotes = [
    "The current HSCS site (saved copy, GitHub herman-supply-chain @ 0971d06) shows claims that could not be verified and are NOT used: 'Est. 1994', '30 years', '$2.4M+ average annual savings', '18.3% average cost reduction', '200+ engagements', '$180M+ recovered', '98.2% client retention', and client testimonials.",
    "Its phone number 1-800-555-1234 is in the 555 exchange reserved for examples. Its email info@hermansupplychain.com is on a different domain from the site (hermansupplychainsolutions.com). Neither is used.",
    "The repository also contains a KPI dashboard page naming a retailer. No client is named on the draft.",
    "Business phone and email: CEO input required.",
    "The approved HSCS Commercial Foundation's primary tagline is '35 Years of Operational Experience. Enhanced by AI.'; this draft uses the Phase 3A brief's 'Transportation & Operations Consulting supported with AI.' as the headline. Choose one.",
  ].join("\n");
  return p;
}

export function hlgInternalProfiles(now: Date): BusinessProfile[] {
  return [hlgBusinessTransformationProfile(now), hscsProfile(now)];
}
