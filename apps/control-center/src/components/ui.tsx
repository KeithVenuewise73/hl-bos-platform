import type { ReactNode } from "react";
import type { Health } from "@/lib/health";

export const DOT: Record<Health, string> = {
  green: "#3fb950",
  yellow: "#d29922",
  red: "#f85149",
  unknown: "#6e7681",
};

export const LABEL: Record<Health, string> = {
  green: "Healthy",
  yellow: "Working",
  red: "Needs attention",
  unknown: "Not visible",
};

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
      <h2 style={{ margin: "0 0 2px", fontSize: 15, letterSpacing: 0.2 }}>{title}</h2>
      {sub ? (
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8b949e" }}>{sub}</p>
      ) : (
        <div style={{ height: 12 }} />
      )}
      {children}
    </section>
  );
}

export function Dot({ health }: { health: Health }) {
  return (
    <span
      aria-label={LABEL[health]}
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

export function Row({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
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
      <span
        style={{
          fontSize: 13,
          fontFamily: mono ? "ui-monospace, monospace" : "inherit",
          textAlign: "right",
        }}
      >
        {v}
      </span>
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
