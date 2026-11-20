// Vertical configuration as data. A new vertical is a new entry here plus a
// template in the renderer; nothing else in the pipeline branches on a name.

import type { SectionType, SiteSpec } from "./schema.ts";

export type Cta = "book" | "call";

export interface VerticalConfig {
  key: "barber";
  label: string;
  /** Section types a page of this vertical may use. */
  sections: readonly SectionType[];
  /** Pages (and their section order) a starter spec gets, filled only from data that exists. */
  defaultPages: readonly {
    slug: string;
    title: string;
    sections: readonly SectionType[];
  }[];
  /** Intake fields without which no site can be built. */
  requiredIntake: readonly string[];
  /** Fields that make the site better; their absence just omits a section. */
  optionalIntake: readonly string[];
  /** schema.org type for the JSON-LD block. */
  schemaOrgType: "HairSalon";
  defaultCta: Cta;
  /** Used when the default CTA has nothing to link to. */
  ctaFallback: Cta;
}

export const VERTICALS = {
  barber: {
    key: "barber",
    label: "Barber shop",
    sections: ["hero", "services", "hours", "about", "gallery", "contact", "faq"],
    defaultPages: [
      {
        slug: "home",
        title: "Home",
        sections: ["hero", "services", "hours", "about", "contact"],
      },
    ],
    requiredIntake: ["businessName", "phone"],
    optionalIntake: ["address", "hours", "services", "bookingUrl", "about"],
    schemaOrgType: "HairSalon",
    defaultCta: "book",
    ctaFallback: "call",
  },
} as const satisfies Record<string, VerticalConfig>;

export type VerticalKey = keyof typeof VERTICALS;

/**
 * The primary call to action for a site: the vertical's default ("book"), or its
 * fallback ("call") when there is no booking link to send people to.
 */
export function resolveCta(spec: Pick<SiteSpec, "vertical" | "profile">): Cta {
  const v: VerticalConfig = VERTICALS[spec.vertical];
  if (v.defaultCta === "book" && !spec.profile.bookingUrl) return v.ctaFallback;
  return v.defaultCta;
}
