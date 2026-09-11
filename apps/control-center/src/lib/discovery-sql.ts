/**
 * The discovery call screen's SQL and mappings.
 *
 * Pure, like shop-audit-sql.ts and for the same reason: these statements run
 * against a real PostgreSQL carrying the same migrations during verification,
 * and the mappings are unit-tested. Nothing here holds a token or calls fetch.
 */

import { lit, type SqlRunner } from "./shop-audit-sql";
import type { CapabilityOffer, ShopStack } from "./capability-match";

export type { SqlRunner };

/** What the call screen needs to open. */
export interface CallContext {
  shopName: string;
  locality: string | null;
  phone: string | null;
  /** Null until somebody has actually spoken to them. */
  answeredAt: string | null;
  stack: ShopStack;
  notes: string;
  catalog: CapabilityOffer[];
}

/**
 * Everything the screen opens with, in one statement.
 *
 * The catalog comes from the database rather than a constant in this app: if a
 * module is promoted from `planned` to `available`, every proposal should start
 * saying so the moment the migration lands, with nothing to redeploy.
 */
export const CALL_SQL = (tenantSlug: string, prospectId: string) => `
with t as (select id from platform.tenants where slug = ${lit(tenantSlug)})
select p.business_name,
       p.phone,
       sp.locality,
       d.answered_at::text as answered_at,
       d.own_website, d.booking_platform, d.online_booking,
       d.missed_call_handling, d.review_process, d.client_records,
       d.takes_walkins, d.chairs, d.notes,
       (select jsonb_agg(jsonb_build_object(
                 'key', c.key::text, 'name', c.name,
                 'status', c.status::text, 'description', c.description)
               order by c.key)
          from barberos.capabilities c) as catalog
  from visibility.prospects p
  left join transform_audit.shop_profiles sp on sp.prospect_id = p.id
  left join transform_audit.discovery d on d.prospect_id = p.id
 where p.id = ${lit(prospectId)}::uuid
   and p.tenant_id = (select id from t)`;

/**
 * A three-state answer out of the database.
 *
 * `undefined` and `null` both mean nobody asked. Anything else must be a real
 * boolean -- a string "true" from a JSON transport included, because the two
 * runners this code sits behind disagree about that and a silently-wrong
 * `false` here would put a claim in a proposal.
 */
export function tri(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v === "true" || v === "t") return true;
  if (v === "false" || v === "f") return false;
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function int(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^-?\d+$/.test(v)) return Number(v);
  return null;
}

function toCatalog(v: unknown): CapabilityOffer[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw) => {
    if (raw === null || typeof raw !== "object") return [];
    const o = raw as Record<string, unknown>;
    const key = str(o["key"]);
    const status = str(o["status"]);
    if (key === null) return [];
    // An unrecognised status is treated as `planned` rather than `available`:
    // the failure mode of under-promising is a slower sale, and the failure
    // mode of over-promising is a contract we cannot honour.
    const known =
      status === "available" || status === "planned" || status === "deferred"
        ? status
        : "planned";
    return [
      {
        key,
        name: str(o["name"]) ?? key,
        status: known,
        description: str(o["description"]) ?? "",
      },
    ];
  });
}

export function toCallContext(r: Record<string, unknown>): CallContext {
  return {
    shopName: str(r["business_name"]) ?? "This shop",
    locality: str(r["locality"]),
    phone: str(r["phone"]),
    answeredAt: str(r["answered_at"]),
    notes: str(r["notes"]) ?? "",
    catalog: toCatalog(r["catalog"]),
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

/** The answer keys `transform_audit.record_discovery` understands. */
export const ANSWER_KEYS = [
  "own_website",
  "booking_platform",
  "online_booking",
  "missed_call_handling",
  "review_process",
  "client_records",
  "takes_walkins",
  "chairs",
  "notes",
] as const;

export type AnswerKey = (typeof ANSWER_KEYS)[number];

/**
 * The payload for one save.
 *
 * A key that is ABSENT leaves the stored answer alone; a key whose value is
 * `null` clears it back to "nobody asked". That distinction is the migration's
 * whole design, so this builder refuses to guess: it copies only the keys it
 * was given, and passes nulls through.
 */
export function answersPayload(
  answers: Partial<Record<AnswerKey, boolean | number | string | null>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ANSWER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(answers, k)) out[k] = answers[k] ?? null;
  }
  return out;
}

/**
 * Record the call AS THE TENANT OWNER.
 *
 * The Management API's SQL endpoint connects as `postgres`, which bypasses RLS
 * and every permission check in the schema. Writing that way would mean the
 * console could store things the application itself would refuse. So this sets
 * the JWT claims and assumes `authenticated` first, and refuses outright if the
 * tenant has no active owner to act as -- the same rule scripts/lib/hlbos-sql
 * applies, for the same reason.
 */
export const RECORD_CALL_SQL = (
  tenantSlug: string,
  prospectId: string,
  payload: Record<string, unknown>,
) => `do $hl$
declare v_owner uuid;
begin
  select m.user_id into v_owner
    from identity.memberships m
    join identity.membership_roles mr on mr.membership_id = m.id
    join platform.tenants t on t.id = m.tenant_id
   where t.slug = ${lit(tenantSlug)} and m.status = 'active'
     and mr.role_key = 'tenant_owner'
   limit 1;
  if v_owner is null then
    raise exception 'tenant % has no active owner to act as; refusing to write as a superuser',
      ${lit(tenantSlug)};
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform transform_audit.record_discovery(
    ${lit(prospectId)}::uuid, ${lit(JSON.stringify(payload))}::jsonb);
  reset role;
end $hl$;`;

export async function loadCall(
  run: SqlRunner,
  tenantSlug: string,
  prospectId: string,
): Promise<CallContext | null> {
  const rows = await run(CALL_SQL(tenantSlug, prospectId));
  const r = rows[0];
  return r === undefined ? null : toCallContext(r);
}
