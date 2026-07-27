// Safe, local fixtures for the Business Transformation Blueprint engine tests.
// No network, no real AI: plain data + a mock `analyze` adapter.

import type {
  CatalogEntry,
  DimensionScore,
  Evidence,
  Rule,
} from "../../_shared/blueprint/rules.ts";
import type { Phase } from "../../_shared/blueprint/roadmap.ts";

// Evidence for a small business with an insecure, low-content website.
export const EVIDENCE: Evidence[] = [
  { id: 101, key: "https", value: { present: false }, confidence: 1 },
  { id: 102, key: "title", value: { text: "Bob Plumbing" }, confidence: 1 },
  { id: 103, key: "meta_description", value: { present: false }, confidence: 1 },
  {
    id: 104,
    key: "contact_signals",
    value: { tel: false, mailto: false },
    confidence: 1,
  },
  { id: 105, key: "analytics_tags", value: { tags: [] }, confidence: 1 },
];

export const SCORES: DimensionScore[] = [
  { framework: "maturity", key: "digital_presence", score: 2 },
  { framework: "maturity", key: "security", score: 1 },
  { framework: "maturity", key: "communications", score: 2 },
  { framework: "health", key: "revenue_readiness", score: 3 },
];

export const RULES: Rule[] = [
  {
    key: "rule_no_https",
    name: "Insecure website",
    kind: "service",
    conditions: { evidence: { https: { present: false } } },
    output: {
      service_key: "website_modernization",
      title: "Secure the website with HTTPS",
      severity: "critical",
      priority_band: "critical",
      effort_band: "s",
      cost_band: "low",
      affected_dimensions: ["security", "digital_presence"],
      dedupe_group: "secure_site",
    },
    confidence: 1.0,
  },
  {
    key: "rule_weak_seo",
    name: "Weak search readiness",
    kind: "service",
    conditions: { evidence: { meta_description: { present: false } } },
    output: {
      service_key: "search_visibility",
      title: "Improve search visibility",
      severity: "medium",
      effort_band: "m",
      cost_band: "medium",
      affected_dimensions: ["marketing", "digital_presence"],
    },
    confidence: 0.85,
  },
  {
    key: "rule_no_contact",
    name: "No contact path",
    kind: "service",
    conditions: { evidence: { contact_signals: { tel: false, mailto: false } } },
    output: {
      service_key: "missed_call_recovery",
      title: "Add reliable contact + missed-call recovery",
      severity: "high",
      effort_band: "s",
      cost_band: "low",
      affected_dimensions: ["communications", "customer_experience"],
    },
    confidence: 0.9,
  },
  {
    key: "rule_no_analytics",
    name: "No analytics",
    kind: "hl_bos_module",
    conditions: { evidence: { analytics_tags: { empty: true } } },
    output: {
      module_key: "analytics",
      title: "Enable analytics + dashboards",
      severity: "medium",
      affected_dimensions: ["analytics"],
    },
    confidence: 0.8,
  },
  {
    key: "rule_low_security_dim",
    name: "Low security maturity",
    kind: "service",
    conditions: { dimension: { framework: "maturity", key: "security", lte: 2 } },
    output: {
      service_key: "hosting_support",
      title: "Harden security and hosting",
      severity: "high",
      affected_dimensions: ["security"],
      dedupe_group: "secure_site", // intentionally same group as rule_no_https (dedupe)
    },
    confidence: 0.7,
  },
];

export const PHASES: Phase[] = [
  {
    key: "immediate_stabilization",
    name: "Immediate Stabilization",
    defaultSequence: 1,
  },
  { key: "digital_foundation", name: "Digital Foundation", defaultSequence: 2 },
  { key: "customer_acquisition", name: "Customer Acquisition", defaultSequence: 3 },
  { key: "customer_experience", name: "Customer Experience", defaultSequence: 4 },
  {
    key: "analytics_optimization",
    name: "Analytics and Optimization",
    defaultSequence: 7,
  },
];

export const CATALOGS: { services: CatalogEntry[]; modules: CatalogEntry[] } = {
  services: [
    { key: "website_modernization", availability: "available" },
    { key: "search_visibility", availability: "available" },
    { key: "missed_call_recovery", availability: "coming_soon" },
    { key: "hosting_support", availability: "available" },
    { key: "payments", availability: "unavailable" }, // must be excluded if recommended
  ],
  modules: [{ key: "analytics", availability: "coming_soon" }],
};

/** A deterministic mock AI that cites a real evidence id. */
export function mockAnalyzeGood(_req: unknown): Promise<unknown> {
  return Promise.resolve({
    executive_summary:
      "Bob Plumbing has a basic web presence with security and contact gaps.",
    findings: [{ label: "No HTTPS", evidenceRef: 101, confidence: 0.9 }],
  });
}

/** A mock AI that fabricates a finding with no supporting evidence. */
export function mockAnalyzeUnsupported(_req: unknown): Promise<unknown> {
  return Promise.resolve({
    executive_summary: "Looks fine.",
    findings: [{ label: "Invented problem", evidenceRef: 999999, confidence: 0.9 }],
  });
}

/** A mock AI that makes a guaranteed-outcome claim (must be rejected). */
export function mockAnalyzeGuarantee(_req: unknown): Promise<unknown> {
  return Promise.resolve({
    executive_summary: "This plan is guaranteed to triple your revenue.",
    findings: [],
  });
}

/** A mock AI that fails (provider error, with a secret to prove redaction). */
export function mockAnalyzeFail(_req: unknown): Promise<unknown> {
  return Promise.reject(new Error("provider_unavailable sk-ant-deadbeefcafe1234beef"));
}
