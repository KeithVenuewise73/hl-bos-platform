import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { REPO_ROOT } from "./shell";

/**
 * Milestone state comes from a version-controlled file, not from a guess.
 *
 * "Progress %" is only honest if it counts something real. It counts declared
 * tasks that are actually done. There is no estimated completion date, because
 * we have no basis for one and a made-up date is worse than none.
 */
const Task = z.object({ title: z.string(), done: z.boolean() });
const Blocker = z.object({
  title: z.string(),
  meaning: z.string(),
  owner: z.enum(["ceo", "ai-engineer"]),
});
const Milestone = z.object({
  milestone: z.string(),
  phase: z.string(),
  engineer: z.string(),
  startedOn: z.string(),
  tasks: z.array(Task),
  blockers: z.array(Blocker),
});

export type MilestoneState = z.infer<typeof Milestone> & {
  progressPct: number;
  remaining: string[];
};

export async function milestoneState(): Promise<MilestoneState | null> {
  try {
    const raw = await readFile(
      path.join(REPO_ROOT, ".hlbos", "milestone.json"),
      "utf8",
    );
    const parsed = Milestone.parse(JSON.parse(raw));
    const done = parsed.tasks.filter((t) => t.done).length;
    return {
      ...parsed,
      progressPct:
        parsed.tasks.length === 0 ? 0 : Math.round((done / parsed.tasks.length) * 100),
      remaining: parsed.tasks.filter((t) => !t.done).map((t) => t.title),
    };
  } catch {
    return null;
  }
}
