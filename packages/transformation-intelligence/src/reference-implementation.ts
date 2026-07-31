/**
 * REFERENCE BUSINESS TRANSFORMATION (Execution Phase 4).
 *
 * Validate the Software Factory by transforming Herman Legacy's own three
 * businesses — Herman Legacy Group, Venuewise, HSCS Consulting — as if each were
 * an external HL-BTI client. These become the first official Reference
 * Implementations of the Factory.
 *
 * ASSEMBLE, DON'T REBUILD. Every reference implementation is produced by the
 * EXISTING engines: the portfolio (`productCatalog`), Herman Legacy Marketing
 * (`campaignByKey`, `marketingCapabilityReuse`), the Customer Manufacturing
 * lifecycle, VisibilityAI evaluation, and the Factory registry. No new platform.
 *
 * HONESTY IS THE POINT (Principle 10). We do NOT have live scan data for these
 * real businesses, so external metrics (visibility, SEO, traffic, reviews,
 * authority, leads) are classified **UNKNOWN — requires a live VisibilityAI scan
 * (not run; gated)**. Only Factory-internal values are **MEASURED** (capability
 * reuse, transformation readiness, commercialization readiness). Expected outcomes
 * are labeled TARGETS, never measured results. No metric is fabricated.
 */

import { productCatalog, type ProductRecord } from "@hl-bos/catalog";
import { marketingCapabilityReuse } from "./marketing";
import { campaignByKey, type Campaign } from "./campaigns";

export type MetricStatus = "measured" | "estimated" | "unknown";

export interface Baseline {
  metric: string;
  status: MetricStatus;
  /** A real value only when `measured`/`estimated`; null when `unknown`. */
  value: string | number | null;
  source: string;
}

export interface OrgSpec {
  key: string;
  name: string;
  /** Products this org's transformation would assemble (portfolio keys). */
  portfolioProductKeys: string[];
  /** The marketing campaign already defined for this org (reused). */
  campaignKey: string;
  /** The assessment areas from the brief (per org). */
  assessmentAreas: string[];
}

export const REFERENCE_ORGS: OrgSpec[] = [
  {
    key: "herman_legacy",
    name: "Herman Legacy Group",
    portfolioProductKeys: ["hl_bti", "visibility_ai"],
    campaignKey: "herman_legacy",
    assessmentAreas: [
      "VisibilityAI Assessment",
      "Business Intelligence Assessment",
      "HL-BTI Assessment",
      "Marketing Assessment",
      "Customer Manufacturing Review",
      "Software Factory Assessment",
      "Operational Maturity",
      "Executive Dashboard",
      "Growth Opportunities",
      "Capability Reuse",
      "Commercialization Opportunities",
      "Risk Assessment",
      "Transformation Roadmap",
      "90-Day Action Plan",
      "Success Metrics",
    ],
  },
  {
    key: "venuewise",
    name: "Venuewise",
    portfolioProductKeys: ["sports_intelligence", "review_management"],
    campaignKey: "venuewise",
    assessmentAreas: [
      "Website",
      "SEO",
      "Digital Presence",
      "Customer Journey",
      "Registration",
      "Athlete Experience",
      "Coach Experience",
      "Family Experience",
      "Marketing",
      "Content",
      "Social Media",
      "Review Management",
      "Growth Opportunities",
      "Factory Capability Reuse",
      "Commercialization Opportunities",
      "Transformation Roadmap",
      "90-Day Plan",
    ],
  },
  {
    key: "hscs",
    name: "HSCS Consulting",
    portfolioProductKeys: ["government_intelligence", "transportation_ai"],
    campaignKey: "hscs",
    assessmentAreas: [
      "Website",
      "SEO",
      "Brand",
      "Consulting Funnel",
      "Lead Generation",
      "Authority",
      "Content",
      "Digital Presence",
      "Customer Journey",
      "Operational Efficiency",
      "Marketing",
      "Growth Opportunities",
      "Factory Capability Reuse",
      "Transformation Roadmap",
      "90-Day Plan",
    ],
  },
];

/** External metrics that CANNOT be known without a live scan — never fabricated. */
const UNKNOWN_METRICS = [
  "Visibility",
  "SEO",
  "Traffic",
  "Content Volume",
  "Leads",
  "Conversions",
  "Review Scores",
  "Authority",
  "Digital Presence",
];

export interface CaseStudy {
  currentState: string;
  transformationProcess: string[];
  recommendations: string[];
  executionPlan: string[];
  /** Explicitly TARGETS pending a real baseline — never measured results. */
  expectedOutcomes: string[];
}

export interface ReferenceImplementation {
  org: string;
  assessmentAreas: string[];
  products: Array<{ key: string; name: string; assemblyPct: number; maturity: string }>;
  baselines: Baseline[];
  measuredCount: number;
  estimatedCount: number;
  unknownCount: number;
  capabilityReuseReport: {
    transformationReadinessPct: number;
    marketingReadinessPct: number;
    factoryCapabilityReusePct: number;
  };
  commercializationOpportunities: string[];
  marketingStrategy: Campaign | null;
  growthOpportunities: string[];
  transformationRoadmap: string[];
  ninetyDayPlan: string[];
  successMetrics: string[];
  caseStudy: CaseStudy;
}

function orgProducts(spec: OrgSpec, catalog: ProductRecord[]): ProductRecord[] {
  return spec.portfolioProductKeys
    .map((k) => catalog.find((p) => p.key === k))
    .filter((p): p is ProductRecord => p !== undefined);
}

/** Build one organization's reference implementation (a transformation blueprint). */
export function referenceImplementation(
  orgKey: string,
): ReferenceImplementation | undefined {
  const spec = REFERENCE_ORGS.find((o) => o.key === orgKey);
  if (!spec) return undefined;

  const catalog = productCatalog();
  const products = orgProducts(spec, catalog);
  const marketing = marketingCapabilityReuse();

  const transformationReadinessPct =
    products.length === 0
      ? 0
      : Math.round(products.reduce((s, p) => s + p.assemblyPct, 0) / products.length);
  const layers = [
    ...new Set(products.flatMap((p) => p.commercializationLayers)),
  ].sort();

  // --- Baselines: MEASURED (Factory-internal) vs UNKNOWN (needs a live scan) ---
  const baselines: Baseline[] = [
    {
      metric: "Factory Transformation Readiness",
      status: "measured",
      value: `${transformationReadinessPct}%`,
      source: "portfolio assembly % of this org's products (computed)",
    },
    {
      metric: "Capability Reuse",
      status: "measured",
      value: `${marketing.reusePct}%`,
      source: "marketing capability reuse assessment (computed)",
    },
    {
      metric: "Commercialization Readiness",
      status: "measured",
      value: `${layers.length} layers (${layers.join(", ") || "none"})`,
      source: "commercialization layers of this org's products (computed)",
    },
    {
      metric: "Marketing Readiness",
      status: "estimated",
      value: `${marketing.reusePct}% platform reuse`,
      source: "platform-level marketing reuse used as a proxy (derived)",
    },
    {
      metric: "Transformation Readiness (business)",
      status: "unknown",
      value: null,
      source: "requires a live HL-BTI assessment (not run)",
    },
    ...UNKNOWN_METRICS.map((m): Baseline => ({
      metric: m,
      status: "unknown",
      value: null,
      source: "requires a live VisibilityAI scan (not run; edge runtime gated)",
    })),
  ];

  const growthOpportunities = [
    ...new Set(products.flatMap((p) => p.futureOpportunities)),
  ];

  const transformationRoadmap = [
    "1. Run the live VisibilityAI scan to replace UNKNOWN baselines with measured values (gated).",
    "2. Run the HL-BTI assessment to score the business and generate the executive blueprint.",
    `3. Assemble the recommended products (${products.map((p) => p.name).join(", ") || "n/a"}) — ${transformationReadinessPct}% already assemblable.`,
    "4. Launch the marketing campaign already defined for this org (draft) once approved.",
    "5. Onboard through the Customer Manufacturing lifecycle; track via the Intelligence CRM.",
    "6. Measure growth on the Growth Dashboard; iterate at the quarterly review.",
  ];

  const ninetyDayPlan = [
    "Days 1–30: live VisibilityAI scan + HL-BTI assessment → real baselines and blueprint (gated).",
    "Days 31–60: assemble/finish the recommended products; approve the marketing campaign.",
    "Days 61–90: launch campaign, onboard, and begin measuring real growth on the dashboard.",
  ];

  return {
    org: spec.name,
    assessmentAreas: spec.assessmentAreas,
    products: products.map((p) => ({
      key: p.key,
      name: p.name,
      assemblyPct: p.assemblyPct,
      maturity: p.maturity,
    })),
    baselines,
    measuredCount: baselines.filter((b) => b.status === "measured").length,
    estimatedCount: baselines.filter((b) => b.status === "estimated").length,
    unknownCount: baselines.filter((b) => b.status === "unknown").length,
    capabilityReuseReport: {
      transformationReadinessPct,
      marketingReadinessPct: marketing.reusePct,
      factoryCapabilityReusePct: marketing.reusePct,
    },
    commercializationOpportunities: layers.map(
      (l) => `${l}: ${products.map((p) => p.name).join(", ")}`,
    ),
    marketingStrategy: campaignByKey(spec.campaignKey) ?? null,
    growthOpportunities,
    transformationRoadmap,
    ninetyDayPlan,
    successMetrics: [
      "Real visibility/SEO scores captured (replacing UNKNOWN) after the live scan.",
      "Qualified opportunities generated by the marketing campaign.",
      "Products assembled and launched via the Factory.",
      "Measured growth (traffic, leads, customers) on the Growth Dashboard.",
    ],
    caseStudy: {
      currentState:
        `${spec.name}: external metrics (visibility, SEO, traffic, reviews, authority) are ` +
        `UNKNOWN pending a live scan — not fabricated. Factory-internal readiness IS measured: ` +
        `${transformationReadinessPct}% of the recommended software transformation is already ` +
        `assemblable, at ${marketing.reusePct}% capability reuse.`,
      transformationProcess: [
        "VisibilityAI assessment (gated live scan)",
        "HL-BTI business assessment + executive blueprint",
        "Factory assembly of recommended products",
        "Herman Legacy Marketing campaign",
        "Customer Manufacturing onboarding + CRM",
        "Growth measurement + quarterly review",
      ],
      recommendations: [
        `Assemble ${products.map((p) => p.name).join(", ") || "the recommended products"} from existing capability.`,
        "Run the gated live scan to establish real external baselines.",
        "Approve and launch the pre-defined marketing campaign.",
      ],
      executionPlan: ninetyDayPlan,
      expectedOutcomes: [
        "TARGET (not measured): established visibility/SEO baselines after the scan.",
        "TARGET (not measured): a qualified-opportunity pipeline from the campaign.",
        "TARGET (not measured): products launched with measured growth.",
      ],
    },
  };
}

export interface ReferenceLibrary {
  implementations: ReferenceImplementation[];
  orgCount: number;
  /** Total baselines classified across all three, by status. */
  totals: { measured: number; estimated: number; unknown: number };
  /** No baseline is fabricated: every non-unknown has a computed/derived source. */
  noFabricatedMetrics: boolean;
}

/** The Herman Legacy Reference Implementation Library (final deliverable). */
export function referenceLibrary(): ReferenceLibrary {
  const implementations = REFERENCE_ORGS.map((o) =>
    referenceImplementation(o.key),
  ).filter((r): r is ReferenceImplementation => r !== undefined);
  const totals = implementations.reduce(
    (acc, r) => ({
      measured: acc.measured + r.measuredCount,
      estimated: acc.estimated + r.estimatedCount,
      unknown: acc.unknown + r.unknownCount,
    }),
    { measured: 0, estimated: 0, unknown: 0 },
  );
  // Every measured/estimated baseline cites a computed/derived source; every
  // unknown has a null value. That is the definition of "no fabricated metrics".
  const noFabricatedMetrics = implementations.every((r) =>
    r.baselines.every(
      (b) =>
        (b.status === "unknown" && b.value === null) ||
        (b.status !== "unknown" && b.value !== null && b.source.length > 0),
    ),
  );
  return {
    implementations,
    orgCount: implementations.length,
    totals,
    noFabricatedMetrics,
  };
}
