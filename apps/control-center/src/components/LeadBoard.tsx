"use client";

import { useMemo, useState } from "react";

import {
  LEAD_STAGES,
  QUALIFICATION_LABELS,
  VERTICAL_LABELS,
  WEBSITE_STATUS_LABELS,
} from "@hl-bos/presence-scanner/labels";

import {
  filterLeads,
  filtersToParams,
  nextSort,
  sortLeads,
  type LeadFilters,
  type LeadRow,
  type SortKey,
} from "@/lib/lead-board";

import { C, input, label, QUAL_COLOUR, scoreColour } from "./presence-style";

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  color: C.muted,
  fontWeight: 600,
  padding: "8px 8px",
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  fontSize: 13,
  padding: "9px 8px",
  borderBottom: "1px solid #1c2128",
  verticalAlign: "top",
};

function Select({
  id,
  text,
  value,
  onChange,
  options,
}: {
  id: string;
  text: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label style={label} htmlFor={id}>
        {text}
      </label>
      <select
        id={id}
        style={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

export function LeadBoard({ rows }: { rows: LeadRow[] }) {
  const [f, setF] = useState<LeadFilters>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "score",
    dir: "desc",
  });
  const set = <K extends keyof LeadFilters>(k: K, v: LeadFilters[K] | "") =>
    setF((cur) => {
      const next = { ...cur };
      if (v === "" || v === undefined) delete next[k];
      else next[k] = v;
      return next;
    });

  const markets = useMemo(() => [...new Set(rows.map((r) => r.market))].sort(), [rows]);
  const shown = useMemo(
    () => sortLeads(filterLeads(rows, f), sort.key, sort.dir),
    [rows, f, sort],
  );
  const query = filtersToParams(f);

  const head = (key: SortKey, text: string) => (
    <th style={th}>
      <button
        type="button"
        onClick={() => setSort((s) => nextSort(s, key))}
        style={{
          background: "none",
          border: 0,
          color: "inherit",
          font: "inherit",
          cursor: "pointer",
          padding: 0,
        }}
        aria-label={`Sort by ${text}`}
      >
        {text}
        {sort.key === key ? (sort.dir === "desc" ? " ▼" : " ▲") : ""}
      </button>
    </th>
  );

  if (rows.length === 0)
    return (
      <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
        No leads yet. Run a scan above: search Google Places, or paste a list of
        businesses.
      </p>
    );

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <Select
          id="f-market"
          text="Market"
          value={f.market ?? ""}
          onChange={(v) => set("market", v)}
          options={markets.map((m) => [m, m])}
        />
        <Select
          id="f-vertical"
          text="Vertical"
          value={f.vertical ?? ""}
          onChange={(v) => set("vertical", v)}
          options={Object.entries(VERTICAL_LABELS)}
        />
        <div>
          <label style={label} htmlFor="f-min">
            Score from
          </label>
          <input
            id="f-min"
            type="number"
            min={0}
            max={100}
            style={input}
            value={f.minScore ?? ""}
            onChange={(e) =>
              set("minScore", e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>
        <div>
          <label style={label} htmlFor="f-max">
            Score to
          </label>
          <input
            id="f-max"
            type="number"
            min={0}
            max={100}
            style={input}
            value={f.maxScore ?? ""}
            onChange={(e) =>
              set("maxScore", e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>
        <Select
          id="f-web"
          text="Website"
          value={f.websiteStatus ?? ""}
          onChange={(v) => set("websiteStatus", v)}
          options={Object.entries(WEBSITE_STATUS_LABELS)}
        />
        <Select
          id="f-stage"
          text="Lead stage"
          value={f.stage ?? ""}
          onChange={(v) => set("stage", v)}
          options={LEAD_STAGES.map((s) => [s.key, s.label])}
        />
        <Select
          id="f-qual"
          text="Qualification"
          value={f.qualification ?? ""}
          onChange={(v) => set("qualification", v)}
          options={Object.entries(QUALIFICATION_LABELS)}
        />
        <div>
          <label style={label} htmlFor="f-since">
            Scanned since
          </label>
          <input
            id="f-since"
            type="date"
            style={input}
            value={f.scannedSince ?? ""}
            onChange={(e) => set("scannedSince", e.target.value)}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          fontSize: 13,
        }}
      >
        <span style={{ color: C.muted }}>
          Showing {shown.length} of {rows.length} lead{rows.length === 1 ? "" : "s"}.
          Higher score = bigger opportunity.
        </span>
        <span>
          <a
            href={`/presence/export.csv${query ? `?${query}` : ""}`}
            style={{ color: C.link }}
          >
            Export CSV
          </a>
          {" · "}
          <a
            href={`/presence/summary${query ? `?${query}` : ""}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: C.link }}
          >
            Printable summary
          </a>
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {head("name", "Business")}
              <th style={th}>Vertical</th>
              {head("score", "Score")}
              <th style={th}>Website</th>
              {head("rating", "Rating")}
              {head("reviews", "Reviews")}
              <th style={th}>Top findings</th>
              <th style={th}>Qualification</th>
              {head("stage", "Stage")}
              {head("lastScannedAt", "Scanned")}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td style={td}>
                  <a
                    href={`/presence/${r.id}`}
                    style={{ color: C.link, fontWeight: 600 }}
                  >
                    {r.name}
                  </a>
                  <div style={{ color: C.muted, fontSize: 12 }}>{r.location}</div>
                </td>
                <td style={{ ...td, fontSize: 12 }}>{VERTICAL_LABELS[r.vertical]}</td>
                <td style={td}>
                  <span
                    style={{
                      fontWeight: 700,
                      color: scoreColour(r.score),
                      fontSize: 15,
                    }}
                  >
                    {r.checkedMax === 0 ? "—" : r.score}
                  </span>
                  {r.checkedMax === 0 ? (
                    <div style={{ color: C.muted, fontSize: 11 }}>not scored yet</div>
                  ) : r.checkedMax < 100 ? (
                    <div
                      style={{ color: C.muted, fontSize: 11 }}
                      title="Points with evidence behind them; the rest were not checked"
                    >
                      on {r.checkedMax} pts
                    </div>
                  ) : null}
                </td>
                <td style={{ ...td, fontSize: 12 }}>
                  {WEBSITE_STATUS_LABELS[r.websiteStatus]}
                </td>
                <td style={td}>
                  {r.rating !== undefined ? r.rating.toFixed(1) : "—"}
                  {r.ratingSource ? (
                    <div style={{ color: C.muted, fontSize: 11 }}>{r.ratingSource}</div>
                  ) : null}
                </td>
                <td style={td}>{r.reviews ?? "—"}</td>
                <td style={{ ...td, fontSize: 12 }}>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {r.topFindings.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </td>
                <td
                  style={{ ...td, fontSize: 12, color: QUAL_COLOUR[r.qualification] }}
                >
                  {QUALIFICATION_LABELS[r.qualification]}
                  {r.overridden ? (
                    <div style={{ color: C.muted }}>(reviewer)</div>
                  ) : null}
                </td>
                <td style={{ ...td, fontSize: 12 }}>
                  {LEAD_STAGES.find((s) => s.key === r.stage)?.label}
                </td>
                <td style={{ ...td, fontSize: 12, whiteSpace: "nowrap" }}>
                  {r.lastScannedAt.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
