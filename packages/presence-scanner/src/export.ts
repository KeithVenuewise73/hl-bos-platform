// Exports: a CSV of the Lead Board, and a printable HTML lead summary.
//
// Both are for internal review. They carry Google Maps attribution for any
// Google-sourced field, and the CSV is protected against spreadsheet formula
// injection (a business name like "=HYPERLINK(...)" is written as text).

import { effectiveQualification } from "./qualify.ts";
import { topFindings } from "./score.ts";
import { stageLabel } from "./stages.ts";
import { VERTICALS } from "./verticals.ts";
import type { Prospect, WebsiteStatus } from "./types.ts";

export const WEBSITE_STATUS_LABELS: Record<WebsiteStatus, string> = {
  none: "No website",
  social_only: "Facebook/social only",
  link_in_bio: "Link-in-bio only",
  retired_google_site: "Retired Google site",
  ok: "Working website",
  unreachable: "Broken / unreachable",
  blocked: "Could not inspect",
  not_checked: "Not checked",
};

export const QUALIFICATION_LABELS = {
  qualified: "Qualified",
  excluded: "Excluded",
  needs_review: "Needs review",
} as const;

/** One CSV cell: quoted, doubled quotes, and formula characters neutralised. */
export function csvCell(v: string | number | undefined | null): string {
  let s = v === undefined || v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = [
  "Business",
  "Address",
  "Market",
  "Vertical",
  "Opportunity score",
  "Points with evidence (of 100)",
  "Scoring version",
  "Website status",
  "Website",
  "Phone",
  "Google rating",
  "Google reviews",
  "Top finding 1",
  "Top finding 2",
  "Top finding 3",
  "Qualification",
  "Qualification reasons",
  "Lead stage",
  "Last scanned",
  "Google Maps link",
  "Data sources",
] as const;

export function prospectsToCsv(prospects: Prospect[]): string {
  const rows = prospects.map((p) => {
    const top = topFindings(p.score);
    const rec = p.places?.record;
    const q = effectiveQualification(p.qualification);
    const reasons = p.qualification.override
      ? `Reviewer override: ${p.qualification.override.note}`
      : p.qualification.checks
          .filter((c) => c.outcome === "fail" || c.outcome === "uncertain")
          .map((c) => c.detail)
          .join(" ");
    const sources = [
      rec ? "Google Maps (Places API)" : null,
      p.importedRating !== undefined || p.importedReviewCount !== undefined || !rec
        ? "imported list"
        : null,
      p.websiteStatus === "ok" ? "website homepage" : null,
    ]
      .filter(Boolean)
      .join("; ");
    return [
      p.name,
      p.address,
      p.market.label,
      VERTICALS[p.vertical].label,
      p.score.total,
      p.score.checkedMax,
      p.score.version,
      WEBSITE_STATUS_LABELS[p.websiteStatus],
      p.corrections.website ?? p.website,
      p.corrections.phone ?? p.phone,
      rec?.rating ?? p.importedRating,
      rec
        ? (rec.reviewCount ?? (rec.rating === undefined ? 0 : undefined))
        : p.importedReviewCount,
      top[0],
      top[1],
      top[2],
      QUALIFICATION_LABELS[q],
      reasons,
      stageLabel(p.stage),
      p.lastScannedAt.slice(0, 10),
      rec?.mapsUrl,
      sources,
    ].map(csvCell);
  });
  return (
    [CSV_COLUMNS.map(csvCell).join(","), ...rows.map((r) => r.join(","))].join("\r\n") +
    "\r\n"
  );
}

const esc = (s: string | number | undefined | null) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** A printable, self-contained HTML summary of the given leads. */
export function leadSummaryHtml(prospects: Prospect[], generatedAt: Date): string {
  const cards = prospects
    .map((p) => {
      const q = effectiveQualification(p.qualification);
      const rec = p.places?.record;
      const comps = p.score.components
        .map(
          (c) =>
            `<tr><td>${esc(c.label)}</td><td class="n">${c.status === "not_checked" ? "not checked" : `${c.awarded} / ${c.max}`}</td><td>${esc(c.contributions.map((x) => `${x.label} (+${x.points})`).join("; ") || c.note)}</td></tr>`,
        )
        .join("");
      return `<section class="lead">
  <h2>${esc(p.name)} <span class="score">${p.score.total}</span></h2>
  <p class="meta">${esc(VERTICALS[p.vertical].label)} · ${esc(p.address ?? p.market.label)} · ${esc(p.corrections.phone ?? p.phone ?? "no phone")} · ${esc(WEBSITE_STATUS_LABELS[p.websiteStatus])}${p.website ? ` (${esc(p.website)})` : ""}</p>
  <p class="meta">${esc(QUALIFICATION_LABELS[q])} · ${esc(stageLabel(p.stage))} · scanned ${esc(p.lastScannedAt.slice(0, 10))} · evidence behind ${p.score.checkedMax} of 100 points${rec ? ` · Google rating ${esc(rec.rating ?? "none")} (${esc(rec.reviewCount ?? 0)} reviews) — source: Google Maps` : ""}</p>
  <table><thead><tr><th>Component</th><th>Points</th><th>Why</th></tr></thead><tbody>${comps}</tbody></table>
  ${
    p.services.length
      ? `<p class="meta">Suggested HLG services: ${esc(
          p.services
            .slice(0, 4)
            .map((s) => s.service)
            .join(", "),
        )} — price pending.</p>`
      : ""
  }
</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>HLG lead summary</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;max-width:900px;margin:24px auto;padding:0 16px}
h1{font-size:20px;margin:0 0 4px} .sub{color:#555;margin:0 0 20px}
.lead{border:1px solid #ccc;border-radius:8px;padding:12px 16px;margin:0 0 16px;break-inside:avoid}
h2{font-size:16px;margin:0 0 4px;display:flex;justify-content:space-between} .score{font-variant-numeric:tabular-nums}
.meta{color:#444;margin:2px 0} table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
th,td{text-align:left;border-top:1px solid #e5e5e5;padding:4px 6px;vertical-align:top} .n{white-space:nowrap}
@media print{body{margin:0}}
</style></head><body>
<h1>HLG Presence Scanner — lead summary</h1>
<p class="sub">Internal review only. Not for publication or outreach. Generated ${esc(generatedAt.toISOString().slice(0, 16).replace("T", " "))} UTC · ${prospects.length} lead(s) · Opportunity Score ${esc(prospects[0]?.score.version ?? "")} (higher = bigger opportunity). Google rating, review and listing data: Google Maps.</p>
${cards}
</body></html>
`;
}
