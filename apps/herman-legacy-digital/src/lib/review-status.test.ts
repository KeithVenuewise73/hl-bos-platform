import { describe, it, expect } from "vitest";
import { REVIEW_STATUSES } from "./review-status";

describe("Executive Review — preview workflow states", () => {
  it("exposes exactly the required states, in order", () => {
    expect([...REVIEW_STATUSES]).toEqual([
      "NEW",
      "Accepted",
      "Deferred",
      "Rejected",
      "Completed",
    ]);
  });

  it("defaults to NEW (the first state)", () => {
    expect(REVIEW_STATUSES[0]).toBe("NEW");
  });
});
