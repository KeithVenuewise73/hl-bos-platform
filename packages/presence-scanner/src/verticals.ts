// The five Phase 1 verticals: what a customer of each needs to be able to do on
// a website (the conversion rules), how to ask Google for them, and how to tell
// whether a business Google returned really is one.

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
  | "registration";

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
  },
};

export const VERTICAL_KEYS = Object.keys(VERTICALS) as Vertical[];

export function isVertical(v: string): v is Vertical {
  return (VERTICAL_KEYS as string[]).includes(v);
}
