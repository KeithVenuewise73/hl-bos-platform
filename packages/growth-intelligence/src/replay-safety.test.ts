// CI guard: production's recovered history must never be replayed by `supabase db push`.
import { execFileSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");

describe("migration replay safety", () => {
  it("no NEW replay hazard, and no archived/proposed SQL under supabase/migrations", () => {
    const out = execFileSync(
      "node",
      [path.join(ROOT, "scripts/check-replay-safety.mjs")],
      { encoding: "utf8" },
    );
    expect(out).toContain("OK: no new replay hazards");
  });

  it("the known hazards are exactly the documented 20; 6 migrations are genuinely pending", () => {
    const out = execFileSync(
      "node",
      [path.join(ROOT, "scripts/check-replay-safety.mjs")],
      { encoding: "utf8" },
    );
    const counts = JSON.parse(/replay safety: (\{.*\})/.exec(out)![1]!) as Record<
      string,
      number
    >;
    expect(counts["replay_hazard"]).toBe(20);
    expect(counts["new"]).toBe(6);
  });
});
