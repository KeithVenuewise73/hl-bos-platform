import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The BarberOS API, as this app sees it.
 *
 * Every call goes through the `public.barberos_*` functions migration 0056
 * added, as the signed-in barber. The mappings below are PURE and unit-tested,
 * because they are where a wrong reading turns into a wrong screen -- and two
 * of those readings decide whether a control is drawn at all.
 *
 * ---------------------------------------------------------------------------
 * TWO DEFAULTS, BOTH CHOSEN FOR WHICH WAY IT IS SAFE TO BE WRONG
 *
 *   * A PERMISSION we do not recognise reads as FALSE. The app never assumes
 *     it may do something. Being wrong this way hides a button from someone
 *     entitled to it, which they will tell us about; being wrong the other way
 *     shows a button that fails when pressed.
 *
 *   * A PAGE STATUS we do not recognise reads as `draft`. Being wrong this way
 *     shows a live page as not-live, and the barber publishes again -- which
 *     is harmless. The other way tells a shop its page is on the internet when
 *     it is not, and they find out from a customer who could not find them.
 */

export type SiteStatus = "draft" | "published" | "unpublished";

export interface ShopPermissions {
  readShop: boolean;
  editPage: boolean;
  publish: boolean;
  manageShop: boolean;
}

export interface Shop {
  tenantId: string;
  tenantSlug: string | null;
  shopName: string;
  chairCount: number | null;
  timezone: string | null;
  /** Capability keys actually switched on for this shop. */
  capabilities: string[];
  /** Null when the shop has no page yet, which is different from a blank one. */
  site: { slug: string; status: SiteStatus } | null;
  can: ShopPermissions;
}

export interface SiteHour {
  day: number;
  closed: boolean;
  opens: string | null;
  closes: string | null;
}

export interface SiteService {
  name: string;
  priceCents: number | null;
  durationMinutes: number | null;
}

export interface SiteLink {
  kind: string;
  url: string;
}

export interface SiteContent {
  slug: string;
  status: SiteStatus;
  shopName: string | null;
  headline: string | null;
  about: string | null;
  phone: string | null;
  addressLine1: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  mapUrl: string | null;
  bookingUrl: string | null;
  publishedAt: string | null;
  hours: SiteHour[];
  services: SiteService[];
  links: SiteLink[];
}

/** The six link kinds the renderer knows how to label. A seventh is refused. */
export const LINK_KINDS = [
  "instagram",
  "facebook",
  "google_business",
  "tiktok",
  "yelp",
  "x",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** Sunday-first, matching `barberos.site_hours.day_of_week`. */
export const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Where shop pages are served from.
 *
 * A CONSTANT, not a setting: it is a fact about the business, and if it changes
 * the change belongs in a reviewed commit beside the reason. The Control
 * Center holds the same address the same way, for the same reason.
 */
export const SHOP_PAGES_BASE = "https://shops.hermanlegacydigital.com";

/** The capability this app's page editor requires to be switched on. */
export const OWNED_WEBSITE = "owned_website";

// ---------------------------------------------------------------------------
// Mapping
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

/** Strictly true. Anything else -- absent, a string, null -- is not permission. */
function may(v: unknown): boolean {
  return v === true;
}

export function toStatus(v: unknown): SiteStatus {
  const s = str(v);
  return s === "published" || s === "unpublished" ? s : "draft";
}

export function toShop(raw: unknown): Shop | null {
  const r = obj(raw);
  const tenantId = r === null ? null : str(r["tenant_id"]);
  if (r === null || tenantId === null) return null;

  const can = obj(r["can"]) ?? {};
  const site = obj(r["site"]);
  return {
    tenantId,
    tenantSlug: str(r["tenant_slug"]),
    shopName: str(r["shop_name"]) ?? "This shop",
    chairCount: int(r["chair_count"]),
    timezone: str(r["timezone"]),
    capabilities: arr(r["capabilities"]).flatMap((c) => {
      const k = str(c);
      return k === null ? [] : [k];
    }),
    // A site block with no slug is not a page. Reading it as one would show a
    // "published" badge for something that does not exist.
    site:
      site === null || str(site["slug"]) === null
        ? null
        : { slug: str(site["slug"])!, status: toStatus(site["status"]) },
    can: {
      readShop: may(can["read_shop"]),
      editPage: may(can["edit_page"]),
      publish: may(can["publish"]),
      manageShop: may(can["manage_shop"]),
    },
  };
}

export function toShops(raw: unknown): Shop[] {
  return arr(raw).flatMap((s) => {
    const shop = toShop(s);
    return shop === null ? [] : [shop];
  });
}

export function toSite(raw: unknown): SiteContent | null {
  const r = obj(raw);
  if (r === null) return null;
  const slug = str(r["slug"]);
  if (slug === null) return null;
  return {
    slug,
    status: toStatus(r["status"]),
    shopName: str(r["shop_name"]),
    headline: str(r["headline"]),
    about: str(r["about"]),
    phone: str(r["phone"]),
    addressLine1: str(r["address_line1"]),
    locality: str(r["locality"]),
    region: str(r["region"]),
    postalCode: str(r["postal_code"]),
    mapUrl: str(r["map_url"]),
    bookingUrl: str(r["booking_url"]),
    publishedAt: str(r["published_at"]),
    hours: arr(r["hours"]).flatMap((h) => {
      const o = obj(h);
      const day = o === null ? null : int(o["day"]);
      if (o === null || day === null) return [];
      return [
        {
          day,
          closed: o["closed"] === true,
          opens: str(o["opens"]),
          closes: str(o["closes"]),
        },
      ];
    }),
    services: arr(r["services"]).flatMap((s) => {
      const o = obj(s);
      const name = o === null ? null : str(o["name"]);
      if (o === null || name === null) return [];
      return [
        {
          name,
          priceCents: int(o["price_cents"]),
          durationMinutes: int(o["duration_minutes"]),
        },
      ];
    }),
    links: arr(r["links"]).flatMap((l) => {
      const o = obj(l);
      const kind = o === null ? null : str(o["kind"]);
      const url = o === null ? null : str(o["url"]);
      if (kind === null || url === null) return [];
      return [{ kind, url }];
    }),
  };
}

/**
 * What still has to be filled in before this page may go on the internet.
 *
 * The database's `sites_publishable` trigger is the authority and will refuse
 * regardless; this exists so the app can say WHICH THINGS are missing before
 * the barber presses a button, rather than only after. It is deliberately the
 * same four rules -- if they ever drift, the trigger wins and the barber gets
 * its message, which is still true.
 */
export function missingBeforePublish(site: SiteContent | null): string[] {
  if (site === null) return ["the page itself"];
  const missing: string[] = [];
  if (site.headline === null) missing.push("a headline");
  if (site.addressLine1 === null) missing.push("a street address");
  if (site.phone === null && site.bookingUrl === null)
    missing.push("a phone number or a booking link");
  if (site.hours.length === 0) missing.push("opening hours for at least one day");
  return missing;
}

/** Money, as a shop writes it. Null stays null -- never rendered as $0.00. */
export function money(cents: number | null): string | null {
  if (cents === null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

/** "$35" or "$35.50" -> 3500 / 3550. Anything unparseable is null, not zero. */
export function toCents(text: string): number | null {
  const t = text.trim().replace(/^\$/, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/**
 * A failed call carries the DATABASE's message, not a replacement.
 *
 * "this page cannot be published yet: it is missing a street address" is the
 * single most useful sentence this app can show a barber. Swapping it for
 * "Something went wrong" would throw away the only part that tells them what
 * to do next.
 */
export class BarberosError extends Error {}

async function rpc(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Asserted rather than inferred: supabase-js types rpc() as `any`, and an
  // unchecked `any` flowing into the mappings would defeat the point of them.
  // `unknown` is deliberate -- every caller runs the result through a mapping
  // that refuses anything it does not recognise.
  const res = (await client.rpc(fn, args)) as {
    data: unknown;
    error: { message: string } | null;
  };
  if (res.error !== null) throw new BarberosError(res.error.message);
  return res.data;
}

export async function myShops(client: SupabaseClient): Promise<Shop[]> {
  return toShops(await rpc(client, "barberos_my_shops", {}));
}

export async function loadSite(
  client: SupabaseClient,
  tenantId: string,
): Promise<SiteContent | null> {
  return toSite(await rpc(client, "barberos_site", { p_tenant: tenantId }));
}

export interface SiteFields {
  slug: string;
  headline?: string | null;
  about?: string | null;
  phone?: string | null;
  address?: string | null;
  locality?: string | null;
  region?: string | null;
  postal?: string | null;
  mapUrl?: string | null;
  bookingUrl?: string | null;
}

export async function saveSite(
  client: SupabaseClient,
  tenantId: string,
  f: SiteFields,
): Promise<void> {
  await rpc(client, "barberos_save_site", {
    p_tenant: tenantId,
    p_slug: f.slug,
    p_headline: f.headline ?? null,
    p_about: f.about ?? null,
    p_phone: f.phone ?? null,
    p_address: f.address ?? null,
    p_locality: f.locality ?? null,
    p_region: f.region ?? null,
    p_postal: f.postal ?? null,
    p_map_url: f.mapUrl ?? null,
    p_booking_url: f.bookingUrl ?? null,
  });
}

export async function setHours(
  client: SupabaseClient,
  tenantId: string,
  h: SiteHour,
): Promise<void> {
  await rpc(client, "barberos_set_hours", {
    p_tenant: tenantId,
    p_day: h.day,
    p_closed: h.closed,
    p_opens: h.closed ? null : h.opens,
    p_closes: h.closed ? null : h.closes,
  });
}

export async function saveService(
  client: SupabaseClient,
  tenantId: string,
  s: SiteService & { order?: number },
): Promise<void> {
  await rpc(client, "barberos_save_service", {
    p_tenant: tenantId,
    p_name: s.name,
    p_price_cents: s.priceCents,
    p_duration: s.durationMinutes,
    p_order: s.order ?? 0,
  });
}

export async function deleteService(
  client: SupabaseClient,
  tenantId: string,
  name: string,
): Promise<boolean> {
  return (
    (await rpc(client, "barberos_delete_service", {
      p_tenant: tenantId,
      p_name: name,
    })) === true
  );
}

export async function setLink(
  client: SupabaseClient,
  tenantId: string,
  kind: string,
  url: string | null,
): Promise<void> {
  await rpc(client, "barberos_set_link", {
    p_tenant: tenantId,
    p_kind: kind,
    p_url: url,
  });
}

export async function publish(
  client: SupabaseClient,
  tenantId: string,
): Promise<SiteStatus> {
  return toStatus(await rpc(client, "barberos_publish", { p_tenant: tenantId }));
}

export async function unpublish(
  client: SupabaseClient,
  tenantId: string,
): Promise<SiteStatus> {
  return toStatus(await rpc(client, "barberos_unpublish", { p_tenant: tenantId }));
}
