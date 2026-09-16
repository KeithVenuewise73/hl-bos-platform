import type { ReactNode } from "react";
import type { MatchStatus, ValidationStatus } from "@hl-bos/ats-resume";

/**
 * Shared presentation pieces.
 *
 * The status vocabulary lives here rather than in each page, so "Strong match"
 * looks and reads the same everywhere it appears. Every status shows a WORD as
 * well as a colour — colour on its own is not a signal for a colour-blind user,
 * and this app's statuses are the difference between a truthful resume and a
 * flagged one.
 */

export function Card({
  title,
  sub,
  right,
  children,
}: {
  title?: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {title === undefined && right === undefined ? null : (
        <div className="card-head">
          <div>
            {title === undefined ? null : <h2>{title}</h2>}
            {sub === undefined ? null : <p className="card-sub">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHead({
  title,
  lead,
  action,
}: {
  title: string;
  lead?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {lead === undefined ? null : <p>{lead}</p>}
      </div>
      {action}
    </header>
  );
}

export function Stat({
  value,
  label,
  note,
}: {
  value: ReactNode;
  label: string;
  note?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {note === undefined ? null : <div className="stat-note">{note}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "danger" | "sample";
  children: ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "notice notice-warn"
      : tone === "danger"
        ? "notice notice-danger"
        : tone === "sample"
          ? "notice notice-sample"
          : "notice";
  return <div className={cls}>{children}</div>;
}

const MATCH_LABELS: Record<MatchStatus, { label: string; cls: string }> = {
  strong_match: { label: "Strong match", cls: "tag tag-strong" },
  partial_match: { label: "Partial match", cls: "tag tag-partial" },
  terminology_match: { label: "Terminology match", cls: "tag tag-accent" },
  not_evidenced: { label: "Not evidenced", cls: "tag tag-missing" },
};

export function MatchTag({ status }: { status: MatchStatus }) {
  const { label, cls } = MATCH_LABELS[status];
  return <span className={cls}>{label}</span>;
}

const VALIDATION_LABELS: Record<ValidationStatus, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "tag tag-strong" },
  user_confirmed: { label: "You confirmed", cls: "tag tag-strong" },
  needs_confirmation: { label: "Needs confirmation", cls: "tag tag-confirm" },
  unsupported: { label: "Unsupported", cls: "tag tag-missing" },
};

export function ValidationTag({ status }: { status: ValidationStatus }) {
  const { label, cls } = VALIDATION_LABELS[status];
  return <span className={cls}>{label}</span>;
}

export function ImportanceTag({ importance }: { importance: string }) {
  const cls =
    importance === "critical"
      ? "tag tag-missing"
      : importance === "important"
        ? "tag tag-partial"
        : "tag tag-neutral";
  return <span className={cls}>{importance}</span>;
}

export function SampleTag() {
  return <span className="tag tag-confirm">Sample data</span>;
}

export function Meter({ value, max = 100 }: { value: number; max?: number }) {
  const pct = max === 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter" role="img" aria-label={`${value.toFixed(1)} out of ${max}`}>
      <div className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MeterRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="meter-row">
        <span>{label}</span>
        <span className="mono nowrap">
          {value.toFixed(1)} / {max}
        </span>
      </div>
      <Meter value={value} max={max} />
    </div>
  );
}

/**
 * The disclosure that makes a generated sentence auditable: where it came
 * from, what it answers, and why it was worded that way.
 */
export function Audit({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="audit">
      <summary>{summary}</summary>
      <div className="audit-body">{children}</div>
    </details>
  );
}
