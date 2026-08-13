"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { INDUSTRY_OPTIONS } from "@/lib/scan/industries";
import { DISCOVERY_GOALS } from "@/lib/scan/discovery";
import type { TransformationReportView } from "@/lib/scan/report-model";
import { ReportView } from "./ReportView";

// The free AI Business Scan experience: a short form → a live analysis of the
// customer's real website → an interactive Transformation Report. The report is
// also stashed in sessionStorage so the next stage (the Blueprint) can read it
// without any persistence layer (no DB, no migration).

export const REPORT_STORAGE_KEY = "hl_transformation_report_v1";

const INK = "#0f1720";
const LINE = "#e4e7ec";
const MUTED = "#5b6672";
const ACCENT = "#1f5f8b";

const input: CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  fontSize: 14,
  border: `1px solid ${LINE}`,
  borderRadius: 9,
  background: "#fff",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: INK,
  display: "block",
  marginBottom: 5,
};

type Phase = "idle" | "scanning" | "error" | "done";

interface ScanApiResponse {
  status?: string;
  error?: string;
  scannedUrl?: string;
  report?: TransformationReportView;
}

function fieldValue(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export function ScanExperience() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<TransformationReportView | null>(null);
  const [goalId, setGoalId] = useState<string>("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      website: fieldValue(form, "website"),
      name: fieldValue(form, "name"),
      industry: fieldValue(form, "industry") || "general",
      location: fieldValue(form, "location"),
      goalId,
      goalOwnWords: fieldValue(form, "goalOwnWords"),
    };
    if (!payload.website.trim()) {
      setError("Enter your website address to run a scan.");
      setPhase("error");
      return;
    }

    setPhase("scanning");
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as ScanApiResponse;
      if (!res.ok || data.status !== "ok" || !data.report) {
        setError(data.error ?? "We could not complete that scan.");
        setPhase("error");
        return;
      }
      const view = data.report;
      setReport(view);
      setPhase("done");
      try {
        sessionStorage.setItem(
          REPORT_STORAGE_KEY,
          JSON.stringify({ scannedUrl: data.scannedUrl ?? "", report: view }),
        );
      } catch {
        // sessionStorage may be unavailable (private mode) — the report still
        // renders here; only the Blueprint hand-off degrades, handled there.
      }
    } catch {
      setError("Something interrupted the scan. Please try again.");
      setPhase("error");
    }
  }

  if (phase === "done" && report) {
    return (
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={() => {
            setReport(null);
            setPhase("idle");
          }}
          style={{
            background: "none",
            border: "none",
            color: ACCENT,
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
            marginBottom: 16,
          }}
        >
          ← Scan another business
        </button>
        <ReportView report={report} />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      style={{
        display: "grid",
        gap: 14,
        maxWidth: 560,
        background: "#fff",
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        padding: 22,
      }}
    >
      <div>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: INK }}>
          First — what would a better business look like for you?
        </div>
        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>
          Your goal, in your words. It shapes the entire analysis — we frame everything
          against where you want to go.
        </div>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}
          role="group"
          aria-label="Your primary goal"
        >
          {DISCOVERY_GOALS.map((g) => {
            const selected = goalId === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoalId(selected ? "" : g.id)}
                aria-pressed={selected}
                style={{
                  fontSize: 13,
                  fontWeight: selected ? 700 : 500,
                  color: selected ? "#fff" : INK,
                  background: selected ? ACCENT : "#fff",
                  border: `1px solid ${selected ? ACCENT : LINE}`,
                  borderRadius: 999,
                  padding: "8px 14px",
                  cursor: "pointer",
                }}
              >
                {g.label}
              </button>
            );
          })}
        </div>
        <textarea
          name="goalOwnWords"
          rows={2}
          placeholder="Or tell us in your own words (optional)…"
          style={{ ...input, marginTop: 10, resize: "vertical" }}
        />
      </div>

      <div style={{ height: 1, background: LINE, margin: "2px 0" }} />

      <div>
        <label style={labelStyle} htmlFor="website">
          Website address <span style={{ color: "#b42318" }}>*</span>
        </label>
        <input
          id="website"
          name="website"
          placeholder="yourbusiness.com"
          style={input}
        />
        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 5 }}>
          We read your live homepage and analyze it in real time. Nothing is stored.
        </div>
      </div>

      <div>
        <label style={labelStyle} htmlFor="name">
          Business name
        </label>
        <input id="name" name="name" placeholder="Your business" style={input} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={labelStyle} htmlFor="industry">
            Industry
          </label>
          <select id="industry" name="industry" style={input} defaultValue="general">
            {INDUSTRY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={labelStyle} htmlFor="location">
            Location
          </label>
          <input
            id="location"
            name="location"
            placeholder="City, State"
            style={input}
          />
        </div>
      </div>

      {phase === "error" && error ? (
        <div
          style={{
            fontSize: 13,
            color: "#b42318",
            background: "#fef3f2",
            border: "1px solid #fecdca",
            borderRadius: 9,
            padding: "10px 12px",
          }}
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={phase === "scanning"}
        style={{
          background: phase === "scanning" ? MUTED : ACCENT,
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
          border: "none",
          borderRadius: 10,
          padding: "13px 18px",
          cursor: phase === "scanning" ? "default" : "pointer",
        }}
      >
        {phase === "scanning"
          ? "Analyzing your website…"
          : "Run my free AI Business Scan"}
      </button>
      <div style={{ fontSize: 11.5, color: MUTED, textAlign: "center" }}>
        Free · No account required · Results in under a minute
      </div>
    </form>
  );
}
