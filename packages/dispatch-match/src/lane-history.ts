// Return-load probability.
//
// This number is ONLY produced from recorded lane history. With no history, or
// too little, the result says so and carries no number at all — the UI shows
// "not estimated" rather than a plausible-looking percentage. A made-up 72%
// next to a load is worse than a blank, because a dispatcher will act on it.

import type { LaneObservation, ReturnLoadProbability } from "./types";

export function returnLoadProbability(args: {
  history: readonly LaneObservation[];
  tenantId: string;
  originRegion: string;
  destinationRegion: string;
  equipmentType: string;
  minWeeks: number;
}): ReturnLoadProbability {
  const weeks = new Map<string, number>();
  for (const o of args.history) {
    if (
      o.tenantId !== args.tenantId ||
      o.originRegion !== args.originRegion ||
      o.destinationRegion !== args.destinationRegion ||
      o.equipmentType !== args.equipmentType
    ) {
      continue;
    }
    weeks.set(o.weekOf, (weeks.get(o.weekOf) ?? 0) + Math.max(0, o.loadsSeen));
  }
  const lane = `${args.originRegion} → ${args.destinationRegion} (${args.equipmentType})`;
  if (weeks.size === 0) {
    return { available: false, reason: `No lane history recorded for ${lane}.` };
  }
  if (weeks.size < args.minWeeks) {
    return {
      available: false,
      reason: `Only ${weeks.size} week(s) of history for ${lane}; ${args.minWeeks} needed before estimating.`,
    };
  }
  const withLoads = [...weeks.values()].filter((n) => n > 0).length;
  return {
    available: true,
    probability: withLoads / weeks.size,
    weeksObserved: weeks.size,
    weeksWithLoads: withLoads,
  };
}
