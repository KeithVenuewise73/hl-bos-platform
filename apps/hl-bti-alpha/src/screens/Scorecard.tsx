"use client";

import { useWorkspace } from "@/lib/workspace";
import { engagementById, scorecardFor, growthFor } from "@/lib/store";
import { DOMAINS, type DomainKey } from "@hl-bos/bti-engine";
import {
  Card,
  Badge,
  ScoreRing,
  ScoreBar,
  EmptyState,
  scoreColor,
  scoreWord,
} from "@/components/ui";

// EXECUTIVE SCORECARD — the seven executive scores, each with explanation,
// strengths, weaknesses and recommendations. Honest: a domain not scored shows
// "Not scored", never an invented number.
const DOMAIN_EXPLAIN: Record<DomainKey, string> = {
  business:
    "Maturity, leadership, processes, customer experience and growth readiness.",
  operations:
    "Operations, supply chain, scheduling, automation, fleet, warehouse and transportation.",
  growth: "Website, SEO, AI search, reviews, content, lead generation and conversion.",
  technology:
    "Software, security, cloud, architecture, technical debt and scalability.",
  ai_readiness:
    "Automation opportunities, AI assistants, support and internal AI workflows.",
  financial: "Cost reduction, revenue growth and ROI potential.",
};

export default function Scorecard({ engagementId }: { engagementId: string }) {
  const { ws } = useWorkspace();
  const e = engagementById(ws, engagementId)!;
  const s = scorecardFor(e.assessment);
  const growth = growthFor(e.assessment);

  const seven: { key: string; label: string; value: number | null }[] = [
    { key: "business", label: "Business Health", value: s.businessHealth },
    { key: "operations", label: "Operations", value: s.operations },
    { key: "growth", label: "Growth", value: s.growth },
    { key: "technology", label: "Technology", value: s.technology },
    { key: "ai_readiness", label: "AI Readiness", value: s.aiReadiness },
    { key: "financial", label: "Financial Opportunity", value: s.financialOpportunity },
  ];

  if (s.transformation === null) {
    return (
      <EmptyState icon="📊" title="No scores yet">
        Rate dimensions in the Assessment wizard to generate the executive scorecard.
      </EmptyState>
    );
  }

  return (
    <div>
      <Card>
        <div className="row" style={{ gap: 28, alignItems: "center" }}>
          <ScoreRing score={s.transformation} label="Transformation" />
          <div style={{ paddingBottom: 18 }}>
            <div className="row" style={{ gap: 8 }}>
              <h2 style={{ fontSize: 20 }}>Transformation Score</h2>
              <Badge
                kind={
                  s.transformation >= 70
                    ? "ok"
                    : s.transformation >= 55
                      ? "warn"
                      : "danger"
                }
              >
                {scoreWord(s.transformation)}
              </Badge>
            </div>
            <div className="dim" style={{ fontSize: 13, marginTop: 6, maxWidth: 460 }}>
              The weighted composite of the scored domains. Domains with no ratings are
              excluded — the score reflects only what was actually assessed.
            </div>
          </div>
        </div>
      </Card>

      <div className="grid cols-3" style={{ marginTop: 16 }}>
        {seven.map((d) => {
          const dom = DOMAINS.find((x) => x.key === d.key)!;
          const rated = e.assessment.ratings[d.key as DomainKey] ?? {};
          const strengths = dom.dimensions
            .filter((dim) => (rated[dim.key] ?? -1) >= 4)
            .map((dim) => dim.name);
          const weaknesses = dom.dimensions
            .filter((dim) => rated[dim.key] !== undefined && rated[dim.key]! <= 2)
            .map((dim) => dim.name);
          return (
            <Card key={d.key} title={d.label}>
              <div className="row spread">
                <div
                  style={{ fontSize: 30, fontWeight: 750, color: scoreColor(d.value) }}
                >
                  {d.value ?? "—"}
                </div>
                <Badge
                  kind={
                    d.value === null
                      ? undefined
                      : d.value >= 70
                        ? "ok"
                        : d.value >= 55
                          ? "warn"
                          : "danger"
                  }
                >
                  {scoreWord(d.value)}
                </Badge>
              </div>
              <div style={{ margin: "8px 0" }}>
                <ScoreBar score={d.value} />
              </div>
              <div className="dim" style={{ fontSize: 12.5 }}>
                {DOMAIN_EXPLAIN[d.key as DomainKey]}
              </div>
              {d.value !== null && (
                <div style={{ marginTop: 8, fontSize: 12.5 }}>
                  {strengths.length > 0 && (
                    <div>
                      <span className="badge ok">Strengths</span> {strengths.join(", ")}
                    </div>
                  )}
                  {weaknesses.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <span className="badge danger">Gaps</span> {weaknesses.join(", ")}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {growth.recommendations.length > 0 && (
        <>
          <div className="section-title">Recommendations (Growth Intelligence)</div>
          <Card>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Recommendation</th>
                  <th>Priority</th>
                  <th>Est. ROI</th>
                  <th>Herman Legacy service</th>
                </tr>
              </thead>
              <tbody>
                {growth.recommendations.map((r) => (
                  <tr key={r.dimension}>
                    <td>{r.label}</td>
                    <td>
                      <Badge
                        kind={
                          r.priority === "critical"
                            ? "danger"
                            : r.priority === "high"
                              ? "warn"
                              : undefined
                        }
                      >
                        {r.priority}
                      </Badge>
                    </td>
                    <td>{r.estimatedRoi}</td>
                    <td>{r.recommendedService}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
