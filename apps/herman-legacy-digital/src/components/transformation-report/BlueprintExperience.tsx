"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { TransformationReportView } from "@/lib/scan/report-model";
import { REPORT_STORAGE_KEY } from "./ScanExperience";

// The Transformation Blueprint — stage 3 of the journey. It reads the report the
// scan produced (from sessionStorage, no persistence) and presents the engine's
// real 30-day / 90-day / 6-month / 12-month roadmap plus an Implementation
// Marketplace. Each "Implement" is a genuine action today — it books a Herman
// Legacy engagement — so no control is shown that does not do anything.

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

interface Stored {
  scannedUrl: string;
  report: TransformationReportView;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10 }}>
      <dt
        style={{
          fontSize: 10.5,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: MUTED,
          fontWeight: 700,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: 12.5, color: INK }}>{value}</dd>
    </div>
  );
}

export function BlueprintExperience() {
  const [state, setState] = useState<"loading" | "empty" | "ready">("loading");
  const [data, setData] = useState<Stored | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(REPORT_STORAGE_KEY);
      if (!raw) {
        setState("empty");
        return;
      }
      const parsed = JSON.parse(raw) as Stored;
      if (!parsed?.report?.horizons) {
        setState("empty");
        return;
      }
      setData(parsed);
      setState("ready");
    } catch {
      setState("empty");
    }
  }, []);

  if (state === "loading") {
    return <div style={{ fontSize: 14, color: MUTED }}>Loading your blueprint…</div>;
  }

  if (state === "empty" || !data) {
    return (
      <div style={{ ...card, maxWidth: 520 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: INK }}>
          Run your free scan first
        </div>
        <div style={{ fontSize: 13.5, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
          Your Transformation Blueprint is built from your Business Scan. Start the free
          scan and your prioritized 30-day, 90-day, and 12-month plan will appear here.
        </div>
        <Link
          href="/scan"
          style={{
            display: "inline-block",
            marginTop: 16,
            background: ACCENT,
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            padding: "11px 18px",
            borderRadius: 9,
            textDecoration: "none",
          }}
        >
          Start my free AI Business Scan →
        </Link>
      </div>
    );
  }

  const { report } = data;
  const horizonsWithItems = report.horizons.filter((h) => h.items.length > 0);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: INK }}>
          {report.business.name} — Transformation Blueprint
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
          {report.timelineSummary}
        </div>
      </div>

      {horizonsWithItems.length === 0 ? (
        <div style={{ ...card, background: PAPER, fontSize: 13.5, color: MUTED }}>
          This scan surfaced no scheduled actions. Add financials or documents for a
          deeper plan, or book a review with our team.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {horizonsWithItems.map((h) => (
            <div key={h.key} style={{ ...card, borderTop: `3px solid ${ACCENT}` }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: ACCENT,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {h.window}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: INK, marginTop: 4 }}>
                {h.objective}
              </div>
              <ul
                style={{
                  margin: "12px 0 0",
                  padding: 0,
                  listStyle: "none",
                  display: "grid",
                  gap: 9,
                }}
              >
                {h.items.map((it, i) => {
                  const color = PRIORITY_COLOR[it.priority] ?? MUTED;
                  return (
                    <li
                      key={i}
                      style={{ borderLeft: `3px solid ${color}`, paddingLeft: 12 }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                        {it.label}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: MUTED,
                          marginTop: 2,
                          lineHeight: 1.45,
                        }}
                      >
                        {it.action}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <dl
                style={{
                  margin: "14px 0 0",
                  paddingTop: 12,
                  borderTop: `1px solid ${LINE}`,
                  display: "grid",
                  gap: 8,
                }}
              >
                <Meta label="Expected change" value={h.expectedChange} />
                {h.solutions.length > 0 ? (
                  <Meta label="Herman Legacy solution" value={h.solutions.join(", ")} />
                ) : null}
                <Meta label="Dependencies" value={h.dependencies} />
                <Meta label="Evidence still required" value={h.evidenceRequired} />
              </dl>
            </div>
          ))}
        </div>
      )}

      {/* Implementation Marketplace — each product is a real, bookable engagement. */}
      <div style={{ ...card, background: INK, borderColor: INK }}>
        <div
          style={{
            fontSize: 12,
            color: "#9fb3c2",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          Implement with Herman Legacy
        </div>
        {report.recommendedTransformations.length > 0 ? (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {report.recommendedTransformations.map((r) => (
              <div
                key={r.product}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 9,
                  padding: "12px 14px",
                }}
              >
                <div>
                  <div style={{ color: "#fff", fontWeight: 600 }}>{r.product}</div>
                  <div style={{ fontSize: 11.5, color: "#9fb3c2", marginTop: 2 }}>
                    {r.type === "recurring"
                      ? "Ongoing subscription"
                      : "One-time engagement"}{" "}
                    · justified by {r.supportedBy.length} finding
                    {r.supportedBy.length === 1 ? "" : "s"}
                  </div>
                </div>
                <Link
                  href={`/book?intent=implement&product=${encodeURIComponent(r.product)}`}
                  style={{
                    background: "#fff",
                    color: INK,
                    fontWeight: 600,
                    fontSize: 13,
                    padding: "9px 15px",
                    borderRadius: 8,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Implement {r.product}
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#c7d3dc", marginTop: 8 }}>
            No product implementations were triggered by this scan.
          </div>
        )}
        <div
          style={{ fontSize: 11.5, color: "#9fb3c2", marginTop: 14, lineHeight: 1.5 }}
        >
          Implementation books a Herman Legacy engagement. Direct in-platform checkout
          and the ongoing Executive Operating System — where you track revenue,
          visibility, leads, and your Transformation Score — are the next stages of this
          workflow.
        </div>
      </div>
    </div>
  );
}
