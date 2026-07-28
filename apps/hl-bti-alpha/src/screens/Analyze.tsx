"use client";

import { useState } from "react";
import { analyst, type consulting } from "@hl-bos/bti-engine";
import { INDUSTRY_PACKS } from "@hl-bos/bti-engine";
import { Card, Badge, EmptyState, Field, scoreColor } from "@/components/ui";

type Analysis = ReturnType<typeof analyst.analyzeBusiness>;
type Finding = consulting.Finding;

// The ONE seamless workflow (EO-001): enter a business + website → Analyze →
// understanding → findings → Herman Legacy recommendations → blueprint → proposal.
// The consultant enters no scores; HL-BTI performs the analysis by orchestrating
// the website extractor + the consulting framework.
export default function Analyze() {
  const [name, setName] = useState(analyst.SAMPLE_BUSINESS.name);
  const [website, setWebsite] = useState(analyst.SAMPLE_BUSINESS.website);
  const [industry, setIndustry] = useState(analyst.SAMPLE_BUSINESS.industry);
  const [location, setLocation] = useState(analyst.SAMPLE_BUSINESS.location);
  const [html, setHtml] = useState(analyst.SAMPLE_HTML);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);

  function run() {
    setBusy(true);
    // Synchronous engine; the tiny delay lets the "analyzing" state paint.
    setTimeout(() => {
      const locationValue = location.trim();
      setAnalysis(
        analyst.analyzeBusiness({
          name: name.trim(),
          website: website.trim(),
          industry,
          html,
          ...(locationValue ? { location: locationValue } : {}),
        }),
      );
      setBusy(false);
    }, 350);
  }

  return (
    <div className="content">
      <div className="page-head">
        <h1>Analyze a Business</h1>
        <p>
          Enter a business and its website. HL-BTI performs the analysis — you review
          and present.
        </p>
      </div>

      {/* Step 1 — intake */}
      <Card title="1 · Business">
        <div className="grid cols-4" style={{ gap: 12 }}>
          <Field label="Business name">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Website">
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </Field>
          <Field label="Industry">
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              {INDUSTRY_PACKS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
        </div>
        <details style={{ marginTop: 6 }}>
          <summary className="dim" style={{ fontSize: 12.5, cursor: "pointer" }}>
            Website content (auto-filled with a demo site; paste the customer&rsquo;s
            homepage HTML for a live analysis)
          </summary>
          <textarea
            style={{
              marginTop: 8,
              minHeight: 120,
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
            }}
            value={html}
            onChange={(e) => setHtml(e.target.value)}
          />
        </details>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="btn primary"
            onClick={run}
            disabled={busy || !name.trim() || !html.trim()}
          >
            {busy ? "Analyzing…" : "⚡ Analyze Business"}
          </button>
          {analysis && (
            <button
              className="btn"
              onClick={() => typeof window !== "undefined" && window.print()}
            >
              🖨 Export Blueprint + Proposal
            </button>
          )}
        </div>
      </Card>

      {busy && (
        <Card>
          <div className="row" style={{ gap: 10 }}>
            <span className="dim">
              Discovering the website, collecting evidence, and analyzing…
            </span>
          </div>
        </Card>
      )}

      {!analysis && !busy && (
        <div style={{ marginTop: 16 }}>
          <EmptyState icon="⚡" title="Ready to analyze">
            Click <strong>Analyze Business</strong> to run discovery and produce a full
            Executive Blueprint.
          </EmptyState>
        </div>
      )}

      {analysis && !busy && <Result analysis={analysis} />}
    </div>
  );
}

function roiBand(priority: string): "High" | "Medium" | "Low" {
  if (priority === "critical") return "High";
  if (priority === "high") return "High";
  if (priority === "medium") return "Medium";
  return "Low";
}

function Result({ analysis }: { analysis: Analysis }) {
  const { report } = analysis;
  const t = report.transformationScore;

  return (
    <>
      {/* Step 2/3 — Business Intelligence Profile */}
      <div className="section-title">
        2 · Business Intelligence Profile — what HL-BTI understands
      </div>
      <Card>
        <div className="grid cols-2" style={{ gap: 10 }}>
          {analysis.profile.map((o, i) => (
            <div
              key={i}
              className="li"
              style={{ alignItems: "flex-start", flexDirection: "column" }}
            >
              <strong>{o.label}</strong>
              <span style={{ fontSize: 13.5 }}>{o.detail}</span>
              <span className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                Evidence: {o.evidence}
              </span>
            </div>
          ))}
        </div>
        <div className="banner" style={{ marginTop: 12 }}>
          ℹ {analysis.coverageNote}
        </div>
      </Card>

      {/* Step 4/5/6 — Findings */}
      <div className="section-title">3 · Findings & Herman Legacy Recommendations</div>
      <div className="list">
        {report.findings.map((f: Finding, i: number) => {
          const confidence = report.review[i]?.confidence ?? "moderate";
          return (
            <Card key={f.dimension}>
              <div className="row spread">
                <strong style={{ fontSize: 15 }}>{f.label}</strong>
                <div className="row">
                  <Badge
                    kind={
                      f.priority === "critical"
                        ? "danger"
                        : f.priority === "high"
                          ? "warn"
                          : undefined
                    }
                  >
                    {f.priority}
                  </Badge>
                  <Badge
                    kind={
                      confidence === "high"
                        ? "ok"
                        : confidence === "low"
                          ? "danger"
                          : undefined
                    }
                  >
                    confidence: {confidence}
                  </Badge>
                  <Badge kind="info">Est. ROI: {roiBand(f.priority)}</Badge>
                </div>
              </div>
              <table className="tbl" style={{ marginTop: 8 }}>
                <tbody>
                  <tr>
                    <td className="dim" style={{ width: 150 }}>
                      Evidence
                    </td>
                    <td>
                      {f.supportingEvidence.map((e, j) => (
                        <div key={j}>{e}</div>
                      ))}
                    </td>
                  </tr>
                  <tr>
                    <td className="dim">Business Impact</td>
                    <td>{f.businessImpact}</td>
                  </tr>
                  <tr>
                    <td className="dim">Root Cause</td>
                    <td>{f.rootCause}</td>
                  </tr>
                  <tr>
                    <td className="dim">Recommended action</td>
                    <td>{f.recommendedAction}</td>
                  </tr>
                  <tr>
                    <td className="dim">Herman Legacy solution</td>
                    <td>
                      {f.services.map((s) => (
                        <Badge key={s} kind="ok">
                          {s}
                        </Badge>
                      ))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>

      {/* Step 7 — Executive Blueprint */}
      <div className="section-title">
        4 · Executive Business Transformation Blueprint
      </div>
      <Card>
        <div className="row spread">
          <div
            className="dim"
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Business Transformation Blueprint
          </div>
          {t !== null && (
            <div
              style={{ fontWeight: 700, color: scoreColor(t) }}
              title="internal composite"
            >
              Composite {t}/100
            </div>
          )}
        </div>
        <h2 style={{ fontSize: 22, marginTop: 4 }}>{analysis.business.name}</h2>
        <div style={{ marginTop: 12 }}>
          {report.narrative
            .filter((s) => s.hasData)
            .map((s) => (
              <div key={s.key} style={{ marginBottom: 12 }}>
                <strong>{s.title}</strong>
                <div style={{ fontSize: 13.5, marginTop: 2 }}>{s.body}</div>
              </div>
            ))}
        </div>
        <div className="section-title">Recommended Herman Legacy Services</div>
        <div className="row" style={{ gap: 8 }}>
          {[...new Set(analysis.proposal.recommendedServices)].map((s) => (
            <Badge key={s} kind="ok">
              {s}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Step 8 — Proposal */}
      <div className="section-title">5 · Proposal</div>
      <Card title={`Proposal — ${analysis.business.name}`}>
        <p style={{ fontSize: 13.5 }}>
          A Business Transformation engagement for{" "}
          <strong>{analysis.business.name}</strong>, delivering the Herman Legacy
          services below — sequenced from the evidence-backed findings above.
        </p>
        <table className="tbl" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Herman Legacy service</th>
              <th>Type</th>
              <th>Addresses</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {analysis.proposal.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <strong>{l.service}</strong>
                </td>
                <td>
                  <Badge kind={l.type === "recurring" ? "info" : undefined}>
                    {l.type === "recurring" ? "Monthly" : "One-time"}
                  </Badge>
                </td>
                <td className="dim">{l.supportedBy.slice(0, 3).join(", ")}</td>
                <td className="dim">TBD</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="banner" style={{ marginTop: 10 }}>
          💡 Pricing is a CEO decision — set it before sending. HL-BTI never invents a
          price.
        </div>
      </Card>
    </>
  );
}
