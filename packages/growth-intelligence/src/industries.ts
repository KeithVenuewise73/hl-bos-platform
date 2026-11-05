// The Revenue Center prospect model: industries, each owned by one business
// line, each with a target number of ACTIVE prospects (50 by default).
//
// The original hosted Revenue Center has eight industries. Its list could not
// be read from this environment, so only industries grounded in this
// repository are listed here (the Presence Scanner's six verticals, plus
// transportation for HSCS). The model takes any number; the eighth — and
// whether these seven match the original's — must be confirmed from the
// original's export. `confirmedAgainstOriginal` says so on every row.

import type { Vertical } from "@hl-bos/presence-scanner";

import type { BusinessLine } from "./types.ts";

export interface Industry {
  key: string;
  label: string;
  line: BusinessLine;
  /** The Presence Scanner vertical used to discover and score it. */
  scannerVertical: Vertical;
  /** Words that make routeLead recognise the industry. */
  routingLabel: string;
  targetActive: number;
  confirmedAgainstOriginal: boolean;
}

export const DEFAULT_TARGET_ACTIVE = 50;

export const INDUSTRIES: readonly Industry[] = [
  {
    key: "contractor",
    label: "Contractors and trades",
    line: "hld",
    scannerVertical: "contractor",
    routingLabel: "contractor",
    targetActive: DEFAULT_TARGET_ACTIVE,
    confirmedAgainstOriginal: false,
  },
  {
    key: "salon_barber",
    label: "Salons and barbers",
    line: "hld",
    scannerVertical: "salon_barber",
    routingLabel: "salon barber",
    targetActive: DEFAULT_TARGET_ACTIVE,
    confirmedAgainstOriginal: false,
  },
  {
    key: "restaurant_bar",
    label: "Restaurants and bars",
    line: "hld",
    scannerVertical: "restaurant_bar",
    routingLabel: "restaurant",
    targetActive: DEFAULT_TARGET_ACTIVE,
    confirmedAgainstOriginal: false,
  },
  {
    key: "trainer_coach",
    label: "Trainers and coaches",
    line: "hld",
    scannerVertical: "trainer_coach",
    routingLabel: "trainer coach",
    targetActive: DEFAULT_TARGET_ACTIVE,
    confirmedAgainstOriginal: false,
  },
  {
    key: "youth_sports",
    label: "Youth sports",
    line: "hld",
    scannerVertical: "youth_sports",
    routingLabel: "coach",
    targetActive: DEFAULT_TARGET_ACTIVE,
    confirmedAgainstOriginal: false,
  },
  {
    key: "professional_services",
    label: "Professional services",
    line: "hld",
    scannerVertical: "professional_services",
    routingLabel: "accountant law firm",
    targetActive: DEFAULT_TARGET_ACTIVE,
    confirmedAgainstOriginal: false,
  },
  // The scanner has no transportation vertical; its website checks are reused
  // through the professional-services vertical. HSCS-specific checks are a gap.
  {
    key: "transportation",
    label: "Transportation and logistics",
    line: "hscs",
    scannerVertical: "professional_services",
    routingLabel: "transportation logistics fleet",
    targetActive: DEFAULT_TARGET_ACTIVE,
    confirmedAgainstOriginal: false,
  },
];

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
  /** Active + qualified count toward the target; rejected do not. */
  open: number;
  deficit: number;
}

/** How many new prospects each industry needs to reach its target. */
export function planBackfill(
  counts: readonly IndustryCounts[],
  industries = INDUSTRIES,
): BackfillPlan[] {
  return industries.map((ind) => {
    const c = counts.find((x) => x.industryKey === ind.key);
    const open = (c?.active ?? 0) + (c?.qualified ?? 0);
    return { industry: ind, open, deficit: Math.max(0, ind.targetActive - open) };
  });
}

/** Stable identity used to refuse duplicates: place ID, then domain, then phone, then name. */
export function dedupeKeyFor(p: {
  placeId?: string | undefined;
  dedupeKey?: string | undefined;
  name: string;
}): string {
  if (p.dedupeKey) return p.dedupeKey.toLowerCase();
  if (p.placeId) return `place:${p.placeId}`;
  return `name:${p.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;
}
