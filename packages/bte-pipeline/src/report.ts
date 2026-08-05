/**
 * BTE findings + the initial draft report.
 *
 * REUSE: when a website was collected, the heavy lifting is done by
 * @hl-bos/bti-engine `analyst.analyzeBusiness` (which itself runs `analyzeHtml`
 * → deterministic evidence rubric → `generateConsultingReport`). This module
 * maps that engine output onto the BTE evidence-confidence model and folds in
 * the truthful "unavailable" findings the engine cannot produce (it only speaks
 * about signals it was handed). When no site is available it produces an
 * intake-only report with digital-presence findings marked `unavailable`.
 *
 * The report is ALWAYS `draft_ai_generated`. It is never delivered to a client.
 */

import { analyst, consulting, type DomainKey } from "@hl-bos/bti-engine";
import {
  confidenceFromClaimType,
  summarize,
  strongest,
  confidenceLine,
} from "./confidence.ts";
import type { CollectedEvidence } from "./evidence.ts";
import type {
  BteFinding,
  FindingCategory,
  FindingConfidence,
  InitialReport,
  NormalizedIntake,
  ReportSection,
  Severity,
} from "./types.ts";

const CATEGORY_BY_DOMAIN: Record<string, FindingCategory> = {
  technology: "technology",
  growth: "growth",
  operations: "operations",
  financial: "operations",
  business: "market",
  ai_readiness: "technology",
};

function categoryFor(domain: DomainKey, dimension: string): FindingCategory {
  if (dimension === "seo" || dimension === "ai_search_optimization") return "seo";
  return CATEGORY_BY_DOMAIN[domain] ?? "growth";
}

function severityFor(priority: consulting.Priority): Severity {
  switch (priority) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
  }
}

/** Map one engine finding onto a confidence-labelled BTE finding. */
function toBteFinding(f: consulting.Finding, source: string): BteFinding {
  const claimLevels: FindingConfidence[] = f.claims.map((c) =>
    confidenceFromClaimType(c.type),
  );
  const evidenceText =
    f.supportingEvidence.length > 0
      ? f.supportingEvidence.join(" ")
      : "No supporting evidence recorded.";
  return {
    title: f.finding,
    category: categoryFor(f.domain, f.dimension),
    evidence: evidenceText,
    evidenceSource: source,
    // A finding's confidence is its strongest evidentiary basis (see confidence.ts).
    confidence: strongest(claimLevels),
    businessImpact: f.businessImpact,
    severity: severityFor(f.priority),
    provenance: `bti-engine ${f.domain}/${f.dimension}; claims: ${
      f.claims.map((c) => c.type).join(", ") || "none"
    }`,
  };
}

/** Truthful strengths read directly from observed site signals (all verified). */
function siteStrengths(site: analyst.SiteEvidence): BteFinding[] {
  const out: BteFinding[] = [];
  const push = (title: string, evidence: string, cat: FindingCategory): void => {
    out.push({
      title,
      category: cat,
      evidence,
      evidenceSource: site.url,
      confidence: "verified",
      businessImpact: "A working foundation to build on.",
      severity: "info",
      provenance: `observed at ${site.url}`,
    });
  };
  if (site.https)
    push("Site is served over HTTPS", "Transport encryption observed.", "technology");
  if (site.structuredDataTypes.length > 0)
    push(
      "Structured data present",
      `schema.org types: ${site.structuredDataTypes.join(", ")}.`,
      "seo",
    );
  if (site.hasViewport)
    push(
      "Mobile viewport is set",
      "Responsive viewport meta present.",
      "digital_presence",
    );
  if (site.analyticsTags.length > 0)
    push(
      "Analytics is in place",
      `Detected: ${site.analyticsTags.join(", ")}.`,
      "technology",
    );
  if (site.forms > 0)
    push("On-page lead capture exists", `${site.forms} form(s) present.`, "growth");
  return out;
}

export interface BuildReportInput {
  intake: NormalizedIntake;
  evidence: CollectedEvidence;
  /** Raw homepage HTML when collected — passed to the engine for full analysis. */
  html?: string;
  generatedAt: string;
  /** Version number for this report in its subject lineage (>= 1). */
  version: number;
  /** Key of the report this supersedes, if any. */
  supersedes?: string;
}

export interface BuiltReport {
  report: InitialReport;
  /** The single most-severe verified/inferred constraint, for notifications. */
  primaryConstraint: BteFinding | null;
  industrySupported: boolean;
}

export function buildReport(input: BuildReportInput): BuiltReport {
  const { intake, evidence, html, generatedAt, version } = input;
  const business = intake.contact.businessName;

  const findings: BteFinding[] = [];
  const industry = normalizeIndustry(intake.industry);

  if (evidence.site && html !== undefined) {
    // Full engine reuse over observed website evidence.
    const analysis = analyst.analyzeBusiness({
      name: business,
      website: evidence.site.url,
      industry: industry.key,
      html,
    });
    for (const f of analysis.report.findings)
      findings.push(toBteFinding(f, evidence.site.url));
    findings.push(...siteStrengths(evidence.site));
  }

  // Digital-presence gap when the site could not be observed — an honest
  // `unavailable`, never a guess.
  const websiteRec = evidence.records.find((r) => r.key === "website.homepage");
  if (!evidence.site && websiteRec) {
    findings.push({
      title:
        websiteRec.status === "blocked"
          ? "Website could not be assessed — automated access was blocked"
          : websiteRec.status === "unavailable"
            ? "No website to assess"
            : "Website could not be reached for assessment",
      category: "digital_presence",
      evidence: websiteRec.detail,
      evidenceSource: websiteRec.source,
      confidence: "unavailable",
      businessImpact:
        "Digital-presence strengths and constraints cannot be verified until the site is reviewed.",
      severity: "info",
      provenance: `evidence status: ${websiteRec.status}`,
    });
  }

  // Client-stated challenge becomes a needs_confirmation finding (their words).
  if (intake.mainChallenge) {
    findings.push({
      title: "Owner-stated primary challenge",
      category: "market",
      evidence: intake.mainChallenge,
      evidenceSource: "intake",
      confidence: "needs_confirmation",
      businessImpact: "Directs where the transformation should focus once confirmed.",
      severity: "medium",
      provenance: "client intake (self-reported)",
    });
  }

  const confidence = summarize(findings);
  const primaryConstraint = pickPrimaryConstraint(findings);

  const sections = buildSections({
    intake,
    evidence,
    findings,
    primaryConstraint,
    confidenceText: confidenceLine(confidence),
    industrySupported: industry.supported,
  });

  const report: InitialReport = {
    subject: `engagement:${intake.submissionRef}:transformation`,
    version,
    status: "draft_ai_generated",
    title: `Initial Business Transformation Report — ${business}`,
    generatedFor: business,
    generatedAt,
    engineVersion: `bte-pipeline-0.1.0 / ${consulting.CONSULTING_ENGINE_VERSION}`,
    sections,
    findings,
    confidence,
    ...(input.supersedes ? { supersedes: input.supersedes } : {}),
  };

  return { report, primaryConstraint, industrySupported: industry.supported };
}

// A ranking used to choose the "primary constraint": most severe, and among
// equal severity, prefer verified over inferred over needs_confirmation.
const SEV_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
const CONF_RANK: Record<FindingConfidence, number> = {
  verified: 0,
  inferred: 1,
  needs_confirmation: 2,
  unavailable: 3,
};

function pickPrimaryConstraint(findings: readonly BteFinding[]): BteFinding | null {
  const candidates = findings.filter(
    (f) => f.severity !== "info" && f.confidence !== "unavailable",
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const s = SEV_RANK[a.severity] - SEV_RANK[b.severity];
    if (s !== 0) return s;
    return CONF_RANK[a.confidence] - CONF_RANK[b.confidence];
  })[0]!;
}

interface SectionsInput {
  intake: NormalizedIntake;
  evidence: CollectedEvidence;
  findings: BteFinding[];
  primaryConstraint: BteFinding | null;
  confidenceText: string;
  industrySupported: boolean;
}

function buildSections(s: SectionsInput): ReportSection[] {
  const { intake, evidence, findings, primaryConstraint, confidenceText } = s;
  const business = intake.contact.businessName;
  const strengths = findings.filter(
    (f) => f.severity === "info" && f.confidence === "verified",
  );
  const constraints = findings.filter(
    (f) => f.severity !== "info" && f.confidence !== "unavailable",
  );
  const unknowns = findings.filter(
    (f) => f.confidence === "unavailable" || f.confidence === "needs_confirmation",
  );
  const risks = findings.filter(
    (f) =>
      (f.severity === "critical" || f.severity === "high") &&
      f.confidence !== "unavailable",
  );

  const list = (items: BteFinding[]): string =>
    items.map((f) => `• ${f.title} [${f.confidence}] — ${f.businessImpact}`).join("\n");

  const digitalBody = evidence.site
    ? `Observed at ${evidence.site.url}: HTTPS ${evidence.site.https ? "yes" : "no"}, ` +
      `title ${evidence.site.title ? "present" : "missing"}, ` +
      `meta description ${evidence.site.metaDescription ? "present" : "missing"}, ` +
      `${evidence.site.socialLinks.length} social link(s), ` +
      `structured data ${evidence.site.structuredDataTypes.length > 0 ? "present" : "absent"}, ` +
      `analytics ${evidence.site.analyticsTags.length > 0 ? "present" : "absent"}.`
    : (evidence.records.find((r) => r.key === "website.homepage")?.detail ??
      "No website was supplied at intake.");

  const industryNote = s.industrySupported
    ? ""
    : ` Note: "${intake.industry ?? "unspecified"}" is not in the supported industry pack set; a general transformation lens was applied.`;

  return [
    {
      key: "executive_summary",
      title: "Executive Summary",
      body:
        `This is an automated, AI-generated DRAFT initial assessment of ${business}` +
        `${intake.industry ? ` (${intake.industry})` : ""}. It is not final and has not been ` +
        `reviewed by HLD. Confidence across findings: ${confidenceText}.` +
        (primaryConstraint ? ` Primary constraint: ${primaryConstraint.title}.` : "") +
        industryNote,
      hasData: true,
    },
    {
      key: "business_profile",
      title: "Business Profile",
      body:
        `Business: ${business}. Contact: ${intake.contact.primaryContact}.` +
        `${intake.businessStage ? ` Stage: ${intake.businessStage}.` : ""}` +
        `${intake.growthPriority ? ` Stated growth priority: ${intake.growthPriority}.` : ""}` +
        `${intake.ninetyDayGoal ? ` 90-day goal: ${intake.ninetyDayGoal}.` : ""}` +
        " (Client-supplied; not independently verified.)",
      hasData: true,
    },
    {
      key: "digital_presence",
      title: "Digital Presence",
      body: digitalBody,
      hasData: evidence.site !== null,
    },
    {
      key: "initial_strengths",
      title: "Initial Strengths",
      body:
        strengths.length > 0
          ? list(strengths)
          : "No verified strengths were observed yet.",
      hasData: strengths.length > 0,
    },
    {
      key: "initial_constraints",
      title: "Initial Constraints",
      body:
        constraints.length > 0
          ? list(constraints)
          : "No constraints could be established from the available evidence.",
      hasData: constraints.length > 0,
    },
    {
      key: "primary_constraint",
      title: "Primary Constraint",
      body: primaryConstraint
        ? `${primaryConstraint.title} [${primaryConstraint.confidence}] — ${primaryConstraint.businessImpact} ` +
          `Evidence: ${primaryConstraint.evidence}`
        : "A single primary constraint cannot be named until more evidence is confirmed.",
      hasData: primaryConstraint !== null,
    },
    {
      key: "growth_opportunities",
      title: "Growth Opportunities",
      body:
        constraints.length > 0
          ? "Each constraint above is a growth opportunity once addressed; prioritized in HLD review."
          : "Growth opportunities will be identified after owner confirmation and deeper review.",
      hasData: constraints.length > 0,
    },
    {
      key: "risks",
      title: "Risks",
      body:
        risks.length > 0
          ? list(risks)
          : "No high-severity risks were verified from available evidence.",
      hasData: risks.length > 0,
    },
    {
      key: "unknowns",
      title: "Unknowns / Owner Confirmation Required",
      body: unknowns.length > 0 ? list(unknowns) : "No outstanding unknowns recorded.",
      hasData: unknowns.length > 0,
    },
    {
      key: "recommended_next_step",
      title: "Recommended Next Step",
      body:
        "HLD reviews this draft, confirms the owner-supplied and inferred items, and decides what " +
        "becomes client-ready. This report is not the final deliverable and is not sent to the client automatically.",
      hasData: true,
    },
    {
      key: "evidence_provenance",
      title: "Evidence and Provenance Summary",
      body:
        evidence.records
          .map((r) => `• [${r.status}] ${r.label}: ${r.detail} (source: ${r.source})`)
          .join("\n") + `\nConfidence: ${confidenceText}.`,
      hasData: evidence.records.length > 0,
    },
  ];
}

function normalizeIndustry(industry: string | undefined): {
  key: string;
  supported: boolean;
} {
  if (!industry) return { key: "general", supported: false };
  const lower = industry.trim().toLowerCase();
  for (const t of consulting.INDUSTRY_TEMPLATES) {
    if (
      lower === t.key ||
      lower.includes(t.key) ||
      t.name.toLowerCase().includes(lower)
    ) {
      return { key: t.key, supported: true };
    }
  }
  return { key: "general", supported: false };
}
