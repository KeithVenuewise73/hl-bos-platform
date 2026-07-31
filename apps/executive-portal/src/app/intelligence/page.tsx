import { PortalShell } from "@/components/PortalShell";
import { Card, Tile, Grid, Row, Dot, Empty } from "@/components/ui";
import { sampleIntelligence } from "@/lib/intelligence-data";

export const dynamic = "force-dynamic";

const PRIORITY_HEALTH: Record<string, "red" | "yellow" | "green"> = {
  critical: "red",
  high: "red",
  medium: "yellow",
  low: "green",
};

function money(n: number | null): string {
  return n === null ? "—" : `$${n.toLocaleString("en-US")}`;
}

export default function IntelligencePage() {
  const r = sampleIntelligence();
  const impact = r.businessImpact;
  const topRecs = r.recommendations.slice(0, 6);

  return (
    <PortalShell view="intelligence">
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
        Illustrative sample input — <strong>{r.meta.businessName}</strong>. The engine
        is real and deterministic; this input is a labelled sample, not a customer.
        Monetary figures are illustrative and derived from supplied sample financials.
      </div>

      <Grid min={160}>
        <Tile
          label="Transformation score"
          value={r.analysis.transformation ?? "—"}
          accent="#58a6ff"
        />
        <Tile label="Findings (why)" value={r.meta.findings} />
        <Tile label="Recommendations" value={r.meta.recommendations} />
        <Tile
          label="Est. monthly impact"
          value={money(impact.totalMonthlyValue)}
          accent="#3fb950"
          hint={impact.incomplete ? `${impact.estimatesGated} gated` : "all supplied"}
        />
      </Grid>

      <Card
        title="Executive recommendations"
        sub="Each answers: what happened · why · what to do · estimated impact · what approval is required."
      >
        {topRecs.length === 0 ? (
          <Empty>No findings for this sample.</Empty>
        ) : (
          topRecs.map((rec) => (
            <div
              key={rec.id}
              style={{
                padding: "12px 0",
                borderBottom: "1px solid #1c2128",
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>
                <Dot health={PRIORITY_HEALTH[rec.priority] ?? "unknown"} />
                {rec.label}
                <span style={{ color: "#6e7681", fontWeight: 400 }}>
                  {" "}
                  · {rec.priority}
                </span>
              </div>
              <Row k="What happened" v={rec.problem} />
              <Row k="Why (root cause)" v={rec.rootCause} />
              <Row k="What to do" v={rec.solution} />
              <Row
                k="Estimated impact"
                v={
                  rec.revenueImpact.monthlyValue === null
                    ? rec.revenueImpact.note
                    : `${money(rec.revenueImpact.monthlyValue)}/mo · ROI ${rec.revenueImpact.roiBand ?? "—"} · illustrative`
                }
              />
              <Row
                k="Reusable HL product"
                v={
                  rec.reusableProduct.factory.matchedProductName
                    ? `${rec.reusableProduct.factory.matchedProductName} · reuse ${rec.reusableProduct.factory.reusePct ?? "—"}% · effort ${rec.reusableProduct.factory.buildEffort}`
                    : `${rec.reusableProduct.services[0] ?? "—"} · ${rec.reusableProduct.factory.buildEffort}`
                }
              />
              <Row
                k="Approval required"
                v={rec.approvals.map((a) => a.type).join(", ") || "none"}
              />
            </div>
          ))
        )}
      </Card>

      <Card
        title="Estimated business impact"
        sub="Evidence-gated: only estimates with supplied financial figures are totalled. Payback is withheld — pricing is a pending CEO decision."
      >
        <Row k="Total monthly (illustrative)" v={money(impact.totalMonthlyValue)} />
        <Row k="Total annual (illustrative)" v={money(impact.totalAnnualValue)} />
        <Row k="Estimates with a value" v={impact.estimatesWithValue} />
        <Row k="Estimates withheld (gated)" v={impact.estimatesGated} />
        <div style={{ fontSize: 12, color: "#8b949e", marginTop: 8 }}>
          {impact.note}
        </div>
      </Card>

      <Card
        title="CEO approvals required"
        sub="The engine advises; it authorises nothing. These are the human gates before any action."
      >
        {r.approvals.length === 0 ? (
          <Empty>No approvals required.</Empty>
        ) : (
          r.approvals.map((a) => <Row key={a.type} k={a.type} v={a.reason} />)
        )}
      </Card>

      <Card
        title="Software opportunities (HLVS)"
        sub="Which recommendations imply a buildable/sellable Herman Legacy product, with the Software Factory reuse verdict."
      >
        {r.softwareOpportunities.map((o) => (
          <Row
            key={o.key}
            k={o.matchedProductName ?? o.service}
            v={`${o.verdict}${o.reusePct === null ? "" : ` · reuse ${o.reusePct}%`} · ${o.buildEffort}`}
          />
        ))}
      </Card>

      <Card
        title="Measurement plan"
        sub="What to track after execution (from the recommendations' success metrics)."
      >
        {r.measurementPlan.slice(0, 10).map((m, i) => (
          <Row
            key={`${m.fromRecommendation}-${i}`}
            k={m.area ?? m.fromRecommendation}
            v={m.metric}
          />
        ))}
      </Card>
    </PortalShell>
  );
}
