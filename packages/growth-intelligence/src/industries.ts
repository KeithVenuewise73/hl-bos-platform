// The Revenue Center prospect model: the eight industries of the original
// Revenue Center, each owned by one business line, each with a replenishable
// target of 50 ACTIVE prospects (400 in all). Targets are not lifetime caps.
//
// The list of eight was confirmed by the owner's Phase 6 directive
// (2026-11-05). It has not been compared with the original hosted app, which
// this environment cannot open.
//
// The same keys are seeded in the database (revenue.industries in the proposed
// migration); a test asserts the two stay identical.
//
// The Presence Scanner has six website-check profiles ("verticals"). Each
// industry borrows the closest one for its website checks; its own search
// terms and Google place types drive discovery. Dedicated scanner profiles for
// dental, landscaping, pet grooming, moving and logistics are not built.

import type { Vertical } from "@hl-bos/presence-scanner";

import type { BusinessLine } from "./types.ts";

export interface Industry {
  key: string;
  label: string;
  line: BusinessLine;
  /** Presence Scanner profile used for the website checks. */
  scannerVertical: Vertical;
  /** Words that make routeLead recognise the industry. */
  routingLabel: string;
  /** Default Google Places text query (a campaign may override it). */
  searchTerms: string;
  /** Google place types that confirm a candidate is in the industry. */
  placeTypes: string[];
  targetActive: number;
  /** One of the eight, or a "not one of the eight" bucket for inbound leads. */
  core: boolean;
}

export const DEFAULT_TARGET_ACTIVE = 50;

const hld = (
  key: string,
  label: string,
  scannerVertical: Vertical,
  routingLabel: string,
  searchTerms: string,
  placeTypes: string[],
): Industry => ({
  key,
  label,
  line: "hld",
  scannerVertical,
  routingLabel,
  searchTerms,
  placeTypes,
  targetActive: DEFAULT_TARGET_ACTIVE,
  core: true,
});
const hscs = (
  key: string,
  label: string,
  routingLabel: string,
  searchTerms: string,
  placeTypes: string[],
): Industry => ({
  key,
  label,
  line: "hscs",
  scannerVertical: "professional_services",
  routingLabel,
  searchTerms,
  placeTypes,
  targetActive: DEFAULT_TARGET_ACTIVE,
  core: true,
});

export const INDUSTRIES: readonly Industry[] = [
  hld(
    "dental",
    "Dental practices",
    "professional_services",
    "dentist dental",
    "dentist dental practice",
    ["dentist", "dental_clinic"],
  ),
  hld("barbershop", "Barbershops", "salon_barber", "barber", "barber shop", [
    "barber_shop",
  ]),
  hld("salon", "Salons", "salon_barber", "salon", "hair salon", [
    "hair_salon",
    "beauty_salon",
    "nail_salon",
  ]),
  hld(
    "landscaping",
    "Landscaping companies",
    "contractor",
    "landscaping",
    "landscaping company lawn care",
    ["landscaper"],
  ),
  hld(
    "pet_grooming",
    "Pet groomers",
    "salon_barber",
    "pet groomer",
    "pet grooming dog groomer",
    ["pet_care", "pet_store"],
  ),
  hscs("moving", "Moving companies", "moving company movers", "moving company movers", [
    "moving_company",
  ]),
  hscs(
    "transportation",
    "Transportation providers",
    "trucking transportation freight carrier",
    "trucking company freight carrier",
    ["trucking_company"],
  ),
  hscs(
    "third_party_logistics",
    "Third-party logistics (3PLs)",
    "3pl logistics warehouse",
    "3PL third party logistics warehouse",
    ["warehouse", "logistics_service"],
  ),
  {
    key: "general_hld",
    label: "HLD — not one of the eight",
    line: "hld",
    scannerVertical: "professional_services",
    routingLabel: "",
    searchTerms: "",
    placeTypes: [],
    targetActive: 0,
    core: false,
  },
  {
    key: "general_hscs",
    label: "HSCS — not one of the eight",
    line: "hscs",
    scannerVertical: "professional_services",
    routingLabel: "",
    searchTerms: "",
    placeTypes: [],
    targetActive: 0,
    core: false,
  },
];

export const CORE_INDUSTRIES = INDUSTRIES.filter((i) => i.core);

export function industry(key: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.key === key);
}

export interface IndustryCounts {
  industryKey: string;
  active: number;
  qualified: number;
  rejected: number;
  disqualified: number;
}

export interface BackfillPlan {
  industry: Industry;
  target: number;
  /** Active + qualified count toward the target; rejected and disqualified do not. */
  open: number;
  deficit: number;
}

/** How many new prospects each industry needs to reach its target. */
export function planBackfill(
  counts: readonly IndustryCounts[],
  industries: readonly Industry[] = CORE_INDUSTRIES,
  targets: Readonly<Record<string, number>> = {},
): BackfillPlan[] {
  return industries.map((ind) => {
    const c = counts.find((x) => x.industryKey === ind.key);
    const open = (c?.active ?? 0) + (c?.qualified ?? 0);
    const target = targets[ind.key] ?? ind.targetActive;
    return { industry: ind, target, open, deficit: Math.max(0, target - open) };
  });
}
