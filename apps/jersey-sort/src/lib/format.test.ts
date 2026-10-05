import { describe, expect, it } from "vitest";

import { longDate, longDateTime, safeReturn, withParam } from "./format.ts";

describe("format", () => {
  it("formats dates without time-zone drift", () => {
    expect(longDate("2026-10-03")).toBe("October 3, 2026");
    expect(longDateTime("2026-10-03T19:31:05")).toBe("October 3, 2026 · 7:31 PM");
    expect(longDateTime("2026-10-03T00:05:00")).toBe("October 3, 2026 · 12:05 AM");
  });
  it("only returns to paths inside the app", () => {
    expect(safeReturn("/events/1?tab=all")).toBe("/events/1?tab=all");
    expect(safeReturn("//evil.example")).toBe("/");
    expect(safeReturn("https://evil.example")).toBe("/");
    expect(safeReturn("/\\evil")).toBe("/");
    expect(safeReturn(undefined, "/review")).toBe("/review");
  });
  it("sets a query parameter", () => {
    expect(withParam("/review?event=1", "error", "x y")).toBe(
      "/review?event=1&error=x+y",
    );
  });
});
