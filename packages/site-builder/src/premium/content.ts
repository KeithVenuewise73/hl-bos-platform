// What a Premium Business Site says, taken only from a Business Profile.
//
// The same rules as internal drafts (internal.ts):
//   * a field appears as a fact only when it is verified;
//   * descriptive lists (services, challenges, process, industries) may appear
//     unverified, but every such item is flagged "to confirm" on the draft;
//   * claim lists (experience, pillars, case studies, products) never appear
//     unverified;
//   * a product shows its real status (Available now / Pilot / Planned /
//     Concept), never more.
// The content is frozen into the draft when it is built, so a later profile
// edit never silently changes a draft that has been approved.

import { formatPhone, normalizePhone } from "@hl-bos/presence-scanner";

import {
  isPlaceholderPhone,
  normalizeProfile,
  profileMissing,
  verified,
  verifiedItems,
  type BusinessProfile,
  type ProfileListKey,
} from "../profile.ts";
import type { ToolItem } from "../types.ts";
import { verticalDef } from "../verticals.ts";
import { premiumTheme } from "./themes.ts";

export interface PremiumItem {
  name: string;
  description: string;
  /** False = drafted, not yet confirmed: shown with a "to confirm" flag. */
  confirmed: boolean;
}

export interface PremiumSolution {
  name: string;
  description: string;
  status: ToolItem["status"];
}

export interface PremiumContent {
  profileId: string;
  theme: string;
  brand: {
    name: string;
    mark: string;
    /** "Business transformation", "Transportation & operations consulting". */
    descriptor: string;
    /** The hero headline: the verified tagline, or the name. */
    headline: string;
    /** The verified description, or undefined (a notice shows instead). */
    lede: string | undefined;
    /** A verified credibility statement, if any. */
    credibility: string | undefined;
  };
  phone: { display: string; link: string } | undefined;
  email: string | undefined;
  serviceArea: string | undefined;
  existingWebsite: string | undefined;
  /** Display and readiness only. Never linked, never configured. */
  plannedDomain: string | undefined;
  primaryCta: string;
  secondaryCta: string;
  services: PremiumItem[];
  challenges: PremiumItem[];
  process: PremiumItem[];
  industries: PremiumItem[];
  experience: PremiumItem[];
  pillars: PremiumItem[];
  caseStudies: PremiumItem[];
  solutions: PremiumSolution[];
  legal: { label: string; url: string }[];
  /** Plain-English facts still missing (shown as indicators and in the checklist). */
  missing: string[];
}

function descriptive(p: BusinessProfile, k: ProfileListKey): PremiumItem[] {
  const l = p.lists[k];
  if (l.status === "required") return [];
  return l.items.map((i) => ({
    name: i.name,
    description: i.description,
    confirmed: l.status === "verified",
  }));
}

function claims(p: BusinessProfile, k: ProfileListKey): PremiumItem[] {
  return verifiedItems(p, k).map((i) => ({
    name: i.name,
    description: i.description,
    confirmed: true,
  }));
}

/** Build the site's content from a profile. Unverified facts never become claims. */
export function premiumContent(raw: BusinessProfile): PremiumContent {
  const p = normalizeProfile(raw);
  const def = verticalDef(p.vertical);
  const name = verified(p, "brandName");
  if (!name)
    throw new Error(
      "The brand name must be entered and marked verified before a premium site can be built.",
    );
  const digits = normalizePhone(verified(p, "phone"));
  const phone =
    digits && digits.length === 10 && !isPlaceholderPhone(digits)
      ? { display: formatPhone(digits) ?? digits, link: `+1${digits}` }
      : undefined;
  const privacy = verified(p, "privacyUrl");
  const terms = verified(p, "termsUrl");
  return {
    profileId: p.id,
    theme: premiumTheme(p.design?.theme).key,
    brand: {
      name,
      mark: verified(p, "logoText") ?? name.slice(0, 3).toUpperCase(),
      descriptor: verified(p, "businessType") ?? def.label,
      headline: verified(p, "tagline") ?? name,
      lede: verified(p, "description"),
      credibility: verified(p, "credibility"),
    },
    phone,
    email: verified(p, "email"),
    serviceArea: verified(p, "serviceArea"),
    existingWebsite: verified(p, "website"),
    plannedDomain: verified(p, "plannedDomain"),
    primaryCta: verified(p, "primaryCta") ?? def.primaryCta,
    secondaryCta:
      verified(p, "secondaryCta") ?? (phone ? `Call ${phone.display}` : "Contact"),
    services: descriptive(p, "services"),
    challenges: descriptive(p, "challenges"),
    process: descriptive(p, "process"),
    industries: descriptive(p, "industries"),
    experience: claims(p, "experience"),
    pillars: claims(p, "pillars"),
    caseStudies: claims(p, "caseStudies"),
    solutions: verifiedItems(p, "products").map((i) => ({
      name: i.name,
      description: i.description,
      status: i.status ?? "planned",
    })),
    legal: [
      ...(privacy ? [{ label: "Privacy policy", url: privacy }] : []),
      ...(terms ? [{ label: "Terms", url: terms }] : []),
    ],
    missing: profileMissing(p),
  };
}
