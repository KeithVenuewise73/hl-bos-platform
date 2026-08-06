"use client";

import type { CSSProperties, ReactNode } from "react";
import type {
  ReportFinding,
  TransformationReportView,
} from "@/lib/scan/report-model";

// The Transformation Report — an interactive executive briefing (NOT a PDF, NOT
// a dashboard). Every value shown traces to the analysis engine; nothing is
// invented. The closing block is the transition into the recurring-revenue
// platform via the single "Build My Transformation Blueprint" action.

const INK = "#0f1720";
const PAPER = "#f7f8fa";
const LINE = "#e4e7ec";
const MUTED = "#5b6672";
const ACCENT = "#1f5f8b";

const PRIORITY_COLOR: Record<string, string> = {
  critical: "#b42318",
  high: "#b54708",
  medium: "#1f5f8b",
  low: "#5b6672",
};

const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${LINE}`,
  borderRadius: 12,
  padding: 20,
};

const label: CSSProperties = {
  fontSize: 11,
  color: MUTED,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  fontWeight: 600,
};

function Row({ label: l, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={label}>{l}</div>
      <div style={{ fontSize: 13.5, color: INK, lineHeight: 1.5, marginTop: 2 }}>{children}</div>
    </div>
  );
}

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        color,
        border: `1px solid ${color}`,
        borderRadius: 999,
        padding: "2px 9px",
      }}
    >
      {text}
    </span>
  );
}

function StageStrip({ report }: { report: TransformationReportView }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        fontSize: 12,
        color: MUTED,
      }}
    >
      {report.stages.map((s, i) => {
        const isActive = s.status === "active";
        const done = s.status === "done";
        return (
          <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                border: `1px solid ${isActive ? ACCENT : LINE}`,
                background: isActive ? ACCENT : done ? "#eef2f5" : "#fff",
                color: isActive ? "#fff" : done ? INK : MUTED,
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {s.title}
            </span>
            {i < report.stages.length - 1 ? <span style={{ color: LINE }}>→</span> : null}
          </span>
        );
      })}
    </div>
  );
}

function ScoreBlock({ report }: { report: TransformationReportView }) {
  return (
    <div style={{ ...card, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ minWidth: 120 }}>
        <div style={{ fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Transformation Score
        </div>
        {report.score === null ? (
          <div style={{ fontSize: 20, fontWeight: 600, color: MUTED, marginTop: 4 }}>
            Not scored
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 44, fontWeight: 700, color: INK, lineHeight: 1 }}>
              {report.score}
            </span>
            <span style={{ fontSize: 16, color: MUTED }}>/ 100</span>
          </div>
        )}
        {report.scoreBand ? (
          <div style={{ marginTop: 8 }}>
            <Pill text={report.scoreBand} color={ACCENT} />
          </div>
        ) : null}
      </div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: INK, lineHeight: 1.35 }}>
          {report.headline}
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>{report.timelineSummary}</div>
      </div>
    </div>
  );
}

function FindingCard({ f }: { f: ReportFinding }) {
  const color = PRIORITY_COLOR[f.priority] ?? MUTED;
  return (
    <div style={{ ...card, borderLeft: `4px solid ${color}` }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <Pill text={f.priority} color={color} />
        <span style={{ fontSize: 12, color: MUTED }}>{f.dimension}</span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: MUTED }}>
          Confidence: <strong style={{ color: INK }}>{f.confidence}</strong>
        </span>
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 600, color: INK, lineHeight: 1.4 }}>
        {f.title}
      </div>

      <Row label="Business impact">{f.businessImpact}</Row>
      <Row label="Why it matters">{f.whyItMatters}</Row>
      {f.opportunity ? <Row label="Opportunity">{f.opportunity}</Row> : null}

      {f.evidence.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div style={label}>Evidence from your site</div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13, color: INK }}>
            {f.evidence.map((e, i) => (
              <li key={i} style={{ marginBottom: 2 }}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Row label="Recommended action">{f.recommendedAction}</Row>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: 12.5, color: MUTED }}>
        <span>Timeline: <strong style={{ color: INK }}>{f.timeline}</strong></span>
        <span>Effort: <strong style={{ color: INK }}>{f.difficulty}</strong></span>
      </div>

      {f.solutions.length > 0 ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
          <div style={label}>Herman Legacy solution</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {f.solutions.map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: ACCENT,
                  background: "#eef4f8",
                  borderRadius: 8,
                  padding: "4px 10px",
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClosingBlock({ report }: { report: TransformationReportView }) {
  return (
    <div style={{ ...card, background: INK, color: "#fff", borderColor: INK }}>
      <div style={{ fontSize: 12, color: "#9fb3c2", textTransform: "uppercase", letterSpacing: 0.4 }}>
        Recommended transformations
      </div>

      {report.recommendedTransformations.length > 0 ? (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {report.recommendedTransformations.map((r) => (
            <div
              key={r.product}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                background: "rgba(255,255,255,0.06)",
                borderRadius: 9,
                padding: "10px 14px",
              }}
            >
              <span style={{ fontWeight: 600 }}>{r.product}</span>
              <span style={{ fontSize: 11.5, color: "#9fb3c2" }}>
                {r.type === "recurring" ? "Ongoing" : "One-time"} · {r.supportedBy.length} finding
                {r.supportedBy.length === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#c7d3dc", marginTop: 8 }}>
          No product transformations were triggered by this scan.
        </div>
      )}

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 18 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: "#9fb3c2", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Estimated ROI
          </div>
          {report.roi.quantified ? (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>
              {report.roi.lines
                .filter((l) => l.value !== null)
                .map((l) => (
                  <li key={l.label}>
                    {l.label}: {l.value} {l.unit}
                  </li>
                ))}
            </ul>
          ) : (
            <div style={{ fontSize: 13, color: "#c7d3dc", marginTop: 6 }}>{report.roi.note}</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: "#9fb3c2", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Estimated timeline
          </div>
          <div style={{ fontSize: 13, color: "#e7edf1", marginTop: 6 }}>{report.timelineSummary}</div>
        </div>
      </div>

      <a
        href={report.next.href}
        style={{
          display: "inline-block",
          marginTop: 20,
          background: "#fff",
          color: INK,
          fontWeight: 700,
          fontSize: 15,
          padding: "13px 22px",
          borderRadius: 10,
          textDecoration: "none",
        }}
      >
        {report.next.cta} →
      </a>
      <div style={{ fontSize: 11.5, color: "#9fb3c2", marginTop: 10 }}>
        Turns this free analysis into your prioritized 30-day, 90-day, and 12-month plan.
      </div>
    </div>
  );
}

export function ReportView({ report }: { report: TransformationReportView }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <StageStrip report={report} />

      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: INK }}>{report.business.name}</div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
          {report.business.website}
          {report.business.location ? ` · ${report.business.location}` : ""}
        </div>
      </div>

      <ScoreBlock report={report} />

      <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4 }}>
        Findings ({report.findings.length})
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {report.findings.map((f) => (
          <FindingCard key={f.id} f={f} />
        ))}
      </div>

      <ClosingBlock report={report} />

      <div style={{ ...card, background: PAPER }}>
        <div style={label}>What this scan could not see</div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>
          {report.coverageNote}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: MUTED, textAlign: "center" }}>
        Generated by {report.meta.engineVersion} · {report.meta.dimensionsRated} dimensions rated ·{" "}
        {report.meta.factCount} facts, {report.meta.inferenceCount} inferences,{" "}
        {report.meta.opinionCount} opinions · deterministic, evidence-based, nothing fabricated.
      </div>
    </div>
  );
}
