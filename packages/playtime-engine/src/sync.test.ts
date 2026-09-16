import { beforeEach, describe, expect, it } from "vitest";
import {
  backoffMs,
  dueItems,
  enqueue,
  markFailed,
  markSynced,
  mergeLogs,
  unsyncedEvents,
  type OutboxItem,
} from "./sync";
import { end, log, playerIn, playerOut, resetSeq, start } from "./test-support";

beforeEach(resetSeq);

const q = (kind: Parameters<typeof enqueue>[1]["kind"], id: string, recordId: string, at: string) =>
  ({ id, kind, recordId, payload: { id }, at });

describe("enqueue", () => {
  it("collapses repeated edits of the same mutable row", () => {
    let box: OutboxItem[] = [];
    box = enqueue(box, q("team", "a", "team-1", "2026-09-12T18:00:00Z"));
    box = enqueue(box, q("team", "b", "team-1", "2026-09-12T18:00:05Z"));
    expect(box).toHaveLength(1);
    expect(box[0]?.id).toBe("b");
  });

  it("does not collapse across different rows of the same kind", () => {
    let box: OutboxItem[] = [];
    box = enqueue(box, q("team", "a", "team-1", "2026-09-12T18:00:00Z"));
    box = enqueue(box, q("team", "b", "team-2", "2026-09-12T18:00:05Z"));
    expect(box).toHaveLength(2);
  });

  it("never collapses game events", () => {
    // Two substitutions a second apart are two facts. Collapsing them would
    // erase an athlete's minutes -- the exact corruption this design prevents.
    let box: OutboxItem[] = [];
    box = enqueue(box, q("game_event", "e1", "e1", "2026-09-12T18:00:00Z"));
    box = enqueue(box, q("game_event", "e2", "e2", "2026-09-12T18:00:01Z"));
    expect(box).toHaveLength(2);
  });

  it("replaces an item re-queued under the same id rather than duplicating it", () => {
    let box: OutboxItem[] = [];
    box = enqueue(box, q("game_event", "e1", "e1", "2026-09-12T18:00:00Z"));
    box = enqueue(box, q("game_event", "e1", "e1", "2026-09-12T18:00:00Z"));
    expect(box).toHaveLength(1);
  });
});

describe("dueItems", () => {
  it("drains parents before the rows that reference them", () => {
    let box: OutboxItem[] = [];
    box = enqueue(box, q("game_event", "e1", "e1", "2026-09-12T18:00:02Z"));
    box = enqueue(box, q("team", "t1", "t1", "2026-09-12T18:00:03Z"));
    box = enqueue(box, q("game", "g1", "g1", "2026-09-12T18:00:01Z"));
    expect(dueItems(box, 0).map((i) => i.kind)).toEqual(["team", "game", "game_event"]);
  });

  it("holds back an item that is waiting out its backoff", () => {
    let box: OutboxItem[] = enqueue([], q("team", "t1", "t1", "2026-09-12T18:00:00Z"));
    box = markFailed(box, "t1", "offline", 1_000);
    expect(dueItems(box, 1_500)).toHaveLength(0);
    expect(dueItems(box, 3_500)).toHaveLength(1);
  });
});

describe("retry bookkeeping", () => {
  it("backs off exponentially, then settles at a minute", () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(backoffMs)).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000,
    ]);
  });

  it("records the failure so the app can say what went wrong", () => {
    let box: OutboxItem[] = enqueue([], q("team", "t1", "t1", "2026-09-12T18:00:00Z"));
    box = markFailed(box, "t1", "network unreachable", 0);
    expect(box[0]?.attempts).toBe(1);
    expect(box[0]?.lastError).toBe("network unreachable");
  });

  it("removes only what actually synced", () => {
    let box: OutboxItem[] = [];
    box = enqueue(box, q("team", "t1", "t1", "2026-09-12T18:00:00Z"));
    box = enqueue(box, q("team", "t2", "t2", "2026-09-12T18:00:01Z"));
    expect(markSynced(box, ["t1"]).map((i) => i.id)).toEqual(["t2"]);
  });
});

describe("mergeLogs", () => {
  it("keeps events the server never received", () => {
    const local = log("g", [start(0), playerIn(10, "p1"), playerOut(70, "p1")]);
    const remote = [local[0]!];
    expect(mergeLogs(local, remote)).toHaveLength(3);
  });

  it("is idempotent -- re-syncing the same game changes nothing", () => {
    const events = log("g", [start(0), playerIn(10, "p1"), end(600)]);
    expect(mergeLogs(events, events)).toHaveLength(3);
    expect(mergeLogs(mergeLogs(events, events), events)).toHaveLength(3);
  });

  it("unions both directions rather than letting the server win", () => {
    const a = log("g", [start(0), playerIn(10, "p1")]);
    const b = log("g", [playerOut(70, "p1")]);
    expect(mergeLogs(a, b)).toHaveLength(3);
  });
});

describe("unsyncedEvents", () => {
  it("reports exactly the backlog", () => {
    const events = log("g", [start(0), playerIn(10, "p1"), playerOut(70, "p1")]);
    const remote = new Set([events[0]!.id]);
    expect(unsyncedEvents(events, remote).map((e) => e.id)).toEqual([
      events[1]!.id,
      events[2]!.id,
    ]);
  });

  it("is empty when everything has landed", () => {
    const events = log("g", [start(0), playerIn(10, "p1")]);
    expect(unsyncedEvents(events, new Set(events.map((e) => e.id)))).toHaveLength(0);
  });
});
