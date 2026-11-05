import type { CSSProperties, ReactNode } from "react";

import { FUNNELS, type Metric } from "@hl-bos/growth-intelligence";

import { C, button } from "@/components/presence-style";
import { Card } from "@/components/ui";
import {
  consoleRevenueSource,
  lineName,
  revenueView,
  type RevenueSource,
} from "@/lib/revenue";

import {
  decideAction,
  mockBackfillAction,
  rejectProspectAction,
  resolveInquiryAction,
  sendToReviewAction,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<Metric["status"], string> = {
  measured: C.green,
  estimate: C.yellow,
  synthetic: C.yellow,
  no_data: C.grey,
  not_supported: C.grey,
  not_connected: C.red,
};

const td: CSSProperties = {
  padding: "6px 8px",
  borderTop: `1px solid ${C.border}`,
  fontSize: 12.5,
  verticalAlign: "top",
};
const th: CSSProperties = {
  ...td,
  color: C.muted,
  fontSize: 11.5,
  textAlign: "left",
  whiteSpace: "nowrap",
};

/** Wide tables scroll inside their card on a phone instead of widening the page. */
function Scroll({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", maxWidth: "100%" }}
    >
      {children}
    </div>
  );
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [src, sp] = await Promise.all([consoleRevenueSource(), searchParams]);
  return (
    <main
      style={{
        maxWidth: 1240,
        margin: "0 auto",
        padding: "24px 16px 64px",
        boxSizing: "border-box",
      }}
    >
      <a href="/" style={{ color: C.link, fontSize: 13, textDecoration: "none" }}>
        ← Back to the console
      </a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 22 }}>HLG Revenue Center</h1>
      <p style={{ margin: "0 0 14px", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
        Discovery, reviews, proposals and outreach for Herman Legacy Digital and Herman
        Supply Chain Solutions, kept apart. Nothing on this page sends a message:
        outreach waits for your approval and then for a delivery provider, and only a
        mock provider is switched on.
      </p>
      {sp["done"] ? <Notice tone="ok">{sp["done"]}</Notice> : null}
      {sp["error"] ? <Notice tone="error">{sp["error"]}</Notice> : null}
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

function Notice({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  const color = tone === "ok" ? C.green : C.red;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{
        border: `1px solid ${color}`,
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 12,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

async function Connected({
  src,
}: {
  src: Extract<RevenueSource, { mode: "development" }>;
}) {
  const v = await revenueView(src);
  const consolidated = v.dashboards.find((d) => d.scope === "consolidated");
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
        <strong>Development database on this computer.</strong> {v.totals.synthetic} of{" "}
        {v.totals.prospects} record(s) are synthetic — fictitious businesses from the
        mock discovery source, not leads. Every figure they touch is labelled Synthetic
        and kept out of live commercial metrics.
      </div>

      <Card title="Owner overview" sub="Both businesses. Only you see this view.">
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: "14px 22px", fontSize: 13 }}
        >
          <Stat label="Prospects" value={v.totals.prospects} />
          <Stat label="Herman Legacy Digital" value={v.totals.byLine.hld} />
          <Stat label="HSCS" value={v.totals.byLine.hscs} />
          <Stat
            label="Review queue"
            value={v.industries.reduce(
              (s, i) => s + Number(i.summary?.review_queue ?? 0),
              0,
            )}
          />
          <Stat
            label="Reviewed"
            value={v.industries.reduce(
              (s, i) => s + Number(i.summary?.reviewed ?? 0),
              0,
            )}
          />
          <Stat label="Waiting for your approval" value={v.approvals.length} />
          <Stat label="Inquiries to decide" value={v.inquiries.length} />
          {consolidated?.metrics
            .filter((m) => ["outreach", "responses", "signed", "mrr"].includes(m.key))
            .map((m) => (
              <MetricTile key={m.key} m={m} />
            ))}
        </div>
      </Card>

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
                  wordBreak: "break-all",
                }}
              >
                version {a.sha256.slice(0, 16)}…
              </div>
              <form
                action={decideAction}
                style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}
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

      {v.inquiries.length > 0 ? (
        <Card
          title={`Website inquiries to decide (${v.inquiries.length})`}
          sub="These could belong to either business, so they were not filed automatically."
        >
          {v.inquiries.map((q) => (
            <div
              key={q.id}
              style={{
                borderTop: `1px solid ${C.border}`,
                padding: "8px 0",
                fontSize: 13,
              }}
            >
              <strong>{q.company ?? "A visitor"}</strong> · arrived on the{" "}
              {lineName(q.line)} site{q.synthetic ? " · synthetic" : ""}
              <div style={{ color: C.muted, fontSize: 12 }}>{q.reasons.join(" ")}</div>
              <form
                action={resolveInquiryAction}
                style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}
              >
                <input type="hidden" name="inquiryId" value={q.id} />
                <button name="line" value="hld" style={button(false)}>
                  File with HLD
                </button>
                <button name="line" value="hscs" style={button(false)}>
                  File with HSCS
                </button>
              </form>
            </div>
          ))}
        </Card>
      ) : null}

      <Card
        title="Industries"
        sub="Target: 50 open prospects per industry, 400 in all. Rejected prospects do not count and are never re-added."
      >
        <Scroll>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr>
                {[
                  "Industry",
                  "Business",
                  "Open / target",
                  "Qualified",
                  "Rejected",
                  "Review queue",
                  "Reviewed",
                  "Proposals",
                  "Outreach",
                  "Backfill needed",
                  "Last discovery",
                  "Sources",
                ].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.industries.map((i) => {
                const s = i.summary;
                const synth = Number(s?.synthetic ?? 0);
                return (
                  <tr key={i.key}>
                    <td style={td}>{i.label}</td>
                    <td style={td}>{i.line.toUpperCase()}</td>
                    <td style={td}>
                      {i.open} / {i.target}
                    </td>
                    <td style={td}>{Number(s?.qualified ?? 0)}</td>
                    <td style={td}>{Number(s?.rejected ?? 0)}</td>
                    <td style={td}>{Number(s?.review_queue ?? 0)}</td>
                    <td style={td}>{Number(s?.reviewed ?? 0)}</td>
                    <td style={td}>{Number(s?.with_proposal ?? 0)}</td>
                    <td style={td}>{Number(s?.outreach ?? 0)}</td>
                    <td style={td}>{i.backfill}</td>
                    <td style={td}>
                      {s?.last_discovery_at
                        ? s.last_discovery_at.slice(0, 10)
                        : "never"}
                    </td>
                    <td style={{ ...td, color: synth ? C.yellow : C.muted }}>
                      {s
                        ? [
                            synth && `${synth} synthetic`,
                            Number(s.imported) && `${Number(s.imported)} imported`,
                            Number(s.live_discovered) &&
                              `${Number(s.live_discovered)} live`,
                            Number(s.inbound) && `${Number(s.inbound)} inbound`,
                          ]
                            .filter(Boolean)
                            .join(", ") || "—"
                        : "none yet"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Scroll>
        <form
          action={mockBackfillAction}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 10,
            fontSize: 12.5,
            alignItems: "center",
          }}
        >
          <span style={{ color: C.muted }}>
            Development only — fill a campaign from the synthetic source:
          </span>
          <input
            name="campaign"
            placeholder="campaign key"
            style={{
              background: C.field,
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "6px 8px",
            }}
          />
          <select
            name="line"
            style={{
              background: C.field,
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "6px 8px",
            }}
          >
            <option value="hld">HLD</option>
            <option value="hscs">HSCS</option>
          </select>
          <button style={button(false)}>Synthetic backfill</button>
        </form>
      </Card>

      <Card title={`Prospects (${v.prospects.length})`}>
        <Scroll>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                {[
                  "Business",
                  "Line · industry",
                  "Status",
                  "Source",
                  "Reviews",
                  "Score",
                  "Recommendations",
                  "",
                ].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.prospects.map((p) => (
                <tr key={p.id}>
                  <td style={td}>
                    {p.name}
                    {p.synthetic ? (
                      <span style={{ color: C.yellow, fontSize: 11 }}>
                        {" "}
                        · synthetic
                      </span>
                    ) : null}
                  </td>
                  <td style={td}>
                    {p.line.toUpperCase()} · {p.industry}
                  </td>
                  <td style={td}>
                    {p.status}
                    {p.statusReason ? ` — ${p.statusReason}` : ""}
                  </td>
                  <td style={td}>{p.source.replace("_", " ")}</td>
                  <td style={td}>{p.reviews}</td>
                  <td style={td}>{p.latestScore ?? "—"}</td>
                  <td style={td}>{p.recommendations}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {p.status === "active" || p.status === "qualified" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        {p.hasScan ? (
                          <form action={sendToReviewAction}>
                            <input type="hidden" name="prospectId" value={p.id} />
                            <button style={button(p.reviews === 0)}>
                              {p.reviews === 0 ? "Send to Review" : "Review again"}
                            </button>
                          </form>
                        ) : (
                          <span style={{ color: C.muted, fontSize: 11.5 }}>
                            needs a website scan
                          </span>
                        )}
                        <form action={rejectProspectAction}>
                          <input type="hidden" name="prospectId" value={p.id} />
                          <button style={button(false)}>Reject</button>
                        </form>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
      </Card>

      {v.dashboards
        .filter((d) => d.scope !== "consolidated")
        .map((d) => (
          <Card
            key={d.scope}
            title={d.scope === "consolidated" ? "Both businesses" : lineName(d.scope)}
            sub={
              d.scope === "consolidated"
                ? ""
                : FUNNELS[d.scope].stages.map((s) => s.label).join(" → ")
            }
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "14px 22px",
                fontSize: 13,
              }}
            >
              {d.metrics
                .filter((m) =>
                  [
                    "discovered",
                    "inbound",
                    "reviews",
                    "qualified",
                    "outreach",
                    "responses",
                    "proposals",
                    "signed",
                    "mrr",
                    "cac",
                  ].includes(m.key),
                )
                .map((m) => (
                  <MetricTile key={m.key} m={m} />
                ))}
            </div>
          </Card>
        ))}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ color: C.muted, fontSize: 11.5 }}>{label}</div>
      <div style={{ fontSize: 18 }}>{value}</div>
    </div>
  );
}

function MetricTile({ m }: { m: Metric }) {
  return (
    <div title={m.note}>
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
  );
}
