import { describe, expect, it } from "vitest";
import { deepEqual, isEmptyPlan, planSize, reconcile } from "./reconcile.ts";

interface Row {
  readonly id: string;
  readonly text?: string | undefined;
  readonly n?: number | undefined;
  readonly tags?: readonly string[] | undefined;
}

describe("reconcile", () => {
  it("finds nothing to do when nothing changed", () => {
    const rows: Row[] = [
      { id: "a", text: "one" },
      { id: "b", text: "two" },
    ];
    const plan = reconcile(rows, [...rows]);
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it("does not treat a copy as a change", () => {
    // The app spreads records constantly. If {...row} counted as a change,
    // every save would rewrite every row it touched.
    const before: Row[] = [{ id: "a", text: "one" }];
    const after: Row[] = [{ ...before[0]! }];
    expect(isEmptyPlan(reconcile(before, after))).toBe(true);
  });

  it("separates inserts, updates and deletes", () => {
    const before: Row[] = [
      { id: "keep", text: "same" },
      { id: "change", text: "old" },
      { id: "drop", text: "gone" },
    ];
    const after: Row[] = [
      { id: "keep", text: "same" },
      { id: "change", text: "new" },
      { id: "add", text: "fresh" },
    ];
    const plan = reconcile(before, after);
    expect(plan.inserted.map((r) => r.id)).toEqual(["add"]);
    expect(plan.updated.map((r) => r.id)).toEqual(["change"]);
    expect(plan.deletedIds).toEqual(["drop"]);
    expect(planSize(plan)).toBe(3);
  });

  it("notices a change nested inside an array", () => {
    const before: Row[] = [{ id: "a", tags: ["x", "y"] }];
    const after: Row[] = [{ id: "a", tags: ["x", "z"] }];
    expect(reconcile(before, after).updated).toHaveLength(1);
  });

  it("treats an absent key and an undefined key as the same record", () => {
    const before: Row[] = [{ id: "a", text: "one" }];
    const after: Row[] = [{ id: "a", text: "one", n: undefined }];
    expect(isEmptyPlan(reconcile(before, after))).toBe(true);
  });

  it("handles an empty side without inventing work", () => {
    expect(reconcile<Row>([], []).inserted).toHaveLength(0);
    expect(reconcile<Row>([], [{ id: "a" }]).inserted).toHaveLength(1);
    expect(reconcile<Row>([{ id: "a" }], []).deletedIds).toEqual(["a"]);
  });
});

describe("deepEqual", () => {
  it("compares the shapes this app actually persists", () => {
    expect(deepEqual({ a: [1, { b: "c" }] }, { a: [1, { b: "c" }] })).toBe(true);
    expect(deepEqual({ a: [1, { b: "c" }] }, { a: [1, { b: "d" }] })).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });
});
