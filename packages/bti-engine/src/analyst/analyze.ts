// The HL-BTI Business Analyst — implemented as ORCHESTRATION of existing
// capabilities, NOT a new AI engine (per EO-001).
//
// Why orchestration, not a new engine: the objective — turn a website into
// evidence-backed findings, Herman Legacy recommendations, a blueprint, and a
// proposal — is fully achieved by chaining what already exists:
//   website extractor (analyzeHtml, a mirror of the CP5 scanner)
//     → a deterministic evidence rubric (signals → evidence facts + derived
//       dimension ratings; NO consultant scoring)
//     → the existing Consulting Intelligence Framework (generateConsultingReport)
//     → the existing blueprint/narrative + a proposal derived from its solutions.
// No LLM is required for a deterministic, honest, demonstrable analysis (and none
// is live in this environment). A live AI narrative can layer on later via the
// existing `ai` gateway; it is not needed for the working product.

import { analyzeHtml, type SiteEvidence } from "./extract.ts";
import { mergeEvidence } from "./merge.ts";
import { hlServiceLabel } from "./services.ts";
import {
  generateConsultingReport,
  FINDING_THRESHOLD,
  severityOf,
  confidenceOf,
} from "../consulting/index.ts";
import type {
  AssessmentInput,
  DimensionInput,
  EvidenceInput,
  ConsultingReport,
  Finding,
  Confidence,
} from "../consulting/index.ts";
import { DOMAINS } from "../catalog.ts";
import type { DomainKey } from "../types.ts";

function dimensionLabel(domain: DomainKey, dimension: string): string {
  const d = DOMAINS.find((x) => x.key === domain);
  return d?.dimensions.find((x) => x.key === dimension)?.name ?? dimension;
}

export interface BusinessInput {
  name: string;
  website: string;
  industry: string; // an industry-pack key, e.g. "transportation"
  location?: string;
  html: string; // the fetched or pasted homepage HTML (real evidence)
  financial?: AssessmentInput["financial"];
}

export interface ProfileObservation {
  label: string;
  detail: string;
  evidence: string;
}

export interface ProposalLine {
  service: string;
  supportedBy: string[];
  type: "one_time" | "recurring";
}

// A single dimension's standing — one row of the visible scorecard. Every field
// is derived from the same real, website-observed rating the findings use, so the
// overall score is auditable dimension by dimension. No new scoring: this simply
// surfaces what analyzeBusiness already computes.
export interface ScorecardEntry {
  domain: DomainKey;
  dimension: string;
  label: string;
  rating: number; // 0-5, from real site signals
  score: number; // rating * 20, on a 0-100 scale
  benchmark: number; // the target the engine holds every dimension to (0-100)
  isStrength: boolean; // rating above the finding threshold
  status: "strength" | "below_benchmark" | "critical";
  confidence: Confidence; // engine confidence in the rating
  interpretation: string; // the real evidence signal behind the rating
}

export interface BusinessAnalysis {
  business: { name: string; website: string; industry: string; location?: string };
  evidence: SiteEvidence;
  pagesAnalyzed: number; // how many pages of the site the evidence was drawn from
  profile: ProfileObservation[]; // the Business Intelligence Profile (understanding, not scores)
  scorecard: ScorecardEntry[]; // every analyzed dimension, scored against benchmark
  report: ConsultingReport; // findings, roadmap, solutions, narrative, review
  proposal: { lines: ProposalLine[]; recommendedServices: string[] };
  coverageNote: string; // honest statement of what evidence could NOT observe
}

// Input for a multi-page analysis: the pages already fetched from the site.
export interface BusinessPagesInput {
  name: string;
  website: string;
  industry: string;
  location?: string;
  financial?: AssessmentInput["financial"];
  pages: { url: string; html: string }[];
}

// A rubric row: an observed weakness signal → a dimension rating + an evidence fact.
interface Rule {
  domain: DomainKey;
  dimension: string;
  when: (e: SiteEvidence) => boolean; // signal present (a weakness)
  rating: (e: SiteEvidence) => number; // 0-3 when weak (a finding); >3 when fine
  fact: (e: SiteEvidence) => string; // the evidence fact, from real signals
}

const RULES: Rule[] = [
  {
    domain: "technology",
    dimension: "security",
    when: (e) => !e.https,
    rating: (e) => (e.https ? 5 : 1),
    fact: (e) =>
      e.https
        ? "Site served over HTTPS."
        : "Site URL is not HTTPS — no transport encryption observed.",
  },
  {
    domain: "growth",
    dimension: "seo",
    when: (e) =>
      !e.metaDescription || e.metaDescriptionLength < 50 || (e.title?.length ?? 0) < 10,
    rating: (e) =>
      e.metaDescription && e.metaDescriptionLength >= 50 && (e.title?.length ?? 0) >= 10
        ? 4
        : 2,
    fact: (e) =>
      `SEO basics: title ${e.title ? `"${e.title.slice(0, 40)}" (${e.titleLength} chars)` : "MISSING"}, meta description ${
        e.metaDescription ? `${e.metaDescriptionLength} chars` : "MISSING"
      }.`,
  },
  {
    domain: "growth",
    dimension: "ai_search_optimization",
    when: (e) => e.structuredDataTypes.length === 0,
    rating: (e) => (e.structuredDataTypes.length > 0 ? 4 : 1),
    fact: (e) =>
      e.structuredDataTypes.length
        ? `Structured data present: ${e.structuredDataTypes.join(", ")}.`
        : "No schema.org structured data found — AI answer engines have little to cite.",
  },
  {
    domain: "growth",
    dimension: "google_business_profile",
    when: (e) => !e.hasTel && !e.hasAddressSignal,
    rating: (e) => (e.hasTel || e.hasAddressSignal ? 4 : 2),
    fact: (e) =>
      e.hasTel || e.hasAddressSignal
        ? "Contact/local signals present (phone or address)."
        : "No phone or address signal on the page — weak local/GBP footprint.",
  },
  {
    domain: "growth",
    dimension: "social_media",
    when: (e) => e.socialLinks.length < 2,
    rating: (e) => (e.socialLinks.length >= 2 ? 4 : 2),
    fact: (e) =>
      e.socialLinks.length
        ? `Social links found: ${e.socialLinks.join(", ")}.`
        : "No social profile links found on the page.",
  },
  {
    domain: "growth",
    dimension: "content",
    when: (e) => e.wordCount < 300 || e.headingCount < 3,
    rating: (e) => (e.wordCount >= 300 && e.headingCount >= 3 ? 4 : 2),
    fact: (e) => `Content depth: ~${e.wordCount} words, ${e.headingCount} headings.`,
  },
  {
    domain: "growth",
    dimension: "conversion",
    when: (e) => e.forms === 0,
    rating: (e) => (e.forms > 0 ? 4 : 2),
    fact: (e) =>
      e.forms > 0
        ? `${e.forms} form(s) present for capture.`
        : "No form found — no on-page lead capture.",
  },
  {
    domain: "growth",
    dimension: "lead_generation",
    when: (e) => e.forms === 0 && !e.hasMailto,
    rating: (e) => (e.forms > 0 || e.hasMailto ? 4 : 2),
    fact: (e) =>
      e.forms > 0 || e.hasMailto
        ? "A contact path exists (form or email)."
        : "No form and no email link — hard to generate leads.",
  },
  {
    domain: "growth",
    dimension: "website",
    when: (e) => !e.hasViewport || e.imagesMissingAlt > 0,
    rating: (e) => (e.hasViewport && e.imagesMissingAlt === 0 ? 4 : 3),
    fact: (e) =>
      `Site quality: ${e.hasViewport ? "mobile viewport set" : "NO mobile viewport"}, ${e.imagesMissingAlt}/${e.imageCount} images missing alt text.`,
  },
  {
    domain: "growth",
    dimension: "technology_stack",
    when: (e) => e.analyticsTags.length === 0,
    rating: (e) => (e.analyticsTags.length > 0 ? 4 : 2),
    fact: (e) =>
      e.analyticsTags.length
        ? `Analytics detected: ${e.analyticsTags.join(", ")}.`
        : "No analytics/measurement tag detected — decisions run blind.",
  },
];

function buildProfile(e: SiteEvidence, biz: BusinessInput): ProfileObservation[] {
  const obs: ProfileObservation[] = [];
  obs.push({
    label: "Digital presence",
    detail: e.https
      ? "Runs a secure (HTTPS) website."
      : "Website is not secured with HTTPS.",
    evidence: `URL: ${e.url}`,
  });
  obs.push({
    label: "Discoverability",
    detail:
      e.metaDescription && e.structuredDataTypes.length
        ? "Has basic SEO metadata and structured data."
        : "Weak search discoverability — missing metadata and/or structured data.",
    evidence: `title ${e.titleLength} chars, meta ${e.metaDescriptionLength} chars, schema: ${e.structuredDataTypes.join(", ") || "none"}`,
  });
  obs.push({
    label: "Customer engagement",
    detail:
      e.forms || e.hasTel || e.hasMailto
        ? "Provides a way for customers to make contact."
        : "No clear contact or capture path for customers.",
    evidence: `forms: ${e.forms}, tel: ${e.hasTel}, email: ${e.hasMailto}`,
  });
  obs.push({
    label: "Marketing footprint",
    detail:
      e.socialLinks.length >= 2
        ? `Active across ${e.socialLinks.length} social channels.`
        : "Thin social presence.",
    evidence: `social: ${e.socialLinks.join(", ") || "none"}; analytics: ${e.analyticsTags.join(", ") || "none"}`,
  });
  obs.push({
    label: "Industry",
    detail: `${biz.industry}${biz.location ? ` · ${biz.location}` : ""}`,
    evidence: "Provided by consultant at intake.",
  });
  return obs;
}

// Single-page analysis (the homepage). Kept for callers that already have one
// page of HTML; internally it delegates to the shared evidence-driven core.
export function analyzeBusiness(input: BusinessInput): BusinessAnalysis {
  const evidence = analyzeHtml(input.html, input.website);
  return analyzeFromEvidence(evidence, input, 1);
}

// Multi-page analysis: read several pages of the site and reason over the merged
// evidence, so findings speak for the whole site rather than just the homepage.
export function analyzeBusinessPages(input: BusinessPagesInput): BusinessAnalysis {
  const pageEvidence = input.pages.map((p) => analyzeHtml(p.html, p.url));
  const evidence =
    pageEvidence.length > 0
      ? mergeEvidence(pageEvidence)
      : analyzeHtml("", input.website);
  const businessInput: BusinessInput = {
    name: input.name,
    website: input.website,
    industry: input.industry,
    html: input.pages[0]?.html ?? "",
    ...(input.location ? { location: input.location } : {}),
    ...(input.financial ? { financial: input.financial } : {}),
  };
  return analyzeFromEvidence(evidence, businessInput, Math.max(1, input.pages.length));
}

function analyzeFromEvidence(
  evidence: SiteEvidence,
  input: BusinessInput,
  pagesAnalyzed: number,
): BusinessAnalysis {
  // Derive dimension ratings + evidence facts from REAL signals (no manual scoring).
  const ratings: DimensionInput[] = [];
  const evidenceInputs: EvidenceInput[] = [];
  for (const r of RULES) {
    ratings.push({
      domain: r.domain,
      dimension: r.dimension,
      rating: r.rating(evidence),
    });
    evidenceInputs.push({
      domain: r.domain,
      dimension: r.dimension,
      label: r.fact(evidence),
    });
  }

  const assessment: AssessmentInput = {
    businessName: input.name,
    industryPack: input.industry,
    mode: "full_transformation",
    ratings,
    evidence: evidenceInputs,
    ...(input.financial ? { financial: input.financial } : {}),
  };

  // Visible scorecard — one row per analyzed dimension, from the same ratings and
  // evidence facts the findings use (surfaced, not recomputed).
  const factByDim = new Map<string, string>();
  for (const e of evidenceInputs) if (e.dimension) factByDim.set(e.dimension, e.label);
  const benchmark = (FINDING_THRESHOLD + 1) * 20;
  const scorecard: ScorecardEntry[] = ratings.map((r) => {
    const isStrength = r.rating > FINDING_THRESHOLD;
    const severity = severityOf(r.rating);
    const status: ScorecardEntry["status"] = isStrength
      ? "strength"
      : severity >= 4
        ? "critical"
        : "below_benchmark";
    const fact = factByDim.get(r.dimension) ?? "";
    return {
      domain: r.domain,
      dimension: r.dimension,
      label: dimensionLabel(r.domain, r.dimension),
      rating: r.rating,
      score: r.rating * 20,
      benchmark,
      isStrength,
      status,
      confidence: confidenceOf(r.rating, fact ? 1 : 0),
      interpretation: fact,
    };
  });

  const report = generateConsultingReport(assessment);
  // Relabel every finding's services to Herman Legacy product names for display.
  for (const f of report.findings)
    f.services = [...new Set(f.services.map(hlServiceLabel))];
  // Rewrite only the Executive Recommendations narrative line (the one place that
  // lists raw service names) so the blueprint speaks in HL product terms — without
  // risking substring corruption elsewhere in the prose.
  const hlProducts = [
    ...new Set(report.solutions.map((s) => hlServiceLabel(s.service))),
  ];
  const execRec = report.narrative.find((s) => s.key === "executive_recommendations");
  if (execRec && execRec.hasData && hlProducts.length) {
    execRec.body = `Recommended Herman Legacy services, strongest support first: ${hlProducts.slice(0, 7).join(", ")}.`;
  }
  const profile = buildProfile(evidence, input);

  // Proposal derived from the report's solution mapping (reuse — no new engine).
  const highPriority = new Set(
    report.findings
      .filter((f: Finding) => f.priority === "critical" || f.priority === "high")
      .flatMap((f) => f.services),
  );
  // Map to Herman Legacy product names, then de-duplicate (several internal
  // services collapse to one HL product, e.g. Website/Hosting → Herman Legacy Digital).
  const seen = new Set<string>();
  const lines: ProposalLine[] = [];
  for (const s of report.solutions) {
    const product = hlServiceLabel(s.service);
    if (seen.has(product)) continue;
    seen.add(product);
    lines.push({
      service: product,
      supportedBy: s.supportedBy,
      type: highPriority.has(s.service) ? "recurring" : "one_time",
    });
  }

  const pagesPhrase =
    pagesAnalyzed > 1
      ? `This analysis read ${pagesAnalyzed} pages of your website.`
      : "This analysis is based on your homepage.";
  const coverageNote = `${pagesPhrase} Operations, financial, and deeper AI-readiness findings require documents or a short interview — HL-BTI does not infer what it cannot observe.`;

  return {
    business: {
      name: input.name,
      website: input.website,
      industry: input.industry,
      ...(input.location ? { location: input.location } : {}),
    },
    evidence,
    pagesAnalyzed,
    profile,
    scorecard,
    report,
    proposal: {
      lines,
      recommendedServices: [
        ...new Set(report.solutions.map((s) => hlServiceLabel(s.service))),
      ],
    },
    coverageNote,
  };
}
