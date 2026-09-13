import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The appointment book, as this app sees it.
 *
 * Everything here is a PURE mapping over what `public.barberos_*` returned,
 * because this is the layer where an honest database answer turns into a
 * dishonest screen.
 *
 * THE ONE THAT MATTERS: `available_slots` never returns a bare empty list --
 * it always returns a `basis` saying why the list is what it is. A screen that
 * renders "no times" and drops the reason has thrown away the whole point:
 * "fully booked", "nobody entered this barber's rota" and "this service has no
 * duration recorded" look identical to a person, and only one of them means
 * the shop is busy. So `basis` is non-optional in the type below, and the
 * fallback when it is missing says that it is missing rather than inventing a
 * cheerful one.
 */

export interface BookingSettings {
  slotMinutes: number;
  leadTimeMinutes: number;
  maxDaysAhead: number;
  /** True when the shop has never changed these, so a screen can say so. */
  isDefault: boolean;
}

export interface WorkingDay {
  day: number;
  starts: string;
  ends: string;
}

export interface TimeOff {
  id: string;
  onDate: string;
  starts: string | null;
  ends: string | null;
  reason: string | null;
}

export interface Barber {
  id: string;
  displayName: string;
  active: boolean;
  /**
   * Whether a rota exists AT ALL. An empty `hours` array is ambiguous on its
   * own -- it is both "works no days" and "nobody has said" -- and those are
   * not the same thing to tell a shop.
   */
  hasARota: boolean;
  hours: WorkingDay[];
  timeOff: TimeOff[];
}

export interface BookableService {
  id: number;
  name: string;
  priceCents: number | null;
  durationMinutes: number | null;
  /** False when the shop never said how long it takes. */
  bookable: boolean;
}

export interface BookingBoard {
  timezone: string;
  settings: BookingSettings;
  barbers: Barber[];
  services: BookableService[];
}

export type AppointmentStatus = "booked" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  /** Already rendered in the shop's own timezone by the database. */
  localTime: string;
  status: AppointmentStatus;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  barberId: string;
  barberName: string;
  serviceName: string;
  priceCents: number | null;
  durationMinutes: number | null;
  notes: string | null;
  cancellationReason: string | null;
  visitId: string | null;
}

export interface DaySheet {
  date: string;
  timezone: string;
  appointments: Appointment[];
  inTheBook: number;
  expectedCents: number;
  /** Never readable without this. */
  appointmentsWithoutAPrice: number;
  cancelled: number;
  noShows: number;
}

export interface SlotAnswer {
  date: string;
  timezone: string;
  slotMinutes: number;
  barberName: string | null;
  serviceName: string | null;
  durationMinutes: number | null;
  slots: string[];
  /** Why the list is what it is. Never empty. */
  basis: string;
}

// ---------------------------------------------------------------------------

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

const STATUSES: AppointmentStatus[] = ["booked", "completed", "cancelled", "no_show"];

/**
 * An unrecognised status reads as `booked`.
 *
 * Chosen for which way it is safe to be wrong: showing a cancelled appointment
 * as still in the book wastes a barber thirty seconds. The other way round
 * hides somebody who is about to walk in.
 */
export function toStatus(v: unknown): AppointmentStatus {
  const s = str(v);
  return STATUSES.includes(s as AppointmentStatus)
    ? (s as AppointmentStatus)
    : "booked";
}

export function toSettings(raw: unknown): BookingSettings {
  const r = obj(raw) ?? {};
  return {
    slotMinutes: int(r["slot_minutes"]) ?? 15,
    leadTimeMinutes: int(r["lead_time_minutes"]) ?? 0,
    maxDaysAhead: int(r["max_days_ahead"]) ?? 60,
    isDefault: r["is_default"] === true,
  };
}

export function toBarber(raw: unknown): Barber | null {
  const r = obj(raw);
  const id = r === null ? null : str(r["id"]);
  const name = r === null ? null : str(r["display_name"]);
  if (r === null || id === null || name === null) return null;

  const hours = arr(r["hours"]).flatMap((h) => {
    const o = obj(h);
    const day = o === null ? null : int(o["day_of_week"]);
    const starts = o === null ? null : str(o["starts_at"]);
    const ends = o === null ? null : str(o["ends_at"]);
    if (day === null || starts === null || ends === null) return [];
    return [{ day, starts, ends }];
  });

  return {
    id,
    displayName: name,
    // Absent reads as INACTIVE, not active: drawing a barber as bookable when
    // they have been retired puts a customer in front of an empty chair.
    active: r["active"] === true,
    // Trusted from the database rather than derived from hours.length, because
    // the two answer different questions and only the database can see the
    // difference between "no rows" and "rows we failed to map".
    hasARota: r["has_a_rota"] === true,
    hours,
    timeOff: arr(r["time_off"]).flatMap((t) => {
      const o = obj(t);
      const id2 = o === null ? null : str(o["id"]);
      const onDate = o === null ? null : str(o["on_date"]);
      if (o === null || id2 === null || onDate === null) return [];
      return [
        {
          id: id2,
          onDate,
          starts: str(o["starts_at"]),
          ends: str(o["ends_at"]),
          reason: str(o["reason"]),
        },
      ];
    }),
  };
}

export function toBoard(raw: unknown): BookingBoard {
  const r = obj(raw) ?? {};
  return {
    timezone: str(r["timezone"]) ?? "UTC",
    settings: toSettings(r["settings"]),
    barbers: arr(r["barbers"]).flatMap((b) => {
      const barber = toBarber(b);
      return barber === null ? [] : [barber];
    }),
    services: arr(r["services"]).flatMap((s) => {
      const o = obj(s);
      const id = o === null ? null : int(o["id"]);
      const name = o === null ? null : str(o["name"]);
      if (o === null || id === null || name === null) return [];
      const duration = int(o["duration_minutes"]);
      return [
        {
          id,
          name,
          priceCents: int(o["price_cents"]),
          durationMinutes: duration,
          // Derived from the duration rather than trusted, so a service can
          // never be offered for booking without a length to book it for.
          bookable: duration !== null && duration > 0,
        },
      ];
    }),
  };
}

export function toAppointment(raw: unknown): Appointment | null {
  const r = obj(raw);
  const id = r === null ? null : str(r["id"]);
  if (r === null || id === null) return null;
  const client = obj(r["client"]) ?? {};
  const barber = obj(r["barber"]) ?? {};
  return {
    id,
    startsAt: str(r["starts_at"]) ?? "",
    endsAt: str(r["ends_at"]) ?? "",
    localTime: str(r["local_time"]) ?? "",
    status: toStatus(r["status"]),
    clientId: str(client["id"]) ?? "",
    clientName: str(client["display_name"]) ?? "Someone",
    clientPhone: str(client["phone"]),
    barberId: str(barber["id"]) ?? "",
    barberName: str(barber["display_name"]) ?? "",
    serviceName: str(r["service_name"]) ?? "",
    priceCents: int(r["price_cents"]),
    durationMinutes: int(r["duration_minutes"]),
    notes: str(r["notes"]),
    cancellationReason: str(r["cancellation_reason"]),
    visitId: str(r["visit_id"]),
  };
}

export function toDaySheet(raw: unknown): DaySheet | null {
  const r = obj(raw);
  if (r === null) return null;
  const date = str(r["date"]);
  if (date === null) return null;
  const summary = obj(r["summary"]) ?? {};
  return {
    date,
    timezone: str(r["timezone"]) ?? "UTC",
    appointments: arr(r["appointments"]).flatMap((a) => {
      const appt = toAppointment(a);
      return appt === null ? [] : [appt];
    }),
    inTheBook: int(summary["in_the_book"]) ?? 0,
    expectedCents: int(summary["expected_cents"]) ?? 0,
    appointmentsWithoutAPrice: int(summary["appointments_without_a_price"]) ?? 0,
    cancelled: int(summary["cancelled"]) ?? 0,
    noShows: int(summary["no_shows"]) ?? 0,
  };
}

/**
 * The sentence shown when a database that has one goes missing.
 *
 * Deliberately not "fully booked" and not "no times available": if the reason
 * is lost between here and the screen, the screen has to say THAT, not guess.
 */
export const NO_BASIS_GIVEN =
  "the appointment book did not say why, which is a fault worth reporting";

export function toSlots(raw: unknown): SlotAnswer | null {
  const r = obj(raw);
  if (r === null) return null;
  const date = str(r["date"]);
  if (date === null) return null;
  const barber = obj(r["barber"]) ?? {};
  const service = obj(r["service"]) ?? {};
  return {
    date,
    timezone: str(r["timezone"]) ?? "UTC",
    slotMinutes: int(r["slot_minutes"]) ?? 15,
    barberName: str(barber["display_name"]),
    serviceName: str(service["name"]),
    durationMinutes: int(service["duration_minutes"]),
    slots: arr(r["slots"]).flatMap((s) => {
      const t = str(s);
      return t === null ? [] : [t];
    }),
    basis: str(r["basis"]) ?? NO_BASIS_GIVEN,
  };
}

/** Sunday-first, matching `barberos.barber_hours.day_of_week`. */
export const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** A time in the shop's own timezone, from an ISO instant. */
export function atShopTime(iso: string, timezone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(d);
  } catch {
    // An unknown timezone is a fault in the shop record, not a reason to
    // render a time that is silently in the wrong one.
    return "";
  }
}

/** Money, or the absence of it stated as such. Never "$0.00" for "not given". */
export function money(cents: number | null): string | null {
  if (cents === null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

type Client = SupabaseClient;

async function rpc(
  c: Client,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // `unknown`, not `any`: everything that comes back goes through a mapping
  // above, and typing it loosely here would let an unchecked shape reach a
  // screen without one.
  const res = (await c.rpc(fn, args)) as {
    data: unknown;
    error: { message: string } | null;
  };
  if (res.error !== null) throw new Error(res.error.message);
  return res.data;
}

export async function loadBoard(c: Client, tenant: string) {
  return toBoard(await rpc(c, "barberos_barbers", { p_tenant: tenant }));
}

export async function loadDaySheet(c: Client, tenant: string, date?: string) {
  return toDaySheet(
    await rpc(c, "barberos_day_sheet", {
      p_tenant: tenant,
      p_date: date ?? null,
    }),
  );
}

export async function loadSlots(
  c: Client,
  tenant: string,
  barber: string,
  service: number,
  date: string,
) {
  return toSlots(
    await rpc(c, "barberos_slots", {
      p_tenant: tenant,
      p_barber: barber,
      p_service: service,
      p_date: date,
    }),
  );
}
