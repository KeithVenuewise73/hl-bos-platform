import { FUNNELS, type Metric } from "@hl-bos/growth-intelligence";

import { C, button } from "@/components/presence-style";
import { Card } from "@/components/ui";
import {
  consoleRevenueSource,
  lineName,
  revenueView,
  type RevenueSource,
} from "@/lib/revenue";

import { decideAction, sendToReviewAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<Metric["status"], string> = {
  measured: C.green,
  estimate: C.yellow,
  synthetic: C.yellow,
  no_data: C.grey,
  not_supported: C.grey,
  not_connected: C.red,
};

const td = {
  padding: "6px 8px",
  borderTop: `1px solid ${C.border}`,
  fontSize: 12.5,
  verticalAlign: "top" as const,
};

export default async function RevenuePage() {
  const src = await consoleRevenueSource();
  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a href="/" style={{ color: C.link, fontSize: 13, textDecoration: "none" }}>
        ← Back to the console
      </a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 22 }}>HLG Revenue Center</h1>
      <p style={{ margin: "0 0 18px", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
        Discovery, reviews, proposals and outreach for Herman Legacy Digital and Herman
        Supply Chain Solutions, kept apart. Nothing on this page sends a message:
        outreach waits for your approval and then for a delivery provider, and only a
        mock provider is switched on.
      </p>
      {src.mode === "not_connected" ? (
        <Card title="Not connected">
          <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{src.reason}</p>
        </Card>
      ) : (
        <Connected src={src} />
      )}
    </main>
  );
}

async function Connected({
  src,
}: {
  src: Extract<RevenueSource, { mode: "development" }>;
}) {
  const v = await revenueView(src);
  return (
    <>
      <div
        style={{
          background: "#1c1a08",
          border: `1px solid ${C.yellow}`,
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 16,
          fontSize: 13,
        }}
      >
        <strong>Development database on this computer.</strong> {v.syntheticRecords}{" "}
        synthetic record(s) from the mock discovery source — fictitious businesses, not
        leads. Every figure they touch is labelled Synthetic.
      </div>

      <Card
        title={`Waiting for your approval (${v.approvals.length})`}
        sub="You approve exactly the version shown. If it changes, the approval is void."
      >
        {v.approvals.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Nothing is waiting.</p>
        ) : (
          v.approvals.map((a) => (
            <div
              key={a.instanceId}
              style={{
                borderTop: `1px solid ${C.border}`,
                padding: "8px 0",
                fontSize: 13,
              }}
            >
              <strong>
                {a.subject === "proposal" ? "Proposal" : "Outreach message"}
              </strong>{" "}
              · {lineName(a.line)} · {a.title}
              <div
                style={{
                  color: C.muted,
                  fontSize: 11.5,
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                version {a.sha256.slice(0, 16)}…
              </div>
              <form
                action={decideAction}
                style={{ display: "flex", gap: 8, marginTop: 6 }}
              >
                <input type="hidden" name="instanceId" value={a.instanceId} />
                <input type="hidden" name="sha256" value={a.sha256} />
                <button name="decision" value="approved" style={button(true)}>
                  Approve this version
                </button>
                <button name="decision" value="rejected" style={button(false)}>
                  Reject
                </button>
              </form>
            </div>
          ))
        )}
      </Card>

      <Card
        title="Industries"
        sub="Target: 50 open prospects per industry. Rejected prospects do not count, and are never re-added."
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: C.muted, fontSize: 12, textAlign: "left" }}>
              <th style={td}>Industry</th>
              <th style={td}>Business</th>
              <th style={td}>Open</th>
              <th style={td}>Target</th>
              <th style={td}>Backfill needed</th>
              <th style={td}>Confirmed against original</th>
            </tr>
          </thead>
          <tbody>
            {v.backfill.map((b) => (
              <tr key={b.industry.key}>
                <td style={td}>{b.industry.label}</td>
                <td style={td}>{lineName(b.industry.line)}</td>
                <td style={td}>{b.open}</td>
                <td style={td}>{b.industry.targetActive}</td>
                <td style={td}>{b.deficit}</td>
                <td
                  style={{
                    ...td,
                    color: b.industry.confirmedAgainstOriginal ? C.green : C.yellow,
                  }}
                >
                  {b.industry.confirmedAgainstOriginal
                    ? "Yes"
                    : "No — original not readable"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={`Prospects (${v.prospects.length})`}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: C.muted, fontSize: 12, textAlign: "left" }}>
              <th style={td}>Business</th>
              <th style={td}>Line · industry</th>
              <th style={td}>Status</th>
              <th style={td}>Reviews</th>
              <th style={td}>Score</th>
              <th style={td}>Recommendations</th>
              <th style={td}>Proposal</th>
              <th style={td}></th>
            </tr>
          </thead>
          <tbody>
            {v.prospects.map((p) => (
              <tr key={p.id}>
                <td style={td}>
                  {p.name}
                  {p.synthetic ? (
                    <span style={{ color: C.yellow, fontSize: 11 }}> · synthetic</span>
                  ) : null}
                </td>
                <td style={td}>
                  {lineName(p.line)} · {p.industry}
                </td>
                <td style={td}>
                  {p.status}
                  {p.statusReason ? ` — ${p.statusReason}` : ""}
                </td>
                <td style={td}>{p.reviews}</td>
                <td style={td}>{p.latestScore ?? "—"}</td>
                <td style={td}>{p.recommendations}</td>
                <td style={td}>{p.proposal ?? "—"}</td>
                <td style={td}>
                  {p.status === "active" || p.status === "qualified" ? (
                    <form action={sendToReviewAction}>
                      <input type="hidden" name="prospectId" value={p.id} />
                      <button style={button(p.reviews === 0)}>
                        {p.reviews === 0 ? "Send to Review" : "Review again"}
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {v.dashboards.map((d) => (
        <Card
          key={d.scope}
          title={d.scope === "consolidated" ? "Both businesses" : lineName(d.scope)}
          sub={
            d.scope === "consolidated"
              ? "HLD and HSCS together."
              : FUNNELS[d.scope].stages.map((s) => s.label).join(" → ")
          }
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 13 }}>
            {d.metrics
              .filter((m) =>
                [
                  "discovered",
                  "reviews",
                  "qualified",
                  "outreach",
                  "proposals",
                  "signed",
                  "mrr",
                ].includes(m.key),
              )
              .map((m) => (
                <div key={m.key} title={m.note}>
                  <div style={{ color: C.muted, fontSize: 11.5 }}>{m.label}</div>
                  <div style={{ fontSize: 18 }}>
                    {m.value === null
                      ? "—"
                      : m.unit === "cents"
                        ? `$${(m.value / 100).toFixed(0)}`
                        : m.value}
                  </div>
                  <div style={{ color: STATUS_COLOR[m.status], fontSize: 11 }}>
                    {m.status.replace("_", " ")}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      ))}
    </>
  );
}
