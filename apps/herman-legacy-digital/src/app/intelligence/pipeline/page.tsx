import Link from "next/link";
import { getInternalViewer } from "@/lib/session";
import {
  sampleEngagement,
  SAMPLE_BUSINESS,
  SAMPLE_INDUSTRY,
  ENGINE_VERSION,
} from "@/lib/bte-live";
import { BticShell, Panel, StatBox, Pill, Provenance } from "@/components/btic";
import { colors } from "@/components/ui";

export const dynamic = "force-dynamic";

// Portfolio-level BTE Pipeline view (matches the BTCC navigation). Renders the
// REAL, deterministic output of @hl-bos/bte-pipeline on its built-in illustrative
// sample — the presentation-layer proof of the BTDI -> BTE -> BTIC seam.
// Role-gated; defense in depth with the middleware + layout gate.

const STATE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  hld_review_required: { bg: "#f3f0e6", fg: "#7a5c00", label: "HLD review required" },
  approved: { bg: "#e7f4ec", fg: "#1a7f43", label: "Approved" },
  client_ready: { bg: "#e6f0f6", fg: "#1f5f8b", label: "Client ready" },
  failed: { bg: "#fbecec", fg: "#a3402f", label: "Failed" },
};

const CONFIDENCE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  verified: { bg: "#e7f4ec", fg: "#1a7f43", label: "Verified" },
  inferred: { bg: "#e6f0f6", fg: "#1f5f8b", label: "Inferred" },
  needs_confirmation: { bg: "#f3f0e6", fg: "#7a5c00", label: "Needs confirmation" },
  unavailable: { bg: "#fbecec", fg: "#a3402f", label: "Unavailable — gap" },
};

const EVIDENCE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  collected: { bg: "#e7f4ec", fg: "#1a7f43", label: "Collected" },
  blocked: { bg: "#fbecec", fg: "#a3402f", label: "Blocked" },
  unavailable: { bg: "#f2f3f5", fg: "#5b6672", label: "Unavailable" },
  client_supplied: { bg: "#f3f0e6", fg: "#7a5c00", label: "Client-supplied" },
  requires_human_review: { bg: "#f3f0e6", fg: "#7a5c00", label: "Needs review" },
};

function styleFor(
  map: Record<string, { bg: string; fg: string; label: string }>,
  key: string,
) {
  return map[key] ?? { bg: "#f2f3f5", fg: "#5b6672", label: key };
}

export default async function BtePipelinePage() {
  const viewer = await getInternalViewer();
  if (!viewer.canBTIC) {
    return (
      <BticShell email={null} title="BTE Pipeline" lede="Internal HLD workspace.">
        <p style={{ color: colors.MUTED }}>
          Please <Link href="/admin-login?next=/intelligence/pipeline">sign in</Link> to
          continue.
        </p>
      </BticShell>
    );
  }

  const r = await sampleEngagement();
  const st = styleFor(STATE_STYLE, r.state);
  const report = r.report;

  return (
    <BticShell
      email={viewer.email}
      title="Business Transformation Engine — Pipeline"
      lede="Live, deterministic output of the automated intake engine. This is a read view of what the engine produces for one submission."
    >
      {/* Honest framing banner */}
      <div
        style={{
          background: "#f3f0e6",
          border: "1px solid #e4d9b8",
          borderRadius: 10,
          padding: "12px 14px",
          marginBottom: 16,
          fontSize: 12.5,
          color: "#6b5300",
          lineHeight: 1.55,
        }}
      >
        <strong>Engine demonstration — illustrative sample.</strong> This runs the real
        engine on a built-in example ({SAMPLE_BUSINESS}, {SAMPLE_INDUSTRY}) — never a
        live client. Live client engagements will appear here once intake capture to the
        database is enabled (an additive migration, pending CEO approval). Nothing shown
        is fabricated: the run is deterministic and reproduced on demand.
      </div>

      <Panel>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "baseline",
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: colors.INK }}>
              {r.business}
            </div>
            <div style={{ fontSize: 12.5, color: colors.MUTED, marginTop: 2 }}>
              Submission {r.submissionRef} · {r.engagementId}
            </div>
          </div>
          <Pill bg={st.bg} fg={st.fg} label={st.label} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <StatBox label="Evidence records" value={String(r.evidence.length)} />
          <StatBox label="Findings" value={String(report?.findings.length ?? 0)} />
          <StatBox
            label="Report status"
            value={report ? report.status.replace(/_/g, " ") : "—"}
          />
          <StatBox
            label="Delivered to client"
            value={r.clientReportDelivered ? "yes" : "no"}
          />
        </div>
        <p style={{ fontSize: 13, color: colors.INK, marginTop: 12, lineHeight: 1.55 }}>
          <strong>Next action:</strong> {r.nextAction}
        </p>
      </Panel>

      {/* Processing timeline */}
      <Panel title="Processing timeline">
        <div style={{ display: "grid", gap: 8 }}>
          {r.timeline.map((t, i) => (
            <div
              key={`${t.state}-${i}`}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "baseline",
                borderBottom:
                  i < r.timeline.length - 1 ? `1px solid ${colors.LINE}` : "none",
                paddingBottom: 8,
              }}
            >
              <span
                style={{
                  fontFamily: "ui-monospace, Menlo, monospace",
                  fontSize: 11,
                  color: colors.MUTED,
                  minWidth: 168,
                }}
              >
                {t.state}
              </span>
              <span style={{ fontSize: 13, color: colors.INK }}>{t.note}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* Evidence */}
      <Panel title="Evidence — observed, and honestly not">
        <div style={{ display: "grid", gap: 10 }}>
          {r.evidence.map((e) => {
            const es = styleFor(EVIDENCE_STYLE, e.status);
            return (
              <div key={e.key} style={{ display: "grid", gap: 3 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <Pill bg={es.bg} fg={es.fg} label={es.label} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: colors.INK }}>
                    {e.label}
                  </span>
                </div>
                {e.detail ? (
                  <span style={{ fontSize: 12.5, color: colors.MUTED }}>
                    {e.detail}
                  </span>
                ) : null}
                <Provenance>{e.source}</Provenance>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Findings */}
      <Panel title="Findings — each with an explicit confidence">
        <div style={{ display: "grid", gap: 12 }}>
          {(report?.findings ?? []).map((f, i) => {
            const cs = styleFor(CONFIDENCE_STYLE, f.confidence);
            return (
              <div
                key={`${f.title}-${i}`}
                style={{
                  borderLeft: `3px solid ${cs.fg}`,
                  paddingLeft: 12,
                  display: "grid",
                  gap: 3,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <Pill bg={cs.bg} fg={cs.fg} label={cs.label} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: colors.INK }}>
                    {f.title}
                  </span>
                  <span style={{ fontSize: 11.5, color: colors.MUTED }}>
                    {f.category} · {f.severity}
                  </span>
                </div>
                <span style={{ fontSize: 12.5, color: colors.INK }}>
                  <strong>Impact:</strong> {f.businessImpact}
                </span>
                <span style={{ fontSize: 12.5, color: colors.MUTED }}>
                  <strong>Evidence:</strong> {f.evidence}
                </span>
                <Provenance>{f.provenance}</Provenance>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Draft report */}
      {report ? (
        <Panel
          title={`Draft report — v${report.version} · ${report.status.replace(/_/g, " ")}`}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <StatBox label="Verified" value={String(report.confidence.verified)} />
            <StatBox label="Inferred" value={String(report.confidence.inferred)} />
            <StatBox
              label="Needs confirm"
              value={String(report.confidence.needsConfirmation)}
            />
            <StatBox label="Gaps" value={String(report.confidence.unavailable)} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {report.sections.map((s) => (
              <div
                key={s.key}
                style={{ display: "flex", gap: 10, alignItems: "baseline" }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: s.hasData ? "#1a7f43" : "#a3402f",
                    minWidth: 64,
                  }}
                >
                  {s.hasData ? "has data" : "gap"}
                </span>
                <span style={{ fontSize: 13, color: colors.INK }}>{s.title}</span>
              </div>
            ))}
          </div>
          <p
            style={{ fontSize: 11.5, color: "#98a2b0", marginTop: 12, lineHeight: 1.6 }}
          >
            This report is <strong>{report.status.replace(/_/g, " ")}</strong> and is
            never delivered to the client automatically. Client acknowledgment is{" "}
            <strong>{r.acknowledgment?.outcome ?? "not attempted"}</strong> (email
            transport is CEO-gated); the full report is not attached
            {r.acknowledgment ? " (fullReportIncluded: false)" : ""}.
          </p>
        </Panel>
      ) : null}

      <p style={{ fontSize: 12, color: "#98a2b0", marginTop: 18, lineHeight: 1.6 }}>
        <Link href="/intelligence" style={{ color: colors.ACCENT }}>
          ← Back to Executive Home
        </Link>{" "}
        · Engine {ENGINE_VERSION}. Deterministic read view; no data is written and no
        message is sent.
      </p>
    </BticShell>
  );
}
