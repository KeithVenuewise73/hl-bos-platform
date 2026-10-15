// The vertical registry: what a customer of each kind of business needs to be
// able to do on a website (the conversion rules), how to ask Google for them,
// how to tell whether a business Google returned really is one, and which
// extra website checks to record. Adding a vertical means adding one entry
// here (and its chain list and tests) -- the pipeline, score and Lead Card
// read everything from this table.

import type { Vertical } from "./types.ts";

/** Conversion capabilities the website detectors can see. */
export type ConversionKey =
  | "call"
  | "email"
  | "form"
  | "booking"
  | "ordering"
  | "menu"
  | "pricing"
  | "services"
  | "directions"
  | "registration"
  | "consultation"
  | "industries"
  | "about"
  | "process"
  | "proof";

/**
 * Website checks recorded as findings only for verticals that list them in
 * `extraChecks`. The scored ones are ConversionKeys; the rest are observations
 * the score never reads (testimonials and statistics cannot be judged true
 * from a web page, so they are "requires manual verification").
 */
export type ExtraCheck =
  | "consultation"
  | "industries"
  | "service_area"
  | "about"
  | "process"
  | "proof"
  | "testimonials"
  | "claims"
  | "placeholder_contact"
  | "privacy"
  | "business_schema";

export interface VerticalSubtype {
  key: string;
  label: string;
  /** Matched against the name and Google category to pick the subtype. */
  keywords: RegExp;
}

export interface VerticalSpec {
  key: Vertical;
  label: string;
  /** Default Places text query; the market name is appended. */
  defaultQuery: string;
  /** Google place types that confirm the vertical. */
  placeTypes: string[];
  /** Google type suffixes that confirm it (e.g. "_restaurant"). */
  placeTypeSuffixes: string[];
  /** Words in the name or Google category that suggest it. */
  keywords: RegExp;
  /**
   * What a customer of this kind of business needs to do online, and how many
   * of the 20 conversion points each gap is worth. Each row sums to 20.
   */
  conversion: Partial<Record<ConversionKey, number>>;
  /** Website checks beyond the base set, recorded for this vertical only. */
  extraChecks: ExtraCheck[];
  /** Kinds of business within the vertical (e.g. accountant, insurance agency). */
  subtypes: VerticalSubtype[];
}

export const PROFESSIONAL_SUBTYPES: VerticalSubtype[] = [
  {
    key: "business_transformation",
    label: "Business transformation consultant",
    keywords:
      /\b(business transformation|transformation|business systems?|digital presence)\b/i,
  },
  {
    key: "transport_operations",
    label: "Transportation, logistics or operations consultant",
    keywords:
      /\b(logistics|supply chain|transportation|freight|fleet|dispatch|routing|warehous(e|ing)|distribution|operations consult(ing|ant)?)\b/i,
  },
  {
    key: "accounting",
    label: "Accountant",
    keywords:
      /\b(accountants?|accounting|cpa|bookkeep(er|ing)|tax (prep|service|preparation)|payroll)\b/i,
  },
  {
    key: "insurance",
    label: "Insurance agency",
    keywords: /\binsurance\b/i,
  },
  {
    key: "real_estate",
    label: "Real estate professional",
    keywords: /\b(real estate|realty|realtors?|brokerage|homes for sale)\b/i,
  },
  {
    key: "digital_services",
    label: "Marketing or digital agency",
    keywords:
      /\b(marketing|digital|agency|web design|seo|social media|branding|advertising|creative)\b/i,
  },
  {
    key: "general_consulting",
    label: "Consulting and advisory",
    keywords: /./,
  },
];

/** The subtype a business fits, from its name and category; always one. */
export function professionalSubtype(text: string): VerticalSubtype {
  return (
    PROFESSIONAL_SUBTYPES.find((t) => t.keywords.test(text)) ??
    PROFESSIONAL_SUBTYPES[PROFESSIONAL_SUBTYPES.length - 1]!
  );
}

export const VERTICALS: Record<Vertical, VerticalSpec> = {
  contractor: {
    key: "contractor",
    label: "Contractor / home services",
    defaultQuery: "home improvement contractor",
    placeTypes: [
      "general_contractor",
      "roofing_contractor",
      "plumber",
      "electrician",
      "painter",
      "locksmith",
      "moving_company",
      "hvac_contractor",
      "landscaper",
      "carpenter",
      "handyman",
    ],
    placeTypeSuffixes: ["_contractor"],
    keywords:
      /\b(contract(or|ing)|construction|roof(ing|er)?|plumb(ing|er)|electric(al|ian)?|hvac|heating|cooling|remodel(ing)?|renovation|painting|painter|masonry|concrete|paving|landscap(e|ing)|lawn|tree service|handyman|siding|gutter|window|door|flooring|drywall|carpentry|excavat(ing|ion)|fenc(e|ing)|deck|home services?|restoration|waterproofing|insulation|septic|drain)\b/i,
    conversion: { call: 5, form: 6, services: 4, pricing: 2, email: 3 },
    extraChecks: [],
    subtypes: [],
  },
  salon_barber: {
    key: "salon_barber",
    label: "Salon / barber",
    defaultQuery: "hair salon barber shop",
    placeTypes: [
      "hair_salon",
      "barber_shop",
      "beauty_salon",
      "hair_care",
      "nail_salon",
    ],
    placeTypeSuffixes: ["_salon"],
    keywords:
      /\b(salon|barber(shop)?|hair|beauty|nails?|stylist|blowout|lashes|brows?)\b/i,
    conversion: { booking: 7, call: 4, pricing: 4, directions: 3, services: 2 },
    extraChecks: [],
    subtypes: [],
  },
  restaurant_bar: {
    key: "restaurant_bar",
    label: "Restaurant / bar",
    defaultQuery: "restaurant bar",
    placeTypes: [
      "restaurant",
      "bar",
      "pub",
      "cafe",
      "coffee_shop",
      "bakery",
      "meal_takeaway",
      "meal_delivery",
      "wine_bar",
      "night_club",
      "brewery",
      "diner",
    ],
    placeTypeSuffixes: ["_restaurant", "_bar"],
    keywords:
      /\b(restaurant|grill|bar|pub|tavern|pizz(a|eria)|diner|cafe|café|bistro|kitchen|eatery|wings?|taco|sushi|bakery|brew(ery|ing)|saloon|deli|steakhouse|smokehouse|bbq)\b/i,
    conversion: { menu: 6, ordering: 5, directions: 4, call: 3, booking: 2 },
    extraChecks: [],
    subtypes: [],
  },
  trainer_coach: {
    key: "trainer_coach",
    label: "Trainer / coach",
    defaultQuery: "personal trainer sports coach",
    placeTypes: [
      "gym",
      "fitness_center",
      "personal_trainer",
      "yoga_studio",
      "sports_coaching",
      "sports_school",
    ],
    placeTypeSuffixes: ["_studio"],
    keywords:
      /\b(train(er|ing)|coach(ing)?|fitness|gym|lessons?|clinic|academy|instruct(or|ion)|crossfit|yoga|pilates|boxing|martial arts|karate|skating|strength|conditioning|performance)\b/i,
    conversion: { booking: 7, call: 4, form: 4, pricing: 3, services: 2 },
    extraChecks: [],
    subtypes: [],
  },
  youth_sports: {
    key: "youth_sports",
    label: "Youth sports organization",
    defaultQuery: "youth sports club league",
    placeTypes: [
      "sports_club",
      "sports_complex",
      "athletic_field",
      "sports_activity_location",
    ],
    placeTypeSuffixes: [],
    keywords:
      /\b(youth|league|travel team|club|hockey|soccer|baseball|softball|lacrosse|basketball|football|volleyball|wrestling|swim(ming)?|little league|association|athletic|sports)\b/i,
    conversion: { registration: 7, email: 4, call: 3, directions: 3, pricing: 3 },
    extraChecks: [],
    subtypes: [],
  },
  professional_services: {
    key: "professional_services",
    label: "Professional services / consulting",
    defaultQuery: "business consultant",
    placeTypes: [
      "consultant",
      "accounting",
      "insurance_agency",
      "real_estate_agency",
      "marketing_agency",
      "corporate_office",
    ],
    placeTypeSuffixes: ["_consultant", "_agency"],
    keywords:
      /\b(consult(ing|ants?)|advis(ory|ors?|ers?)|transformation|logistics|supply chain|transportation|operations|marketing|digital|agency|accountants?|accounting|cpa|bookkeep(er|ing)|tax|insurance|real estate|realty|realtors?|brokerage|financial planning|strategy|solutions)\b/i,
    // A client of a consultant needs to understand the services, trust the
    // firm, and start a conversation. Sums to 20 like every other row.
    conversion: {
      consultation: 4,
      call: 3,
      form: 3,
      services: 3,
      email: 2,
      proof: 2,
      process: 1,
      industries: 1,
      about: 1,
    },
    extraChecks: [
      "consultation",
      "industries",
      "service_area",
      "about",
      "process",
      "proof",
      "testimonials",
      "claims",
      "placeholder_contact",
      "privacy",
      "business_schema",
    ],
    subtypes: PROFESSIONAL_SUBTYPES,
  },
};

export const VERTICAL_KEYS = Object.keys(VERTICALS) as Vertical[];

export function isVertical(v: string): v is Vertical {
  return (VERTICAL_KEYS as string[]).includes(v);
}
