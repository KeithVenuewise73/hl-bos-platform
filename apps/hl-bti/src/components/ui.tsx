import type { ReactNode } from "react";

export function scoreColor(score: number | null): string {
  if (score === null) return "var(--text-3)";
  if (score >= 70) return "var(--ok)";
  if (score >= 55) return "var(--warn)";
  return "var(--danger)";
}

export function scoreWord(score: number | null): string {
  if (score === null) return "Not scored";
  if (score >= 80) return "Strong";
  if (score >= 70) return "Healthy";
  if (score >= 55) return "Developing";
  if (score >= 40) return "At risk";
  return "Critical";
}

export function Card({
  children,
  title,
  action,
}: {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card">
      {(title || action) && (
        <div className="card-title">
          {title ? <h3>{title}</h3> : <span />}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub !== undefined && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Badge({
  children,
  kind,
}: {
  children: ReactNode;
  kind?: "ok" | "warn" | "danger" | "info" | "demo" | undefined;
}) {
  return <span className={`badge${kind ? " " + kind : ""}`}>{children}</span>;
}

export function ScoreBar({ score }: { score: number | null }) {
  return (
    <div
      className="scorebar"
      aria-label={score === null ? "not scored" : `${score} of 100`}
    >
      <span style={{ width: `${score ?? 0}%`, background: scoreColor(score) }} />
    </div>
  );
}

export function Progress({ pct }: { pct: number }) {
  return (
    <div className="progress">
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function ScoreRing({ score, label }: { score: number | null; label?: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const pct = score ?? 0;
  const dash = (pct / 100) * c;
  const color = scoreColor(score);
  return (
    <div className="ring">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth="8"
        />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="ring-num" style={{ color }}>
        {score === null ? "—" : score}
      </div>
      {label && <div className="ring-lbl">{label}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="big">{icon}</div>}
      <div style={{ fontWeight: 600, marginTop: 6 }}>{title}</div>
      {children && <div style={{ marginTop: 6, fontSize: 13.5 }}>{children}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </label>
  );
}
