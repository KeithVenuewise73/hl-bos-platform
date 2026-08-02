import type { ReactNode, CSSProperties } from "react";

// Executive-intelligence workspace palette — dense, calm, evidence-first.
export const colors = {
  bg: "#0d1117",
  panel: "#161b22",
  border: "#232a33",
  text: "#e6edf3",
  dim: "#8b949e",
  accent: "#4493f8",
  good: "#3fb950",
  warn: "#d29922",
  bad: "#f85149",
};

export function Card({
  title,
  sub,
  children,
  right,
}: {
  title?: string;
  sub?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section
      style={{
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: 18,
        marginBottom: 16,
      }}
    >
      {title ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 10,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 15, color: colors.text }}>{title}</h2>
            {sub ? (
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: colors.dim }}>
                {sub}
              </p>
            ) : null}
          </div>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Grid({ children, min = 220 }: { children: ReactNode; min?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: `1px dashed ${colors.border}`,
        borderRadius: 10,
        padding: 20,
        color: colors.dim,
        fontSize: 13,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

const TONE: Record<string, string> = {
  good: colors.good,
  warn: colors.warn,
  bad: colors.bad,
  neutral: colors.dim,
  accent: colors.accent,
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  const c = TONE[tone] ?? colors.dim;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        color: c,
        border: `1px solid ${c}55`,
        background: `${c}18`,
        borderRadius: 999,
        padding: "2px 9px",
      }}
    >
      {children}
    </span>
  );
}

/** A quantitative claim always renders with its status — never a bare number. */
export function EstimateBadge({
  status,
}: {
  status: "measured" | "estimated" | "unknown";
}) {
  const tone =
    status === "measured" ? "good" : status === "estimated" ? "warn" : "neutral";
  const label =
    status === "measured" ? "measured" : status === "estimated" ? "est." : "no data";
  return <Badge tone={tone}>{label}</Badge>;
}

export function Bar({ pct, tone = colors.accent }: { pct: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      style={{
        background: "#0d1117",
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        height: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ width: `${clamped}%`, height: "100%", background: tone }} />
    </div>
  );
}

export function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 0",
        borderBottom: `1px solid ${colors.border}`,
        fontSize: 13,
      }}
    >
      <span style={{ color: colors.dim }}>{k}</span>
      <span style={{ color: colors.text, textAlign: "right" }}>{v}</span>
    </div>
  );
}

export const pageStyle: CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: "24px 20px",
};
