// CSV form of hlg.prospect-import@1. One row per prospect; every row repeats the
// report envelope columns so a row is self-describing and a sheet can be sorted.
//
// Multi-value cells use " | " between items. An item that needs a source is
// written "text :: https://source". Two decision-maker slots are provided; use
// the JSON form for more. Errors name the CSV row (header = row 1) and column.

import {
  IMPORT_SCHEMA_ID,
  IMPORT_SCHEMA_VERSION,
  validateImportReport,
} from "./import-v1.ts";
import type { ImportIssue, ImportReportV1 } from "./import-v1.ts";

export const CSV_COLUMNS = [
  "schema_version",
  "report_id",
  "workspace_slug",
  "task_name",
  "generated_by",
  "generated_at",
  "is_synthetic",
  "external_ref",
  "organization_name",
  "organization_type",
  "official_website",
  "city",
  "state_province",
  "country",
  "team_count",
  "scoresheet_provider",
  "scoresheet_provider_status",
  "scoresheet_provider_source_url",
  "registration_provider",
  "registration_provider_status",
  "registration_provider_source_url",
  "analytics_capabilities",
  "analytics_capabilities_status",
  "analytics_capabilities_source_url",
  "decision_maker_1_name",
  "decision_maker_1_title",
  "decision_maker_1_source_url",
  "decision_maker_1_email",
  "decision_maker_1_phone",
  "decision_maker_2_name",
  "decision_maker_2_title",
  "decision_maker_2_source_url",
  "decision_maker_2_email",
  "decision_maker_2_phone",
  "business_email",
  "business_phone",
  "business_address",
  "business_contact_source_url",
  "operational_needs",
  "verified_facts",
  "inferences_and_assumptions",
  "recommended_modules",
  "integration_recommendation",
  "priority",
  "estimated_annual_contract_value",
  "currency",
  "pricing_assumptions",
  "recommended_next_action",
  "research_date",
  "supporting_source_urls",
] as const;

/** RFC 4180 parser: quotes, doubled quotes, CRLF/LF, embedded newlines, BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (q) throw new Error("CSV has an unterminated quoted cell");
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export function toCsv(rows: string[][]): string {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

const nul = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};
const items = (s: string | undefined) =>
  (s ?? "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
const withSource = (item: string): { text: string; urls: string[] } => {
  const [t, ...u] = item.split("::").map((x) => x.trim());
  return { text: t ?? "", urls: u.filter(Boolean) };
};
const urlList = (s: string | undefined) => items(s);

export type CsvConversion =
  { ok: true; report: ImportReportV1 } | { ok: false; issues: ImportIssue[] };

export function csvToReport(csv: string): CsvConversion {
  let rows: string[][];
  try {
    rows = parseCsv(csv);
  } catch (e) {
    return {
      ok: false,
      issues: [{ row: null, path: "", message: (e as Error).message }],
    };
  }
  if (rows.length < 2)
    return {
      ok: false,
      issues: [
        {
          row: null,
          path: "",
          message: "CSV needs a header row and at least one prospect row",
        },
      ],
    };

  const header = rows[0]!.map((h) => h.trim());
  const unknown = header.filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h));
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  const issues: ImportIssue[] = [
    ...unknown.map((h) => ({ row: 1, path: h, message: `unknown column "${h}"` })),
    ...missing.map((h) => ({ row: 1, path: h, message: `missing column "${h}"` })),
  ];
  if (issues.length) return { ok: false, issues };

  const body = rows.slice(1).map((r, idx) => {
    const get = (k: (typeof CSV_COLUMNS)[number]) => r[header.indexOf(k)];
    return { csvRow: idx + 2, get };
  });
  const first = body[0]!;
  for (const b of body)
    // one report per file
    for (const k of [
      "schema_version",
      "report_id",
      "workspace_slug",
      "is_synthetic",
    ] as const)
      if ((b.get(k) ?? "").trim() !== (first.get(k) ?? "").trim())
        issues.push({
          row: b.csvRow,
          path: k,
          message: `"${k}" must be identical on every row`,
        });
  if (issues.length) return { ok: false, issues };

  const claim = (
    b: (typeof body)[number],
    k: "scoresheet_provider" | "registration_provider" | "analytics_capabilities",
  ) => ({
    value: nul(b.get(k)),
    status: nul(b.get(`${k}_status`)) ?? (nul(b.get(k)) ? "" : "unknown"),
    source_urls: urlList(b.get(`${k}_source_url`)),
  });
  const dm = (b: (typeof body)[number], n: 1 | 2) => {
    const name = nul(b.get(`decision_maker_${n}_name` as never));
    if (!name) return [];
    return [
      {
        name,
        title: nul(b.get(`decision_maker_${n}_title` as never)) ?? "",
        source_urls: urlList(b.get(`decision_maker_${n}_source_url` as never)),
        email: nul(b.get(`decision_maker_${n}_email` as never)),
        phone: nul(b.get(`decision_maker_${n}_phone` as never)),
      },
    ];
  };

  const candidate = {
    schema: IMPORT_SCHEMA_ID,
    schema_version: (first.get("schema_version") ?? "").trim(),
    report: {
      report_id: (first.get("report_id") ?? "").trim(),
      workspace_slug: (first.get("workspace_slug") ?? "").trim(),
      task_name: (first.get("task_name") ?? "").trim(),
      generated_by: (first.get("generated_by") ?? "").trim(),
      generated_at: (first.get("generated_at") ?? "").trim(),
      is_synthetic: (first.get("is_synthetic") ?? "").trim().toLowerCase() === "true",
      notes: null,
    },
    prospects: body.map((b) => {
      const ev = nul(b.get("estimated_annual_contract_value"));
      const tc = nul(b.get("team_count"));
      return {
        external_ref: (b.get("external_ref") ?? "").trim(),
        organization_name: (b.get("organization_name") ?? "").trim(),
        organization_type: (b.get("organization_type") ?? "").trim(),
        official_website: nul(b.get("official_website")),
        location: {
          city: nul(b.get("city")),
          state_province: nul(b.get("state_province")),
          country: (b.get("country") ?? "").trim(),
        },
        team_count: tc === null ? null : Number(tc),
        scoresheet_provider: claim(b, "scoresheet_provider"),
        registration_provider: claim(b, "registration_provider"),
        analytics_capabilities: claim(b, "analytics_capabilities"),
        decision_makers: [...dm(b, 1), ...dm(b, 2)],
        business_contact: {
          email: nul(b.get("business_email")),
          phone: nul(b.get("business_phone")),
          address: nul(b.get("business_address")),
          source_urls: urlList(b.get("business_contact_source_url")),
        },
        operational_needs: items(b.get("operational_needs")).map((x) => {
          const w = withSource(x);
          return {
            need: w.text,
            status: w.urls.length ? "verified" : "inferred",
            source_urls: w.urls,
          };
        }),
        verified_facts: items(b.get("verified_facts")).map((x) => {
          const w = withSource(x);
          return { statement: w.text, source_urls: w.urls };
        }),
        inferences_and_assumptions: items(b.get("inferences_and_assumptions")).map(
          (x) => ({ statement: x, basis: null }),
        ),
        recommended_modules: items(b.get("recommended_modules")),
        integration_recommendation: (b.get("integration_recommendation") ?? "").trim(),
        priority: (b.get("priority") ?? "").trim(),
        estimated_annual_contract_value: {
          amount: ev === null ? null : Number(ev),
          currency: (b.get("currency") ?? "").trim(),
          pricing_assumptions: nul(b.get("pricing_assumptions")),
        },
        recommended_next_action: (b.get("recommended_next_action") ?? "").trim(),
        research_date: (b.get("research_date") ?? "").trim(),
        source_urls: urlList(b.get("supporting_source_urls")),
      };
    }),
  };

  // Non-numeric numbers would become NaN and give a confusing message; say it plainly.
  candidate.prospects.forEach((p, i) => {
    if (Number.isNaN(p.team_count))
      issues.push({
        row: i + 2,
        path: "team_count",
        message: "team_count must be a whole number",
      });
    if (Number.isNaN(p.estimated_annual_contract_value.amount))
      issues.push({
        row: i + 2,
        path: "estimated_annual_contract_value",
        message: "estimated_annual_contract_value must be a number",
      });
  });
  if (issues.length) return { ok: false, issues };

  const v = validateImportReport(candidate);
  if (v.ok) return v;
  // validator rows are 1-based prospect numbers; CSV row = that + 1 (header)
  return {
    ok: false,
    issues: v.issues.map((i) => ({ ...i, row: i.row === null ? null : i.row + 1 })),
  };
}

/** The template ChatGPT is told to fill in: header + one clearly synthetic example row. */
export function templateCsv(): string {
  const ex: Record<string, string> = {
    schema_version: IMPORT_SCHEMA_VERSION,
    report_id: "SYNTH-TEMPLATE-EXAMPLE",
    workspace_slug: "venuewise-hockey",
    task_name: "Hockey Intelligence Prospecting",
    generated_by: "template",
    generated_at: "2026-01-05T08:00:00-05:00",
    is_synthetic: "true",
    external_ref: "SYNTH-001",
    organization_name:
      "Example Synthetic Youth Hockey Association (NOT A REAL ORGANIZATION)",
    organization_type: "association",
    official_website: "https://synthetic-association.example.com",
    city: "Exampleville",
    state_province: "NY",
    country: "US",
    team_count: "12",
    scoresheet_provider: "Paper scoresheets",
    scoresheet_provider_status: "inferred",
    scoresheet_provider_source_url: "",
    registration_provider: "",
    registration_provider_status: "unknown",
    registration_provider_source_url: "",
    analytics_capabilities: "",
    analytics_capabilities_status: "unknown",
    analytics_capabilities_source_url: "",
    decision_maker_1_name: "Pat Example",
    decision_maker_1_title: "Registrar",
    decision_maker_1_source_url: "https://synthetic-association.example.com/board",
    decision_maker_1_email: "",
    decision_maker_1_phone: "",
    business_email: "",
    business_phone: "",
    business_address: "",
    business_contact_source_url: "",
    operational_needs:
      "Season scheduling consolidation :: https://synthetic-association.example.com/schedule | Standings reporting",
    verified_facts:
      "Lists 12 teams across 3 age groups :: https://synthetic-association.example.com/teams",
    inferences_and_assumptions: "Volunteer-run, so likely limited IT capacity",
    recommended_modules: "Standings | Scheduling",
    integration_recommendation: "integrate",
    priority: "medium",
    estimated_annual_contract_value: "2400",
    currency: "USD",
    pricing_assumptions: "12 teams x $200 per team per year (assumption, not a quote)",
    recommended_next_action: "Confirm provider via public site review",
    research_date: "2026-01-04",
    supporting_source_urls: "https://synthetic-association.example.com",
  };
  return toCsv([[...CSV_COLUMNS], CSV_COLUMNS.map((c) => ex[c] ?? "")]);
}
