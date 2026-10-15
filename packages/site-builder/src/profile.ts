// The Business Profile: the verified source of facts for a business HLG builds
// a site for from the inside -- HLG's own companies now, approved clients later.
//
// The rule: a field becomes a FACT on a page only when it is marked verified
// and says where the verification came from. Anything else is either left
// off the page, or (for descriptive lists like services) shown with a visible
// Sample marker. Claim lists -- experience, statistics, case studies -- are
// never shown unverified: an empty section shows an internal "information
// required" notice instead. Nothing here is guessed or filled in.

import { formatPhone, normalizePhone } from "@hl-bos/presence-scanner";

import type { SiteVertical, ToolItem } from "./types.ts";
import { FORBIDDEN, LIMITS } from "./validate.ts";
import { verticalDef } from "./verticals.ts";

/** verified = checked and approved; unverified = a draft to confirm; required = not supplied. */
export type Verification = "verified" | "unverified" | "required";

export const VERIFICATION_LABELS: Record<Verification, string> = {
  verified: "Verified",
  unverified: "Unverified",
  required: "Information required",
};

export interface ProfileValue {
  value: string;
  status: Verification;
  /** Who or what verified it, e.g. "CEO, 2026-10-15". Required when verified. */
  source: string;
}

export interface ProfileItem {
  name: string;
  /** For social links this is the address. */
  description: string;
  /** Products only: the product's real status. */
  status?: ToolItem["status"];
}

export interface ProfileList {
  items: ProfileItem[];
  status: Verification;
  source: string;
}

export const PROFILE_FIELDS = {
  legalName: "Legal or operating name",
  brandName: "Brand name",
  tagline: "Tagline",
  description: "Business description",
  businessType: "Business type",
  serviceArea: "Geographic service area",
  phone: "Business phone",
  email: "Business email",
  website: "Existing website",
  address: "Business address",
  bookingUrl: "Consultation or booking link",
  logoText: "Logo text mark",
  brandColor: "Brand colour",
  credibility: "Credibility statement",
  primaryCta: "Primary call to action",
  secondaryCta: "Secondary call to action",
  privacyUrl: "Privacy policy link",
  termsUrl: "Terms link",
  plannedDomain: "Planned public address (display and readiness only)",
} as const;

export const PROFILE_LISTS = {
  services: "Services",
  challenges: "Business challenges addressed",
  process: "How the engagement works",
  industries: "Industries served",
  experience: "Approved experience claims",
  pillars: "Value pillars (why choose us)",
  statistics: "Approved statistics",
  caseStudies: "Approved case studies",
  products: "Products and tools",
  socialLinks: "Social and professional links",
} as const;

export type ProfileFieldKey = keyof typeof PROFILE_FIELDS;
export type ProfileListKey = keyof typeof PROFILE_LISTS;

/** Lists that make claims: never shown unless verified. */
export const CLAIM_LISTS: ProfileListKey[] = [
  "experience",
  "pillars",
  "statistics",
  "caseStudies",
  "products",
];

const URL_FIELDS: ProfileFieldKey[] = [
  "website",
  "bookingUrl",
  "privacyUrl",
  "termsUrl",
];
/** A bare host name, e.g. transform.hermanlegacygroup.com. */
const HOST_FIELDS: ProfileFieldKey[] = ["plannedDomain"];

export interface BusinessProfile {
  id: string;
  /** internal = an HLG-owned business. */
  kind: "internal" | "client";
  vertical: SiteVertical;
  /** Professional services: business_transformation, transport_operations, ... */
  subtype: string | undefined;
  /** The Presence Scanner lead this profile's audit lives on. */
  prospectId: string | undefined;
  fields: Record<ProfileFieldKey, ProfileValue>;
  lists: Record<ProfileListKey, ProfileList>;
  internalNotes: string;
  /** Premium Business Site design choices (not facts): the theme preset. */
  design?: { theme?: string };
  createdAt: string;
  updatedAt: string;
  audit: { at: string; by: string; detail: string }[];
}

export const emptyValue = (): ProfileValue => ({
  value: "",
  status: "required",
  source: "",
});
export const emptyList = (): ProfileList => ({
  items: [],
  status: "required",
  source: "",
});

export function emptyProfile(
  id: string,
  vertical: SiteVertical,
  now: Date,
  kind: BusinessProfile["kind"] = "internal",
): BusinessProfile {
  const at = now.toISOString();
  return {
    id,
    kind,
    vertical,
    subtype: undefined,
    prospectId: undefined,
    fields: Object.fromEntries(
      Object.keys(PROFILE_FIELDS).map((k) => [k, emptyValue()]),
    ) as Record<ProfileFieldKey, ProfileValue>,
    lists: Object.fromEntries(
      Object.keys(PROFILE_LISTS).map((k) => [k, emptyList()]),
    ) as Record<ProfileListKey, ProfileList>,
    internalNotes: "",
    createdAt: at,
    updatedAt: at,
    audit: [],
  };
}

/**
 * A profile saved by an older version gains any field or list added since,
 * as "information required". Nothing is ever guessed.
 */
export function normalizeProfile(p: BusinessProfile): BusinessProfile {
  const fields = { ...p.fields };
  for (const k of Object.keys(PROFILE_FIELDS) as ProfileFieldKey[])
    fields[k] ??= emptyValue();
  const lists = { ...p.lists };
  for (const k of Object.keys(PROFILE_LISTS) as ProfileListKey[])
    lists[k] ??= emptyList();
  return { ...p, fields, lists };
}

/** A field's value if, and only if, it is verified. */
export function verified(p: BusinessProfile, k: ProfileFieldKey): string | undefined {
  const f = p.fields[k];
  return f.status === "verified" && f.value.trim() ? f.value.trim() : undefined;
}

export function verifiedItems(p: BusinessProfile, k: ProfileListKey): ProfileItem[] {
  const l = p.lists[k];
  return l.status === "verified" ? l.items : [];
}

/** True when a phone number is in the 555 exchange (reserved for fiction). */
export function isPlaceholderPhone(digits: string): boolean {
  return /^\d{3}555\d{4}$/.test(digits);
}

// Claims a profile may never carry, verified or not. A verified profile may
// state approved experience and numbers; it may not carry these.
const ALWAYS_FORBIDDEN = new Set([
  "a price or price claim",
  "a guarantee",
  "something offered free",
  "a superlative or award",
  "a credential",
  "a rating or review claim",
]);

/**
 * Problems that stop a profile from being saved, in plain English.
 * Only verified content is judged for claims: unverified content never reaches
 * a page as a fact.
 */
export function validateProfile(p: BusinessProfile): string[] {
  const problems: string[] = [];
  const claimCheck = (label: string, text: string) => {
    for (const [re, what] of FORBIDDEN)
      if (ALWAYS_FORBIDDEN.has(what) && re.test(text))
        problems.push(`${label} contains ${what}: "${clip(text)}".`);
    if (/<[a-z/!]/i.test(text)) problems.push(`${label} contains markup.`);
  };
  for (const [k, label] of Object.entries(PROFILE_FIELDS) as [
    ProfileFieldKey,
    string,
  ][]) {
    const f = p.fields[k];
    const v = f.value.trim();
    if (f.status === "verified" && !v)
      problems.push(`${label} is marked verified but is empty.`);
    if (f.status === "verified" && !f.source.trim())
      problems.push(`${label} is marked verified: say who verified it, and when.`);
    if (!v) continue;
    if (k === "phone") {
      const d = normalizePhone(v);
      if (!d || d.length !== 10)
        problems.push(`${label} "${clip(v)}" is not a 10-digit US phone number.`);
      else if (isPlaceholderPhone(d))
        problems.push(
          `${label} ${formatPhone(d)} is in the 555 exchange, which is reserved for examples. Enter the real number.`,
        );
    } else if (k === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v))
        problems.push(`${label} "${clip(v)}" is not an email address.`);
    } else if (URL_FIELDS.includes(k)) {
      if (!/^https:\/\/[^\s/]+\.[^\s]+$/i.test(v))
        problems.push(`${label} must be a full https:// address.`);
    } else if (HOST_FIELDS.includes(k)) {
      if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(v))
        problems.push(`${label} must be a host name like transform.example.com.`);
    } else if (k === "brandColor") {
      if (!/^#[0-9a-f]{6}$/i.test(v))
        problems.push(`${label} must be a colour like #c0892d.`);
    } else if (f.status === "verified") {
      claimCheck(label, v);
      if (/\bhttps?:\/\/|\bwww\./i.test(v)) problems.push(`${label} contains a link.`);
    }
  }
  for (const [k, label] of Object.entries(PROFILE_LISTS) as [
    ProfileListKey,
    string,
  ][]) {
    const l = p.lists[k];
    if (l.status === "verified" && !l.items.length)
      problems.push(`${label} is marked verified but has no entries.`);
    if (l.status === "verified" && !l.source.trim())
      problems.push(`${label} is marked verified: say who verified it, and when.`);
    if (k === "socialLinks") {
      for (const i of l.items)
        if (!/^https:\/\/[^\s/]+\.[^\s]+$/i.test(i.description))
          problems.push(`${label}: "${clip(i.name)}" needs a full https:// address.`);
      continue;
    }
    if (l.status === "verified")
      for (const i of l.items) {
        claimCheck(`${label}: "${clip(i.name)}"`, `${i.name} ${i.description}`);
        if (/\bhttps?:\/\/|\bwww\./i.test(`${i.name} ${i.description}`))
          problems.push(`${label}: "${clip(i.name)}" contains a link.`);
      }
  }
  // Lengths the page can hold, checked here so a build never fails on them.
  const max: Partial<Record<ProfileFieldKey, number>> = {
    brandName: LIMITS.heroHeadline,
    tagline: LIMITS.heroHeadline,
    credibility: LIMITS.heroHeadline,
    description: LIMITS.heroSubhead,
    businessType: LIMITS.heroEyebrow,
    primaryCta: LIMITS.cta,
    secondaryCta: LIMITS.cta,
    logoText: 4,
  };
  for (const [k, m] of Object.entries(max) as [ProfileFieldKey, number][])
    if (p.fields[k].value.trim().length > m)
      problems.push(
        `${PROFILE_FIELDS[k]} is ${p.fields[k].value.trim().length} characters; the limit is ${m}.`,
      );
  const nameMax = verticalDef(p.vertical).validation.itemNameMax;
  for (const [k, label] of Object.entries(PROFILE_LISTS) as [
    ProfileListKey,
    string,
  ][]) {
    if (k === "socialLinks") continue;
    if (p.lists[k].items.length > LIMITS.maxSectionItems)
      problems.push(
        `${label} has ${p.lists[k].items.length} entries; at most ${LIMITS.maxSectionItems} fit the page.`,
      );
    for (const i of p.lists[k].items) {
      if (i.name.length > nameMax)
        problems.push(
          `${label}: "${clip(i.name)}" is ${i.name.length} characters; the limit is ${nameMax}.`,
        );
      if (i.description.length > LIMITS.offeringDescription)
        problems.push(
          `${label}: the description of "${clip(i.name)}" is over ${LIMITS.offeringDescription} characters.`,
        );
    }
  }
  // Testimonials are not a profile field at all, and may not arrive through one.
  for (const k of ["services", "experience", "statistics", "caseStudies"] as const)
    for (const i of p.lists[k].items)
      if (
        /\btestimonials?\b|\bwhat (our )?clients say\b/i.test(
          `${i.name} ${i.description}`,
        )
      )
        problems.push(
          `${PROFILE_LISTS[k]}: testimonials cannot be added through the profile ("${clip(i.name)}").`,
        );
  return problems;
}

/** What the profile still needs before its site could launch, in plain English. */
export function profileMissing(p: BusinessProfile): string[] {
  const out: string[] = [];
  const need = verticalDef(p.vertical).requiredProfileFields;
  for (const k of need as ProfileFieldKey[]) {
    const f = p.fields[k];
    if (!f) continue;
    if (f.status !== "verified" || !f.value.trim())
      out.push(
        `${PROFILE_FIELDS[k]}${f.status === "unverified" && f.value.trim() ? " (entered but not verified)" : ""}`,
      );
  }
  if (p.lists.services.status !== "verified") out.push("Verified list of services");
  if (p.lists.caseStudies.status !== "verified")
    out.push(
      "Case studies (optional; the section shows a notice until verified ones exist)",
    );
  return out;
}

/** "(716) 220-7354" and "+17162207354" from a verified phone, if valid. */
export function profilePhone(
  p: BusinessProfile,
): { display: string; link: string } | undefined {
  const d = normalizePhone(verified(p, "phone"));
  if (!d || d.length !== 10 || isPlaceholderPhone(d)) return undefined;
  return { display: formatPhone(d) ?? d, link: `+1${d}` };
}

/** A brand accent from one verified colour: the colour, a darker and a soft tint. */
export function brandAccent(hex: string): {
  accent: string;
  dark: string;
  soft: string;
} {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mix = (t: number, to: number) =>
    `#${rgb
      .map((c) =>
        Math.round(c + (to - c) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  return { accent: hex.toLowerCase(), dark: mix(0.22, 0), soft: mix(0.88, 255) };
}

const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 59)}…` : s);
