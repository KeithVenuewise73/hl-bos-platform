import { describe, expect, it } from "vitest";
import {
  LIFECYCLE,
  PLANES,
  actionsByPlane,
  allActions,
  stage,
  type LifecycleStageKey,
  type Plane,
} from "./index.js";

const EXPECTED_ORDER: readonly LifecycleStageKey[] = [
  "provision",
  "operate",
  "monitor",
  "update",
  "backup",
  "retire",
];

describe("company lifecycle", () => {
  it("has the six stages in order", () => {
    expect(LIFECYCLE.map((s) => s.key)).toEqual(EXPECTED_ORDER);
  });

  it("every action has a known plane and a non-empty summary", () => {
    for (const action of allActions()) {
      expect(Object.keys(PLANES)).toContain(action.plane);
      expect(action.summary.length).toBeGreaterThan(0);
    }
  });

  it("action keys are unique across the whole lifecycle", () => {
    const keys = allActions().map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("stage() returns the right stage and rejects an unknown one", () => {
    expect(stage("provision").title).toBe("Provision");
    // @ts-expect-error — an unknown key is not a LifecycleStageKey
    expect(() => stage("nope")).toThrow();
  });

  // The security boundary, asserted as a test: destructive or OS-level actions
  // must NEVER be classified remote-safe. If someone reclassifies one to run in
  // the cloud plane by default, this fails.
  it("keeps destructive / privileged actions off the remote-safe plane", () => {
    const mustNotBeRemoteSafe = ["purge-tenant", "restore-backup", "apply-migration"];
    const remoteSafeKeys = actionsByPlane("remote-safe").map((a) => a.key);
    for (const key of mustNotBeRemoteSafe) {
      expect(remoteSafeKeys).not.toContain(key);
    }
  });

  it("partitions every action across the three planes with none left over", () => {
    const planes: readonly Plane[] = ["remote-safe", "local-privileged", "promoted"];
    const counted = planes.reduce((sum, p) => sum + actionsByPlane(p).length, 0);
    expect(counted).toBe(allActions().length);
  });
});
