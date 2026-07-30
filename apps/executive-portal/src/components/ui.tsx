import type { ReactNode } from "react";

export type Health = "green" | "yellow" | "red" | "unknown";
export const DOT: Record<Health, string> = {
  green: "#3fb950",
  yellow: "#d29922",
  red: "#f85149",
  unknown: "#6e7681",
};

export function Dot({ health }: { health: Health }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: 999,
        background: DOT[health],
        marginRight: 8,
        flexShrink: 0,
      }}
    />
  );
}

export function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: "#12151a",
        border: "1px solid #262c36",
        borderRadius: 12,
        padding: "18px 20px",
        marginBottom: 16,
      }}
    >
      <h2 style={{ margin: "0 0 2px", fontSize: 15 }}>{title}</h2>
      {sub ? (
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8b949e" }}>{sub}</p>
      ) : (
        <div style={{ height: 12 }} />
      )}
      {children}
    </section>
  );
}

export function Tile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "#12151a",
        border: "1px solid #262c36",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: accent ?? "#e8eaed",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>{label}</div>
      {hint ? (
        <div style={{ fontSize: 11, color: "#6e7681", marginTop: 2 }}>{hint}</div>
      ) : null}
    </div>
  );
}

export function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "7px 0",
        borderBottom: "1px solid #1c2128",
      }}
    >
      <span style={{ fontSize: 13, color: "#8b949e" }}>{k}</span>
      <span style={{ fontSize: 13, textAlign: "right" }}>{v}</span>
    </div>
  );
}

export function Bar({ label, pct, sub }: { label: string; pct: number; sub?: string }) {
  const color = pct >= 100 ? "#3fb950" : pct >= 60 ? "#d29922" : "#f85149";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
        <span>{label}</span>
        <span style={{ color: "#8b949e", fontFamily: "ui-monospace, monospace" }}>
          {pct}%{sub ? ` · ${sub}` : ""}
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "#21262d",
          borderRadius: 999,
          overflow: "hidden",
          marginTop: 5,
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

export function Grid({ children, min = 150 }: { children: ReactNode; min?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap: 12,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 13, color: "#8b949e", lineHeight: 1.6 }}>
      {children}
    </p>
  );
}
