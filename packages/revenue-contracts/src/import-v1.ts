// hlg.prospect-import @ 1.0.0 -- the contract between a research source (the
// weekly ChatGPT "Hockey Intelligence Prospecting" task, a CSV, a future HubSpot
// sync, an authorised API) and ANY HLG Revenue Center workspace.
//
// Rules this contract enforces (they are the honesty rules of the platform):
//   1. "verified" is a CLAIM BY THE REPORT, not a fact. It is only accepted with
//      at least one source URL. The importer still stores it as "reported
//      verified" until our own fetcher confirms it (Phase 4).
//   2. Unknown is a value. A claim with no value must say "unknown".
//   3. Synthetic data can never pass as real: is_synthetic requires SYNTH- refs
//      and reserved example domains; real reports may use neither.
//
// Versioning: MAJOR changes break producers; MINOR adds optional fields only.
// A report names the version it was written against; the importer picks the
// validator by MAJOR and rejects versions it does not know.

import { z } from "zod";

export const IMPORT_SCHEMA_ID = "hlg.prospect-import";
export const IMPORT_SCHEMA_VERSION = "1.0.0";

const text = (max = 500) => z.string().trim().min(1).max(max);
const httpUrl = z.url({ protocol: /^https?$/, hostname: z.regexes.domain }).max(2000);
const sources = z.array(httpUrl).max(20);

export const CLAIM_STATUS = ["verified", "inferred", "assumption", "unknown"] as const;
const claimStatus = z.enum(CLAIM_STATUS);

/** A single factual claim about the prospect (a provider, a capability ...). */
export const claim = z
  .object({
    value: text(300).nullable(),
    status: claimStatus,
    source_urls: sources.default([]),
  })
  .superRefine((c, ctx) => {
    if (c.status === "verified" && c.source_urls.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["source_urls"],
        message: "a verified claim needs at least one source URL",
      });
    if (c.value === null && c.status !== "unknown")
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: 'a claim with no value must have status "unknown"',
      });
    if (c.value !== null && c.status === "unknown")
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: 'status "unknown" cannot carry a value',
      });
  });
export type Claim = z.infer<typeof claim>;

export const ORGANIZATION_TYPES = [
  "league",
  "association",
  "organization",
  "facility",
  "team",
  "tournament_organizer",
  "other",
] as const;
export const INTEGRATION_RECOMMENDATIONS = [
  "integrate",
  "replace",
  "coexist",
  "undetermined",
] as const;
export const PRIORITIES = ["high", "medium", "low"] as const;

const decisionMaker = z.object({
  name: text(200),
  title: text(200),
  source_urls: sources.min(1, "a decision-maker needs a public source"),
  email: z.email().max(254).nullable().default(null),
  phone: text(40).nullable().default(null),
});

const prospect = z.object({
  external_ref: text(120), // stable id inside the report; also the re-import dedupe key
  organization_name: text(300),
  organization_type: z.enum(ORGANIZATION_TYPES),
  official_website: httpUrl.nullable(),
  location: z.object({
    city: text(120).nullable().default(null),
    state_province: text(80).nullable().default(null),
    country: z.enum(["US", "CA"]),
  }),
  team_count: z.number().int().min(0).max(100000).nullable(),
  scoresheet_provider: claim,
  registration_provider: claim,
  analytics_capabilities: claim,
  decision_makers: z.array(decisionMaker).max(10).default([]),
  business_contact: z
    .object({
      email: z.email().max(254).nullable().default(null),
      phone: text(40).nullable().default(null),
      address: text(300).nullable().default(null),
      source_urls: sources.default([]),
    })
    .default({ email: null, phone: null, address: null, source_urls: [] }),
  operational_needs: z
    .array(
      z.object({
        need: text(300),
        status: claimStatus,
        source_urls: sources.default([]),
      }),
    )
    .max(30)
    .default([]),
  verified_facts: z
    .array(
      z.object({
        statement: text(1000),
        source_urls: sources.min(1, "a verified fact needs a source URL"),
      }),
    )
    .max(50)
    .default([]),
  inferences_and_assumptions: z
    .array(
      z.object({ statement: text(1000), basis: text(500).nullable().default(null) }),
    )
    .max(50)
    .default([]),
  recommended_modules: z.array(text(120)).max(20).default([]),
  integration_recommendation: z.enum(INTEGRATION_RECOMMENDATIONS),
  priority: z.enum(PRIORITIES),
  estimated_annual_contract_value: z.object({
    amount: z.number().min(0).max(100_000_000).nullable(),
    currency: z.enum(["USD", "CAD"]),
    pricing_assumptions: text(1000).nullable().default(null),
  }),
  recommended_next_action: text(500),
  research_date: z.iso.date(),
  source_urls: sources.default([]),
});
export type ImportProspect = z.infer<typeof prospect>;

const reportMeta = z.object({
  report_id: text(120),
  workspace_slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  task_name: text(200),
  generated_by: text(200),
  generated_at: z.iso.datetime({ offset: true }),
  is_synthetic: z.boolean().default(false),
  notes: text(2000).nullable().default(null),
});

const SYNTH = /^SYNTH-/;
const isReservedHost = (u: string) => {
  try {
    return /(^|\.)example\.(com|org|net)$|\.(example|invalid|test)$/.test(
      new URL(u).hostname,
    );
  } catch {
    return false;
  } // malformed URLs are reported by the field's own validator
};

export const importReportV1 = z
  .object({
    schema: z.literal(IMPORT_SCHEMA_ID),
    schema_version: z
      .string()
      .regex(/^1\.\d+\.\d+$/, "this validator handles major version 1 only"),
    report: reportMeta,
    prospects: z.array(prospect).min(1).max(500),
  })
  .superRefine((r, ctx) => {
    const seen = new Set<string>();
    r.prospects.forEach((p, i) => {
      const key = p.external_ref.toLowerCase();
      if (seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["prospects", i, "external_ref"],
          message: `duplicate external_ref "${p.external_ref}" in this report`,
        });
      seen.add(key);
      const synthRef = SYNTH.test(p.external_ref);
      if (r.report.is_synthetic && !synthRef)
        ctx.addIssue({
          code: "custom",
          path: ["prospects", i, "external_ref"],
          message: "synthetic reports must use SYNTH- references",
        });
      if (!r.report.is_synthetic && synthRef)
        ctx.addIssue({
          code: "custom",
          path: ["prospects", i, "external_ref"],
          message: "SYNTH- references are only allowed in synthetic reports",
        });
      if (p.official_website) {
        const reserved = isReservedHost(p.official_website);
        if (r.report.is_synthetic && !reserved)
          ctx.addIssue({
            code: "custom",
            path: ["prospects", i, "official_website"],
            message: "synthetic prospects must use a reserved example domain",
          });
        if (!r.report.is_synthetic && reserved)
          ctx.addIssue({
            code: "custom",
            path: ["prospects", i, "official_website"],
            message: "reserved example domains are only allowed in synthetic reports",
          });
      }
    });
  });
export type ImportReportV1 = z.infer<typeof importReportV1>;

export type ImportIssue = { row: number | null; path: string; message: string };

/** Validate a parsed JSON value. Issues name the prospect (0-based) and field. */
export function validateImportReport(
  value: unknown,
): { ok: true; report: ImportReportV1 } | { ok: false; issues: ImportIssue[] } {
  const r = importReportV1.safeParse(value);
  if (r.success) return { ok: true, report: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => ({
      row:
        typeof i.path[1] === "number" && i.path[0] === "prospects"
          ? i.path[1] + 1
          : null,
      path: i.path.join("."),
      message: i.message,
    })),
  };
}
