/**
 * Read-only data layer for the Business Transformation Intelligence section.
 *
 * Pure functions over @hl-bos/transformation-intelligence. NO filesystem scan,
 * NO shell, NO git, NO database writes. The engine is real; the INPUT is a
 * clearly-labelled illustrative sample (`sample: true`), never a real customer.
 * This honours Principle 10 — we demonstrate the engine on a labelled sample
 * rather than fabricating a customer interaction.
 *
 * When live assessments are connected (a later, approval-gated step) this module
 * is where a read-only `public.bti_*` RPC read would replace the sample input.
 */

import type { consulting } from "@hl-bos/bti-engine";
import {
  runTransformationIntelligence,
  assessGovOpportunity,
  ourCapabilities,
  DEFAULT_CONFIG,
  customerManufacturingSystem,
  type GovOpportunity,
  type TransformationIntelligenceResult,
  type GovAssessment,
} from "@hl-bos/transformation-intelligence";

/**
 * The CEO Operations Dashboard — the assembled Customer Manufacturing System
 * (Execution Phase 3). Pure composition of existing engines; the operational
 * metrics are honestly zero until live customers exist.
 */
export function customerOperations() {
  return customerManufacturingSystem();
}

/** An explicitly illustrative assessment — NOT a real customer. */
const SAMPLE_ASSESSMENT: consulting.AssessmentInput = {
  businessName: "Sample Business (illustrative)",
  industryPack: "general",
  mode: "full_transformation",
  sample: true,
  ratings: [
    { domain: "growth", dimension: "website", rating: 1 },
    { domain: "growth", dimension: "seo", rating: 2 },
    { domain: "growth", dimension: "reviews", rating: 2 },
    { domain: "growth", dimension: "conversion", rating: 2 },
    { domain: "growth", dimension: "google_business_profile", rating: 2 },
    { domain: "operations", dimension: "automation", rating: 1 },
    { domain: "operations", dimension: "operations", rating: 2 },
    { domain: "business", dimension: "customer_experience", rating: 2 },
    { domain: "ai_readiness", dimension: "automation_opportunities", rating: 1 },
    { domain: "financial", dimension: "revenue_growth", rating: 3 },
  ],
  financial: {
    monthlyRevenue: 50000,
    monthlyOperatingCost: 38000,
    laborHoursPerMonth: 200,
    laborCostPerHour: 30,
  },
};

/** Illustrative government opportunities — NOT real solicitations. */
const SAMPLE_GOV_OPPORTUNITIES: GovOpportunity[] = [
  {
    id: "SAMPLE-RFP-001",
    title: "Regional transit scheduling & communications (illustrative)",
    agency: "Sample Regional Authority",
    naics: "485111",
    value: 1_200_000,
    dueInDays: 21,
    requiredCapabilities: ["Scheduling", "Communications", "Route Assessment"],
  },
  {
    id: "SAMPLE-RFP-002",
    title: "Clinical records modernization (illustrative)",
    agency: "Sample Health District",
    naics: "621111",
    value: 3_500_000,
    dueInDays: 10,
    requiredCapabilities: [
      "Scheduling",
      "Electronic Health Records",
      "Claims Processing",
      "Communications",
    ],
  },
];

export function sampleIntelligence(): TransformationIntelligenceResult {
  return runTransformationIntelligence(SAMPLE_ASSESSMENT);
}

export function sampleGovAssessments(): GovAssessment[] {
  const caps = ourCapabilities();
  return SAMPLE_GOV_OPPORTUNITIES.map((o) =>
    assessGovOpportunity(o, DEFAULT_CONFIG, caps),
  );
}

export function ourCapabilityList(): { key: string; name: string }[] {
  return ourCapabilities();
}
