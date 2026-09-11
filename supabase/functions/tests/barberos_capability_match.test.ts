// The cross-reference between what a shop has and what we can give it.
//
// Most of these guard against the failure a sales conversation invites: saying
// more than we know, or promising more than we have built.

import {
  deliverableNow,
  matchCapabilities,
  questionsToAsk,
  roadmap,
  type CapabilityOffer,
  type ShopStack,
} from "../_shared/barberos/capability_match.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`assertion failed: ${msg} (got ${a}, want ${b})`);
}

/** The real catalog, as seeded in production by migration 0048/0052. */
const CATALOG: CapabilityOffer[] = [
  {
    key: "owned_website",
    name: "Owned Website / Landing Page",
    status: "available",
    description: "",
  },
  { key: "booking", name: "Booking & Scheduling", status: "planned", description: "" },
  {
    key: "missed_call_capture",
    name: "Missed-Call Capture",
    status: "planned",
    description: "",
  },
  {
    key: "walkin_queue",
    name: "Walk-in Queue & Virtual Wait",
    status: "planned",
    description: "",
  },
  { key: "client_crm", name: "Client CRM", status: "planned", description: "" },
  { key: "review_engine", name: "Review Engine", status: "planned", description: "" },
  {
    key: "staff_management",
    name: "Multi-chair / Staff Management",
    status: "planned",
    description: "",
  },
  {
    key: "reporting_dashboard",
    name: "Reporting Dashboard",
    status: "planned",
    description: "",
  },
  { key: "payments", name: "Payments", status: "deferred", description: "" },
];

/** Everything unknown: a shop off the prospect list that nobody has called. */
const UNKNOWN: ShopStack = {
  ownWebsite: null,
  bookingPlatform: null,
  onlineBooking: null,
  missedCallHandling: null,
  reviewProcess: null,
  clientRecords: null,
  takesWalkIns: null,
  chairs: null,
};

// ===========================================================================
// Rule 1 — never offer what we have decided not to build
// ===========================================================================

Deno.test("a deferred capability never appears, in any form", () => {
  // `payments` is deferred for PCI reasons. A proposal that implies it is
  // coming is a promise nobody has agreed to keep.
  const gaps = matchCapabilities(UNKNOWN, CATALOG);
  assert(!gaps.some((g) => g.capability === "payments"), "payments absent");
  assert(
    !roadmap(gaps).some((g) => g.capability === "payments"),
    "not in roadmap either",
  );
});

Deno.test("a capability the catalog has never heard of is not invented", () => {
  // Only what the database actually offers. If the catalog shrinks, so does
  // the proposal -- automatically.
  const gaps = matchCapabilities(UNKNOWN, [CATALOG[0]!]);
  assertEquals(gaps.length, 1, "only the one on offer");
  assertEquals(gaps[0]!.capability, "owned_website", "and it is that one");
});

// ===========================================================================
// Rule 2 — available and roadmap are never blurred
// ===========================================================================

Deno.test("only what is built can be promised today", () => {
  const gaps = matchCapabilities(UNKNOWN, CATALOG);
  const now = deliverableNow(gaps);
  assertEquals(now.length, 1, "exactly one module is deliverable");
  assertEquals(now[0]!.capability, "owned_website", "and it is the one that exists");
  for (const g of roadmap(gaps)) {
    assertEquals(g.deliverableToday, false, `${g.capability} is not promised as today`);
  }
});

Deno.test("the two lists never overlap and never lose anything", () => {
  const gaps = matchCapabilities(UNKNOWN, CATALOG);
  assertEquals(
    deliverableNow(gaps).length + roadmap(gaps).length,
    gaps.length,
    "every gap is in exactly one list",
  );
});

// ===========================================================================
// Rule 3 — unknown is not absent
// ===========================================================================

Deno.test("a signal we could not observe is phrased as a question, not a claim", () => {
  const gaps = matchCapabilities(UNKNOWN, CATALOG);
  const booking = gaps.find((g) => g.capability === "booking")!;
  assertEquals(booking.needsConfirming, true, "flagged for confirming");
  assert(
    booking.because.includes("could not tell"),
    "and says so, rather than asserting the shop has no booking",
  );
});

Deno.test(
  "missed calls are ALWAYS a question, because a phone log is not visible",
  () => {
    // Even for a shop we know a lot about. We cannot measure this from outside,
    // and telling an owner they are losing calls is the fastest way to be wrong
    // in front of someone who knows their business better than we do.
    const wellKnown: ShopStack = {
      ...UNKNOWN,
      ownWebsite: true,
      onlineBooking: true,
      reviewProcess: true,
      clientRecords: true,
      takesWalkIns: false,
      chairs: 1,
    };
    const gap = matchCapabilities(wellKnown, CATALOG).find(
      (g) => g.capability === "missed_call_capture",
    )!;
    assertEquals(gap.needsConfirming, true, "still a question");
    assert(gap.because.includes("Worth asking the owner"), "and asks it");
  },
);

Deno.test("a shop that already handles missed calls is not sold the module", () => {
  const gaps = matchCapabilities({ ...UNKNOWN, missedCallHandling: true }, CATALOG);
  assert(
    !gaps.some((g) => g.capability === "missed_call_capture"),
    "nothing to fix, nothing offered",
  );
});

// ===========================================================================
// The shop's actual situation drives the words
// ===========================================================================

Deno.test("a shop on a booking platform is told what it actually loses", () => {
  // The five platform-only shops in the WNY list. Their problem is not
  // "no booking" -- they book fine. It is that the page is not theirs.
  const gaps = matchCapabilities(
    {
      ...UNKNOWN,
      ownWebsite: false,
      bookingPlatform: "GlossGenius",
      onlineBooking: true,
    },
    CATALOG,
  );
  const site = gaps.find((g) => g.capability === "owned_website")!;
  assert(site.because.includes("GlossGenius"), "names the platform");
  assert(site.because.includes("owns"), "and what that means");
  assert(
    !gaps.some((g) => g.capability === "booking"),
    "and never pitches booking to a shop that can already be booked",
  );
});

Deno.test("a shop with no website at all is told the simpler truth", () => {
  const gaps = matchCapabilities({ ...UNKNOWN, ownWebsite: false }, CATALOG);
  const site = gaps.find((g) => g.capability === "owned_website")!;
  assertEquals(site.needsConfirming, false, "this one we did observe");
  assert(site.because.includes("No website was found"), "says it plainly");
});

Deno.test("a single-chair shop is not sold staff management", () => {
  assert(
    !matchCapabilities({ ...UNKNOWN, chairs: 1 }, CATALOG).some(
      (g) => g.capability === "staff_management",
    ),
    "one chair needs no rota",
  );
  const three = matchCapabilities({ ...UNKNOWN, chairs: 3 }, CATALOG).find(
    (g) => g.capability === "staff_management",
  )!;
  assert(three.because.includes("3 chairs"), "three does, and it says why");
});

Deno.test("an appointment-only shop is not sold a walk-in queue", () => {
  assert(
    !matchCapabilities({ ...UNKNOWN, takesWalkIns: false }, CATALOG).some(
      (g) => g.capability === "walkin_queue",
    ),
    "no walk-ins, no queue",
  );
});

Deno.test("a shop that needs nothing we sell is given an honest short list", () => {
  const sorted: ShopStack = {
    ownWebsite: true,
    bookingPlatform: null,
    onlineBooking: true,
    missedCallHandling: true,
    reviewProcess: true,
    clientRecords: true,
    takesWalkIns: false,
    chairs: 1,
  };
  const gaps = matchCapabilities(sorted, CATALOG);
  // Only the reporting dashboard, which every shop lacks by definition.
  assertEquals(gaps.length, 1, "we do not manufacture a need");
  assertEquals(gaps[0]!.capability, "reporting_dashboard", "and it is the honest one");
});

// ===========================================================================
// Order
// ===========================================================================

Deno.test(
  "structural gaps come before quick wins, and buildable before roadmap",
  () => {
    const gaps = matchCapabilities(
      { ...UNKNOWN, ownWebsite: false, chairs: 4 },
      CATALOG,
    );
    const firstQuickWin = gaps.findIndex((g) => g.priority === "quick_win");
    const lastStructural = gaps.map((g) => g.priority).lastIndexOf("structural");
    assert(lastStructural < firstQuickWin, "no quick win above a structural gap");
    // The audit already learned this: rank by anything else and "customers
    // cannot book you" ends up under "add a viewport tag".
    assertEquals(gaps[0]!.capability, "owned_website", "what we can build leads");
  },
);

Deno.test("every gap says what it recovers, in money-or-time terms", () => {
  for (const g of matchCapabilities(UNKNOWN, CATALOG)) {
    assert(g.recovers.trim().length > 20, `${g.capability} explains what it recovers`);
    assert(g.because.trim().length > 20, `${g.capability} explains why this shop`);
  }
});

Deno.test("the questions list is exactly what we could not observe", () => {
  const gaps = matchCapabilities(UNKNOWN, CATALOG);
  const qs = questionsToAsk(gaps);
  assertEquals(
    qs.length,
    gaps.filter((g) => g.needsConfirming).length,
    "one question per unconfirmed signal",
  );
  assert(qs.length > 0, "an unresearched shop produces questions, not assertions");
});
