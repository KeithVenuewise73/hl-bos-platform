// Website scoring rubric — maps deterministic findings to Digital-Maturity
// dimension contributions (0–5) with severity, confidence, and the evidence
// keys that justify each score. Traceable and versioned; the composite is still
// computed data-driven in the DB (discovery.score_dimension → profile_scores).
// A dimension score is only produced when supporting evidence exists.

import type { WebsiteFindings } from "./extract.ts";

export const RUBRIC_VERSION = "rubric-0.1.0";

export interface DimensionScore {
  framework: "maturity" | "health";
  dimension: string;
  score: number; // 0–5
  severity: "critical" | "high" | "medium" | "info";
  confidence: number; // 0–1
  evidenceKeys: string[];
}

export interface DerivedFinding {
  key: string;
  value: Record<string, unknown>;
  category: string;
  severity: "critical" | "high" | "medium" | "info";
  confidence: number;
  detection: "deterministic";
}

const clamp = (n: number) => Math.max(0, Math.min(5, n));
const sev = (s: number): DimensionScore["severity"] =>
  s <= 1 ? "critical" : s <= 2 ? "high" : s <= 3 ? "medium" : "info";

export function scoreFromFindings(f: WebsiteFindings): {
  rubricVersion: string;
  dimensions: DimensionScore[];
  findings: DerivedFinding[];
} {
  const social = Object.keys(f.socialLinks).length;
  const dims: Array<[string, number, string[]]> = [
    [
      "security",
      clamp(
        (f.https ? 2 : 0) +
          Math.min(f.securityHeaders.length, 3) -
          (f.mixedContent ? 1 : 0),
      ),
      ["https", "security_headers", "mixed_content"],
    ],
    [
      "digital_presence",
      clamp(
        (f.title ? 2 : 0) +
          (f.metaDescription ? 1 : 0) +
          (f.canonical ? 1 : 0) +
          (f.hasViewport ? 1 : 0),
      ),
      ["title", "meta_description", "canonical", "viewport"],
    ],
    [
      "customer_experience",
      clamp(
        (f.hasViewport ? 2 : 0) +
          (f.forms > 0 ? 1 : 0) +
          (f.contactSignals.tel || f.contactSignals.mailto ? 1 : 0) +
          (f.h1.length === 1 ? 1 : 0),
      ),
      ["viewport", "forms", "contact_signals", "h1_count"],
    ],
    [
      "marketing",
      clamp(
        (f.analyticsTags.length ? 2 : 0) +
          (f.openGraph.length ? 1 : 0) +
          (social ? 2 : 0),
      ),
      ["analytics_tags", "open_graph", "social_links"],
    ],
    ["analytics", clamp(f.analyticsTags.length ? 4 : 1), ["analytics_tags"]],
    [
      "communications",
      clamp(
        (f.contactSignals.tel ? 2 : 0) +
          (f.contactSignals.mailto ? 1 : 0) +
          (f.forms > 0 ? 2 : 0),
      ),
      ["contact_signals", "forms"],
    ],
    [
      "growth_readiness",
      clamp(
        (f.structuredDataTypes.length ? 2 : 0) +
          (social ? 1 : 0) +
          (f.canonical ? 1 : 0) +
          (f.metaDescription ? 1 : 0),
      ),
      ["structured_data", "social_links", "canonical", "meta_description"],
    ],
  ];
  const dimensions: DimensionScore[] = dims.map(([dimension, score, evidenceKeys]) => ({
    framework: "maturity",
    dimension,
    score,
    severity: sev(score),
    confidence: 0.9,
    evidenceKeys,
  }));

  // Deterministic raw findings (become discovery.evidence rows).
  const findings: DerivedFinding[] = [
    {
      key: "https",
      value: { present: f.https },
      category: "security",
      severity: f.https ? "info" : "critical",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "mixed_content",
      value: { present: f.mixedContent },
      category: "security",
      severity: f.mixedContent ? "high" : "info",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "security_headers",
      value: { present: f.securityHeaders },
      category: "security",
      severity: f.securityHeaders.length ? "info" : "medium",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "title",
      value: { text: f.title },
      category: "search_visibility",
      severity: f.title ? "info" : "high",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "meta_description",
      value: { present: !!f.metaDescription },
      category: "search_visibility",
      severity: f.metaDescription ? "info" : "medium",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "canonical",
      value: { present: !!f.canonical },
      category: "search_visibility",
      severity: "info",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "h1_count",
      value: { count: f.h1.length },
      category: "search_visibility",
      severity: f.h1.length === 1 ? "info" : "medium",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "viewport",
      value: { present: f.hasViewport },
      category: "mobile",
      severity: f.hasViewport ? "info" : "high",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "images_missing_alt",
      value: { count: f.imagesMissingAlt, total: f.imageCount },
      category: "accessibility",
      severity: f.imagesMissingAlt ? "medium" : "info",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "lang",
      value: { lang: f.lang },
      category: "accessibility",
      severity: f.lang ? "info" : "medium",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "forms",
      value: { count: f.forms },
      category: "conversion",
      severity: f.forms ? "info" : "medium",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "contact_signals",
      value: f.contactSignals,
      category: "conversion",
      severity: f.contactSignals.tel || f.contactSignals.mailto ? "info" : "medium",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "social_links",
      value: f.socialLinks,
      category: "local_presence",
      severity: "info",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "analytics_tags",
      value: { tags: f.analyticsTags },
      category: "analytics",
      severity: f.analyticsTags.length ? "info" : "medium",
      confidence: 1,
      detection: "deterministic",
    },
    {
      key: "structured_data",
      value: { types: f.structuredDataTypes },
      category: "search_visibility",
      severity: f.structuredDataTypes.length ? "info" : "medium",
      confidence: 1,
      detection: "deterministic",
    },
  ];

  return { rubricVersion: RUBRIC_VERSION, dimensions, findings };
}
