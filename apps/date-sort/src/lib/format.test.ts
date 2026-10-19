import { describe, expect, it } from "vitest";

import { clockTime, count, dateAndTime, longDate } from "./format";

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
