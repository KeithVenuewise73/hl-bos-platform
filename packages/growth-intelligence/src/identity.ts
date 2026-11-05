// Business identity: one business, many spellings.
//
// A business is the same business when ANY of these match: its Google place
// ID, its website domain, its phone number, its email address, or its
// normalised name in the same city. The database stores every key
// (revenue.identity_keys) and refuses a second record on any match, so
// "Joe's Barber Shop, LLC" and "Joes Barbershop" in Buffalo are one business.

import type { Prospect } from "@hl-bos/presence-scanner";

const SUFFIXES =
  /\b(llc|l\.l\.c|inc|incorporated|co|corp|corporation|company|ltd|limited|pllc|pc|dds|dmd|the)\b/g;

/** Lower case, '&' -> 'and', no punctuation or spaces, no legal suffixes, no trailing "shop". */
export function normaliseBusinessName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['’`]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(SUFFIXES, " ")
      .replace(/\s+/g, "")
      // "Barber Shop" and "Barbershop" compact to the same word; drop a trailing "shop".
      .replace(/shop$/, "")
      .trim()
  );
}

export function normaliseDomain(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    // Social and link-in-bio hosts identify the platform, not the business.
    if (
      /(^|\.)(facebook|instagram|linktr|linkedin|yelp|google|business\.site|x|twitter)\.(com|ee|site)$/.test(
        host,
      )
    )
      return undefined;
    return host.includes(".") ? host : undefined;
  } catch {
    return undefined;
  }
}

export function normalisePhone(phone: string | undefined | null): string | undefined {
  if (!phone) return undefined;
  const d = phone.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? ten : undefined;
}

export function normaliseEmail(email: string | undefined | null): string | undefined {
  const e = email?.trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined;
}

export interface IdentityInput {
  name: string;
  city?: string | undefined;
  placeId?: string | undefined;
  website?: string | undefined | null;
  phone?: string | undefined | null;
  email?: string | undefined | null;
}

/** Every identity key for a business, lower case, most specific first. */
export function identityKeys(b: IdentityInput): string[] {
  const keys: string[] = [];
  if (b.placeId) keys.push(`place:${b.placeId.toLowerCase()}`);
  const domain = normaliseDomain(b.website);
  if (domain) keys.push(`domain:${domain}`);
  const phone = normalisePhone(b.phone);
  if (phone) keys.push(`phone:${phone}`);
  const email = normaliseEmail(b.email);
  if (email) keys.push(`email:${email}`);
  const name = normaliseBusinessName(b.name);
  if (name) keys.push(`name:${name}|${(b.city ?? "").toLowerCase().trim()}`);
  return keys;
}

export function prospectIdentityKeys(p: Prospect): string[] {
  return identityKeys({
    name: p.name,
    city: p.market.label,
    placeId: p.placeId,
    website: p.corrections.website ?? p.website,
    phone: p.corrections.phone ?? p.phone,
    email: p.corrections.email ?? p.email,
  });
}
