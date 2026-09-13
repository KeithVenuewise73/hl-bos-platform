import { describe, it, expect } from "vitest";
import {
  completeness,
  decidedAgainst,
  loadProductMap,
  PRODUCT_MAP_SQL,
  shipped,
  toCapability,
  toOwner,
  toStatus,
  waitingOnCeo,
  waitingOnEngineering,
  type Capability,
} from "./product-map";

const CAP = (over: Partial<Capability> = {}): Capability => ({
  key: "client_crm",
  name: "Client CRM",
  category: "core",
  description: "",
  status: "planned",
  blockedOn: "Engineering only.",
  blockerOwner: "engineering",
  requires: [],
  ...over,
});

describe("a status we do not recognise is never 'available'", () => {
  it("reads the real ones", () => {
    expect(toStatus("available")).toBe("available");
    expect(toStatus("deferred")).toBe("deferred");
    expect(toStatus("planned")).toBe("planned");
  });

  it("falls back to planned", () => {
    // Same rule the proposal uses. Under-promising costs a slower sale;
    // over-promising costs a contract we cannot honour.
    for (const v of ["shipped", "live", "", null, 3])
      expect(toStatus(v)).toBe("planned");
  });
});

describe("an owner we do not recognise is engineering, not the CEO", () => {
  it("reads the real ones", () => {
    expect(toOwner("ceo")).toBe("ceo");
    expect(toOwner("engineering")).toBe("engineering");
  });

  it("never invents a job for the CEO", () => {
    // Only the exact string puts work on his list. Wrong the other way puts a
    // job on his list that was never his, and it sits there.
    expect(toOwner("someone")).toBe("engineering");
    expect(toOwner("CEO")).toBe("engineering");
  });

  it("reports an unwritten owner as unwritten, and lets the row decide", () => {
    // Null here means "the row said nothing", not "no owner". Only
    // toCapability knows whether there is a blocker needing one.
    for (const v of [null, undefined, "", 7, {}]) expect(toOwner(v)).toBeNull();
  });
});

describe("reading a row", () => {
  it("carries what the catalog says", () => {
    const c = toCapability({
      key: "marketing_engine",
      name: "Marketing Engine",
      category: "growth",
      description: "d",
      status: "planned",
      blocked_on: "An SMS provider account.",
      blocker_owner: "ceo",
      requires: "client_crm",
    })!;
    expect(c.blockerOwner).toBe("ceo");
    expect(c.requires).toEqual(["client_crm"]);
  });

  it("never shows a blocker with nobody to clear it", () => {
    // The schema guarantees these agree. This keeps them agreeing even if a
    // row arrives half-formed, rather than rendering "blocked by nobody".
    const c = toCapability({ key: "x", blocked_on: "something", blocker_owner: null })!;
    expect(c.blockerOwner).toBe("engineering");
  });

  it("never shows an owner with nothing to clear", () => {
    const c = toCapability({ key: "x", blocked_on: null, blocker_owner: "ceo" })!;
    expect(c.blockerOwner).toBeNull();
  });

  it("drops a row with no key rather than inventing one", () => {
    expect(toCapability({ name: "Nameless" })).toBeNull();
  });

  it("copes with a module that needs nothing first", () => {
    expect(toCapability({ key: "x", requires: null })!.requires).toEqual([]);
  });
});

describe("the four buckets are exclusive", () => {
  const all: Capability[] = [
    CAP({
      key: "owned_website",
      status: "available",
      blockedOn: null,
      blockerOwner: null,
    }),
    CAP({ key: "client_crm", blockerOwner: "engineering" }),
    CAP({ key: "marketing_engine", blockerOwner: "ceo", blockedOn: "An SMS account." }),
    CAP({ key: "payments", status: "deferred", blockedOn: null, blockerOwner: null }),
  ];

  it("puts every capability in exactly one", () => {
    const total =
      shipped(all).length +
      waitingOnCeo(all).length +
      waitingOnEngineering(all).length +
      decidedAgainst(all).length;
    expect(total).toBe(all.length);
  });

  it("never counts a deferred module as waiting", () => {
    // `payments` is a decision not to build, not a queue position. Showing it
    // as "waiting on the CEO" would invite someone to unblock it.
    expect(waitingOnCeo(all).map((c) => c.key)).not.toContain("payments");
    expect(waitingOnEngineering(all).map((c) => c.key)).not.toContain("payments");
  });

  it("separates what needs an account from what needs time", () => {
    expect(waitingOnCeo(all).map((c) => c.key)).toEqual(["marketing_engine"]);
    expect(waitingOnEngineering(all).map((c) => c.key)).toEqual(["client_crm"]);
  });
});

describe("how much of the product exists", () => {
  it("counts against what we intend to sell, not against everything", () => {
    const all: Capability[] = [
      CAP({ key: "a", status: "available", blockedOn: null, blockerOwner: null }),
      CAP({ key: "b" }),
      CAP({ key: "c", status: "deferred", blockedOn: null, blockerOwner: null }),
    ];
    // `deferred` is out of the denominator: it is not a gap, it is a decision.
    expect(completeness(all)).toEqual({
      shipped: 1,
      sellable: 2,
      blockedOnAccess: 0,
    });
  });
});

describe("the query", () => {
  it("reads the catalog and what each module needs first", () => {
    const sql = PRODUCT_MAP_SQL();
    expect(sql).toContain("barberos.capabilities");
    expect(sql).toContain("barberos.capability_requires");
    expect(sql).toContain("blocked_on");
    expect(sql).toContain("blocker_owner");
  });

  it("is a read and nothing else", () => {
    expect(PRODUCT_MAP_SQL()).not.toMatch(/insert|update|delete|drop/i);
  });

  it("drops malformed rows rather than showing a nameless module", async () => {
    const rows = [{ key: "ok", status: "available" }, { name: "no key" }];
    const caps = await loadProductMap(() => Promise.resolve(rows));
    expect(caps.map((c) => c.key)).toEqual(["ok"]);
  });
});
