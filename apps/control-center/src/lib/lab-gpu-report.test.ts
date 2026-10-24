import { describe, expect, it } from "vitest";

import {
  decideStatus,
  explainRunpodError,
  findLabPod,
  LAB_POD_NAME,
  toPodSummary,
  type PodSummary,
} from "./lab-gpu-report";

const pod = (over: Partial<PodSummary> = {}): PodSummary => ({
  id: "abc123",
  name: LAB_POD_NAME,
  desiredStatus: "RUNNING",
  costPerHr: 0.59,
  gpu: "NVIDIA A40",
  volumeInGb: 100,
  ...over,
});

const account = { balanceUsd: 24.1, spendPerHrUsd: 0.6 };

describe("toPodSummary", () => {
  it("keeps only what the page uses, and never the environment", () => {
    const summary = toPodSummary({
      id: "abc123",
      name: LAB_POD_NAME,
      desiredStatus: "RUNNING",
      costPerHr: 0.59,
      volumeInGb: 100,
      machine: { gpuTypeId: "NVIDIA A40" },
      env: { INFERENCE_API_TOKEN: "secret-value" },
    });
    expect(summary).toEqual(pod());
    expect(JSON.stringify(summary)).not.toContain("secret-value");
  });

  it("returns nothing for something that is not a pod", () => {
    expect(toPodSummary(null)).toBeNull();
    expect(toPodSummary({ name: "x" })).toBeNull();
  });
});

describe("findLabPod", () => {
  it("finds the Lab pod by name and ignores other pods", () => {
    expect(findLabPod([pod({ id: "other", name: "something-else" }), pod()])?.id).toBe(
      "abc123",
    );
  });

  it("ignores a terminated Lab pod", () => {
    expect(findLabPod([pod({ desiredStatus: "TERMINATED" })])).toBeNull();
  });
});

describe("decideStatus", () => {
  it("offers nothing until RunPod is connected", () => {
    const s = decideStatus({
      connected: false,
      pods: [],
      account: null,
      serviceReady: null,
    });
    expect(s.state).toBe("not-connected");
    expect(s.canTurnOn || s.canTurnOff).toBe(false);
  });

  it("does not guess when RunPod does not answer", () => {
    const s = decideStatus({
      connected: true,
      pods: null,
      account: null,
      serviceReady: null,
    });
    expect(s.state).toBe("unknown");
    expect(s.canTurnOn || s.canTurnOff).toBe(false);
  });

  it("says plainly when there is no Lab GPU at all", () => {
    const s = decideStatus({ connected: true, pods: [], account, serviceReady: null });
    expect(s.state).toBe("missing");
    expect(s.canTurnOn).toBe(false);
  });

  it("off: can only turn on, and warns against picking it in the Lab", () => {
    const s = decideStatus({
      connected: true,
      pods: [pod({ desiredStatus: "EXITED" })],
      account,
      serviceReady: null,
    });
    expect(s.state).toBe("off");
    expect([s.canTurnOn, s.canTurnOff]).toEqual([true, false]);
    expect(s.meaning).toContain("Self-hosted GPU");
  });

  it("never says ready until the model service itself answers", () => {
    const starting = decideStatus({
      connected: true,
      pods: [pod()],
      account,
      serviceReady: false,
    });
    expect(starting.state).toBe("starting");
    expect(starting.meaning).toContain("billing");
    expect(starting.canTurnOff).toBe(true);

    const ready = decideStatus({
      connected: true,
      pods: [pod()],
      account,
      serviceReady: true,
    });
    expect(ready.state).toBe("ready");
    expect(ready.meaning).toContain("$0.59 an hour");
    expect([ready.canTurnOn, ready.canTurnOff]).toEqual([false, true]);
  });

  it("an unfamiliar state still allows turning off, so a card cannot be stuck billing", () => {
    const s = decideStatus({
      connected: true,
      pods: [pod({ desiredStatus: "RESTARTING" })],
      account,
      serviceReady: null,
    });
    expect(s.state).toBe("unknown");
    expect(s.canTurnOff).toBe(true);
  });
});

describe("explainRunpodError", () => {
  it("names the no-free-card case, which is RunPod's, not ours", () => {
    expect(
      explainRunpodError(
        "There are not enough free GPUs on the host machine to start this pod.",
      ),
    ).toMatch(/no free card/);
  });

  it("names a refused key", () => {
    expect(explainRunpodError("401 Unauthorized")).toMatch(/Connect page/);
  });

  it("falls back without inventing a cause", () => {
    expect(explainRunpodError("something odd")).toMatch(/Nothing was changed/);
  });
});
