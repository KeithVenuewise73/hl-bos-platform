// Deterministic finding generation — the 12-part consulting workflow per finding.
// Every finding traces to a verified rating (+ any attached evidence). Root
// cause and business impact are explicitly INFERENCE; the recommended action is
// OPINION; the rating and evidence are FACT. Nothing is fabricated.

import { DOMAINS } from "../catalog.ts";
import type { DomainKey } from "../types.ts";
import type { AssessmentInput, Finding, Claim, TimelineBucket } from "./types.ts";
import { kbFor } from "./knowledge.ts";
import { severityOf, priorityFor, FINDING_THRESHOLD } from "./priority.ts";

function dimLabel(domain: DomainKey, dimension: string): string {
  const d = DOMAINS.find((x) => x.key === domain);
  return d?.dimensions.find((x) => x.key === dimension)?.name ?? dimension;
}

const IMPACT: Record<DomainKey, string> = {
  business: "constrains the organization's ability to execute and scale",
  operations: "raises operating cost and slows fulfillment",
  growth: "limits new-customer acquisition and revenue",
  technology: "increases risk and slows every other initiative",
  ai_readiness: "leaves productivity and service-quality gains uncaptured",
  financial: "means margin and ROI opportunities go uncaptured",
};

const OPPORTUNITY: Record<DomainKey, string> = {
  business: "clearer execution and a foundation to scale",
  operations: "lower cost per unit and faster, more reliable fulfillment",
  growth: "more qualified pipeline and revenue",
  technology: "lower risk and faster delivery of every other initiative",
  ai_readiness: "reclaimed hours and higher service quality",
  financial: "captured margin and measurable ROI",
};

function riskFor(severity: number): string {
  if (severity >= 4)
    return "Left unaddressed, this is a near-term threat to performance.";
  if (severity === 3)
    return "This materially holds back results if not addressed this quarter.";
  return "This caps upside and should be scheduled deliberately.";
}

// Critical findings are pulled earlier than the KB default.
function timelineFor(kbTimeline: TimelineBucket, severity: number): TimelineBucket {
  if (severity >= 4) return "immediate";
  if (severity === 3 && (kbTimeline === "medium_term" || kbTimeline === "long_term"))
    return "short_term";
  return kbTimeline;
}

export function buildFindings(input: AssessmentInput): Finding[] {
  const findings: Finding[] = [];
  const evidenceByDim = new Map<string, string[]>();
  for (const ev of input.evidence ?? []) {
    const key = ev.dimension ?? `domain:${ev.domain}`;
    const arr = evidenceByDim.get(key) ?? [];
    arr.push(ev.label);
    evidenceByDim.set(key, arr);
  }

  for (const r of input.ratings) {
    if (r.rating > FINDING_THRESHOLD) continue; // 4-5 are strengths, not findings
    const kb = kbFor(r.dimension);
    if (!kb) continue; // only produce a finding where we have grounded consulting knowledge
    const label = dimLabel(r.domain, r.dimension);
    const severity = severityOf(r.rating);
    const priority = priorityFor(r.rating);
    const dimEvidence = evidenceByDim.get(r.dimension) ?? [];
    const domainNote = input.notes?.[r.domain];

    const supportingEvidence = [
      `Assessment rating: ${label} = ${r.rating}/5 (verified input)`,
      ...dimEvidence.map((e) => `Attached evidence: ${e}`),
      ...(domainNote ? [`Assessor note (${r.domain}): ${domainNote}`] : []),
    ];

    const businessImpact = `Weak ${label} ${IMPACT[r.domain]}.`;
    const businessRisk = riskFor(severity);
    const opportunity = `Improving ${label} from ${r.rating}/5 toward target unlocks ${OPPORTUNITY[r.domain]}.`;

    const claims: Claim[] = [
      {
        type: "fact",
        text: `${label} was rated ${r.rating}/5 in the assessment.`,
        evidence: supportingEvidence,
      },
      {
        type: "inference",
        text: `Likely root cause: ${kb.rootCause.toLowerCase()}.`,
        evidence: [
          `Derived from the ${label} rating${dimEvidence.length ? " and attached evidence" : ""}.`,
        ],
      },
      {
        type: "inference",
        text: businessImpact,
        evidence: [`Derived from the ${label} rating and its domain (${r.domain}).`],
      },
      {
        type: "opinion",
        text: `Recommended action: ${kb.action}.`,
        evidence: [`Professional recommendation based on the finding.`],
      },
    ];

    findings.push({
      domain: r.domain,
      dimension: r.dimension,
      label,
      rating: r.rating,
      severity,
      finding: `${label} is rated ${r.rating}/5 — below target.`,
      supportingEvidence,
      businessImpact,
      rootCause: kb.rootCause,
      businessRisk,
      opportunity,
      priority,
      recommendedAction: kb.action,
      difficulty: kb.difficulty,
      timeline: timelineFor(kb.timeline, severity),
      successMetrics: kb.metrics,
      services: kb.services,
      claims,
    });
  }

  // Deterministic order: worst priority first, then domain weight, then label.
  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const w = {
    business: 9,
    operations: 8,
    growth: 8,
    technology: 7,
    ai_readiness: 7,
    financial: 8,
  } as Record<DomainKey, number>;
  findings.sort((a, b) => {
    const p = rank[a.priority]! - rank[b.priority]!;
    if (p !== 0) return p;
    const dw = w[b.domain] - w[a.domain];
    if (dw !== 0) return dw;
    return a.label.localeCompare(b.label);
  });

  return findings;
}
