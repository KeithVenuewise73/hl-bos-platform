import { describe, expect, it } from "vitest";

import { clockTime, count, dateAndTime, longDate, number } from "./format";

describe("dates on screen", () => {
  it("reads the camera's wall clock without any time-zone shift", () => {
    expect(longDate("2026-10-04")).toBe("October 4, 2026");
    expect(longDate("2026-10-04T23:59:59")).toBe("October 4, 2026");
    expect(clockTime("2026-10-04T13:03:00")).toBe("1:03 PM");
    expect(clockTime("2026-10-04T15:47:12")).toBe("3:47 PM");
    expect(clockTime("2026-10-04T00:05:00")).toBe("12:05 AM");
    expect(clockTime("2026-10-04T12:00:00")).toBe("12:00 PM");
    expect(dateAndTime("2018-02-21T12:08:56")).toBe("February 21, 2018, 12:08 PM");
  });

  it("counts in plain English", () => {
    expect(count(1, "photo")).toBe("1 photo");
    expect(count(1487, "photo")).toBe("1,487 photos");
    expect(count(2, "photo has", "photos have")).toBe("2 photos have");
  });
});

describe("number", () => {
  it("groups thousands the way the screen expects", () => {
    expect(number(0)).toBe("0");
    expect(number(1)).toBe("1");
    expect(number(999)).toBe("999");
    expect(number(1487)).toBe("1,487");
    expect(number(1_234_567)).toBe("1,234,567");
  });

  it("matches toLocaleString exactly, which is what it replaced", () => {
    // The hoist is only safe if the output is identical. One formatter reused
    // and a fresh one per call must agree on every number the app can show,
    // including the shapes nobody writes a test for on purpose.
    for (const n of [
      0, 1, 9, 10, 999, 1000, 1487, 999_999, 1_000_000, 1_234_567, -1, -1487, 0.5, 1.25,
    ]) {
      expect(number(n)).toBe(n.toLocaleString("en-US"));
    }
  });

  it("gives the same answer on the first call and the thousandth", () => {
    // A shared formatter is reused state in a way a fresh one is not. If that
    // reuse ever drifted -- a formatter mutated, a locale lost -- this is
    // where it would show.
    const first = number(1487);
    for (let i = 0; i < 1000; i += 1) number(i);
    expect(number(1487)).toBe(first);
    expect(number(1487)).toBe("1,487");
  });
});
