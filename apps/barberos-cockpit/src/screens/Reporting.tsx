"use client";

import { catalog, myShops, pipeline, type Agency, type PipelineEntry } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { STAGES, groupByStage, money, when } from "@/lib/model";
import { Card, EmptyState } from "@/components/ui";
import { Loaded, PageHead } from "@/components/parts";

/**
 * Screen 15 — reporting.
 *
 * Every number here is counted from the pipeline read at the moment the page
 * loaded. There is no revenue figure, no conversion rate over time, no traffic
 * and no ranking, because this platform holds none of those things: there is no
 * payment provider, no analytics SDK and no Search Console integration
 * anywhere in the repository. A panel that showed them would be showing
 * something invented.
 *
 * What it does show is the evidence quality of the audits the sales pitch rests
 * on, which is the number most likely to be wrong in our favour if nobody
 * looks at it.
 */
export default function Reporting({ agency }: { agency: Agency }) {
  const pipe = useAsync(() => pipeline(agency.tenant_id), [agency.tenant_id]);
  const shops = useAsync(() => myShops(), []);
  const cat = useAsync(() => catalog(), []);

  return (
    <>
      <PageHead
        title="Reporting"
        sub={`${agency.name} — counted from the pipeline, at the moment this page loaded.`}
      />

      <Loaded
        state={pipe}
        isEmpty={(d: PipelineEntry[]) => d.length === 0}
        empty={
          <EmptyState title="Nothing to report">
            No shop has been imported for this agency, so there is nothing to count.
            This panel stays empty rather than showing a zero that could be mistaken for
            a measurement.
          </EmptyState>
        }
      >
        {(entries) => {
          const g = groupByStage(entries);
          const runs = entries.filter((e) => e.latest_run);
          const findings = runs.reduce((a, e) => a + (e.latest_run?.findings ?? 0), 0);
          const evidenced = runs.reduce(
            (a, e) => a + (e.latest_run?.evidenced_findings ?? 0),
            0,
          );
          const hooks = runs.filter((e) => e.latest_run?.has_outreach_hook).length;
          const hooksNoEvidence = runs.filter(
            (e) =>
              e.latest_run?.has_outreach_hook && e.latest_run.evidenced_findings === 0,
          ).length;
          const partial = runs.filter(
            (e) =>
              e.latest_run &&
              e.latest_run.coverage.scored < e.latest_run.coverage.possible,
          ).length;
          const sold = entries.filter(
            (e) => e.latest_proposal?.status === "accepted",
          ).length;
          const sent = entries.filter((e) => e.latest_proposal?.sent_at).length;
          const declined = entries.filter(
            (e) => e.latest_proposal?.status === "declined",
          ).length;

          return (
            <>
              <h3 className="section-title">The pipeline</h3>
              <div className="grid cols-3" style={{ marginBottom: 22 }}>
                {STAGES.map((s) => (
                  <div className="stat" key={s.key}>
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-value" style={{ fontSize: 26 }}>
                      {g[s.key].length}
                    </div>
                    <div className="stat-sub">{s.hint}</div>
                  </div>
                ))}
              </div>

              <h3 className="section-title">
                Evidence quality — the thing to check before quoting any of it
              </h3>
              <div className="grid cols-4" style={{ marginBottom: 22 }}>
                <div className="stat">
                  <div className="stat-label">Shops audited</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {runs.length}
                  </div>
                  <div className="stat-sub">of {entries.length} on the list</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Findings with evidence</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {findings === 0 ? "—" : `${evidenced}/${findings}`}
                  </div>
                  <div className="stat-sub">
                    {findings === 0
                      ? "no findings recorded"
                      : evidenced === 0
                        ? "not one finding carries an evidence URL"
                        : `${Math.round((evidenced / findings) * 100)}% evidenced`}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">
                    Sales hooks with no evidence behind them
                  </div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {hooksNoEvidence}
                  </div>
                  <div className="stat-sub">
                    of {hooks} hook{hooks === 1 ? "" : "s"} set. A hook must cite a
                    finding; the database does not require that finding to be evidenced.
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Runs with partial coverage</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {partial}
                  </div>
                  <div className="stat-sub">
                    scored fewer dimensions than the campaign weighted
                  </div>
                </div>
              </div>

              <h3 className="section-title">Proposals</h3>
              <div className="grid cols-3" style={{ marginBottom: 22 }}>
                <div className="stat">
                  <div className="stat-label">Sent</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {sent}
                  </div>
                  <div className="stat-sub">
                    recorded as sent by an operator — nothing is sent from this console
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Accepted</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {sold}
                  </div>
                  <div className="stat-sub">{declined} declined</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Onboarded</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {g.delivering.length}
                  </div>
                  <div className="stat-sub">
                    {sold > g.delivering.length
                      ? `${sold - g.delivering.length} sold but not yet onboarded`
                      : "every sale has been onboarded"}
                  </div>
                </div>
              </div>

              <div className="grid cols-2">
                <Card title="What is actually switched on, across the shops you operate">
                  <Loaded
                    state={shops}
                    isEmpty={(d) => d.length === 0}
                    empty={
                      <EmptyState title="No client shops">
                        Nothing has been onboarded into a tenant you are a member of.
                      </EmptyState>
                    }
                  >
                    {(list) => {
                      const counts = new Map<string, number>();
                      for (const s of list)
                        for (const k of s.capabilities)
                          counts.set(k, (counts.get(k) ?? 0) + 1);
                      return counts.size === 0 ? (
                        <EmptyState title="Nothing switched on yet">
                          {list.length} shop{list.length === 1 ? "" : "s"} onboarded,
                          and no capability enabled on any of them.
                        </EmptyState>
                      ) : (
                        <table className="tbl">
                          <thead>
                            <tr>
                              <th>Capability</th>
                              <th>Shops</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...counts.entries()]
                              .sort((a, b) => b[1] - a[1])
                              .map(([k, n]) => (
                                <tr key={k}>
                                  <td>{k}</td>
                                  <td>
                                    {n} of {list.length}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      );
                    }}
                  </Loaded>
                </Card>

                <Card title="What this report deliberately does not contain">
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                    <li>
                      <strong>Revenue.</strong> No payment provider is connected to this
                      platform. Recorded visit prices are the only money it holds, and
                      those are a shop&rsquo;s own bookkeeping, not ours.
                    </li>
                    <li>
                      <strong>Traffic, rankings and leads.</strong> There is no
                      analytics SDK, no Search Console integration and no Google
                      Business API access anywhere in this repository, so any figure
                      here would be invented.
                    </li>
                    <li>
                      <strong>Messages sent.</strong> No SMS or email provider is
                      configured. &ldquo;Sent&rdquo; above means an operator recorded
                      that they sent something themselves.
                    </li>
                    <li>
                      <strong>Conversion over time.</strong> The pipeline read carries
                      current state, not history. A trend line drawn from it would be a
                      guess.
                    </li>
                  </ul>
                  {cat.data && (
                    <div className="banner" style={{ marginTop: 14 }}>
                      {
                        cat.data.capabilities.filter((c) => c.status === "available")
                          .length
                      }{" "}
                      of {cat.data.capabilities.length} capabilities have shipped. Until
                      reporting_dashboard is one of them, there is nothing honest to
                      report beyond what is on this page.
                    </div>
                  )}
                </Card>
              </div>

              <Card title="Every shop, and where it is">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Shop</th>
                      <th>Stage</th>
                      <th>Audit coverage</th>
                      <th>Evidence</th>
                      <th>Proposal</th>
                      <th>Onboarded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAGES.flatMap((s) =>
                      g[s.key].map((e) => (
                        <tr key={e.prospect_id}>
                          <td style={{ fontWeight: 600 }}>{e.business_name}</td>
                          <td>
                            <span className="badge info">{s.label}</span>
                          </td>
                          <td className="muted">
                            {e.latest_run
                              ? `${e.latest_run.coverage.scored} of ${e.latest_run.coverage.possible}`
                              : "—"}
                          </td>
                          <td className="muted">
                            {e.latest_run
                              ? `${e.latest_run.evidenced_findings} of ${e.latest_run.findings}`
                              : "—"}
                          </td>
                          <td className="muted">{e.latest_proposal?.status ?? "—"}</td>
                          <td className="muted">{when(e.onboarding?.onboarded_at)}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
                <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>
                  Recorded visit prices are shown per client inside a shop&rsquo;s own
                  records, never aggregated into an agency revenue figure here —{" "}
                  {money(null)} is what this console knows about money it has not been
                  told.
                </div>
              </Card>
            </>
          );
        }}
      </Loaded>
    </>
  );
}
