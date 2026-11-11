import { describe, expect, it } from "vitest";

import { JobManager, type JobContext } from "./jobs.ts";
import type { JobResult } from "./types.ts";

const result: JobResult = {
  kind: "make",
  made: {
    planId: "plan-x",
    picksFile: null,
    outFile: "D:\\x.mp4",
    seconds: 10,
    bytes: 100,
    quality: "full",
  },
};
const tick = () => new Promise((r) => setTimeout(r, 5));
class Stop extends Error {}

/** Work that finishes when its gate is opened. */
function gated() {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((r) => (open = r));
  return {
    open,
    work: async (ctx: JobContext): Promise<JobResult> => {
      ctx.step("working");
      await gate;
      return result;
    },
  };
}

describe("the one background job", () => {
  it("runs, reports its step and progress, and finishes with its result", async () => {
    const m = new JobManager();
    const g = gated();
    const id = m.start("make", "Making", async (ctx) => {
      ctx.progress(0.4);
      return g.work(ctx);
    });
    expect(id).toBe(1);
    await tick();
    expect(m.snapshot()).toMatchObject({
      state: "running",
      step: "working",
      fraction: 0.4,
      kind: "make",
      label: "Making",
    });
    g.open();
    await tick();
    expect(m.snapshot()).toMatchObject({ state: "done", fraction: 1, result });
    expect(m.snapshot()!.endedAt).not.toBeNull();
  });

  it("refuses a second job while one runs, and allows one after it ends", async () => {
    const m = new JobManager();
    const g = gated();
    expect(m.start("plan", "a", g.work)).toBe(1);
    expect(m.start("plan", "b", () => Promise.resolve(result))).toBeNull();
    g.open();
    await tick();
    expect(m.start("plan", "c", () => Promise.resolve(result))).toBe(2);
  });

  it("progress never moves backwards and stays between 0 and 1", async () => {
    const m = new JobManager();
    const g = gated();
    m.start("make", "x", async (ctx) => {
      ctx.progress(0.6);
      ctx.progress(0.2);
      ctx.progress(7);
      ctx.progress(-1);
      return g.work(ctx);
    });
    await tick();
    expect(m.snapshot()!.fraction).toBe(1);
  });

  it("stop aborts the work, says nothing was kept, and does not report it as a failure", async () => {
    const m = new JobManager();
    let sawAbort = false;
    m.start(
      "make",
      "x",
      (ctx) =>
        new Promise<JobResult>((_, reject) =>
          ctx.signal.addEventListener("abort", () => {
            sawAbort = true;
            reject(new Error("killed"));
          }),
        ),
    );
    await tick();
    expect(m.cancel()).toBe(true);
    expect(m.snapshot()!.step).toBe("Stopping…");
    await tick();
    expect(sawAbort).toBe(true);
    expect(m.snapshot()).toMatchObject({
      state: "cancelled",
      error: null,
      result: null,
    });
    expect(m.snapshot()!.step).toMatch(/Nothing was kept/);
  });

  it("a stop that finishes anyway still counts as stopped, never as a result", async () => {
    const m = new JobManager();
    const g = gated();
    m.start("make", "x", g.work);
    await tick();
    m.cancel();
    g.open();
    await tick();
    expect(m.snapshot()).toMatchObject({ state: "cancelled", result: null });
  });

  it("a failure is reported in words, with no result", async () => {
    const m = new JobManager(
      () => 1,
      (e) => `Plain: ${(e as Error).message}`,
    );
    m.start("plan", "x", () => Promise.reject(new Error("boom")));
    await tick();
    expect(m.snapshot()).toMatchObject({
      state: "failed",
      error: "Plain: boom",
      result: null,
    });
  });

  it("an error the engine calls a stop on purpose is not a failure", async () => {
    const m = new JobManager(
      () => 1,
      undefined,
      (e) => e instanceof Stop,
    );
    m.start("plan", "x", () => Promise.reject(new Stop()));
    await tick();
    expect(m.snapshot()).toMatchObject({ state: "cancelled", error: null });
  });

  it("cancel with nothing running says so", () => {
    expect(new JobManager().cancel()).toBe(false);
    expect(new JobManager().snapshot()).toBeNull();
  });

  it("a finished job stays visible until the next one starts, so a page opened later still sees it", async () => {
    const m = new JobManager();
    m.start("make", "x", () => Promise.resolve(result));
    await tick();
    expect(m.snapshot()!.state).toBe("done");
    expect(m.snapshot()!.result).toEqual(result);
  });
});
