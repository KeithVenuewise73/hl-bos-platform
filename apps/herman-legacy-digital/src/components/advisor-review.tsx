/**
 * Executive Review — a PREVIEW workflow over the Advisor's recommendations.
 *
 * This lets an executive walk the review motion — mark a recommendation Accepted,
 * Deferred, Rejected, or Completed — BEFORE any of it becomes real transformation
 * work. It is deliberately UI-only for V1, and it is implemented WITHOUT client
 * JavaScript on purpose:
 *
 *   - This app ships a strict CSP (`script-src 'self'`) and no client hydration —
 *     it is entirely server-rendered. A React state toggle would be a control that
 *     does nothing in production, which the operating contract forbids. So the
 *     status selector is a native radio group styled with `:checked` CSS: it works
 *     under the existing CSP with zero JavaScript.
 *   - Because there is no script, there is nothing to persist and nothing to send.
 *     The selection lives only in the rendered page; a reload returns every card to
 *     NEW. There is no table, no API, no migration.
 *   - The underlying recommendation is never mutated. Provenance, confidence,
 *     supporting evidence, transformation phase, and business impact are rendered
 *     exactly as derived.
 *
 * When persistence is designed (its own additive migration, CEO-gated), this same
 * control can be wired to a form action without changing the derivation beneath it.
 */

import type { Recommendation, Priority, Effort } from "@/lib/executive-advisor";
import { REVIEW_STATUSES } from "@/lib/review-status";
import { Pill } from "@/components/btic";
import { colors } from "@/components/ui";

const PRIORITY_STYLE: Record<Priority, { bg: string; fg: string; label: string }> = {
  critical: { bg: "#fbecec", fg: "#a3402f", label: "Critical" },
  high: { bg: "#f3e9e0", fg: "#9a5b1f", label: "High" },
  medium: { bg: "#e6f0f6", fg: "#1f5f8b", label: "Medium" },
  informational: { bg: "#f2f3f5", fg: "#5b6672", label: "Informational" },
};

const CONFIDENCE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  verified: { bg: "#e7f4ec", fg: "#1a7f43", label: "Verified" },
  reported: { bg: "#f3f0e6", fg: "#7a5c00", label: "Reported" },
  derived: { bg: "#e6f0f6", fg: "#1f5f8b", label: "Derived" },
  unknown: { bg: "#fbecec", fg: "#a3402f", label: "Gap — unknown" },
};

const EFFORT_LABEL: Record<Effort, string> = {
  owner_decision: "Owner decision (no engineering)",
  low: "Low",
  medium: "Medium",
  high: "High",
  unknown: "Unknown — not sized",
};

// The one <style> block for the review control. Inline styles cannot express the
// `:checked + label` relationship, and this app's CSP allows inline <style>
// (style-src 'unsafe-inline'). Scoped by the `rv-` prefix.
const REVIEW_CSS = `
.rv-group { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.rv-input { position:absolute; width:1px; height:1px; opacity:0; margin:0; }
.rv-seg {
  display:inline-block; font-size:11.5px; font-weight:600; line-height:1.4;
  padding:3px 10px; border-radius:999px; border:1px solid ${colors.LINE};
  background:#fff; color:${colors.MUTED}; cursor:pointer; user-select:none;
}
.rv-seg:hover { border-color:#9aa2ab; }
.rv-input:focus-visible + .rv-seg { outline:2px solid #1f5f8b; outline-offset:1px; }
.rv-NEW:checked + .rv-seg       { background:#eef1f4; color:#5b6672; border-color:#5b6672; }
.rv-Accepted:checked + .rv-seg  { background:#e7f4ec; color:#1a7f43; border-color:#1a7f43; }
.rv-Deferred:checked + .rv-seg  { background:#f3f0e6; color:#7a5c00; border-color:#7a5c00; }
.rv-Rejected:checked + .rv-seg  { background:#fbecec; color:#a3402f; border-color:#a3402f; }
.rv-Completed:checked + .rv-seg { background:#e6f0f6; color:#1f5f8b; border-color:#1f5f8b; }
`;

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
      <span style={{ color: colors.MUTED, minWidth: 118, fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ color: colors.INK }}>{value}</span>
    </div>
  );
}

function ReviewControl({ id }: { id: string }) {
  return (
    <div className="rv-group" role="radiogroup" aria-label="Executive review status">
      {REVIEW_STATUSES.map((s) => {
        const inputId = `rv-${id}-${s}`;
        return (
          <span key={s} style={{ display: "inline-flex" }}>
            <input
              type="radio"
              className={`rv-input rv-${s}`}
              name={`rv-${id}`}
              id={inputId}
              defaultChecked={s === "NEW"}
            />
            <label className="rv-seg" htmlFor={inputId}>
              {s}
            </label>
          </span>
        );
      })}
    </div>
  );
}

function ReviewCard({ r, index }: { r: Recommendation; index: number }) {
  const ps = PRIORITY_STYLE[r.priority];
  const cs = CONFIDENCE_STYLE[r.confidence] ?? CONFIDENCE_STYLE["derived"]!;
  return (
    <div
      style={{
        border: `1px solid ${colors.LINE}`,
        borderLeft: `3px solid ${ps.fg}`,
        borderRadius: 10,
        padding: 14,
        background: "#fff",
      }}
    >
      <div
        style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}
      >
        <span style={{ fontSize: 12, color: colors.MUTED, fontWeight: 700 }}>
          {index + 1}
        </span>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: colors.INK }}>
          {r.title}
        </span>
        <Pill bg={ps.bg} fg={ps.fg} label={ps.label} />
        <Pill bg={cs.bg} fg={cs.fg} label={cs.label} />
      </div>

      <p style={{ fontSize: 13, color: colors.INK, lineHeight: 1.55, margin: "8px 0" }}>
        {r.rationale}
      </p>

      <div style={{ display: "grid", gap: 3, marginTop: 8 }}>
        <MetaRow label="Business impact" value={r.businessImpact} />
        <MetaRow label="Estimated effort" value={EFFORT_LABEL[r.estimatedEffort]} />
        <MetaRow label="Effort basis" value={r.effortBasis} />
        <MetaRow label="BTIC section" value={r.relatedBticSection} />
        <MetaRow label="Transformation phase" value={r.relatedPhase} />
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11.5, color: colors.MUTED, fontWeight: 600 }}>
          Supporting evidence
        </div>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {r.supportingEvidence.map((e, i) => (
            <li
              key={i}
              style={{
                fontSize: 11.5,
                color: "#7c8794",
                marginBottom: 2,
                lineHeight: 1.5,
              }}
            >
              {e}
            </li>
          ))}
        </ul>
      </div>

      {/* Review control — native radios, styled with CSS. UI-only, not persisted. */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px dashed ${colors.LINE}`,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11.5, color: colors.MUTED, fontWeight: 600 }}>
          Executive review
        </span>
        <ReviewControl id={r.id} />
      </div>
    </div>
  );
}

export function AdvisorReview({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: REVIEW_CSS }} />

      {/* Preview banner — honest about what this is and is not */}
      <div
        style={{
          background: "#f3f0e6",
          border: "1px solid #e4d9b8",
          borderRadius: 10,
          padding: "10px 12px",
          marginBottom: 12,
          fontSize: 12,
          color: "#6b5300",
          lineHeight: 1.55,
        }}
      >
        <strong>Preview Workflow — not yet persisted.</strong> Marking a recommendation
        Accepted / Deferred / Rejected / Completed shows how an executive would review
        it before it becomes approved transformation work. The selection lives only on
        this rendered page — it is not saved, not shared, and resets on refresh. The
        recommendation itself is unchanged: it stays a pure derivation from evidence.
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {recommendations.map((r, i) => (
          <ReviewCard key={r.id} r={r} index={i} />
        ))}
      </div>
    </div>
  );
}
