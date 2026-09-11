/**
 * The proposal screens' SQL and mappings.
 *
 * Pure, like shop-audit-sql.ts and discovery-sql.ts and for the same reason:
 * these statements run against a real PostgreSQL carrying the same migrations
 * during verification, and the mappings are unit-tested. Nothing here holds a
 * token or calls fetch.
 *
 * READS go straight at the tables with an explicit tenant filter. The SQL
 * endpoint connects as `postgres`, so `auth.uid()` is NULL and the
 * permission-checked read functions would refuse -- correctly. WRITES take the
 * opposite route: they assume the tenant owner and go through the
 * SECURITY DEFINER functions, so the console cannot store what the application
 * would refuse. `asTenantOwner` is that switch, shared with the call screen.
 */

import { asTenantOwner, lit, type SqlRunner } from "./shop-audit-sql";
import type { CapabilityOffer, ShopStack } from "./capability-match";
import { tri } from "./discovery-sql";
import type { AuditSnapshot, ProposalDocument } from "./proposal-doc";

export type { SqlRunner };

export type ProposalStatus = "draft" | "sent" | "accepted" | "declined" | "withdrawn";

const STATUSES: readonly ProposalStatus[] = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "withdrawn",
];

export interface ProposalSummary {
  id: string;
  status: ProposalStatus;
  createdAt: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  offerLines: number;
}

/** One stored proposal, with its frozen document. */
export interface StoredProposal extends ProposalSummary {
  document: ProposalDocument;
  decisionNote: string | null;
}

/** The live material a NEW proposal is assembled from. */
export interface AssembleContext {
  shop: {
    name: string;
    locality: string | null;
    website_url: string | null;
    phone: string | null;
  };
  runId: string | null;
  audit: AuditSnapshot | null;
  stack: ShopStack;
  answeredAt: string | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function int(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^-?\d+$/.test(v)) return Number(v);
  return null;
}

/**
 * A jsonb column, whichever way the transport hands it over.
 *
 * node-postgres parses jsonb into an object; the Management API's JSON body
 * may deliver it as a string. Both sit behind this code.
 */
function obj(v: unknown): Record<string, unknown> | null {
  if (typeof v === "string") {
    try {
      const parsed: unknown = JSON.parse(v);
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function arr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * An unrecognised status reads as `draft`.
 *
 * Under-reading a status leaves a document looking un-sent, which is
 * recoverable. Over-reading one would show a draft as sent and stop anyone
 * sending the real thing.
 */
export function toStatus(v: unknown): ProposalStatus {
  const s = str(v);
  return s !== null && (STATUSES as readonly string[]).includes(s)
    ? (s as ProposalStatus)
    : "draft";
}

export function toSummary(r: Record<string, unknown>): ProposalSummary {
  const doc = obj(r["document"]);
  return {
    id: str(r["id"]) ?? "",
    status: toStatus(r["status"]),
    createdAt: str(r["created_at"]),
    sentAt: str(r["sent_at"]),
    decidedAt: str(r["decided_at"]),
    offerLines: int(r["offer_lines"]) ?? (doc === null ? 0 : arr(doc["offer"]).length),
  };
}

/** The stored document, with every field the renderer needs guaranteed present. */
export function toDocument(v: unknown): ProposalDocument {
  const d = obj(v) ?? {};
  const shop = obj(d["shop"]) ?? {};
  const inv = obj(d["investment"]) ?? {};
  return {
    shop: {
      name: str(shop["name"]) ?? "This shop",
      locality: str(shop["locality"]),
      website_url: str(shop["website_url"]),
      phone: str(shop["phone"]),
    },
    prepared_by: str(d["prepared_by"]) ?? "",
    prepared_at: str(d["prepared_at"]) ?? "",
    message: str(d["message"]) ?? "",
    // A malformed audit or call block becomes null, which the renderer prints
    // as "no audit was run" -- wrong, but visibly wrong. Silently dropping the
    // section would read as "nothing to report".
    audit: toAudit(d["audit"]),
    call: toCall(d["call"]),
    offer: arr(d["offer"]).flatMap((o) => {
      const l = obj(o);
      const key = l === null ? null : str(l["capability"]);
      if (l === null || key === null) return [];
      return [
        {
          capability: key,
          name: str(l["name"]) ?? key,
          because: str(l["because"]) ?? "",
          recovers: str(l["recovers"]) ?? "",
          deliverable_today: l["deliverable_today"] === true,
          needs_confirming: l["needs_confirming"] === true,
        },
      ];
    }),
    investment: {
      lines: arr(inv["lines"]).flatMap((x) => {
        const l = obj(x);
        const label = l === null ? null : str(l["label"]);
        if (l === null || label === null) return [];
        return [
          {
            label,
            amount: str(l["amount"]) ?? "",
            cadence:
              l["cadence"] === "monthly" ? ("monthly" as const) : ("once" as const),
          },
        ];
      }),
      note: str(inv["note"]) ?? "",
    },
    next_steps: arr(d["next_steps"]).flatMap((s) => {
      const t = str(s);
      return t === null ? [] : [t];
    }),
  };
}

function toAudit(v: unknown): AuditSnapshot | null {
  const a = obj(v);
  if (a === null) return null;
  const cov = obj(a["coverage"]) ?? {};
  return {
    run_at: str(a["run_at"]),
    composite: int(a["composite"]),
    coverage: { scored: int(cov["scored"]) ?? 0, possible: int(cov["possible"]) ?? 0 },
    findings: arr(a["findings"]).flatMap((x) => {
      const f = obj(x);
      const statement = f === null ? null : str(f["statement"]);
      if (f === null || statement === null) return [];
      return [
        {
          code: str(f["code"]) ?? "",
          dimension: str(f["dimension"]) ?? "",
          statement,
          evidence_url: str(f["evidence_url"]),
          confidence: str(f["confidence"]) ?? "unknown",
          severity: str(f["severity"]) ?? "info",
        },
      ];
    }),
  };
}

function toCall(v: unknown): ProposalDocument["call"] {
  const c = obj(v);
  if (c === null) return null;
  return {
    answered_at: str(c["answered_at"]),
    said: arr(c["said"]).flatMap((x) => {
      const s = obj(x);
      const label = s === null ? null : str(s["label"]);
      if (s === null || label === null) return [];
      const detail = str(s["detail"]);
      return [
        {
          label,
          answer: s["answer"] === "yes" ? ("yes" as const) : ("no" as const),
          ...(detail === null ? {} : { detail }),
        },
      ];
    }),
    not_asked: arr(c["not_asked"]).flatMap((s) => {
      const t = str(s);
      return t === null ? [] : [t];
    }),
    notes: str(c["notes"]) ?? "",
  };
}

export function toStoredProposal(r: Record<string, unknown>): StoredProposal {
  return {
    ...toSummary(r),
    document: toDocument(r["document"]),
    decisionNote: str(r["decision_note"]),
  };
}

export function toAssembleContext(r: Record<string, unknown>): AssembleContext {
  const runId = str(r["run_id"]);
  return {
    shop: {
      name: str(r["business_name"]) ?? "This shop",
      locality: str(r["locality"]),
      website_url: str(r["website_url"]),
      phone: str(r["phone"]),
    },
    runId,
    // No run means no audit, and the document says exactly that rather than
    // printing an empty scorecard.
    audit:
      runId === null
        ? null
        : {
            run_at: str(r["run_at"]),
            composite: int(r["composite_score"]),
            coverage: {
              scored: int(r["dimensions_scored"]) ?? 0,
              possible: int(r["dimensions_possible"]) ?? 0,
            },
            findings: arr(r["findings"]).flatMap((x) => {
              const f = obj(x);
              const statement = f === null ? null : str(f["statement"]);
              if (f === null || statement === null) return [];
              return [
                {
                  code: str(f["code"]) ?? "",
                  dimension: str(f["dimension"]) ?? "",
                  statement,
                  evidence_url: str(f["evidence_url"]),
                  confidence: str(f["confidence"]) ?? "unknown",
                  severity: str(f["severity"]) ?? "info",
                },
              ];
            }),
          },
    answeredAt: str(r["answered_at"]),
    notes: str(r["notes"]) ?? "",
    stack: {
      ownWebsite: tri(r["own_website"]),
      bookingPlatform: str(r["booking_platform"]),
      onlineBooking: tri(r["online_booking"]),
      missedCallHandling: tri(r["missed_call_handling"]),
      reviewProcess: tri(r["review_process"]),
      clientRecords: tri(r["client_records"]),
      takesWalkIns: tri(r["takes_walkins"]),
      chairs: int(r["chairs"]),
    },
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Everything a NEW proposal is assembled from, in one statement: the shop, its
 * most recent audit with that run's findings, and what the shop said on the
 * call.
 *
 * Only findings that carry a verdict are taken. An `unknown`-confidence
 * finding is a record that we could NOT observe something -- useful to the
 * audit, and not a sentence to put in front of a shop as if it were a
 * discovery about them.
 */
export const ASSEMBLE_SQL = (tenantSlug: string, prospectId: string) => `
with t as (select id from platform.tenants where slug = ${lit(tenantSlug)}),
     lr as (select r.* from transform_audit.runs r
             where r.prospect_id = ${lit(prospectId)}::uuid
               and r.tenant_id = (select id from t)
               and r.status in ('completed','partially_completed')
             order by r.started_at desc limit 1)
select p.business_name, p.phone, p.website_url,
       sp.locality,
       lr.id as run_id, lr.started_at::text as run_at, lr.composite_score,
       lr.dimensions_scored, lr.dimensions_possible,
       (select jsonb_agg(jsonb_build_object(
                 'code', f.code::text, 'dimension', f.dimension::text,
                 'statement', f.statement, 'evidence_url', f.evidence_url,
                 'confidence', f.confidence::text, 'severity', f.severity::text)
               order by f.severity desc, f.id)
          from transform_audit.findings f
         where f.run_id = lr.id and f.confidence <> 'unknown') as findings,
       d.answered_at::text as answered_at,
       d.own_website, d.booking_platform, d.online_booking,
       d.missed_call_handling, d.review_process, d.client_records,
       d.takes_walkins, d.chairs, d.notes
  from visibility.prospects p
  left join transform_audit.shop_profiles sp on sp.prospect_id = p.id
  left join transform_audit.discovery d on d.prospect_id = p.id
  left join lr on true
 where p.id = ${lit(prospectId)}::uuid
   and p.tenant_id = (select id from t)`;

export const PROPOSALS_SQL = (tenantSlug: string, prospectId: string) => `
with t as (select id from platform.tenants where slug = ${lit(tenantSlug)})
select pr.id::text as id, pr.status::text as status,
       pr.created_at::text as created_at, pr.sent_at::text as sent_at,
       pr.decided_at::text as decided_at,
       jsonb_array_length(coalesce(pr.document->'offer','[]'::jsonb)) as offer_lines
  from transform_audit.proposals pr
 where pr.prospect_id = ${lit(prospectId)}::uuid
   and pr.tenant_id = (select id from t)
 order by pr.created_at desc`;

export const PROPOSAL_SQL = (tenantSlug: string, proposalId: string) => `
with t as (select id from platform.tenants where slug = ${lit(tenantSlug)})
select pr.id::text as id, pr.prospect_id::text as prospect_id,
       pr.status::text as status, pr.document,
       pr.created_at::text as created_at, pr.sent_at::text as sent_at,
       pr.decided_at::text as decided_at, pr.decision_note
  from transform_audit.proposals pr
 where pr.id = ${lit(proposalId)}::uuid
   and pr.tenant_id = (select id from t)`;

// ---------------------------------------------------------------------------
// Writes -- every one of them as the tenant owner
// ---------------------------------------------------------------------------

export const DRAFT_SQL = (
  tenantSlug: string,
  prospectId: string,
  runId: string | null,
  document: ProposalDocument,
) =>
  asTenantOwner(
    tenantSlug,
    `  perform transform_audit.draft_proposal(
    ${lit(prospectId)}::uuid,
    ${runId === null ? "null" : `${lit(runId)}::uuid`},
    ${lit(JSON.stringify(document))}::jsonb);`,
  );

export const SAVE_SQL = (
  tenantSlug: string,
  proposalId: string,
  document: ProposalDocument,
) =>
  asTenantOwner(
    tenantSlug,
    `  perform transform_audit.save_proposal(
    ${lit(proposalId)}::uuid, ${lit(JSON.stringify(document))}::jsonb);`,
  );

export const SEND_SQL = (tenantSlug: string, proposalId: string) =>
  asTenantOwner(
    tenantSlug,
    `  perform transform_audit.send_proposal(${lit(proposalId)}::uuid);`,
  );

export const DECIDE_SQL = (
  tenantSlug: string,
  proposalId: string,
  status: "accepted" | "declined" | "withdrawn",
  note: string,
) =>
  asTenantOwner(
    tenantSlug,
    `  perform transform_audit.decide_proposal(
    ${lit(proposalId)}::uuid, ${lit(status)},
    ${note === "" ? "null" : lit(note)});`,
  );

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/**
 * The BarberOS catalog, from the database rather than a constant in this app.
 *
 * When a module is promoted from `planned` to `available` by migration, every
 * proposal drafted afterwards starts saying so, with nothing to redeploy.
 */
export const CATALOG_SQL = () => `
select c.key::text as key, c.name, c.status::text as status, c.description
  from barberos.capabilities c
 order by c.key`;

export async function loadCatalog(run: SqlRunner): Promise<CapabilityOffer[]> {
  return (await run(CATALOG_SQL())).flatMap((r) => {
    const key = str(r["key"]);
    if (key === null) return [];
    const status = str(r["status"]);
    return [
      {
        key,
        name: str(r["name"]) ?? key,
        // Under-promising costs a slower sale; over-promising costs a contract
        // we cannot honour. An unrecognised status is `planned`.
        status:
          status === "available" || status === "planned" || status === "deferred"
            ? status
            : ("planned" as const),
        description: str(r["description"]) ?? "",
      },
    ];
  });
}

export async function loadAssembleContext(
  run: SqlRunner,
  tenantSlug: string,
  prospectId: string,
): Promise<AssembleContext | null> {
  const rows = await run(ASSEMBLE_SQL(tenantSlug, prospectId));
  const r = rows[0];
  return r === undefined ? null : toAssembleContext(r);
}

export async function loadProposals(
  run: SqlRunner,
  tenantSlug: string,
  prospectId: string,
): Promise<ProposalSummary[]> {
  return (await run(PROPOSALS_SQL(tenantSlug, prospectId))).map(toSummary);
}

export async function loadProposal(
  run: SqlRunner,
  tenantSlug: string,
  proposalId: string,
): Promise<(StoredProposal & { prospectId: string }) | null> {
  const rows = await run(PROPOSAL_SQL(tenantSlug, proposalId));
  const r = rows[0];
  if (r === undefined) return null;
  return { ...toStoredProposal(r), prospectId: str(r["prospect_id"]) ?? "" };
}
