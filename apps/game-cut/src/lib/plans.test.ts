import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Analysis } from "@hl-bos/game-cut";

vi.mock("server-only", () => ({}));

const plans = await import("./plans.ts");

const analysis = {
  moments: [],
  gameSeconds: 100,
  sync: { offsetSeconds: 1, confidence: 0.9 },
  notes: [],
  mode: "broadcast",
} as unknown as Analysis;
const made = (id: string) => ({
  kind: "broadcast" as const,
  id,
  fileA: "D:\\A.mov",
  fileB: "D:\\B.mov",
  analysis,
});

describe("plans saved on this computer", () => {
  let dir = "";
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "plans-"));
  });
  afterAll(async () => {
    plans.setPlansDir(null);
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await rm(dir, { recursive: true, force: true });
    plans.setPlansDir(dir);
  });

  it("a plan survives a restart: gone from memory, still found on disk, with the same content", async () => {
    const id = plans.newPlanId();
    await plans.savePlan(made(id));
    plans.setPlansDir(dir); // what a restart does: memory is empty, the folder is not
    const back = await plans.getPlan(id);
    expect(back).toMatchObject({
      kind: "broadcast",
      id,
      fileA: "D:\\A.mov",
      fileB: "D:\\B.mov",
    });
    expect((await plans.latestPlan())?.id).toBe(id);
  });

  it("the latest plan is the newest one made", async () => {
    const a = plans.newPlanId();
    await plans.savePlan(made(a));
    await new Promise((r) => setTimeout(r, 20));
    const b = plans.newPlanId();
    await plans.savePlan(made(b));
    plans.setPlansDir(dir);
    expect((await plans.latestPlan())?.id).toBe(b);
  });

  it("keeps only the last ten", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 13; i += 1) {
      const id = plans.newPlanId();
      ids.push(id);
      await plans.savePlan(made(id));
      await new Promise((r) => setTimeout(r, 5));
    }
    expect((await readdir(dir)).filter((f) => f.endsWith(".json"))).toHaveLength(10);
    plans.setPlansDir(dir);
    expect(await plans.getPlan(ids[0]!)).toBeUndefined();
    expect(await plans.getPlan(ids[12]!)).toBeDefined();
  });

  it("ids from different runs never collide", () => {
    expect(
      new Set([plans.newPlanId(), plans.newPlanId(), plans.newPlanId()]).size,
    ).toBe(3);
  });

  it("never reads a file outside its folder, whatever id it is asked for", async () => {
    await mkdir(join(dir, ".."), { recursive: true });
    for (const bad of [
      "../secret",
      "plan-../x",
      "plan-a/b",
      "C:\\Windows\\win",
      "",
      "plan-A",
    ]) {
      expect(await plans.getPlan(bad)).toBeUndefined();
    }
  });

  it("ignores a damaged or foreign file instead of failing", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "plan-broken.json"), "{not json");
    await writeFile(
      join(dir, "plan-wrong.json"),
      JSON.stringify({ id: "plan-wrong", kind: "other" }),
    );
    await writeFile(
      join(dir, "plan-mismatch.json"),
      JSON.stringify(made("plan-someone-else")),
    );
    plans.setPlansDir(dir);
    expect(await plans.getPlan("plan-broken")).toBeUndefined();
    expect(await plans.getPlan("plan-wrong")).toBeUndefined();
    expect(await plans.getPlan("plan-mismatch")).toBeUndefined();
  });

  it("with nothing saved, there is no latest plan", async () => {
    expect(await plans.latestPlan()).toBeUndefined();
  });
});
