import { describe, expect, it } from "vitest";

import {
  createPodBody,
  decideStatus,
  explainRunpodError,
  findLabPod,
  inferenceUrl,
  LAB_GPU_LAUNCH,
  LAB_POD_NAME,
  labPods,
  parseRunpodTime,
  STUCK_AFTER_MINUTES,
  toPodSummary,
  type PodSummary,
} from "./lab-gpu-report";

const pod = (over: Partial<PodSummary> = {}): PodSummary => ({
  id: "abc123",
  name: LAB_POD_NAME,
  desiredStatus: "RUNNING",
  costPerHr: 0.59,
  gpu: "NVIDIA A40",
  volumeInGb: null,
  startedAt: null,
  ...over,
});

const account = { balanceUsd: 19.4, spendPerHrUsd: 0.6 };
const base = {
  connected: true,
  coolifyConnected: true,
  account,
  serviceReady: null,
  labPointsHere: null,
} as const;

describe("toPodSummary", () => {
  it("keeps only what the page uses, and never the environment", () => {
    const summary = toPodSummary({
      id: "abc123",
      name: LAB_POD_NAME,
      desiredStatus: "RUNNING",
      costPerHr: 0.59,
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

describe("parseRunpodTime", () => {
  it("reads RunPod's own time format", () => {
    expect(parseRunpodTime("2026-10-24 16:44:15.078 +0000 UTC")).toBe(
      Date.parse("2026-10-24T16:44:15.078Z"),
    );
  });

  it("returns nothing for what it cannot read", () => {
    expect(parseRunpodTime(undefined)).toBeNull();
    expect(parseRunpodTime("yesterday-ish")).toBeNull();
  });

  it("is carried into the summary", () => {
    const summary = toPodSummary({
      id: "abc123",
      name: LAB_POD_NAME,
      lastStartedAt: "2026-10-24 17:18:15.000 +0000 UTC",
    });
    expect(summary?.startedAt).toBe(Date.parse("2026-10-24T17:18:15Z"));
  });
});

describe("finding the Lab server", () => {
  it("finds the running one by name and ignores other pods and stopped ones", () => {
    const pods = [
      pod({ id: "other", name: "something-else" }),
      pod({ id: "old", desiredStatus: "EXITED" }),
      pod(),
    ];
    expect(findLabPod(pods)?.id).toBe("abc123");
    expect(labPods(pods).map((p) => p.id)).toEqual(["old", "abc123"]);
  });

  it("treats a stopped server as not running", () => {
    expect(findLabPod([pod({ desiredStatus: "EXITED" })])).toBeNull();
  });
});

describe("Turn on's request", () => {
  it("uses the saved template, the shared storage and its data centre", () => {
    const body = createPodBody();
    expect(body).toMatchObject({
      name: LAB_POD_NAME,
      templateId: LAB_GPU_LAUNCH.templateId,
      networkVolumeId: LAB_GPU_LAUNCH.networkVolumeId,
      dataCenterIds: [LAB_GPU_LAUNCH.dataCenterId],
      cloudType: "SECURE",
      gpuCount: 1,
    });
    expect(body).not.toHaveProperty("env");
  });

  it("asks only for 48 GB cards, cheapest first", () => {
    expect(createPodBody()["gpuTypeIds"]).toEqual([...LAB_GPU_LAUNCH.gpuTypeIds]);
    expect(LAB_GPU_LAUNCH.gpuTypeIds[0]).toBe("NVIDIA A40");
  });

  it("knows the address the Lab must use", () => {
    expect(inferenceUrl("abc123")).toBe("https://abc123-8000.proxy.runpod.net");
  });
});

describe("decideStatus", () => {
  it("offers nothing until RunPod is connected", () => {
    const s = decideStatus({ ...base, connected: false, pods: [] });
    expect(s.state).toBe("not-connected");
    expect(s.canTurnOn || s.canTurnOff).toBe(false);
  });

  it("does not guess when RunPod does not answer", () => {
    const s = decideStatus({ ...base, pods: null });
    expect(s.state).toBe("unknown");
    expect(s.canTurnOn || s.canTurnOff).toBe(false);
  });

  it("off: no server, so only Turn on, and a warning against picking it in the Lab", () => {
    const s = decideStatus({ ...base, pods: [] });
    expect(s.state).toBe("off");
    expect([s.canTurnOn, s.canTurnOff]).toEqual([true, false]);
    expect(s.meaning).toContain("Self-hosted GPU");
  });

  it("will not offer Turn on without Coolify, which it needs to point the Lab", () => {
    const s = decideStatus({ ...base, coolifyConnected: false, pods: [] });
    expect(s.state).toBe("off");
    expect(s.canTurnOn).toBe(false);
    expect(s.meaning).toContain("Coolify");
  });

  it("a leftover stopped server can still be removed", () => {
    const s = decideStatus({ ...base, pods: [pod({ desiredStatus: "EXITED" })] });
    expect(s.state).toBe("off");
    expect(s.canTurnOff).toBe(true);
  });

  it("never says ready until the model service answers", () => {
    const s = decideStatus({ ...base, pods: [pod()], serviceReady: false });
    expect(s.state).toBe("starting");
    expect(s.meaning).toContain("billing");
    expect(s.canTurnOff).toBe(true);
  });

  it("says how long it has been starting", () => {
    const startedAt = Date.parse("2026-10-24T17:18:00Z");
    const s = decideStatus({
      ...base,
      pods: [pod({ startedAt })],
      serviceReady: false,
      now: startedAt + 7 * 60_000,
    });
    expect(s.state).toBe("starting");
    expect(s.meaning).toContain("7 minutes ago");
  });

  it("calls a server stuck, not starting, once it is overdue -- and offers Turn off", () => {
    // 2026-10-24: two servers on one faulty RunPod machine never started.
    const startedAt = Date.parse("2026-10-24T17:18:00Z");
    const s = decideStatus({
      ...base,
      pods: [pod({ startedAt })],
      serviceReady: false,
      now: startedAt + STUCK_AFTER_MINUTES * 60_000,
    });
    expect(s.state).toBe("stuck");
    expect(s.meaning).toContain("billing");
    expect([s.canTurnOn, s.canTurnOff]).toEqual([false, true]);
  });

  it("does not call a server stuck when it cannot tell how long it has been on", () => {
    const s = decideStatus({
      ...base,
      pods: [pod()],
      serviceReady: false,
      now: Date.now(),
    });
    expect(s.state).toBe("starting");
  });

  it("a ready server is ready however long it has been on", () => {
    const s = decideStatus({
      ...base,
      pods: [pod({ startedAt: 0 })],
      serviceReady: true,
      labPointsHere: true,
      now: Date.now(),
    });
    expect(s.state).toBe("ready");
  });

  it("never says ready while the Lab points somewhere else", () => {
    const s = decideStatus({
      ...base,
      pods: [pod()],
      serviceReady: true,
      labPointsHere: false,
    });
    expect(s.state).toBe("not-pointed");
    expect(s.canTurnOff).toBe(true);
  });

  it("ready: running, answering, and the Lab points at it", () => {
    const s = decideStatus({
      ...base,
      pods: [pod()],
      serviceReady: true,
      labPointsHere: true,
    });
    expect(s.state).toBe("ready");
    expect(s.meaning).toContain("$0.59 an hour");
    expect([s.canTurnOn, s.canTurnOff]).toEqual([false, true]);
  });

  it("says so when it could not confirm the Lab's address", () => {
    const s = decideStatus({ ...base, pods: [pod()], serviceReady: true });
    expect(s.state).toBe("ready");
    expect(s.meaning).toContain("could not confirm");
  });
});

describe("explainRunpodError", () => {
  it("names the no-free-card case, and that nothing bills", () => {
    expect(explainRunpodError("There are no instances currently available")).toMatch(
      /No 48 GB card is free.*Nothing is billing/,
    );
  });

  it("names a refused key", () => {
    expect(explainRunpodError("401 Unauthorized")).toMatch(/Connect page/);
  });

  it("falls back without inventing a cause", () => {
    expect(explainRunpodError("something odd")).toMatch(/Nothing was changed/);
  });
});
