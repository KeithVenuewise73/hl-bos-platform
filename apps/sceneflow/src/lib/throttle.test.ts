import { describe, expect, it } from "vitest";

import {
  afterFailure,
  afterSuccess,
  delayAfter,
  describeWait,
  FREE_ATTEMPTS,
  MAX_DELAY_MS,
  mayAttempt,
  NO_FAILURES,
} from "./throttle";

describe("delayAfter", () => {
  it("lets the first three through, because people mistype", () => {
    expect(delayAfter(0)).toBe(0);
    expect(delayAfter(1)).toBe(0);
    expect(delayAfter(2)).toBe(0);
    expect(delayAfter(FREE_ATTEMPTS)).toBe(0);
  });

  it("doubles from one second", () => {
    expect(delayAfter(4)).toBe(1000);
    expect(delayAfter(5)).toBe(2000);
    expect(delayAfter(6)).toBe(4000);
    expect(delayAfter(7)).toBe(8000);
    expect(delayAfter(8)).toBe(16_000);
  });

  it("stops at the ceiling rather than growing forever", () => {
    expect(delayAfter(9)).toBe(MAX_DELAY_MS);
    expect(delayAfter(50)).toBe(MAX_DELAY_MS);
    // A huge count must not overflow into Infinity and out again by luck.
    expect(delayAfter(5000)).toBe(MAX_DELAY_MS);
    expect(Number.isFinite(delayAfter(5000))).toBe(true);
  });

  it("makes a million guesses take about a year", () => {
    // The point of the ceiling, stated as the property it has to hold: two
    // guesses a minute against a six-digit code.
    const perMinute = 60_000 / MAX_DELAY_MS;
    const minutes = 1_000_000 / perMinute;
    expect(minutes / (60 * 24)).toBeGreaterThan(300);
  });
});

describe("mayAttempt", () => {
  it("allows a first attempt", () => {
    expect(mayAttempt(NO_FAILURES, 1000)).toEqual({ allowed: true, waitMs: 0 });
  });

  it("refuses while the wait is running, and says how long is left", () => {
    const state = { failures: 4, nextAllowedAt: 5000 };
    expect(mayAttempt(state, 4000)).toEqual({ allowed: false, waitMs: 1000 });
  });

  it("allows again the moment the wait expires", () => {
    const state = { failures: 4, nextAllowedAt: 5000 };
    expect(mayAttempt(state, 5000).allowed).toBe(true);
    expect(mayAttempt(state, 6000).allowed).toBe(true);
  });
});

describe("afterFailure", () => {
  it("counts up and sets the next allowed time", () => {
    let state = NO_FAILURES;
    for (let i = 0; i < 4; i += 1) state = afterFailure(state, 0);
    expect(state.failures).toBe(4);
    expect(state.nextAllowedAt).toBe(1000);
  });

  it("keeps compounding across separate attempts", () => {
    const fourth = { failures: 4, nextAllowedAt: 1000 };
    const fifth = afterFailure(fourth, 10_000);
    expect(fifth).toEqual({ failures: 5, nextAllowedAt: 12_000 });
  });

  it("an attacker at the ceiling never gets faster than the ceiling", () => {
    let state = NO_FAILURES;
    let now = 0;
    for (let i = 0; i < 40; i += 1) {
      state = afterFailure(state, now);
      now = state.nextAllowedAt;
    }
    expect(afterFailure(state, now).nextAllowedAt - now).toBe(MAX_DELAY_MS);
  });
});

describe("afterSuccess", () => {
  it("clears the whole thing, so the owner is never left waiting", () => {
    let state = NO_FAILURES;
    for (let i = 0; i < 20; i += 1) state = afterFailure(state, 0);
    expect(state.failures).toBe(20);

    const cleared = afterSuccess();
    expect(cleared).toEqual(NO_FAILURES);
    expect(mayAttempt(cleared, 0).allowed).toBe(true);
  });
});

describe("describeWait", () => {
  it("counts in whole seconds, rounding up so it is never optimistic", () => {
    expect(describeWait(1)).toBe("Too many wrong codes. Wait a second and try again.");
    expect(describeWait(1500)).toBe(
      "Too many wrong codes. Wait 2 seconds and try again.",
    );
    expect(describeWait(30_000)).toBe(
      "Too many wrong codes. Wait 30 seconds and try again.",
    );
  });

  it("never says zero", () => {
    expect(describeWait(0)).toContain("a second");
    expect(describeWait(-100)).toContain("a second");
  });
});
