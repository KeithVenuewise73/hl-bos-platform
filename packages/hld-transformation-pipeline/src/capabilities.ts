/**
 * Herman Legacy Digital Capability Library — the execution mechanisms.
 *
 * This index is consulted AFTER the analysis, never during it: BTI recommends a
 * business outcome; the pipeline then asks "which HLD capability executes it".
 * Capabilities never influence the recommendation — the firewall from the BTI
 * constitution holds.
 */

import type { Capability, CapabilityId } from "./types.ts";

export const CAPABILITIES: Record<CapabilityId, Capability> = {
  consulting_strategy: {
    id: "consulting_strategy",
    name: "Consulting & Strategy",
    executes: "Offer design, positioning, packaging, focus decisions",
  },
  market_validation: {
    id: "market_validation",
    name: "Market Validation",
    executes: "Customer discovery, design-partner sales, willingness-to-pay tests",
  },
  sales_enablement: {
    id: "sales_enablement",
    name: "Sales Enablement",
    executes: "A repeatable interest→signed motion and its collateral",
  },
  onboarding_ops: {
    id: "onboarding_ops",
    name: "Onboarding Operations",
    executes: "Turning bespoke setup into a repeatable onboarding process",
  },
  crm: { id: "crm", name: "CRM", executes: "Pipeline, lead and customer records" },
  automation: {
    id: "automation",
    name: "Automation",
    executes: "Follow-up, reminders and internal workflows without labor",
  },
  marketing: {
    id: "marketing",
    name: "Marketing",
    executes: "Demand generation and content for a repeatable channel",
  },
  analytics_measurement: {
    id: "analytics_measurement",
    name: "Analytics & Measurement",
    executes: "Baselines and outcome data — the truth layer",
  },
  pricing_finance: {
    id: "pricing_finance",
    name: "Pricing & Finance",
    executes: "Pricing model, margin and cash-flow mechanics",
  },
};

/**
 * Candidate capabilities per transformation OUTCOME. The first is the primary
 * executor. A transformation maps to several possible means; the choice is made
 * on fit, never fed back into the recommendation.
 */
const OUTCOME_CAPABILITIES: {
  readonly match: RegExp;
  readonly caps: readonly CapabilityId[];
}[] = [
  {
    match: /package|focused commercial offer|one offer/i,
    caps: ["consulting_strategy", "pricing_finance", "marketing"],
  },
  {
    match: /design partner|product-market fit|validate/i,
    caps: ["market_validation", "sales_enablement", "onboarding_ops"],
  },
  {
    match: /acquisition|repeatable.*channel|first-customer acquisition/i,
    caps: ["marketing", "sales_enablement", "crm"],
  },
  { match: /sales motion|interest to signed/i, caps: ["sales_enablement", "crm"] },
  { match: /onboarding|repeatable process/i, caps: ["onboarding_ops", "automation"] },
  {
    match: /recurring-revenue|commercialization model/i,
    caps: ["pricing_finance", "sales_enablement", "automation"],
  },
  { match: /retention|renewal/i, caps: ["automation", "crm", "onboarding_ops"] },
  { match: /pricing|margin/i, caps: ["pricing_finance"] },
  { match: /customer|buying trigger/i, caps: ["market_validation", "crm"] },
];

/** The primary capability that would execute a given outcome/task title. */
export function capabilityForOutcome(text: string): CapabilityId {
  for (const rule of OUTCOME_CAPABILITIES)
    if (rule.match.test(text)) return rule.caps[0]!;
  // Evidence-gathering and framing default to consulting.
  return "consulting_strategy";
}

/** All candidate capabilities for an outcome (primary first). */
export function capabilitiesForOutcome(text: string): CapabilityId[] {
  for (const rule of OUTCOME_CAPABILITIES)
    if (rule.match.test(text)) return [...rule.caps];
  return ["consulting_strategy"];
}
