// SiteSpec v1. Every generated site is this JSON and nothing else: AI never
// writes code or HTML. The database enforces the core rules (specVersion,
// theme, profile, hero.choice, claims) on every save; this schema enforces
// those AND the deep shape of every page section, so a spec that passes here
// cannot break the renderer.
//
// Rules applied everywhere:
//   * every object is strict: an unknown key is an error, not ignored;
//   * no raw HTML: text may not contain < or >;
//   * links are https:, tel: or sms: only;
//   * there is NO testimonial, review or award section type, by design.

import { z } from "zod";
import { FONT_KEYS } from "./fonts.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const PHONE_RE = /^\+[1-9][0-9]{7,14}$/;
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KEY_RE = /^[a-z0-9_]{1,64}$/;
const TEL_SMS_RE = /^(tel|sms):\+[1-9][0-9]{7,14}$/;

/** True when `s` contains markup characters or control characters. */
function hasUnsafeChars(s: string, multiline: boolean): boolean {
  if (s.includes("<") || s.includes(">")) return true;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 10 && multiline) continue;
    if (c < 32 || c === 127) return true;
  }
  return false;
}

/** Plain text: trimmed length within [min, max] (as the database counts it), no markup. */
function text(min: number, max: number, opts: { multiline?: boolean } = {}) {
  return z
    .string()
    .max(max * 4)
    .refine((s) => s.trim().length >= min && s.trim().length <= max, {
      message: `must be ${min === 0 ? "at most" : `${min} to`} ${max} characters`,
    })
    .refine((s) => !hasUnsafeChars(s, opts.multiline === true), {
      message: "must be plain text: no HTML or control characters",
    });
}

export function isSafeHref(href: string): boolean {
  if (href.length > 2048) return false;
  if (TEL_SMS_RE.test(href)) return true;
  if (!href.startsWith("https://")) return false;
  try {
    const u = new URL(href);
    return u.protocol === "https:" && u.hostname.length > 0;
  } catch {
    return false;
  }
}

const href = z.string().refine(isSafeHref, {
  message: "links must be https:, tel: (+E.164) or sms: (+E.164)",
});

const httpsUrl = z.string().refine((s) => isSafeHref(s) && s.startsWith("https://"), {
  message: "must be an https:// link",
});

const uuid = z.string().regex(UUID_RE, "must be a uuid");

// --- theme ------------------------------------------------------------------
export const themeSchema = z.strictObject({
  brandColor: z.string().regex(HEX_RE, "must be #rrggbb"),
  accentColor: z.string().regex(HEX_RE, "must be #rrggbb"),
  fontHeading: z.enum(FONT_KEYS),
  fontBody: z.enum(FONT_KEYS),
  logoAssetId: uuid.optional(),
});

// --- profile ----------------------------------------------------------------
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

export const hoursEntrySchema = z
  .strictObject({
    day: z.enum(DAYS),
    closed: z.literal(true).optional(),
    open: z.string().regex(TIME_RE, "must be HH:MM (24h)").optional(),
    close: z.string().regex(TIME_RE, "must be HH:MM (24h)").optional(),
  })
  .superRefine((h, ctx) => {
    if (h.closed) {
      if (h.open !== undefined || h.close !== undefined)
        ctx.addIssue({
          code: "custom",
          message: "a closed day has no open/close times",
        });
    } else if (h.open === undefined || h.close === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "an open day needs both open and close",
      });
    } else if (h.open >= h.close) {
      ctx.addIssue({ code: "custom", message: "close must be after open" });
    }
  });

export const serviceSchema = z.strictObject({
  name: text(1, 80),
  description: text(1, 200).optional(),
  priceCents: z.number().int().min(0).max(10_000_000).optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
});

export const addressSchema = z.strictObject({
  street: text(1, 120).optional(),
  city: text(1, 80).optional(),
  region: text(1, 80).optional(),
  postalCode: text(1, 20).optional(),
});

export const profileSchema = z.strictObject({
  businessName: text(1, 120),
  phone: z.string().regex(PHONE_RE, "must be E.164, like +17165550100"),
  services: z.array(serviceSchema).max(30),
  hours: z
    .array(hoursEntrySchema)
    .max(7)
    .refine((hs) => new Set(hs.map((h) => h.day)).size === hs.length, {
      message: "each day may appear once",
    }),
  address: addressSchema.optional(),
  bookingUrl: httpsUrl.optional(),
});

// --- hero -------------------------------------------------------------------
export const heroChoiceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("default") }),
  z.strictObject({ kind: z.literal("library"), key: z.string().regex(KEY_RE) }),
  z.strictObject({ kind: z.literal("asset"), assetId: uuid }),
]);

export const heroSchema = z.strictObject({
  headline: text(1, 120),
  subheadline: text(0, 240),
  choice: heroChoiceSchema,
});

// --- sections ---------------------------------------------------------------
// Sections hold presentation choices only. Business facts (services, hours,
// phone) live in `profile`, once, so a section can never contradict them.
const heading = text(1, 80).optional();

export const sectionSchema = z.discriminatedUnion("type", [
  // Places the top-level hero in the page order.
  z.strictObject({ type: z.literal("hero") }),
  z.strictObject({
    type: z.literal("services"),
    heading,
    intro: text(1, 300).optional(),
    showPrices: z.boolean().optional(),
  }),
  z.strictObject({ type: z.literal("hours"), heading }),
  z.strictObject({
    type: z.literal("about"),
    heading,
    body: text(1, 1500, { multiline: true }),
  }),
  z.strictObject({
    type: z.literal("gallery"),
    heading,
    items: z
      .array(z.strictObject({ assetId: uuid, alt: text(1, 140) }))
      .min(1)
      .max(12),
  }),
  z.strictObject({
    type: z.literal("contact"),
    heading,
    note: text(1, 300).optional(),
    links: z
      .array(z.strictObject({ label: text(1, 60), href }))
      .max(6)
      .optional(),
  }),
  z.strictObject({
    type: z.literal("faq"),
    heading,
    items: z
      .array(
        z.strictObject({
          question: text(1, 160),
          answer: text(1, 800, { multiline: true }),
        }),
      )
      .min(1)
      .max(12),
  }),
]);

export const SECTION_TYPES = [
  "hero",
  "services",
  "hours",
  "about",
  "gallery",
  "contact",
  "faq",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const pageSchema = z.strictObject({
  slug: z.string().max(40).regex(SLUG_RE, "lowercase letters, digits and hyphens"),
  title: text(1, 80),
  sections: z.array(sectionSchema).max(20),
});

// --- claims -----------------------------------------------------------------
// A factual claim about the business ("25 years in business"). The database
// refuses any claim without a source; so does this schema.
export const CLAIM_KINDS = [
  "yearsInBusiness",
  "award",
  "rating",
  "certification",
  "other",
] as const;

export const claimSchema = z.strictObject({
  kind: z.enum(CLAIM_KINDS),
  value: text(1, 200),
  source: z.strictObject({
    type: z.enum(["intake", "user"]),
    field: text(1, 80),
  }),
});

// --- seo --------------------------------------------------------------------
export const seoSchema = z.strictObject({
  title: text(1, 70),
  description: text(0, 200),
});

// --- the spec ---------------------------------------------------------------
export const siteSpecSchema = z
  .strictObject({
    specVersion: z.literal(1),
    vertical: z.enum(["barber"]),
    theme: themeSchema,
    profile: profileSchema,
    hero: heroSchema,
    pages: z.array(pageSchema).min(1).max(20),
    seo: seoSchema,
    claims: z.array(claimSchema).max(20).optional(),
  })
  .superRefine((spec, ctx) => {
    const slugs = spec.pages.map((p) => p.slug);
    if (new Set(slugs).size !== slugs.length)
      ctx.addIssue({
        code: "custom",
        path: ["pages"],
        message: "page slugs must be unique",
      });
  });

export type SiteSpec = z.infer<typeof siteSpecSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type HoursEntry = z.infer<typeof hoursEntrySchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Page = z.infer<typeof pageSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type HeroChoice = z.infer<typeof heroChoiceSchema>;

/** Problems with a spec, one plain line each. Empty = valid. */
export function validateSpec(
  input: unknown,
): { ok: true; spec: SiteSpec } | { ok: false; problems: string[] } {
  const r = siteSpecSchema.safeParse(input);
  if (r.success) return { ok: true, spec: r.data };
  return {
    ok: false,
    problems: r.error.issues.map(
      (i) => `${i.path.join(".") || "(spec)"}: ${i.message}`,
    ),
  };
}
