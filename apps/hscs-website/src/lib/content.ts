/**
 * HSCS homepage content model — the single source of truth for every string
 * rendered by the site. All copy here is transcribed verbatim from the approved
 * HSCS Homepage Copy v1.0 (docs/products/hscs-homepage-architecture/01-homepage-copy.md),
 * which itself implements the approved Homepage Content Architecture, Website IA,
 * Commercial Foundation, Page Specifications, and Design System.
 *
 * Keeping copy in one typed module (rather than scattered through JSX) lets the
 * automated tests assert the principal homepage structure, the doctrine, and the
 * honesty rules directly against the data the page renders.
 *
 * HONESTY / DOCTRINE (enforced structurally + by tests):
 *  - The single primary conversion is "Request an Operations Assessment".
 *  - The assessment workflow is NOT built yet, so its CTA points to an honest
 *    "being prepared" page (`/request-an-assessment`) — never a fake form.
 *  - Toolbox entries carry NO link/CTA: tools support consulting, they are not
 *    products for sale (Foundation §18).
 *  - The credibility strip uses the NAME-FREE operating-record line by default,
 *    because the company names are experience (not endorsement) and must be
 *    permission-cleared before publication (Homepage Copy governance rule 2).
 *  - Links whose destination page is not built yet point to `/coming-soon`,
 *    which states plainly that the section is being prepared.
 */

export const DOCTRINE =
  "Operations lead. Technology supports. Operational expertise is the product. AI enhances analysis, validation, and decision-making.";

/** A destination that is a real, built route in this milestone. */
export const COMING_SOON = "/coming-soon";
/** Honest temporary destination for the primary conversion (no form yet). */
export const ASSESSMENT_HREF = "/request-an-assessment";

export interface NavItem {
  readonly label: string;
  /** Real future route; `pending` items resolve to the honest coming-soon page. */
  readonly href: string;
  readonly status: "ready" | "pending";
}

export interface Cta {
  readonly label: string;
  readonly href: string;
  /** True when the destination is an on-page anchor that already works. */
  readonly onPage?: boolean;
}

export const BRAND = {
  name: "Herman Supply Chain Solutions",
  short: "HSCS",
  descriptor: "Transportation & Operations Consulting",
} as const;

export const PRIMARY_CTA: Cta = {
  label: "Request an Operations Assessment",
  href: ASSESSMENT_HREF,
};

export const PRIMARY_CTA_MICROCOPY =
  "The first step is a conversation, not a commitment.";

/** Primary navigation labels come from the approved IA (§2.1 / Homepage Copy S0). */
export const NAV_PRIMARY: readonly NavItem[] = [
  { label: "Services", href: "/services", status: "pending" },
  { label: "Industries", href: "/industries", status: "pending" },
  { label: "Experience", href: "/experience", status: "pending" },
  { label: "Method", href: "/method", status: "pending" },
  { label: "Insights", href: "/insights", status: "pending" },
  { label: "About", href: "/about", status: "pending" },
];

/* ------------------------------------------------------------------------- *
 * Homepage sections S1–S11 (S0 header and S12 footer live in the layout).
 * Section `id`s are the in-page anchor targets used by working secondary CTAs.
 * ------------------------------------------------------------------------- */

export const HERO = {
  id: "top",
  eyebrow: "TRANSPORTATION & OPERATIONS CONSULTING",
  headline: "35 Years of Operational Experience. Enhanced by AI.",
  supporting:
    "Built by a business owner. Designed for operators. We don't study operations from the outside — we've run them, from the plant floor to the customer's front door. AI makes our analysis faster, deeper, and more defensible. The judgment behind it is still an operator's.",
  primaryCta: PRIMARY_CTA,
  secondaryCta: {
    label: "Explore the operating lifecycle",
    href: "#lifecycle",
    onPage: true,
  } satisfies Cta,
} as const;

export const CREDIBILITY = {
  id: "operating-record",
  headline: "Thirty-five years across the entire supply chain.",
  body: "Most consultants know one link in the chain. We've operated all of them — white-glove home delivery, direct-to-customer distribution, middle-mile logistics at national scale, retail final-mile delivery, and warehousing inside a major food manufacturer. That range is the difference: when we look at your operation, we've stood where you're standing.",
  // NAME-FREE variant by default (governance rule 2 — names need clearance).
  operatingRecord:
    "Experience built across white-glove moving, cold-chain direct-to-customer distribution, national middle-mile logistics, big-and-bulky retail final mile, and food-manufacturing warehousing.",
  secondaryCta: {
    label: "See the full operating record",
    href: COMING_SOON,
  } satisfies Cta,
} as const;

export interface LifecycleStage {
  readonly name: string;
  readonly blurb: string;
}

export const LIFECYCLE = {
  id: "lifecycle",
  headline: "We've run every stage of the operation — and we know how they connect.",
  body: "A decision in the warehouse shows up in the final mile. Middle-mile network design decides what distribution can promise. The plant's rhythm sets the tempo for everything downstream. We can see those connections because we've operated every stage of the chain, not just one — and that's what lets us find the problem you're feeling in one place that actually starts somewhere else.",
  stages: [
    {
      name: "Manufacturing",
      blurb:
        "Where the chain begins. Production rhythm and throughput set the constraints everything downstream inherits.",
    },
    {
      name: "Warehousing",
      blurb:
        "Throughput, labor, layout, and inventory flow — whether the rest of the chain has product to move, on time and intact.",
    },
    {
      name: "Middle Mile",
      blurb:
        "Network design and standardization at national scale: the connective tissue between the warehouse and distribution.",
    },
    {
      name: "Distribution",
      blurb:
        "Route density, service levels, and the unit economics of getting product out toward the customer.",
    },
    {
      name: "Final Mile",
      blurb:
        "Appointment and routing complexity, retailer expectations, and the reality of the last mile in retail.",
    },
    {
      name: "White Glove",
      blurb:
        "The final, most demanding touch, where the customer experience is the product.",
    },
  ] satisfies readonly LifecycleStage[],
  secondaryCta: {
    label: "See how each stage informs our work",
    href: COMING_SOON,
  } satisfies Cta,
} as const;

export interface Contrast {
  readonly them: string;
  readonly us: string;
}

export const WHY = {
  id: "why-hscs",
  headline: "Operators who consult — not consultants who understand operations.",
  body: "There's a real difference, and you've felt it. The big firms send bright people who have read about your operation but never run one — you get frameworks and a deck. The technology vendors sell you a tool and leave you to figure out what to do with it. HSCS is neither. We've carried the P&L, made the payroll, and stood on the dock at 4 a.m. when the freight didn't move. Then we put modern AI behind that judgment — so the analysis is faster and better supported than either the big firm or the software vendor can deliver.",
  contrasts: [
    {
      them: "The management consultancy studies your operation.",
      us: "We've run it.",
    },
    {
      them: "The technology vendor sells you the tool.",
      us: "We deliver the outcome.",
    },
    {
      them: "HSCS brings an operator's judgment, sharpened by AI.",
      us: "Operations lead. Technology supports.",
    },
  ] satisfies readonly Contrast[],
  secondaryCta: {
    label: "See how we work",
    href: "#method",
    onPage: true,
  } satisfies Cta,
} as const;

export interface ServiceItem {
  readonly name: string;
  readonly blurb: string;
  readonly startHere?: boolean;
}

export const SERVICES = {
  id: "services",
  headline: "Start where every engagement starts: an Operations Assessment.",
  body: "Before anything else, we tell you — with evidence — where your operation is losing money and what to fix first. That's the Operations Assessment, and it's the front door to everything we do. From there, engagements go as deep as the work requires: targeted improvement, a full transformation program, or an operator's judgment on call.",
  services: [
    {
      name: "Operations Assessment",
      blurb:
        "Start here. An evidence-backed diagnosis of where your operation stands and what to do first.",
      startHere: true,
    },
    {
      name: "Transportation & Fleet Optimization",
      blurb: "Routing, utilization, dispatch, and network design.",
    },
    {
      name: "Warehousing & Distribution Improvement",
      blurb: "Throughput, labor, layout, and inventory flow.",
    },
    {
      name: "Final-Mile & White-Glove Delivery",
      blurb: "High-touch delivery, service design, and damage control.",
    },
    {
      name: "Operational Turnaround & Margin Recovery",
      blurb: "Rapid diagnosis and a measured recovery plan.",
    },
    {
      name: "Operations Technology Advisory",
      blurb: "An operator's independent read on the software you're weighing.",
    },
  ] satisfies readonly ServiceItem[],
  secondaryCta: { label: "See all services", href: COMING_SOON } satisfies Cta,
} as const;

export const METHOD = {
  id: "method",
  headline: "Every recommendation is backed by evidence.",
  body: "We work in four stages — Assess, Analyze, Recommend, Transform — and we show our reasoning at every one. AI reads across your operation faster than any team could; the operator decides what it means. Every recommendation traces to a rating, a measurement, or a stated assumption, and we tell you which is which — fact, inference, or opinion. You'll always know exactly what you're relying on.",
  steps: ["Assess", "Analyze", "Recommend", "Transform"] as const,
  honestyGuarantee:
    "When we don't know something, we say so — and then we go measure it. We won't dress up an assumption as a fact or hand you a number we can't stand behind. That discipline is why our recommendations are safe to act on.",
  secondaryCta: {
    label: "See the assessment framework",
    href: COMING_SOON,
  } satisfies Cta,
} as const;

export interface Enhancement {
  readonly term: string;
  readonly blurb: string;
}

export const AI_CLARIFIER = {
  id: "ai",
  headline: "AI is not the product. Operational expertise is.",
  body: "Let's be clear about how we use AI, because most of our market isn't. AI doesn't run your engagement — an operator does. What AI does is make that operator sharper: reading more of your data, surfacing patterns a person would miss, pressure-testing every recommendation before it reaches you, and speeding up the analysis without cutting a corner. Technology exists to support the consulting. It never replaces it.",
  enhances: [
    { term: "Analyze", blurb: "reads more of your data, faster than a team." },
    {
      term: "Identify opportunities",
      blurb: "surfaces patterns across the operation a person would miss.",
    },
    {
      term: "Validate",
      blurb: "pressure-tests every recommendation against the evidence.",
    },
    { term: "Improve decisions", blurb: "gives you a sharper, better-supported call." },
  ] satisfies readonly Enhancement[],
} as const;

export interface Tool {
  readonly name: string;
  readonly role: string;
}

export const TOOLBOX = {
  id: "toolbox",
  headline: "The tools behind the judgment.",
  body: "An engagement draws on whatever tools make the analysis better — and only those. Operational assessments, fleet and dispatch analysis, transportation and network modeling, executive dashboards, government-logistics capability, and AI-supported operational intelligence all sit in the toolbox. None of them is a product we sell you. The engagement is what we deliver; these are how the work gets done.",
  // NB: tools carry NO href/CTA — they support consulting, never sold (Foundation §18).
  tools: [
    {
      name: "Operational Assessments",
      role: "the core diagnostic that anchors every engagement.",
    },
    {
      name: "FleetHuddle",
      role: "sharpens fleet-operations analysis within fleet engagements.",
    },
    {
      name: "DispatchAI",
      role: "supports dispatch analysis within transportation engagements.",
    },
    { name: "TransportationAI", role: "deepens routing and network analysis." },
    {
      name: "Executive Dashboards",
      role: "evidence-based visibility for your leadership during and after the work.",
    },
    {
      name: "Government Logistics",
      role: "capability that supports our government-logistics practice.",
    },
    {
      name: "AI-supported Operational Intelligence",
      role: "how we read, correlate, and validate across the chain.",
    },
  ] satisfies readonly Tool[],
  supportsTag: "Supports consulting",
} as const;

export const WHO_WE_HELP = {
  id: "who-we-help",
  headline: "Built for the people who run operations.",
  body: "If you own the number, feel the service failures, or carry the operation on your back, we built HSCS for you — CEOs and business owners, COOs and VPs of Operations, and the directors and managers who run transportation, fleets, warehouses, distribution, and plants. And if you operate in transportation, logistics, distribution, or manufacturing, we've operated your kind of business.",
  roles: [
    "CEOs & Business Owners",
    "COOs & VPs of Operations",
    "Directors of Operations",
    "Transportation Directors",
    "Fleet Managers",
    "Warehouse Managers",
    "Distribution Managers",
    "Plant Managers",
  ] as const,
  industries: [
    "Warehousing & Fulfillment",
    "Middle-Mile Logistics",
    "Direct-to-Customer / Cold-Chain",
    "Final-Mile Retail Delivery",
    "White-Glove & High-Touch Delivery",
  ] as const,
  secondaryCta: { label: "Explore your industry", href: COMING_SOON } satisfies Cta,
} as const;

export const WHAT_YOU_GET = {
  id: "what-you-get",
  headline: "You leave with an assessment you can act on.",
  body: "The Operations Assessment isn't a sales call — it's real work you keep. You get a clear, scored picture of where your operation stands, a prioritized list of what's costing you and what to fix first, and a recommended sequence to fix it — each finding backed by evidence, not opinion. It's decision-ready and short enough to read between shifts. No 200-page binder that ends up on a shelf.",
  items: [
    "A scored current-state of your operation, domain by domain.",
    "Prioritized, evidence-backed findings — ranked by impact.",
    "A recommended sequence of moves, with the success metrics we'd measure.",
    "An executive summary you keep and can put in front of your team.",
  ] as const,
  secondaryCta: {
    label: "See the assessment framework",
    href: COMING_SOON,
  } satisfies Cta,
} as const;

export const CLOSING = {
  id: "closing",
  headline: "Let's find where your operation is losing money.",
  body: "You know something in the operation is costing you. We'll tell you what — with evidence, from an operator who's run your kind of business, sharpened by AI. Start with an Operations Assessment. It's the first step, not a commitment to a program, and you'll walk away with something you can use whether we work together or not.",
  primaryCta: PRIMARY_CTA,
  microcopy: PRIMARY_CTA_MICROCOPY,
  secondaryCta: {
    label: "Not ready? Read our Insights",
    href: COMING_SOON,
  } satisfies Cta,
} as const;

/* ------------------------------------------------------------------------- *
 * S12 footer
 * ------------------------------------------------------------------------- */

export interface FooterColumn {
  readonly heading: string;
  readonly links: readonly NavItem[];
}

export const FOOTER = {
  ctaHeadline: "Ready when you are.",
  ctaSubline:
    "Thirty-five years of operational experience, enhanced by AI — put it to work on your operation.",
  primaryCta: PRIMARY_CTA,
  boilerplate:
    "Herman Supply Chain Solutions (HSCS) is a transportation & operations consulting firm built by a business owner and designed for operators. We are operators who consult — not consultants who understand operations. We combine thirty-five years of hands-on experience across the complete supply chain — manufacturing, warehousing, middle mile, distribution, final mile, and white glove — with AI that makes our analysis faster, deeper, and more defensible. Operations lead; technology supports. AI is not the product — operational expertise is.",
  newsletterPrompt: "Operator's-eye lessons from across the supply chain.",
  columns: [
    {
      heading: "Services",
      links: [
        { label: "Operations Assessment", href: ASSESSMENT_HREF, status: "ready" },
        { label: "Transportation & Fleet", href: "/services", status: "pending" },
        { label: "Warehousing & Distribution", href: "/services", status: "pending" },
        { label: "Final-Mile & White-Glove", href: "/services", status: "pending" },
        { label: "Government Logistics", href: "/services", status: "pending" },
      ],
    },
    {
      heading: "Industries",
      links: [
        { label: "Warehousing & Fulfillment", href: "/industries", status: "pending" },
        { label: "Middle-Mile Logistics", href: "/industries", status: "pending" },
        {
          label: "Direct-to-Customer / Cold-Chain",
          href: "/industries",
          status: "pending",
        },
        { label: "Final-Mile Retail Delivery", href: "/industries", status: "pending" },
        { label: "White-Glove & High-Touch", href: "/industries", status: "pending" },
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "Experience", href: "/experience", status: "pending" },
        { label: "Method", href: "/method", status: "pending" },
        { label: "About", href: "/about", status: "pending" },
        { label: "Contact", href: "/contact", status: "pending" },
      ],
    },
    {
      heading: "Resources",
      links: [
        { label: "Insights", href: "/insights", status: "pending" },
        { label: "Guides", href: "/guides", status: "pending" },
        { label: "Request an Assessment", href: ASSESSMENT_HREF, status: "ready" },
      ],
    },
  ] satisfies readonly FooterColumn[],
  legal: [
    { label: "Privacy Policy", href: "/privacy-policy", status: "pending" },
    { label: "Terms of Service", href: "/terms-of-service", status: "pending" },
    { label: "Accessibility", href: "/accessibility", status: "pending" },
  ] satisfies readonly NavItem[],
  copyright: "© Herman Supply Chain Solutions",
} as const;

/** In-page section ids in render order — asserted by the structure tests. */
export const SECTION_ORDER: readonly string[] = [
  HERO.id,
  CREDIBILITY.id,
  LIFECYCLE.id,
  WHY.id,
  SERVICES.id,
  METHOD.id,
  AI_CLARIFIER.id,
  TOOLBOX.id,
  WHO_WE_HELP.id,
  WHAT_YOU_GET.id,
  CLOSING.id,
];
