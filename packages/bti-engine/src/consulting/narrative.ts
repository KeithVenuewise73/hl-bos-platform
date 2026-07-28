// Deterministic executive narrative. Produces board-ready sections filled ONLY
// from real data. Where a section has no supporting data it is emitted with
// hasData=false and a stated reason — never a fabricated paragraph. An AI layer
// may later polish the prose, but it may not change or invent a fact.

import type { DomainKey } from "../types.ts";
import type { ExecutiveScorecard } from "../scoring.ts";
import type {
  Finding,
  SolutionRecommendation,
  FinancialLine,
  NarrativeSection,
} from "./types.ts";

function sec(
  key: string,
  title: string,
  body: string,
  hasData: boolean,
  note?: string,
): NarrativeSection {
  return note === undefined
    ? { key, title, body, hasData }
    : { key, title, body, hasData, note };
}

function domainOpp(
  findings: Finding[],
  domain: DomainKey,
  title: string,
  key: string,
): NarrativeSection {
  const items = findings.filter((f) => f.domain === domain);
  if (items.length === 0)
    return sec(
      key,
      title,
      "",
      false,
      `No ${domain.replace("_", " ")} findings — either not assessed or already at target.`,
    );
  const top = items.slice(0, 4).map((f) => `${f.label}: ${f.recommendedAction}`);
  return sec(key, title, `Priority moves: ${top.join("; ")}.`, true);
}

export function buildNarrative(
  businessName: string,
  scores: ExecutiveScorecard,
  findings: Finding[],
  solutions: SolutionRecommendation[],
  financial: FinancialLine[],
): NarrativeSection[] {
  const scored = Object.entries(scores.domainScores) as [DomainKey, number][];
  const strengths = scored.filter(([, v]) => v >= 70);
  const critical = findings.filter((f) => f.priority === "critical");
  const high = findings.filter((f) => f.priority === "high");

  const summary =
    scores.transformation === null
      ? sec(
          "executive_summary",
          "Executive Summary",
          "",
          false,
          "No domains scored — complete the assessment to generate the summary.",
        )
      : sec(
          "executive_summary",
          "Executive Summary",
          `${businessName} has an overall Transformation Score of ${scores.transformation}/100 across ${scored.length} assessed domain(s). ` +
            `The assessment surfaced ${findings.length} evidence-backed finding(s)` +
            (critical.length ? `, ${critical.length} of them critical` : "") +
            `. The priorities below are sequenced by severity and business impact, and every recommendation traces to a verified rating.`,
          true,
        );

  const currentState =
    scored.length === 0
      ? sec("current_state", "Current State", "", false, "No domain scores available.")
      : sec(
          "current_state",
          "Current State",
          scored.map(([k, v]) => `${k.replace("_", " ")}: ${v}/100`).join(" · "),
          true,
        );

  const strengthsSection =
    strengths.length === 0
      ? sec(
          "strengths",
          "Business Strengths",
          "",
          false,
          "No domain scored at or above 70.",
        )
      : sec(
          "strengths",
          "Business Strengths",
          `Strong domains: ${strengths.map(([k, v]) => `${k.replace("_", " ")} (${v})`).join(", ")}.`,
          true,
        );

  const weaknesses =
    findings.length === 0
      ? sec(
          "weaknesses",
          "Business Weaknesses",
          "",
          false,
          "No findings — nothing rated at or below the finding threshold.",
        )
      : sec(
          "weaknesses",
          "Business Weaknesses",
          `Lowest-rated areas: ${findings
            .slice(0, 5)
            .map((f) => `${f.label} (${f.rating}/5)`)
            .join(", ")}.`,
          true,
        );

  const risks =
    critical.length + high.length === 0
      ? sec(
          "strategic_risks",
          "Strategic Risks",
          "",
          false,
          "No critical or high-priority findings.",
        )
      : sec(
          "strategic_risks",
          "Strategic Risks",
          [...critical, ...high]
            .slice(0, 5)
            .map((f) => `${f.label}: ${f.businessRisk}`)
            .join(" "),
          true,
        );

  const priorities =
    findings.length === 0
      ? sec(
          "transformation_priorities",
          "Transformation Priorities",
          "",
          false,
          "No findings to prioritize.",
        )
      : sec(
          "transformation_priorities",
          "Transformation Priorities",
          findings
            .slice(0, 6)
            .map(
              (f, i) => `${i + 1}. ${f.label} (${f.priority}) — ${f.recommendedAction}`,
            )
            .join(" "),
          true,
        );

  const recommendations =
    solutions.length === 0
      ? sec(
          "executive_recommendations",
          "Executive Recommendations",
          "",
          false,
          "No services recommended — no supporting findings.",
        )
      : sec(
          "executive_recommendations",
          "Executive Recommendations",
          `Recommended Herman Legacy services, strongest support first: ${solutions
            .slice(0, 6)
            .map((s) => s.service)
            .join(", ")}.`,
          true,
        );

  const financialKnown = financial.filter((l) => l.value !== null);
  const financialSection =
    financialKnown.length === 0
      ? sec(
          "financial_opportunities",
          "Financial Opportunities",
          "",
          false,
          "Additional financial information required before any financial value can be stated.",
        )
      : sec(
          "financial_opportunities",
          "Financial Opportunities",
          financialKnown
            .map((l) => `${l.label}: ${l.value?.toLocaleString()} ${l.unit}`)
            .join("; ") + ".",
          true,
        );

  const board =
    scores.transformation === null
      ? sec(
          "board_summary",
          "Board-Level Summary",
          "",
          false,
          "Insufficient data for a board summary.",
        )
      : sec(
          "board_summary",
          "Board-Level Summary",
          `Transformation Score ${scores.transformation}/100. ${critical.length} critical, ${high.length} high-priority findings. ` +
            `${solutions.length} Herman Legacy service line(s) indicated. ` +
            (financialKnown.length
              ? "Financial baselines provided."
              : "Financial values pending additional information."),
          true,
        );

  return [
    summary,
    currentState,
    strengthsSection,
    weaknesses,
    risks,
    domainOpp(findings, "growth", "Growth Opportunities", "growth_opportunities"),
    domainOpp(
      findings,
      "technology",
      "Technology Opportunities",
      "technology_opportunities",
    ),
    domainOpp(findings, "ai_readiness", "AI Opportunities", "ai_opportunities"),
    domainOpp(
      findings,
      "operations",
      "Operational Opportunities",
      "operational_opportunities",
    ),
    financialSection,
    priorities,
    recommendations,
    board,
  ];
}
