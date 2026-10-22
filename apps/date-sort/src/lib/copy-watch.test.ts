import { describe, expect, it } from "vitest";

import {
  copyHealth,
  HEARTBEAT_MS,
  LOST_AFTER_MS,
  STALLED_AFTER_MS,
} from "./copy-watch";

describe("watching a running copy", () => {
  const t0 = 1_000_000;

  it("is fine while messages and photos keep coming", () => {
    expect(copyHealth(t0 + 1_000, t0, t0)).toBe("ok");
  });

  it("allows several missed heartbeats before calling the connection lost", () => {
    expect(LOST_AFTER_MS).toBeGreaterThanOrEqual(HEARTBEAT_MS * 5);
    expect(copyHealth(t0 + LOST_AFTER_MS - 1, t0, t0)).toBe("ok");
  });

  it("calls the connection lost when nothing at all arrives", () => {
    expect(copyHealth(t0 + LOST_AFTER_MS, t0, t0)).toBe("lost");
  });

  it("calls it stalled when heartbeats arrive but no photo finishes", () => {
    const now = t0 + STALLED_AFTER_MS;
    expect(copyHealth(now, now - HEARTBEAT_MS, t0)).toBe("stalled");
  });

  it("lost wins over stalled: a dead connection is the thing to say", () => {
    expect(copyHealth(t0 + STALLED_AFTER_MS, t0, t0)).toBe("lost");
  });
});
