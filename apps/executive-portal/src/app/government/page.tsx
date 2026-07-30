import { PortalShell } from "@/components/PortalShell";
import { Card, Row, Dot, Empty } from "@/components/ui";
import { sampleGovAssessments, ourCapabilityList } from "@/lib/intelligence-data";

export const dynamic = "force-dynamic";

const WIN_HEALTH: Record<string, "green" | "yellow" | "red"> = {
  high: "green",
  medium: "yellow",
  low: "red",
};

const VERDICT_HEALTH: Record<string, "green" | "yellow" | "red" | "unknown"> = {
  pursue: "green",
  pursue_with_partner: "yellow",
  decline: "red",
  insufficient_data: "unknown",
};

function money(n: number | null): string {
  return n === null ? "—" : `$${n.toLocaleString("en-US")}`;
}

export default function GovernmentPage() {
  const assessments = sampleGovAssessments();
  const caps = ourCapabilityList();

  return (
    <PortalShell view="government">
      <div
        style={{
          background: "#1b1206",
          border: "1px solid #7a5b16",
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 16,
          fontSize: 12.5,
          color: "#e3b341",
        }}
      >
        Illustrative sample opportunities — not real solicitations. Win probability is a
        capability-match ratio against our registered capabilities. Profit is withheld
        unless a contract value is supplied, and is illustrative when shown. The
        bid/no-bid decision is a CEO decision.
      </div>

      {assessments.map((a) => (
        <Card
          key={a.opportunity.id}
          title={a.opportunity.title}
          sub={`${a.opportunity.agency ?? "—"} · ${a.opportunity.id}${a.opportunity.naics ? ` · NAICS ${a.opportunity.naics}` : ""}`}
        >
          <Row
            k="Win probability"
            v={
              <span>
                <Dot
                  health={
                    a.winProbability.band
                      ? (WIN_HEALTH[a.winProbability.band] ?? "unknown")
                      : "unknown"
                  }
                />
                {a.winProbability.band ?? "insufficient data"}
                {a.winProbability.score === null ? "" : ` · ${a.winProbability.score}%`}
              </span>
            }
          />
          <Row
            k="Capability fit"
            v={`${a.haveCount}/${a.capabilityGaps.length} required`}
          />
          <Row
            k="Gaps"
            v={
              a.gapCount === 0
                ? "none"
                : a.capabilityGaps
                    .filter((g) => !g.have)
                    .map((g) => g.capability)
                    .join(", ")
            }
          />
          <Row
            k="Estimated profit"
            v={
              a.estimatedProfit.estimatedProfit === null
                ? a.estimatedProfit.note
                : `${money(a.estimatedProfit.estimatedProfit)} · ${Math.round(a.estimatedProfit.marginFraction * 100)}% margin · illustrative`
            }
          />
          <Row
            k="CEO recommendation"
            v={
              <span>
                <Dot
                  health={VERDICT_HEALTH[a.ceoRecommendation.verdict] ?? "unknown"}
                />
                {a.ceoRecommendation.verdict} — {a.ceoRecommendation.reason}
              </span>
            }
          />
          <Row
            k="Approval required"
            v={`${a.ceoRecommendation.approval.type} — ${a.ceoRecommendation.approval.gate}`}
          />
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 4 }}>
              Recommended actions
            </div>
            {a.recommendedActions.map((act, i) => (
              <div
                key={i}
                style={{ fontSize: 12.5, padding: "3px 0", color: "#c9d1d9" }}
              >
                • {act}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card
        title="Our registered capabilities"
        sub="The capability inventory win probability and gaps are matched against (from the Enterprise Catalog)."
      >
        {caps.length === 0 ? (
          <Empty>No capabilities registered.</Empty>
        ) : (
          caps.map((c) => <Row key={c.key} k={c.name} v={c.key} />)
        )}
      </Card>
    </PortalShell>
  );
}
