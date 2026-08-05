import Link from "next/link";
import type { ReactNode } from "react";
import { colors } from "@/components/ui";
import type { Confidence, PhaseStatus, ReportStatus } from "@/lib/btic-data";

/**
 * Shared shell + primitives for the Business Transformation Intelligence Center.
 * Internal executive workspace — same restrained palette as the rest of HLD, its
 * own header (no marketing nav), and a clear "Internal" marker so it can never be
 * mistaken for a public page. Inline styles only (CSP-safe).
 */

const INTERNAL = "#7a4d00"; // amber ink for the internal marker

export function BticShell({
  email,
  title,
  lede,
  breadcrumb,
  children,
}: {
  email: string | null;
  title: string;
  lede: string;
  breadcrumb?: { label: string; href: string }[];
  children: ReactNode;
}) {
  return (
    <div style={{ background: colors.PAPER, minHeight: "100vh", color: colors.INK }}>
      <header style={{ borderBottom: `1px solid ${colors.LINE}`, background: "#fff" }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "12px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              href="/intelligence"
              style={{ fontWeight: 700, color: colors.INK, textDecoration: "none" }}
            >
              HLD <span style={{ color: colors.ACCENT }}>Intelligence Center</span>
            </Link>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: INTERNAL,
                border: `1px solid ${INTERNAL}`,
                borderRadius: 999,
                padding: "1px 8px",
              }}
            >
              Internal
            </span>
          </div>
          <div
            style={{ fontSize: 12.5, color: colors.MUTED, display: "flex", gap: 14 }}
          >
            {email ? <span>{email}</span> : null}
            <Link href="/logout" style={{ color: colors.ACCENT }}>
              Sign out
            </Link>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 56px" }}>
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav style={{ fontSize: 12, color: colors.MUTED, marginBottom: 12 }}>
            {breadcrumb.map((b, i) => (
              <span key={b.href}>
                {i > 0 ? <span style={{ margin: "0 6px" }}>/</span> : null}
                <Link href={b.href} style={{ color: colors.MUTED }}>
                  {b.label}
                </Link>
              </span>
            ))}
          </nav>
        ) : null}
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>{title}</h1>
        <p style={{ fontSize: 13.5, color: colors.MUTED, marginTop: 0, maxWidth: 760 }}>
          {lede}
        </p>
        {children}
      </main>
    </div>
  );
}

export function DossierNav({ base, active }: { base: string; active: string }) {
  const items = [
    { id: "overview", label: "Overview", href: base },
    { id: "timeline", label: "Timeline", href: `${base}/timeline` },
    { id: "reports", label: "Reports", href: `${base}/reports` },
    { id: "decisions", label: "Decisions", href: `${base}/decisions` },
    { id: "artifacts", label: "Artifacts", href: `${base}/artifacts` },
    { id: "intelligence", label: "Intelligence", href: `${base}/intelligence` },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        margin: "6px 0 20px",
        borderBottom: `1px solid ${colors.LINE}`,
        paddingBottom: 10,
      }}
    >
      {items.map((it) => {
        const on = it.id === active;
        return (
          <Link
            key={it.id}
            href={it.href}
            style={{
              fontSize: 13,
              textDecoration: "none",
              padding: "5px 12px",
              borderRadius: 999,
              color: on ? "#fff" : colors.MUTED,
              background: on ? colors.ACCENT : "transparent",
              border: `1px solid ${on ? colors.ACCENT : colors.LINE}`,
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${colors.LINE}`,
        borderRadius: 12,
        padding: 18,
      }}
    >
      {title ? (
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{title}</div>
      ) : null}
      {children}
    </div>
  );
}

export function Provenance({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "#98a2b0",
        marginTop: 8,
        borderTop: `1px dashed ${colors.LINE}`,
        paddingTop: 6,
      }}
    >
      <span style={{ fontWeight: 600 }}>Source:</span> {children}
    </div>
  );
}

const REPORT_STATUS_STYLE: Record<ReportStatus, { bg: string; fg: string }> = {
  approved: { bg: "#e7f4ec", fg: "#1a7f43" },
  current: { bg: "#e6f0f6", fg: "#1f5f8b" },
  draft: { bg: "#f3f0e6", fg: "#7a5c00" },
  superseded: { bg: "#f2f3f5", fg: "#5b6672" },
  archived: { bg: "#f2f3f5", fg: "#8a929c" },
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const s = REPORT_STATUS_STYLE[status];
  const label =
    status === "current" ? "Current truth" : status[0]!.toUpperCase() + status.slice(1);
  return <Pill bg={s.bg} fg={s.fg} label={label} />;
}

const PHASE_STATUS_STYLE: Record<
  PhaseStatus,
  { bg: string; fg: string; label: string }
> = {
  complete: { bg: "#e7f4ec", fg: "#1a7f43", label: "Complete" },
  in_progress: { bg: "#e6f0f6", fg: "#1f5f8b", label: "In progress" },
  not_started: { bg: "#f2f3f5", fg: "#8a929c", label: "Not started" },
};

export function PhaseStatusBadge({ status }: { status: PhaseStatus }) {
  const s = PHASE_STATUS_STYLE[status];
  return <Pill bg={s.bg} fg={s.fg} label={s.label} />;
}

const CONFIDENCE_STYLE: Record<Confidence, { bg: string; fg: string; label: string }> =
  {
    verified: { bg: "#e7f4ec", fg: "#1a7f43", label: "Verified" },
    reported: { bg: "#f3f0e6", fg: "#7a5c00", label: "Reported" },
    unknown: { bg: "#fbecec", fg: "#a3402f", label: "Unknown — gap" },
  };

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const s = CONFIDENCE_STYLE[confidence];
  return <Pill bg={s.bg} fg={s.fg} label={s.label} />;
}

export function Pill({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        color: fg,
        background: bg,
        borderRadius: 999,
        padding: "2px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${colors.LINE}`,
        borderRadius: 10,
        padding: "12px 14px",
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: colors.MUTED }}>{label}</div>
    </div>
  );
}
