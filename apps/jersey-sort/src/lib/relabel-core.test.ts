import { describe, expect, it } from "vitest";

import { clusterByGap } from "./relabel-core.ts";

const at = (id: string, t: string) => ({ id, capturedAt: `2026-10-24T${t}` });

describe("suggesting where games break", () => {
  it("splits at a long quiet gap and keeps a busy stretch together", () => {
    const runs = clusterByGap([
      at("a", "10:00:00"),
      at("b", "10:20:00"),
      at("c", "10:40:00"),
      at("d", "14:00:00"),
      at("e", "14:05:00"),
    ]);
    expect(runs.map((r) => r.map((p) => p.id))).toEqual([
      ["a", "b", "c"],
      ["d", "e"],
    ]);
  });

  it("does not need sorted input", () => {
    const runs = clusterByGap([
      at("d", "14:00:00"),
      at("a", "10:00:00"),
      at("e", "14:01:00"),
    ]);
    expect(runs.map((r) => r.map((p) => p.id))).toEqual([["a"], ["d", "e"]]);
  });

  it("a gap just under the limit stays together; exactly the limit splits", () => {
    expect(clusterByGap([at("a", "10:00:00"), at("b", "10:29:59")])).toHaveLength(1);
    expect(clusterByGap([at("a", "10:00:00"), at("b", "10:30:00")])).toHaveLength(2);
  });

  it("handles none and one", () => {
    expect(clusterByGap([])).toEqual([]);
    expect(clusterByGap([at("a", "10:00:00")])).toHaveLength(1);
  });
});
