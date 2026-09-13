import type { SupabaseClient } from "@supabase/supabase-js";
import { BarberosError } from "./barberos";

/**
 * The client record, as this app sees it.
 *
 * Same shape of discipline as barberos.ts: the mappings are pure and tested,
 * because they are where a wrong reading becomes a wrong thing said to a
 * barber about their own customer.
 *
 * THE ONE READING THAT MATTERS MOST: a client's rhythm. `typicalDays` is null
 * until the database has three visits to work from, and this app must never
 * turn that null into a number. "Marcus is overdue" computed from one haircut
 * is how the shop stops trusting the screen.
 */

export interface ClientSummary {
  id: string;
  displayName: string;
  phone: string | null;
  visits: number;
  lastVisit: string | null;
}

export interface Rhythm {
  visits: number;
  lastVisit: string | null;
  daysSinceLast: number | null;
  /** Null until there are enough visits. Never fill this in. */
  typicalDays: number | null;
  /** Why it is or is not known, in the database's own words. */
  basis: string;
  overdueByDays: number | null;
}

export interface Visit {
  id: string;
  visitedOn: string;
  barber: string | null;
  serviceName: string | null;
  priceCents: number | null;
  durationMinutes: number | null;
  sidesGuard: number | null;
  topFinish: string | null;
  topGuard: number | null;
  fade: string | null;
  beard: boolean;
  beardGuard: number | null;
  lineUp: boolean;
  part: boolean;
  notes: string | null;
  tools: string[];
}

export interface ClientValue {
  totalCents: number;
  visits: number;
  /** The gap in the number above, always carried with it. */
  visitsWithoutAPrice: number;
}

export interface ClientDetail {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  since: string | null;
  value: ClientValue;
  rhythm: Rhythm;
  visits: Visit[];
}

export interface DueClient {
  id: string;
  displayName: string;
  phone: string | null;
  lastVisit: string | null;
  typicalDays: number;
  overdueByDays: number;
}

export const TOP_FINISHES = ["guard", "scissor", "razor", "freehand"] as const;
export const FADES = ["none", "taper", "low", "mid", "high", "skin"] as const;
/** 0 is skin; 8 is the longest guard in common use. Mirrors the constraint. */
export const GUARDS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}
function int(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^-?\d+$/.test(v)) return Number(v);
  return null;
}

export function toRhythm(v: unknown): Rhythm {
  const r = obj(v) ?? {};
  const typical = int(r["typical_days"]);
  return {
    visits: int(r["visits"]) ?? 0,
    lastVisit: str(r["last_visit"]),
    daysSinceLast: int(r["days_since_last"]),
    typicalDays: typical,
    basis: str(r["basis"]) ?? "not enough visits to know a rhythm",
    // Overdue is meaningless without a rhythm, and showing a number here when
    // the database declined to give one would invent the whole judgement.
    overdueByDays: typical === null ? null : int(r["overdue_by_days"]),
  };
}

export function toVisit(v: unknown): Visit | null {
  const o = obj(v);
  const id = o === null ? null : str(o["id"]);
  const on = o === null ? null : str(o["visited_on"]);
  if (o === null || id === null || on === null) return null;
  return {
    id,
    visitedOn: on,
    barber: str(o["barber"]),
    serviceName: str(o["service_name"]),
    priceCents: int(o["price_cents"]),
    durationMinutes: int(o["duration_minutes"]),
    sidesGuard: int(o["sides_guard"]),
    topFinish: str(o["top_finish"]),
    topGuard: int(o["top_guard"]),
    fade: str(o["fade"]),
    beard: o["beard"] === true,
    beardGuard: int(o["beard_guard"]),
    lineUp: o["line_up"] === true,
    part: o["part"] === true,
    notes: str(o["notes"]),
    tools: arr(o["tools"]).flatMap((t) => {
      const n = str(t);
      return n === null ? [] : [n];
    }),
  };
}

export function toClientDetail(v: unknown): ClientDetail | null {
  const c = obj(v);
  const id = c === null ? null : str(c["id"]);
  if (c === null || id === null) return null;
  const value = obj(c["value"]) ?? {};
  return {
    id,
    displayName: str(c["display_name"]) ?? "This client",
    phone: str(c["phone"]),
    email: str(c["email"]),
    notes: str(c["notes"]),
    since: str(c["since"]),
    value: {
      totalCents: int(value["total_cents"]) ?? 0,
      visits: int(value["visits"]) ?? 0,
      visitsWithoutAPrice: int(value["visits_without_a_price"]) ?? 0,
    },
    rhythm: toRhythm(c["rhythm"]),
    visits: arr(c["visits"]).flatMap((x) => {
      const visit = toVisit(x);
      return visit === null ? [] : [visit];
    }),
  };
}

export function toClientSummaries(v: unknown): ClientSummary[] {
  return arr(v).flatMap((x) => {
    const o = obj(x);
    const id = o === null ? null : str(o["id"]);
    if (o === null || id === null) return [];
    return [
      {
        id,
        displayName: str(o["display_name"]) ?? "This client",
        phone: str(o["phone"]),
        visits: int(o["visits"]) ?? 0,
        lastVisit: str(o["last_visit"]),
      },
    ];
  });
}

export function toDueClients(v: unknown): DueClient[] {
  return arr(v).flatMap((x) => {
    const o = obj(x);
    const id = o === null ? null : str(o["id"]);
    const typical = o === null ? null : int(o["typical_days"]);
    const overdue = o === null ? null : int(o["overdue_by_days"]);
    // A row with no rhythm has no business on this list; the database already
    // filters them out, and reading one here would mean something changed.
    if (o === null || id === null || typical === null || overdue === null) return [];
    return [
      {
        id,
        displayName: str(o["display_name"]) ?? "This client",
        phone: str(o["phone"]),
        lastVisit: str(o["last_visit"]),
        typicalDays: typical,
        overdueByDays: overdue,
      },
    ];
  });
}

/** Money. Null stays null; an unpriced visit is never rendered as free. */
export function money(cents: number | null): string | null {
  return cents === null ? null : `$${(cents / 100).toFixed(2)}`;
}

/**
 * The cut, in one line, the way a barber would say it.
 *
 * Returns null when nothing about the cut was recorded -- so the screen can
 * say "no cut details" rather than print an empty string that looks like a
 * rendering bug.
 */
export function describeCut(v: Visit): string | null {
  const parts: string[] = [];
  if (v.sidesGuard !== null) {
    parts.push(v.sidesGuard === 0 ? "skin sides" : `#${v.sidesGuard} sides`);
  }
  if (v.topFinish !== null) {
    parts.push(
      v.topFinish === "guard" && v.topGuard !== null
        ? `#${v.topGuard} on top`
        : `${v.topFinish} on top`,
    );
  }
  if (v.fade !== null && v.fade !== "none") parts.push(`${v.fade} fade`);
  if (v.beard) {
    parts.push(v.beardGuard === null ? "beard" : `beard #${v.beardGuard}`);
  }
  if (v.lineUp) parts.push("line-up");
  if (v.part) parts.push("part");
  return parts.length === 0 ? null : parts.join(", ");
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

async function rpc(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const res = (await client.rpc(fn, args)) as {
    data: unknown;
    error: { message: string } | null;
  };
  if (res.error !== null) throw new BarberosError(res.error.message);
  return res.data;
}

export async function listClients(
  client: SupabaseClient,
  tenantId: string,
  search: string,
): Promise<ClientSummary[]> {
  return toClientSummaries(
    await rpc(client, "barberos_clients", {
      p_tenant: tenantId,
      p_search: search === "" ? null : search,
    }),
  );
}

export async function loadClient(
  client: SupabaseClient,
  clientId: string,
): Promise<ClientDetail | null> {
  return toClientDetail(await rpc(client, "barberos_client", { p_client: clientId }));
}

export async function saveClient(
  client: SupabaseClient,
  tenantId: string,
  c: { name: string; phone: string | null; email: string | null; notes: string | null },
): Promise<void> {
  await rpc(client, "barberos_save_client", {
    p_tenant: tenantId,
    p_name: c.name,
    p_phone: c.phone,
    p_email: c.email,
    p_notes: c.notes,
  });
}

export async function recordVisit(
  client: SupabaseClient,
  tenantId: string,
  clientId: string,
  visit: Record<string, unknown>,
): Promise<void> {
  await rpc(client, "barberos_record_visit", {
    p_tenant: tenantId,
    p_client: clientId,
    p_visit: visit,
  });
}

export async function clientsDue(
  client: SupabaseClient,
  tenantId: string,
): Promise<DueClient[]> {
  return toDueClients(
    await rpc(client, "barberos_clients_due", { p_tenant: tenantId }),
  );
}

export async function shopTools(
  client: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  return arr(await rpc(client, "barberos_tools", { p_tenant: tenantId })).flatMap(
    (t) => {
      const n = str(obj(t)?.["name"]);
      return n === null ? [] : [n];
    },
  );
}
