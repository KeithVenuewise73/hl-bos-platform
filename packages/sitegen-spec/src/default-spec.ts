// A valid starter spec built from intake data ONLY. Nothing here is invented:
// no tagline, no years in business, no reviews, no "family owned". A field the
// intake does not have stays absent, and the section that would show it is not
// added.

import { displayPhone } from "./contact.ts";
import {
  siteSpecSchema,
  type HoursEntry,
  type Service,
  type SiteSpec,
} from "./schema.ts";
import { VERTICALS, type VerticalKey } from "./verticals.ts";

export interface IntakeService {
  name: string;
  description?: string;
  priceCents?: number;
  durationMinutes?: number;
}

/** What the business told us. Everything but name and phone is optional. */
export interface Intake {
  businessName: string;
  /** E.164, like +17165550100. */
  phone: string;
  address?: { street?: string; city?: string; region?: string; postalCode?: string };
  hours?: HoursEntry[];
  services?: IntakeService[];
  bookingUrl?: string;
  /** Text the owner wrote about themselves, used verbatim. */
  about?: string;
  /** Other intake answers (yearsInBusiness, awards, ...), used only to back claims. */
  [field: string]: unknown;
}

// A design starting point, not a fact about the business. The client can change it.
const DEFAULT_THEME = {
  brandColor: "#1f2937",
  accentColor: "#c8a24a",
  fontHeading: "serif_classic",
  fontBody: "sans_clean",
} as const;

const clean = (s: string | undefined): string | undefined => {
  const t = s?.trim();
  return t ? t : undefined;
};

export function defaultSpec(vertical: VerticalKey, intake: Intake): SiteSpec {
  const config = VERTICALS[vertical];
  const name = intake.businessName.trim();

  const a = intake.address;
  const address = a
    ? {
        ...(clean(a.street) && { street: clean(a.street) }),
        ...(clean(a.city) && { city: clean(a.city) }),
        ...(clean(a.region) && { region: clean(a.region) }),
        ...(clean(a.postalCode) && { postalCode: clean(a.postalCode) }),
      }
    : {};
  const hasAddress = Object.keys(address).length > 0;
  const place = [address.city, address.region].filter(Boolean).join(", ");

  const services: Service[] = (intake.services ?? []).map((s) => ({
    name: s.name.trim(),
    ...(clean(s.description) && { description: clean(s.description) }),
    ...(s.priceCents !== undefined && { priceCents: s.priceCents }),
    ...(s.durationMinutes !== undefined && { durationMinutes: s.durationMinutes }),
  }));
  const hours = intake.hours ?? [];
  const about = clean(intake.about);

  const has = (t: string): boolean => {
    switch (t) {
      case "services":
        return services.length > 0;
      case "hours":
        return hours.length > 0;
      case "about":
        return about !== undefined;
      case "gallery":
      case "faq":
        return false; // needs content we do not have
      default:
        return true;
    }
  };

  const spec = {
    specVersion: 1,
    vertical,
    theme: { ...DEFAULT_THEME },
    profile: {
      businessName: name,
      phone: intake.phone,
      services,
      hours,
      ...(hasAddress && { address }),
      ...(intake.bookingUrl && { bookingUrl: intake.bookingUrl }),
    },
    hero: {
      headline: name,
      subheadline: place,
      choice: { kind: "default" },
    },
    pages: config.defaultPages.map((p) => ({
      slug: p.slug,
      title: p.title,
      sections: p.sections
        .filter(has)
        .map((type) => (type === "about" ? { type, body: about ?? "" } : { type })),
    })),
    seo: {
      title: place ? `${name} | ${place}` : name,
      description: `${name}${place ? `, ${place}` : ""}. Call ${displayPhone(intake.phone)}.`,
    },
  };
  // Throws a ZodError naming the field if the intake itself is invalid.
  return siteSpecSchema.parse(spec);
}
