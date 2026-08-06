"use client";

import type {
  ClaimView,
  PriorityRow,
  ReportFinding,
  ScorecardRow,
  TransformationReportView,
} from "@/lib/scan/report-model";

// The Executive Transformation Report — an interactive consulting briefing driven
// entirely by real engine output. Committed to a light, print-friendly document
// treatment (a consulting deliverable, not a dashboard). All styling is scoped
// under `.htr` so it cannot collide with the surrounding site.

const GAUGE_R = 80;
const GAUGE_C = 2 * Math.PI * GAUGE_R;

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Gauge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="htr-gauge">
        <div className="htr-gauge-na">Not scored</div>
        <div className="htr-gauge-band">Insufficient signals</div>
      </div>
    );
  }
  const offset = GAUGE_C * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="htr-gauge">
      <svg
        width="176"
        height="176"
        viewBox="0 0 190 190"
        role="img"
        aria-label={`Transformation score ${score} of 100`}
      >
        <circle cx="95" cy="95" r={GAUGE_R} className="htr-gauge-track" />
        <circle
          cx="95"
          cy="95"
          r={GAUGE_R}
          className="htr-gauge-arc"
          strokeDasharray={GAUGE_C}
          strokeDashoffset={offset}
          transform="rotate(-90 95 95)"
        />
        <text x="95" y="99" textAnchor="middle" className="htr-gauge-val">
          {score}
        </text>
        <text x="95" y="122" textAnchor="middle" className="htr-gauge-den">
          / 100
        </text>
      </svg>
    </div>
  );
}

function ClaimChips({ claims }: { claims: ClaimView[] }) {
  if (claims.length === 0) return null;
  return (
    <div className="htr-claims">
      {claims.map((c, i) => (
        <span
          key={i}
          className={`htr-claim htr-claim-${c.type.toLowerCase()}`}
          title={c.text}
        >
          {c.type}
        </span>
      ))}
    </div>
  );
}

function FindingCard({ f }: { f: ReportFinding }) {
  return (
    <article className={`htr-finding htr-sev-${f.priority}`}>
      <div className="htr-fpills">
        <span className={`htr-pill htr-pri-${f.priority}`}>
          {PRIORITY_LABEL[f.priority]}
        </span>
        <span className="htr-pill htr-pill-dim">{f.dimension}</span>
        <span className="htr-conf">
          Confidence: <b>{f.confidence}</b>
        </span>
      </div>
      <h3 className="htr-fh">{f.title}</h3>
      <p className="htr-fproblem">{f.problem}</p>

      <div className="htr-fgrid">
        <div>
          <div className="htr-flabel">Evidence from your site</div>
          <ul className="htr-evi">
            {f.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="htr-flabel">Business impact</div>
          <p className="htr-fbody">{f.businessImpact}</p>
          <div className="htr-flabel" style={{ marginTop: 12 }}>
            Recommended action
          </div>
          <p className="htr-fbody">{f.recommendedAction}</p>
        </div>
      </div>

      <div className="htr-fmeta">
        <span>
          Expected outcome<b>{f.expectedOutcome}</b>
        </span>
        <span>
          Effort<b>{f.effort}</b>
        </span>
        <span>
          Timeline<b>{f.timeline}</b>
        </span>
      </div>

      <div className="htr-fsolve">
        <div>
          <span className="htr-flabel">Herman Legacy solution</span>
          <div className="htr-chips">
            {f.solutions.map((s) => (
              <span key={s} className="htr-solchip">
                {s}
              </span>
            ))}
          </div>
        </div>
        <div>
          <span className="htr-flabel">Claim basis</span>
          <ClaimChips claims={f.claims} />
        </div>
      </div>
    </article>
  );
}

function ScorecardTable({ rows }: { rows: ScorecardRow[] }) {
  return (
    <div className="htr-scorecard">
      {rows.map((r) => (
        <div key={r.dimension} className="htr-scrow">
          <div className="htr-scname">
            <span>{r.label}</span>
            <span className={`htr-status htr-status-${r.status}`}>{r.statusLabel}</span>
          </div>
          <div className="htr-scbar">
            <div className="htr-sctrack">
              <div
                className={`htr-scfill htr-fill-${r.status}`}
                style={{ width: `${r.score}%` }}
              />
              <div
                className="htr-scmark"
                style={{ left: `${r.benchmark}%` }}
                title={`Benchmark ${r.benchmark}`}
              />
            </div>
            <div className="htr-scinterp">{r.interpretation}</div>
          </div>
          <div className="htr-scnum">
            <span className="htr-scscore">{r.score}</span>
            <span className="htr-scconf">{r.confidence}</span>
          </div>
        </div>
      ))}
      <div className="htr-sclegend">
        <span>
          <i className="htr-legmark" /> Benchmark ({rows[0]?.benchmark ?? 80}/100)
        </span>
        <span>
          Score column is 0–100 · Confidence reflects the strength of the site evidence.
        </span>
      </div>
    </div>
  );
}

function PriorityTable({ rows }: { rows: PriorityRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="htr-tblwrap">
      <table className="htr-tbl">
        <thead>
          <tr>
            <th>Priority</th>
            <th>Issue</th>
            <th>Why it matters</th>
            <th>Recommended action</th>
            <th>Solution</th>
            <th>Timing</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <span className={`htr-dot htr-pri-${r.priority}`} />
                {PRIORITY_LABEL[r.priority]}
              </td>
              <td>{r.issue}</td>
              <td>{r.whyItMatters}</td>
              <td>{r.action}</td>
              <td>{r.solution}</td>
              <td>{r.timing}</td>
              <td>{r.confidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportView({ report: r }: { report: TransformationReportView }) {
  const when = formatDate(r.analyzedAtIso);
  return (
    <div className="htr">
      <style>{CSS}</style>

      {/* Cover / executive header */}
      <header className="htr-cover">
        <div className="htr-cover-main">
          <div className="htr-kicker">
            <span className="htr-kdot" /> Business Transformation Intelligence ·
            Confidential
          </div>
          <h1 className="htr-title">{r.headline}</h1>
          <div className="htr-covmeta">
            <span>
              Prepared for
              <b>
                {r.business.name}
                {r.business.location ? ` — ${r.business.location}` : ""}
              </b>
            </span>
            <span>
              Website analyzed<b>{r.business.website}</b>
            </span>
            <span>
              Pages read
              <b>
                {r.pagesAnalyzed} page{r.pagesAnalyzed === 1 ? "" : "s"}
              </b>
            </span>
            {when ? (
              <span>
                Analyzed<b>{when}</b>
              </span>
            ) : null}
            <span>
              Prepared by<b>Herman Legacy Digital</b>
            </span>
          </div>
        </div>
        <div className="htr-cover-score">
          <Gauge score={r.score} />
          {r.scoreBand ? (
            <div className="htr-gauge-band">Transformation Score · {r.scoreBand}</div>
          ) : null}
        </div>
      </header>

      {/* KPI strip */}
      <div className="htr-kpis">
        <div className="htr-kpi">
          <div className="htr-kpi-n">{r.criticalHighCount}</div>
          <div className="htr-kpi-l">Critical / high-priority findings</div>
        </div>
        <div className="htr-kpi">
          <div className="htr-kpi-n">
            {r.dimensionsBelowBenchmark}
            <span className="htr-kpi-of"> / {r.dimensionsTotal}</span>
          </div>
          <div className="htr-kpi-l">Dimensions below benchmark</div>
        </div>
        <div className="htr-kpi">
          <div className="htr-kpi-n">{r.findings.length}</div>
          <div className="htr-kpi-l">Evidence-backed findings</div>
        </div>
      </div>
      <p className="htr-limit">
        <b>Evidence basis.</b> {r.evidenceLimitation}
      </p>

      {/* Executive briefing */}
      <section className="htr-sec">
        <div className="htr-sechead">
          <span className="htr-n">01</span>
          <h2>Executive briefing</h2>
        </div>
        <div className="htr-brief">
          <div>
            <div className="htr-flabel">Current situation</div>
            <p>{r.executiveBriefing.situation}</p>
          </div>
          <div>
            <div className="htr-flabel">Primary constraint</div>
            <p>{r.executiveBriefing.primaryConstraint}</p>
          </div>
          <div>
            <div className="htr-flabel">Business consequence</div>
            <p>{r.executiveBriefing.businessConsequence}</p>
          </div>
          <div>
            <div className="htr-flabel">Recommended path forward</div>
            <p>{r.executiveBriefing.pathForward}</p>
          </div>
        </div>
      </section>

      {/* The connected picture — synthesis across themes */}
      <section className="htr-sec">
        <div className="htr-sechead">
          <span className="htr-n">02</span>
          <h2>The connected picture</h2>
        </div>
        <p className="htr-insight">{r.connectedInsight}</p>
        {r.synthesisThemes.length > 0 ? (
          <div className="htr-themes">
            {r.synthesisThemes.map((t) => (
              <div key={t.name} className="htr-theme">
                <div className="htr-theme-name">{t.name}</div>
                <div className="htr-theme-sum">{t.summary}</div>
                <ul className="htr-theme-find">
                  {t.findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
                {t.solutions.length > 0 ? (
                  <div className="htr-theme-sol">
                    {t.solutions.map((s) => (
                      <span key={s} className="htr-theme-chip">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* Scorecard */}
      <section className="htr-sec">
        <div className="htr-sechead">
          <span className="htr-n">03</span>
          <h2>Where you stand — the scorecard</h2>
        </div>
        <p className="htr-lead">
          Each dimension is scored 0–100 from real signals on your site and set against
          the benchmark the engine holds every dimension to. The gaps, not the averages,
          are where demand leaks.
        </p>
        <ScorecardTable rows={r.scorecard} />
      </section>

      {/* Findings */}
      <section className="htr-sec">
        <div className="htr-sechead">
          <span className="htr-n">04</span>
          <h2>Findings ({r.findings.length})</h2>
        </div>
        {r.findings.length === 0 ? (
          <p className="htr-lead">
            No critical or high-priority weaknesses were detected in this website scan.
            The next tier of opportunity likely lies in areas a website cannot reveal —
            see the evidence basis above.
          </p>
        ) : (
          <div className="htr-findings">
            {r.findings.map((f) => (
              <FindingCard key={f.id} f={f} />
            ))}
          </div>
        )}
      </section>

      {/* Priority table */}
      {r.priorityTable.length > 0 ? (
        <section className="htr-sec">
          <div className="htr-sechead">
            <span className="htr-n">05</span>
            <h2>Priorities at a glance</h2>
          </div>
          <PriorityTable rows={r.priorityTable} />
        </section>
      ) : null}

      {/* Beyond your website — the full transformation surface */}
      <section className="htr-sec">
        <div className="htr-sechead">
          <span className="htr-n">06</span>
          <h2>Beyond your website — the full transformation</h2>
        </div>
        <p className="htr-lead">
          This scan reads your digital front door. Herman Legacy transforms the whole
          business — the areas below are <b>not yet assessed</b> from a website alone
          and are where the deeper opportunities usually live. We never estimate what we
          haven&apos;t measured.
        </p>
        <div className="htr-scope">
          <div className="htr-scope-col">
            <div className="htr-flabel">Assessed in this report</div>
            <ul className="htr-scope-list htr-scope-done">
              {r.transformationScope.assessed.map((a) => (
                <li key={a.area}>
                  <b>{a.area}</b>
                  <span>{a.note}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="htr-scope-col">
            <div className="htr-flabel">
              Not yet assessed — unlock with a full assessment
            </div>
            <ul className="htr-scope-list htr-scope-todo">
              {r.transformationScope.notYetAssessed.map((a) => (
                <li key={a.area}>
                  <b>{a.area}</b>
                  <span>{a.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Blueprint */}
      <section className="htr-sec">
        <div className="htr-sechead">
          <span className="htr-n">07</span>
          <h2>Your transformation blueprint</h2>
        </div>
        <div className="htr-timeline">
          {r.horizons
            .filter((h) => h.items.length > 0)
            .map((h) => (
              <div key={h.key} className="htr-phase">
                <div className="htr-phase-win">{h.window}</div>
                <div className="htr-phase-obj">{h.objective}</div>
                <ul className="htr-phase-actions">
                  {h.items.map((it, i) => (
                    <li key={i}>
                      <b>{it.label}</b>
                      {it.action}
                    </li>
                  ))}
                </ul>
                <dl className="htr-phase-meta">
                  <div>
                    <dt>Expected change</dt>
                    <dd>{h.expectedChange}</dd>
                  </div>
                  {h.solutions.length > 0 ? (
                    <div>
                      <dt>Herman Legacy solution</dt>
                      <dd>{h.solutions.join(", ")}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Dependencies</dt>
                    <dd>{h.dependencies}</dd>
                  </div>
                  <div>
                    <dt>Evidence still required</dt>
                    <dd>{h.evidenceRequired}</dd>
                  </div>
                </dl>
              </div>
            ))}
        </div>
      </section>

      {/* Recommended transformations */}
      <section className="htr-sec">
        <div className="htr-sechead">
          <span className="htr-n">08</span>
          <h2>Recommended transformations</h2>
        </div>
        <p className="htr-lead">
          Each solution is recommended only because specific findings justify it —
          framed by the outcome it produces, not the label. Nothing here is a generic
          upsell.
        </p>
        {r.recommendedTransformations.length === 0 ? (
          <p className="htr-lead">
            No product transformations were triggered by this scan.
          </p>
        ) : (
          <div className="htr-xf">
            {r.recommendedTransformations.map((t) => (
              <div key={t.product} className="htr-xcard">
                <div className="htr-xhead">
                  <div className="htr-xprod">{t.product}</div>
                  <span className={`htr-xtype htr-xtype-${t.type}`}>
                    {t.type === "recurring" ? "Ongoing" : "One-time"}
                  </span>
                </div>
                <div className="htr-xout">{t.outcome}</div>
                <div className="htr-xwhy">{t.whyRecommended}</div>
                <dl className="htr-xmeta">
                  <div>
                    <dt>Effort</dt>
                    <dd>{t.effort}</dd>
                  </div>
                  <div>
                    <dt>Timeline</dt>
                    <dd>{t.timeline}</dd>
                  </div>
                  <div>
                    <dt>Price</dt>
                    <dd>{t.price}</dd>
                  </div>
                  <div>
                    <dt>ROI</dt>
                    <dd>{t.roi}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Why Herman Legacy + urgency */}
      <section className="htr-sec">
        <div className="htr-sechead">
          <span className="htr-n">09</span>
          <h2>Why Herman Legacy</h2>
        </div>
        <ul className="htr-why">
          {r.whyHermanLegacy.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        <div className="htr-begin">
          <div className="htr-flabel">Why begin now</div>
          <p>{r.beginNow}</p>
        </div>
      </section>

      {/* CTA */}
      <section className="htr-cta">
        <h2>Turn this analysis into a plan</h2>
        <p>
          Your Transformation Blueprint sequences every fix by return and timeline — and
          our team can execute it with you. The analysis is free. The results are not
          theoretical.
        </p>
        <div className="htr-ctarow">
          <a className="htr-btn htr-btn-primary" href={r.next.href}>
            {r.next.cta} →
          </a>
          <a className="htr-btn htr-btn-ghost" href={r.secondary.href}>
            {r.secondary.cta}
          </a>
        </div>
        <div className="htr-ctasub">
          Free assessment · No account required · Evidence-based, nothing fabricated
        </div>
      </section>

      <footer className="htr-foot">
        <div className="htr-prov">
          Generated by {r.meta.engineVersion} · {r.meta.dimensionsRated} dimensions
          rated · {r.meta.factCount} facts, {r.meta.inferenceCount} inferences,{" "}
          {r.meta.opinionCount} opinions · deterministic · every claim traced to a real
          signal · unknowns left unknown.
        </div>
      </footer>
    </div>
  );
}

const CSS = `
.htr{--ink:#0e1a26;--paper:#f5f6f8;--card:#fff;--line:#e4e7ec;--muted:#5c6b7a;--soft:#7d8b98;
  --navy:#12354e;--navy2:#0d2536;--accent:#17506e;--brass:#b98a2e;
  --crit:#b42318;--high:#b54708;--med:#1f5f8b;--good:#237a4b;--grid:rgba(18,53,78,.10);
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:"SF Mono","JetBrains Mono",ui-monospace,Menlo,monospace;
  color:var(--ink);font-family:var(--sans);line-height:1.55;font-size:15px}
.htr *{box-sizing:border-box}
.htr h1,.htr h2,.htr h3{font-family:var(--serif);font-weight:600;letter-spacing:-.01em;margin:0;text-wrap:balance}
.htr .htr-flabel{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--soft)}
.htr-tnum{font-variant-numeric:tabular-nums}

.htr-cover{background:radial-gradient(900px 320px at 82% -20%,rgba(185,138,46,.16),transparent 60%),
  linear-gradient(180deg,var(--navy),var(--navy2));color:#eaf1f6;border-radius:16px;
  border-bottom:3px solid var(--brass);padding:28px 26px;display:grid;grid-template-columns:1.5fr .8fr;gap:22px;align-items:center}
.htr-kicker{display:flex;align-items:center;gap:9px;font-size:11.5px;letter-spacing:.05em;color:#9fb6c6;margin-bottom:12px}
.htr-kdot{width:5px;height:5px;border-radius:50%;background:var(--brass)}
.htr-title{color:#fff;font-size:clamp(23px,3.4vw,34px);line-height:1.12}
.htr-covmeta{display:flex;flex-wrap:wrap;gap:16px 26px;margin-top:18px;font-size:11.5px;color:#9fb6c6}
.htr-covmeta b{display:block;color:#e7eef4;font-weight:600;font-size:13px;margin-top:1px;word-break:break-word}
.htr-cover-score{justify-self:end;text-align:center}
.htr-gauge{display:flex;flex-direction:column;align-items:center}
.htr-gauge-track{fill:none;stroke:rgba(255,255,255,.14);stroke-width:14}
.htr-gauge-arc{fill:none;stroke:var(--brass);stroke-width:14;stroke-linecap:round;transition:stroke-dashoffset .9s ease}
.htr-gauge-val{font-family:var(--serif);font-size:44px;font-weight:600;fill:#fff;font-variant-numeric:tabular-nums}
.htr-gauge-den{font-size:13px;fill:#9fb6c6}
.htr-gauge-na{font-family:var(--serif);font-size:26px;color:#fff;padding:40px 0 6px}
.htr-gauge-band{margin-top:8px;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--brass);font-weight:700}

.htr-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}
.htr-kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:15px 16px}
.htr-kpi-n{font-family:var(--serif);font-size:30px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.htr-kpi-of{font-size:17px;color:var(--soft)}
.htr-kpi-l{font-size:12px;color:var(--muted);margin-top:6px}
.htr-limit{font-size:12.5px;color:var(--muted);background:var(--paper);border:1px solid var(--line);
  border-radius:10px;padding:11px 13px;margin:12px 0 0;line-height:1.5}
.htr-limit b{color:var(--ink)}

.htr-sec{padding:30px 0;border-bottom:1px solid var(--line)}
.htr-sechead{display:flex;align-items:baseline;gap:12px;margin-bottom:16px}
.htr-sechead h2{font-size:21px}
.htr-n{font-family:var(--mono);font-size:11px;color:var(--soft);border:1px solid var(--line);border-radius:6px;padding:2px 7px}
.htr-lead{font-size:14px;color:var(--muted);max-width:40em;margin:-4px 0 16px;line-height:1.55}

.htr-brief{display:grid;grid-template-columns:1fr 1fr;gap:18px 26px}
.htr-brief p{margin:5px 0 0;font-size:14.5px;line-height:1.55}
.htr-brief > div:first-child p{font-family:var(--serif);font-size:16.5px;line-height:1.5}

.htr-scorecard{display:grid;gap:9px}
.htr-scrow{display:grid;grid-template-columns:210px 1fr 66px;gap:14px;align-items:center}
.htr-scname{display:flex;flex-direction:column;gap:3px}
.htr-scname > span:first-child{font-size:13.5px;font-weight:600}
.htr-status{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;width:fit-content}
.htr-status-strength{color:var(--good)}.htr-status-below_benchmark{color:var(--high)}.htr-status-critical{color:var(--crit)}
.htr-sctrack{position:relative;height:9px;background:var(--grid);border-radius:99px;overflow:visible}
.htr-scfill{height:9px;border-radius:99px}
.htr-fill-strength{background:var(--good)}.htr-fill-below_benchmark{background:var(--high)}.htr-fill-critical{background:var(--crit)}
.htr-scmark{position:absolute;top:-3px;width:2px;height:15px;background:var(--navy);border-radius:2px;transform:translateX(-1px)}
.htr-scinterp{font-size:11.5px;color:var(--muted);margin-top:6px;line-height:1.4}
.htr-scnum{text-align:right}
.htr-scscore{font-family:var(--mono);font-size:15px;font-weight:600;display:block;font-variant-numeric:tabular-nums}
.htr-scconf{font-size:10.5px;color:var(--soft)}
.htr-sclegend{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:11px;color:var(--soft)}
.htr-legmark{display:inline-block;width:2px;height:11px;background:var(--navy);vertical-align:middle;margin-right:5px}

.htr-findings{display:grid;gap:14px}
.htr-finding{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--med);border-radius:14px;padding:22px}
.htr-sev-critical{border-left-color:var(--crit)}.htr-sev-high{border-left-color:var(--high)}
.htr-sev-medium{border-left-color:var(--med)}.htr-sev-low{border-left-color:var(--soft)}
.htr-fpills{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.htr-pill{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;border-radius:99px;padding:3px 10px;border:1px solid currentColor}
.htr-pri-critical{color:var(--crit)}.htr-pri-high{color:var(--high)}.htr-pri-medium{color:var(--med)}.htr-pri-low{color:var(--soft)}
.htr-pill-dim{color:var(--soft)}
.htr-conf{margin-left:auto;font-size:11.5px;color:var(--muted)}.htr-conf b{color:var(--ink)}
.htr-fh{font-size:19px;margin-bottom:5px}
.htr-fproblem{font-size:14.5px;color:var(--muted);margin:0;max-width:44em;line-height:1.55}
.htr-fgrid{display:grid;grid-template-columns:1fr 1fr;gap:18px 26px;margin-top:16px}
.htr-fbody{font-size:13.5px;margin:4px 0 0;line-height:1.5}
.htr-evi{list-style:none;padding:0;margin:6px 0 0;display:grid;gap:6px}
.htr-evi li{font-size:13px;padding-left:17px;position:relative;line-height:1.45}
.htr-evi li::before{content:"";position:absolute;left:0;top:7px;width:7px;height:7px;border-radius:2px;background:var(--accent)}
.htr-fmeta{display:flex;flex-wrap:wrap;gap:20px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-size:12px;color:var(--soft)}
.htr-fmeta b{display:block;color:var(--ink);font-weight:600;font-size:13px;margin-top:2px}
.htr-fsolve{display:grid;grid-template-columns:1fr 1fr;gap:18px 26px;margin-top:14px}
.htr-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.htr-solchip{font-size:12.5px;font-weight:600;color:#fff;background:linear-gradient(180deg,var(--navy),var(--navy2));border-radius:8px;padding:4px 11px}
.htr-claims{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.htr-claim{font-size:10.5px;font-weight:700;letter-spacing:.04em;border-radius:6px;padding:3px 9px}
.htr-claim-fact{background:#e7f2ec;color:#1c6a41}
.htr-claim-inference{background:#eaf1f7;color:#1f5f8b}
.htr-claim-opinion{background:#f5edda;color:#8a6416}

.htr-tblwrap{overflow-x:auto}
.htr-tbl{width:100%;border-collapse:collapse;font-size:13px;min-width:720px}
.htr-tbl th{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--soft);text-align:left;padding:0 11px 9px;font-weight:700}
.htr-tbl td{padding:11px;border-top:1px solid var(--line);vertical-align:top;line-height:1.45}
.htr-dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:7px;vertical-align:middle;background:var(--med)}
.htr-dot.htr-pri-critical{background:var(--crit)}.htr-dot.htr-pri-high{background:var(--high)}.htr-dot.htr-pri-medium{background:var(--med)}

.htr-timeline{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.htr-phase{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;border-top:3px solid var(--accent)}
.htr-phase-win{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:700}
.htr-phase-obj{font-family:var(--serif);font-size:16px;font-weight:600;margin-top:5px}
.htr-phase-actions{list-style:none;padding:0;margin:12px 0 0;display:grid;gap:9px}
.htr-phase-actions li{font-size:13px;line-height:1.45}
.htr-phase-actions b{display:block;font-size:13.5px;margin-bottom:1px}
.htr-phase-meta{margin:14px 0 0;padding-top:12px;border-top:1px solid var(--line);display:grid;gap:8px}
.htr-phase-meta > div{display:grid;grid-template-columns:130px 1fr;gap:10px}
.htr-phase-meta dt{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--soft);font-weight:700}
.htr-phase-meta dd{margin:0;font-size:12.5px;color:var(--ink)}

.htr-xf{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.htr-xcard{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
.htr-xhead{display:flex;align-items:center;justify-content:space-between;gap:10px}
.htr-xprod{font-family:var(--serif);font-size:18px;font-weight:600}
.htr-xtype{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:99px;padding:2px 9px;border:1px solid var(--line);color:var(--soft)}
.htr-xout{font-size:14px;color:var(--ink);margin-top:8px;line-height:1.5}
.htr-xwhy{font-size:12.5px;color:var(--muted);margin-top:8px;line-height:1.45}
.htr-xmeta{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin:14px 0 0;padding-top:12px;border-top:1px solid var(--line)}
.htr-xmeta dt{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--soft);font-weight:700}
.htr-xmeta dd{margin:1px 0 0;font-size:12.5px;color:var(--ink)}

.htr-cta{background:linear-gradient(180deg,var(--navy),var(--navy2));color:#fff;border-radius:16px;padding:30px;text-align:center;margin-top:22px;border:1px solid var(--brass)}
.htr-cta h2{color:#fff;font-size:24px}
.htr-cta p{color:#c6d6e2;max-width:34em;margin:11px auto 20px;font-size:14.5px}
.htr-ctarow{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.htr-btn{display:inline-block;font-weight:700;font-size:14.5px;padding:13px 22px;border-radius:11px;text-decoration:none}
.htr-btn-primary{background:var(--brass);color:#20160a}
.htr-btn-ghost{background:transparent;color:#eaf1f6;border:1px solid rgba(255,255,255,.35)}
.htr-ctasub{color:#9fb6c6;font-size:11.5px;margin-top:12px}

.htr-foot{padding:22px 0 6px}
.htr-prov{font-family:var(--mono);font-size:11px;color:var(--soft);text-align:center;line-height:1.5}

@media (max-width:760px){
  .htr-cover{grid-template-columns:1fr}
  .htr-cover-score{justify-self:start}
  .htr-kpis{grid-template-columns:1fr}
  .htr-brief,.htr-fgrid,.htr-fsolve,.htr-timeline,.htr-xf,.htr-themes,.htr-scope{grid-template-columns:1fr}
  .htr-scrow{grid-template-columns:120px 1fr 52px;gap:10px}
}

/* Connected picture */
.htr-insight{font-family:var(--serif);font-size:18px;line-height:1.5;max-width:44em;margin:0 0 18px;color:var(--ink)}
.htr-themes{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.htr-theme{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;border-top:3px solid var(--accent)}
.htr-theme-name{font-family:var(--serif);font-size:16px;font-weight:600}
.htr-theme-sum{font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.45}
.htr-theme-find{margin:11px 0 0;padding-left:17px;font-size:13px;color:var(--ink);display:grid;gap:4px}
.htr-theme-sol{display:flex;gap:6px;flex-wrap:wrap;margin-top:11px}
.htr-theme-chip{font-size:11.5px;font-weight:600;color:var(--accent);background:#eef4f8;border-radius:7px;padding:3px 9px}

/* Beyond your website — transformation scope */
.htr-scope{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:6px}
.htr-scope-list{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:8px}
.htr-scope-list li{border-left:3px solid var(--line);padding:2px 0 2px 12px}
.htr-scope-list li b{display:block;font-size:13.5px;color:var(--ink)}
.htr-scope-list li span{font-size:12px;color:var(--muted)}
.htr-scope-done li{border-left-color:var(--good)}
.htr-scope-todo li{border-left-color:var(--brass)}

/* Why Herman Legacy + urgency */
.htr-why{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.htr-why li{position:relative;padding-left:22px;font-size:14px;line-height:1.5;color:var(--ink)}
.htr-why li::before{content:"";position:absolute;left:0;top:7px;width:9px;height:9px;border-radius:2px;background:var(--brass)}
.htr-begin{margin-top:18px;background:var(--paper);border:1px solid var(--line);border-left:4px solid var(--brass);border-radius:10px;padding:14px 16px}
.htr-begin p{margin:5px 0 0;font-size:14.5px;line-height:1.5;color:var(--ink);font-family:var(--serif)}

@media (max-width:760px){ .htr-why{grid-template-columns:1fr} }

@media print{
  .htr{font-size:11.5px}
  .htr-cta,.htr-btn{display:none !important}
  .htr *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .htr-sec,.htr-finding,.htr-phase,.htr-xcard,.htr-kpi,.htr-theme{break-inside:avoid}
  .htr-cover{break-inside:avoid}
}
@media (prefers-reduced-motion:reduce){ .htr-gauge-arc{transition:none} }
`;
