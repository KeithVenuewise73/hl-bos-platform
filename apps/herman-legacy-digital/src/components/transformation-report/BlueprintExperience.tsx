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

      {/* Choose Your Starting Point — the consulting sales step (not a checkout). */}
      <ChooseStartingPoint plan={report.engagement} />
    </div>
  );
}

const BRASS = "#b98a2e";

function ChooseStartingPoint({
  plan,
}: {
  plan: TransformationReportView["engagement"];
}) {
  const ordered = [
    ...plan.tracks.filter((t) => t.recommended),
    ...plan.tracks.filter((t) => !t.recommended),
  ];
  const recommended = plan.tracks.find((t) => t.recommended);
  return (
    <div style={{ ...card, background: INK, borderColor: INK }}>
      <div
        style={{
          fontSize: 12,
          color: "#9fb3c2",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        Choose your starting point
      </div>
      <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginTop: 6 }}>
        Based on our analysis, we&apos;d begin here.
      </div>
      <div style={{ fontSize: 13, color: "#c7d3dc", marginTop: 4, lineHeight: 1.5 }}>
        {plan.recommendationReason}
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {ordered.map((t) => (
          <div
            key={t.id}
            style={{
              background: t.recommended
                ? "rgba(185,138,46,0.14)"
                : "rgba(255,255,255,0.05)",
              border: `1px solid ${t.recommended ? BRASS : "rgba(255,255,255,0.12)"}`,
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
                {t.name}
              </span>
              {t.recommended ? (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    color: "#20160a",
                    background: BRASS,
                    borderRadius: 999,
                    padding: "2px 9px",
                  }}
                >
                  Recommended
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: 13.5, color: "#e7edf1", marginTop: 5 }}>
              {t.outcome}
            </div>
            {t.covers.length > 0 ? (
              <div style={{ fontSize: 11.5, color: "#9fb3c2", marginTop: 6 }}>
                Addresses: {t.covers.slice(0, 3).join(" · ")}
                {t.covers.length > 3 ? ` +${t.covers.length - 3} more` : ""}
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 8,
                flexWrap: "wrap",
                fontSize: 11.5,
                color: "#9fb3c2",
              }}
            >
              <span>
                Timeline: <span style={{ color: "#e7edf1" }}>{t.timeline}</span>
              </span>
              <span>
                Investment: <span style={{ color: "#e7edf1" }}>{t.investment}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <Link
          href={`/book?intent=strategy&track=${encodeURIComponent(recommended?.id ?? "")}`}
          style={{
            background: BRASS,
            color: "#20160a",
            fontWeight: 700,
            fontSize: 14,
            padding: "12px 20px",
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          Book a Strategy Session
        </Link>
        <Link
          href={`/contact?intent=start&track=${encodeURIComponent(recommended?.id ?? "")}`}
          style={{
            background: "transparent",
            color: "#eaf1f6",
            border: "1px solid rgba(255,255,255,0.35)",
            fontWeight: 700,
            fontSize: 14,
            padding: "12px 20px",
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          Start Your Transformation
        </Link>
      </div>
      <div style={{ fontSize: 11.5, color: "#9fb3c2", marginTop: 12, lineHeight: 1.5 }}>
        A strategy session is a conversation, not a commitment — investment is scoped
        with you there. From your engagement grows the Transformation Operating System:
        monthly executive reviews and continuous AI monitoring.
      </div>
    </div>
  );
}
