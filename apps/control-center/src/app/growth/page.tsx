import { FUNNELS, lineName, type Metric } from "@hl-bos/growth-intelligence";

import { C } from "@/components/presence-style";
import { Card } from "@/components/ui";
import { consoleConnectorEvidence, growthView } from "@/lib/growth";
import { FilePresenceRepository } from "@/lib/presence-store";

export const dynamic = "force-dynamic";

const STATUS: Record<Metric["status"], { label: string; color: string }> = {
  measured: { label: "Measured", color: C.green },
  estimate: { label: "Estimate", color: C.yellow },
  no_data: { label: "No data yet", color: C.grey },
  not_supported: { label: "Not enough data", color: C.grey },
  not_connected: { label: "Not connected", color: C.red },
  synthetic: { label: "Synthetic (dev)", color: C.yellow },
};

function show(m: Metric): string {
  if (m.value === null) return "—";
  if (m.unit === "cents")
    return `$${(m.value / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (m.unit === "ratio") return `${Math.round(m.value * 100)}%`;
  return m.value.toLocaleString("en-US");
}

export default async function GrowthPage() {
  const prospects = await new FilePresenceRepository().listProspects();
  const view = growthView(prospects, consoleConnectorEvidence(), new Date());

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a href="/" style={{ color: C.link, fontSize: 13, textDecoration: "none" }}>
        ← Back to the console
      </a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 22 }}>Growth Intelligence</h1>
      <p style={{ margin: "0 0 22px", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
        Owner only. Herman Legacy Digital and Herman Supply Chain Solutions, kept
        separate, plus both together. Every figure comes from the {view.leadCount}{" "}
        Presence Scanner lead{view.leadCount === 1 ? "" : "s"} saved on this computer.
        Nothing here is sample data — a dash means there is nothing real to show yet,
        and the line beside it says why. Read-only: nothing is sent, published or
        charged from this page.
      </p>

      <Card
        title="Which business owns each lead"
        sub="Decided by campaign, then the website an inquiry came through, then the industry. When those disagree, a person decides."
      >
        <div style={{ display: "flex", gap: 22, fontSize: 13 }}>
          <span>Herman Legacy Digital: {view.routed.hld}</span>
          <span>HSCS: {view.routed.hscs}</span>
          <span style={{ color: view.needsReview.length ? C.yellow : C.muted }}>
            Needs your decision: {view.needsReview.length}
          </span>
        </div>
        {view.needsReview.slice(0, 10).map((n) => (
          <p key={n.name} style={{ margin: "8px 0 0", fontSize: 12.5, color: C.muted }}>
            <strong style={{ color: C.text }}>{n.name}</strong> — {n.reasons.join(" ")}
          </p>
        ))}
      </Card>

      {view.dashboards.map((d) => (
        <Card
          key={d.scope}
          title={d.scope === "consolidated" ? "Both businesses" : lineName(d.scope)}
          sub={
            d.scope === "consolidated"
              ? "HLD and HSCS added together."
              : `Funnel: ${FUNNELS[d.scope].stages.map((s) => s.label).join(" → ")}`
          }
        >
          {d.demoRecordsExcluded > 0 ? (
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.yellow }}>
              {d.demoRecordsExcluded} demonstration record(s) left out of every figure.
            </p>
          ) : null}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {d.metrics.map((m) => (
                <tr key={m.key} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: "6px 8px 6px 0" }}>{m.label}</td>
                  <td
                    style={{
                      padding: "6px 8px",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {show(m)}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      color: STATUS[m.status].color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {STATUS[m.status].label}
                  </td>
                  <td
                    style={{ padding: "6px 0 6px 8px", color: C.muted, fontSize: 12 }}
                  >
                    {m.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      <Card
        title="Google connections"
        sub="Counted as connected only after a saved credential has answered a real test call in the last 7 days."
      >
        {view.connectors.map((c) => (
          <div
            key={c.connector.key}
            style={{
              borderTop: `1px solid ${C.border}`,
              padding: "8px 0",
              fontSize: 13,
            }}
          >
            <strong>{c.connector.name}</strong>{" "}
            <span style={{ color: c.status === "connected" ? C.green : C.red }}>
              {c.status === "connected"
                ? "Connected"
                : c.status === "failing"
                  ? "Failing"
                  : c.status === "not_tested"
                    ? "Not tested"
                    : "Not connected"}
            </span>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              {c.explanation}
            </div>
            <div style={{ color: C.muted, fontSize: 12 }}>
              Unlocks: {c.connector.unlocks.join(" ")} {c.connector.cost}
            </div>
          </div>
        ))}
      </Card>
    </main>
  );
}
