import { describe, it, expect } from "vitest";
import {
  describeCut,
  money,
  toClientDetail,
  toDueClients,
  toRhythm,
  toVisit,
  type Visit,
} from "./crm";

const VISIT = (over: Partial<Visit> = {}): Visit => ({
  id: "v1",
  visitedOn: "2026-09-01",
  barber: null,
  serviceName: null,
  priceCents: null,
  durationMinutes: null,
  sidesGuard: null,
  topFinish: null,
  topGuard: null,
  fade: null,
  beard: false,
  beardGuard: null,
  lineUp: false,
  part: false,
  notes: null,
  tools: [],
  ...over,
});

describe("a rhythm this app must never invent", () => {
  it("carries a real one through", () => {
    const r = toRhythm({
      visits: 4,
      typical_days: 28,
      days_since_last: 34,
      overdue_by_days: 6,
      basis: "average of the last gaps",
    });
    expect(r.typicalDays).toBe(28);
    expect(r.overdueByDays).toBe(6);
  });

  it("keeps 'not enough visits' as not enough", () => {
    const r = toRhythm({
      visits: 2,
      typical_days: null,
      basis: "not enough visits to know a rhythm",
    });
    expect(r.typicalDays).toBeNull();
    expect(r.basis).toContain("not enough visits");
  });

  it("refuses to report overdue when there is no rhythm", () => {
    // The single most important line in this file. "Marcus is overdue"
    // computed from one haircut is how a shop stops trusting the screen.
    const r = toRhythm({ visits: 1, typical_days: null, overdue_by_days: 400 });
    expect(r.overdueByDays).toBeNull();
  });

  it("survives a rhythm block that is missing entirely", () => {
    const r = toRhythm(null);
    expect(r.visits).toBe(0);
    expect(r.typicalDays).toBeNull();
    expect(r.basis).toContain("not enough visits");
  });
});

describe("lifetime value always carries its own gaps", () => {
  it("reports the total and how much of it is unknown", () => {
    const c = toClientDetail({
      id: "c1",
      display_name: "Marcus",
      value: { total_cents: 8000, visits: 3, visits_without_a_price: 1 },
      visits: [],
    })!;
    expect(c.value.totalCents).toBe(8000);
    expect(c.value.visitsWithoutAPrice).toBe(1);
  });

  it("does not pretend an absent value block is zero visits of zero value", () => {
    const c = toClientDetail({ id: "c1", display_name: "Marcus" })!;
    expect(c.value).toEqual({ totalCents: 0, visits: 0, visitsWithoutAPrice: 0 });
  });
});

describe("the overdue list", () => {
  it("keeps a real row", () => {
    const d = toDueClients([
      { id: "c1", display_name: "Marcus", typical_days: 28, overdue_by_days: 6 },
    ]);
    expect(d).toHaveLength(1);
    expect(d[0]!.overdueByDays).toBe(6);
  });

  it("drops a row with no rhythm rather than showing a guess", () => {
    // The database already filters these out. Reading one here would mean
    // something changed, and the safe response is to show nothing.
    const d = toDueClients([
      { id: "c1", display_name: "A", typical_days: null, overdue_by_days: 5 },
      { id: "c2", display_name: "B", typical_days: 28, overdue_by_days: null },
      { id: "c3", display_name: "C", typical_days: 28, overdue_by_days: 3 },
    ]);
    expect(d.map((x) => x.id)).toEqual(["c3"]);
  });

  it("copes with nobody being due", () => {
    expect(toDueClients([])).toEqual([]);
    expect(toDueClients(null)).toEqual([]);
  });
});

describe("reading a visit", () => {
  it("maps the cut and the kit", () => {
    const v = toVisit({
      id: "v1",
      visited_on: "2026-09-01",
      sides_guard: 2,
      top_finish: "scissor",
      fade: "low",
      beard: true,
      beard_guard: 1,
      line_up: true,
      price_cents: 4000,
      tools: ["T-liner", "Wahl Magic Clip"],
    })!;
    expect(v.sidesGuard).toBe(2);
    expect(v.beard).toBe(true);
    expect(v.tools).toHaveLength(2);
  });

  it("keeps guard zero as zero, not as absent", () => {
    // 0 is skin. Treating it as missing would lose the most specific thing a
    // barber can record.
    expect(toVisit({ id: "v", visited_on: "d", sides_guard: 0 })!.sidesGuard).toBe(0);
  });

  it("drops a visit with no date rather than showing one with no date", () => {
    expect(toVisit({ id: "v" })).toBeNull();
  });
});

describe("the cut in one line, the way a barber would say it", () => {
  it("says the guards", () => {
    expect(describeCut(VISIT({ sidesGuard: 2, topFinish: "scissor" }))).toBe(
      "#2 sides, scissor on top",
    );
  });

  it("calls guard zero skin", () => {
    expect(describeCut(VISIT({ sidesGuard: 0 }))).toBe("skin sides");
  });

  it("uses the top guard number when there is one", () => {
    expect(describeCut(VISIT({ topFinish: "guard", topGuard: 4 }))).toBe("#4 on top");
  });

  it("leaves out a fade of none", () => {
    expect(describeCut(VISIT({ sidesGuard: 3, fade: "none" }))).toBe("#3 sides");
  });

  it("mentions the beard, with its guard when known", () => {
    expect(describeCut(VISIT({ beard: true }))).toBe("beard");
    expect(describeCut(VISIT({ beard: true, beardGuard: 1 }))).toBe("beard #1");
  });

  it("returns null when nothing about the cut was recorded", () => {
    // So the screen can say "no cut details" rather than print an empty string
    // that reads as a rendering bug.
    expect(describeCut(VISIT())).toBeNull();
  });
});

describe("money", () => {
  it("never renders an unpriced visit as free", () => {
    expect(money(null)).toBeNull();
    expect(money(4000)).toBe("$40.00");
  });
});
