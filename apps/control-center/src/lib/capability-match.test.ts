import { describe, it, expect } from "vitest";
import {
  deliverableNow,
  matchCapabilities,
  questionsToAsk,
  roadmap,
  type CapabilityOffer,
  type ShopStack,
} from "./capability-match";

/** The real catalog, as seeded in production by migrations 0048 and 0052. */
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

/** Everything unknown: a shop off the list that nobody has called. */
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

describe("rule 1 — never offer what we decided not to build", () => {
  it("keeps a deferred capability out entirely", () => {
    // `payments` is deferred for PCI reasons. A proposal implying it is coming
    // is a promise nobody agreed to keep.
    const gaps = matchCapabilities(UNKNOWN, CATALOG);
    expect(gaps.map((g) => g.capability)).not.toContain("payments");
    expect(roadmap(gaps).map((g) => g.capability)).not.toContain("payments");
  });

  it("never invents a capability the catalog has not heard of", () => {
    const gaps = matchCapabilities(UNKNOWN, [CATALOG[0]!]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.capability).toBe("owned_website");
  });
});

describe("rule 2 — available and roadmap never blur", () => {
  it("promises only what is built", () => {
    const gaps = matchCapabilities(UNKNOWN, CATALOG);
    const now = deliverableNow(gaps);
    expect(now).toHaveLength(1);
    expect(now[0]!.capability).toBe("owned_website");
    for (const g of roadmap(gaps)) expect(g.deliverableToday).toBe(false);
  });

  it("splits every gap into exactly one of the two lists", () => {
    const gaps = matchCapabilities(UNKNOWN, CATALOG);
    expect(deliverableNow(gaps).length + roadmap(gaps).length).toBe(gaps.length);
  });
});

describe("rule 3 — unknown is not absent", () => {
  it("phrases an unobserved signal as a question, not a claim", () => {
    const booking = matchCapabilities(UNKNOWN, CATALOG).find(
      (g) => g.capability === "booking",
    )!;
    expect(booking.needsConfirming).toBe(true);
    expect(booking.because).toContain("could not tell");
  });

  it("always treats missed calls as a question, even for a well-known shop", () => {
    // A phone log is invisible from outside. Telling an owner they are losing
    // calls is the fastest way to be wrong in front of someone who knows their
    // business better than we do.
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
    expect(gap.needsConfirming).toBe(true);
    expect(gap.because).toContain("Worth asking the owner");
  });

  it("stops offering the module once the shop says it is handled", () => {
    const gaps = matchCapabilities({ ...UNKNOWN, missedCallHandling: true }, CATALOG);
    expect(gaps.map((g) => g.capability)).not.toContain("missed_call_capture");
  });
});

describe("the shop's own situation drives the words", () => {
  it("tells a booking-platform shop what it actually loses", () => {
    // The five platform-only shops in the WNY list. Their problem is not "no
    // booking" -- they book fine. It is that the page is not theirs.
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
    expect(site.because).toContain("GlossGenius");
    expect(site.because).toContain("owns");
    expect(gaps.map((g) => g.capability)).not.toContain("booking");
  });

  it("tells a shop with no website the simpler truth", () => {
    const site = matchCapabilities({ ...UNKNOWN, ownWebsite: false }, CATALOG).find(
      (g) => g.capability === "owned_website",
    )!;
    expect(site.needsConfirming).toBe(false);
    expect(site.because).toContain("No website was found");
  });

  it("does not sell a rota to a one-chair shop", () => {
    expect(
      matchCapabilities({ ...UNKNOWN, chairs: 1 }, CATALOG).map((g) => g.capability),
    ).not.toContain("staff_management");
    const three = matchCapabilities({ ...UNKNOWN, chairs: 3 }, CATALOG).find(
      (g) => g.capability === "staff_management",
    )!;
    expect(three.because).toContain("3 chairs");
  });

  it("does not sell a queue to an appointment-only shop", () => {
    expect(
      matchCapabilities({ ...UNKNOWN, takesWalkIns: false }, CATALOG).map(
        (g) => g.capability,
      ),
    ).not.toContain("walkin_queue");
  });

  it("gives a well-run shop a short honest list rather than a manufactured need", () => {
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
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.capability).toBe("reporting_dashboard");
  });
});

describe("order and completeness", () => {
  it("puts structural gaps above quick wins, and buildable above roadmap", () => {
    const gaps = matchCapabilities(
      { ...UNKNOWN, ownWebsite: false, chairs: 4 },
      CATALOG,
    );
    const firstQuickWin = gaps.findIndex((g) => g.priority === "quick_win");
    const lastStructural = gaps.map((g) => g.priority).lastIndexOf("structural");
    expect(lastStructural).toBeLessThan(firstQuickWin);
    expect(gaps[0]!.capability).toBe("owned_website");
  });

  it("makes every gap say why this shop and what it recovers", () => {
    for (const g of matchCapabilities(UNKNOWN, CATALOG)) {
      expect(g.recovers.trim().length).toBeGreaterThan(20);
      expect(g.because.trim().length).toBeGreaterThan(20);
    }
  });

  it("lists exactly the questions we could not answer ourselves", () => {
    const gaps = matchCapabilities(UNKNOWN, CATALOG);
    const qs = questionsToAsk(gaps);
    expect(qs).toHaveLength(gaps.filter((g) => g.needsConfirming).length);
    expect(qs.length).toBeGreaterThan(0);
  });
});
