// Lead -> facts. Only what the Presence Scanner record supports; nothing is
// filled in. A reviewer's correction wins over Google and the import, exactly
// as it does on the Lead Card.

import { classifyUrl, normalizePhone, type Prospect } from "@hl-bos/presence-scanner";

import type { SiteFacts, SiteVertical } from "./types.ts";

export const SITE_VERTICALS: SiteVertical[] = [
  "contractor",
  "salon_barber",
  "restaurant_bar",
];

export function isSiteVertical(v: string): v is SiteVertical {
  return (SITE_VERTICALS as string[]).includes(v);
}

export class UnsupportedVerticalError extends Error {
  constructor(vertical: string) {
    super(
      `Demo sites are built for contractors, salons/barbers and restaurants/bars so far; "${vertical}" templates come later.`,
    );
    this.name = "UnsupportedVerticalError";
  }
}

/** "12 Main St, West Seneca, NY 14224, USA" -> "West Seneca". */
export function cityFromAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Drop a trailing country, then the "NY 14224" state/ZIP part.
  if (parts.length && /^(usa|united states)$/i.test(parts.at(-1)!)) parts.pop();
  if (parts.length && /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(parts.at(-1)!)) parts.pop();
  if (parts.length < 2) return undefined;
  const city = parts.at(-1)!;
  return /\d/.test(city) ? undefined : city;
}

const GAP_KEYS = /^(site\.|places\.|website\.)/;

export function factsFromProspect(p: Prospect): SiteFacts {
  if (!isSiteVertical(p.vertical)) throw new UnsupportedVerticalError(p.vertical);
  const rec = p.places?.record;
  const phone = p.corrections.phone ?? p.phone;
  const digits = normalizePhone(phone);
  const website =
    p.corrections.website && p.corrections.website !== "none"
      ? p.corrections.website
      : p.website;
  const realSite =
    website && classifyUrl(website).kind === "site" && p.websiteStatus !== "none"
      ? website
      : undefined;
  const city =
    cityFromAddress(p.address) ??
    // A single-town market label ("West Seneca") is a fair city; a multi-town one is not.
    (/\band\b|,|&/.test(p.market.label) ? undefined : p.market.label);
  const query = [p.name, p.address ?? city].filter(Boolean).join(", ");
  return {
    prospectId: p.id,
    businessName: p.name,
    vertical: p.vertical,
    category: rec?.primaryTypeLabel,
    city,
    address: p.address,
    phone: phone ?? undefined,
    phoneLink: digits && digits.length === 10 ? `+1${digits}` : undefined,
    email: p.corrections.email ?? p.email,
    existingWebsite: realSite,
    directionsUrl:
      rec?.mapsUrl ??
      (p.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
        : undefined),
    rating:
      rec && rec.rating !== undefined && rec.reviewCount !== undefined && p.places
        ? {
            value: rec.rating,
            count: rec.reviewCount,
            source: "Google Maps",
            observedAt: p.places.observedAt,
          }
        : undefined,
    gaps: p.findings
      .filter(
        (f) =>
          GAP_KEYS.test(f.key) && (f.status === "missing" || f.status === "not_found"),
      )
      .map((f) => f.key),
    vendors: (
      p.findings.find((f) => f.key === "site.vendors" && f.status === "present")
        ?.evidence ?? ""
    )
      .split(",")
      .map((s) => s.replace(/\s*\(.*\)$/, "").trim())
      .filter(Boolean),
    websiteStatus: p.websiteStatus,
  };
}
