// What the shop already has, against what BarberOS can give it.
//
// LIVES HERE, in the console, because the console is what runs a discovery
// call. The first draft put it in supabase/functions/_shared, which is Deno
// territory the Next app deliberately does not reach into -- a second copy or
// a cross-boundary import hack would both have been worse than moving it to
// where its only caller is. If an edge function ever needs it, that is when it
// moves again.
//
// This is the cross-reference the sale is built on: not "here is our feature
// list", but "here is the specific thing costing you money, and here is the
// module that stops it". A generic pitch is worth nothing to a barber who
// already pays for Booksy.
//
// ---------------------------------------------------------------------------
// THE THREE RULES THIS FILE ENFORCES, because a proposal is a promise
//
// 1. NEVER OFFER WHAT WE CANNOT DELIVER. A capability whose catalog status is
//    `deferred` is not a roadmap item, it is a decision not to build. It never
//    appears in a proposal in any form. `payments` is deferred for PCI reasons
//    and must not be implied to a shop as "coming".
//
// 2. AVAILABLE AND ROADMAP ARE NEVER BLURRED. A `planned` module may be shown
//    -- a shop buying an operating system is entitled to know where it is
//    going -- but it is labelled, and it can never be the thing that closes
//    the deal. `deliverableToday` is what a contract may rest on.
//
// 3. UNKNOWN IS NOT ABSENT. We cannot see a shop's phone log before they are a
//    customer. So "they miss calls" is not a finding, it is a QUESTION, and it
//    is phrased as one. Telling an owner they are losing calls when we have not
//    measured it is the fastest way to be wrong in front of someone who knows
//    their own business better than we do.
//
// Rule 3 is the one most likely to be quietly dropped under sales pressure,
// which is exactly why it is a type and a test rather than a guideline: an
// unknown signal cannot produce a `because` that asserts anything.

/** What the catalog offers, as stored in `barberos.capabilities`. */
export interface CapabilityOffer {
  key: string;
  name: string;
  status: "available" | "planned" | "deferred";
  description: string;
}

/**
 * A tri-state. `null` means we have not looked or could not tell, and it is
 * deliberately not `false`: the whole point of rule 3 is that these are
 * different, and a boolean would erase the difference at the type level.
 */
export type Known = boolean | null;

/**
 * What we believe the shop runs today.
 *
 * Everything here is either observed by the audit, read off the prospect list,
 * or told to us by the owner. Nothing is assumed.
 */
export interface ShopStack {
  /** A site on a domain the shop controls. */
  ownWebsite: Known;
  /** "Booksy", "GlossGenius", "Square"... or null for none found. */
  bookingPlatform: string | null;
  /** Any way for a customer to book without phoning. */
  onlineBooking: Known;
  /** Does anyone answer, or capture, a call the shop misses? */
  missedCallHandling: Known;
  /** Any systematic asking for reviews. */
  reviewProcess: Known;
  /** Any record of a client beyond the barber's memory. */
  clientRecords: Known;
  /** Walk-in led shops are where queue time is worth the most. */
  takesWalkIns: Known;
  /** More than one chair changes which modules matter. */
  chairs: number | null;
}

export interface Gap {
  capability: string;
  name: string;
  /** Why this shop, citing what we actually observed. */
  because: string;
  /** The downtime or lost income it addresses, in the owner's terms. */
  recovers: string;
  /** True only when the catalog says `available`. A contract may rest on this. */
  deliverableToday: boolean;
  /** Ask the owner rather than assert: we could not observe the signal. */
  needsConfirming: boolean;
  priority: "structural" | "quick_win";
}

interface Rule {
  capability: string;
  priority: Gap["priority"];
  recovers: string;
  /** Null when the shop does not need it. */
  assess(s: ShopStack): { because: string; needsConfirming: boolean } | null;
}

const RULES: readonly Rule[] = [
  {
    capability: "owned_website",
    priority: "structural",
    recovers:
      "Every search that finds the shop currently ends somewhere the shop does not control.",
    assess(s) {
      if (s.ownWebsite === true) return null;
      if (s.ownWebsite === null) {
        return {
          because: "We could not confirm whether the shop has a site of its own.",
          needsConfirming: true,
        };
      }
      return s.bookingPlatform !== null
        ? {
            because: `The shop's web presence is a ${s.bookingPlatform} page, which ${s.bookingPlatform} owns.`,
            needsConfirming: false,
          }
        : {
            because: "No website was found for the shop at all.",
            needsConfirming: false,
          };
    },
  },
  {
    capability: "booking",
    priority: "structural",
    recovers:
      "Bookings taken while the shop is shut, mid-cut, or on the other line -- the hours when a phone cannot be answered.",
    assess(s) {
      if (s.onlineBooking === true) return null;
      if (s.onlineBooking === null) {
        return {
          because: "We could not tell whether a customer can book without phoning.",
          needsConfirming: true,
        };
      }
      return {
        because: "There is no way to book without phoning during opening hours.",
        needsConfirming: false,
      };
    },
  },
  {
    capability: "missed_call_capture",
    priority: "structural",
    recovers:
      "The calls that come in while a barber's hands are busy. Each one is a chair that could have been filled.",
    assess(s) {
      if (s.missedCallHandling === true) return null;
      // We cannot see a phone log before they are a customer. This is always a
      // question, never a claim -- rule 3.
      return {
        because:
          "A barber mid-cut cannot answer the phone, and we have no way to see how often that happens here. Worth asking the owner what a missed call currently costs them.",
        needsConfirming: true,
      };
    },
  },
  {
    capability: "walkin_queue",
    priority: "structural",
    recovers:
      "Walk-ins who look through the window, see a full shop, and leave -- and the dead time between chairs when nobody is waiting.",
    assess(s) {
      if (s.takesWalkIns === false) return null;
      if (s.takesWalkIns === null) {
        return {
          because: "We do not know how much of the shop's trade is walk-in.",
          needsConfirming: true,
        };
      }
      return {
        because: "The shop takes walk-ins with no way to hold a place in line.",
        needsConfirming: false,
      };
    },
  },
  {
    capability: "client_crm",
    priority: "structural",
    recovers:
      "Repeat trade. A barber who knows the guard number, the product and the last visit date does not lose the client to whoever is nearer.",
    assess(s) {
      if (s.clientRecords === true) return null;
      if (s.clientRecords === null) {
        return {
          because: "We do not know what the shop keeps on a returning client.",
          needsConfirming: true,
        };
      }
      return {
        because:
          "Client history lives in the barber's memory, and leaves when they do.",
        needsConfirming: false,
      };
    },
  },
  {
    capability: "review_engine",
    priority: "quick_win",
    recovers:
      "Local search position, which is mostly review count and recency -- the thing that decides who gets found first.",
    assess(s) {
      if (s.reviewProcess === true) return null;
      if (s.reviewProcess === null) {
        return {
          because:
            "We could not tell whether the shop asks for reviews systematically.",
          needsConfirming: true,
        };
      }
      return {
        because: "Reviews are left to chance rather than asked for.",
        needsConfirming: false,
      };
    },
  },
  {
    capability: "staff_management",
    priority: "quick_win",
    recovers:
      "Chair utilisation across barbers, rather than one busy chair and one idle one.",
    assess(s) {
      if (s.chairs === null || s.chairs <= 1) return null;
      return {
        because: `The shop runs ${s.chairs} chairs, which need separate schedules.`,
        needsConfirming: false,
      };
    },
  },
  {
    capability: "reporting_dashboard",
    priority: "quick_win",
    recovers:
      "Knowing which of the above is actually working, instead of guessing at the end of the month.",
    assess() {
      return {
        because:
          "Nothing currently reports whether a change to the shop's operations made a difference.",
        needsConfirming: false,
      };
    },
  },
];

/**
 * The cross-reference.
 *
 * Ordered structural-first, because the audit learned that lesson already:
 * ranking by anything else buries "customers cannot book you" under "add a
 * viewport tag".
 */
export function matchCapabilities(
  stack: ShopStack,
  catalog: readonly CapabilityOffer[],
): Gap[] {
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const gaps: Gap[] = [];

  for (const rule of RULES) {
    const offer = byKey.get(rule.capability);
    // Not in the catalog, or a decision not to build it. Either way it is not
    // ours to offer -- rule 1.
    if (offer === undefined || offer.status === "deferred") continue;

    const hit = rule.assess(stack);
    if (hit === null) continue;

    gaps.push({
      capability: offer.key,
      name: offer.name,
      because: hit.because,
      recovers: rule.recovers,
      deliverableToday: offer.status === "available",
      needsConfirming: hit.needsConfirming,
      priority: rule.priority,
    });
  }

  return gaps.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "structural" ? -1 : 1;
    // Within a priority, what we can deliver now comes first: it is what the
    // conversation can actually close on.
    if (a.deliverableToday !== b.deliverableToday) return a.deliverableToday ? -1 : 1;
    return 0;
  });
}

/**
 * What a proposal may state as available now.
 *
 * Deliberately a separate function rather than a flag on the list, so that
 * building the "what you get today" section of a proposal cannot accidentally
 * include a roadmap item by forgetting to filter.
 */
export function deliverableNow(gaps: readonly Gap[]): Gap[] {
  return gaps.filter((g) => g.deliverableToday);
}

/** Everything we would be promising rather than delivering. */
export function roadmap(gaps: readonly Gap[]): Gap[] {
  return gaps.filter((g) => !g.deliverableToday);
}

/**
 * The questions to take into the meeting.
 *
 * A shop owner can answer in ten seconds what we cannot determine from the
 * outside in a week, and asking beats guessing in front of someone who knows
 * their own business.
 */
export function questionsToAsk(gaps: readonly Gap[]): string[] {
  return gaps.filter((g) => g.needsConfirming).map((g) => g.because);
}
