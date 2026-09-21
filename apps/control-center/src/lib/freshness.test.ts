import { describe, expect, it } from "vitest";

import { describeFreshness } from "./freshness";

const base = { hasGit: true, behind: 0, short: "218ef09", when: "2 hours ago" };

describe("describeFreshness", () => {
  it("says up to date when nothing is waiting", () => {
    const f = describeFreshness(base);
    expect(f.stale).toBe(false);
    expect(f.headline).toMatch(/Up to date/);
    expect(f.headline).toContain("218ef09");
  });

  it("says how far behind, and what to do", () => {
    const f = describeFreshness({ ...base, behind: 3 });
    expect(f.stale).toBe(true);
    expect(f.headline).toMatch(/3 changes/);
    expect(f.meaning).toMatch(/control-center\.bat/);
  });

  it("counts one change in the singular", () => {
    expect(describeFreshness({ ...base, behind: 1 }).headline).toMatch(/1 change\b/);
  });

  it("never claims to be current when git is missing", () => {
    // The zip copy. It cannot receive anything, so "up to date" would be a
    // claim nothing on that machine is able to check.
    const f = describeFreshness({ ...base, hasGit: false, behind: 0 });
    expect(f.stale).toBe(true);
    expect(f.headline).not.toMatch(/Up to date/);
    expect(f.meaning).toMatch(/GitHub Desktop/);
  });

  it("does not call an unanswered check 'out of date'", () => {
    // Not knowing is not the same as being behind, and dressing one as the
    // other is how a warning stops meaning anything.
    const f = describeFreshness({ ...base, behind: -1 });
    expect(f.stale).toBe(false);
    expect(f.headline).toMatch(/could not be checked/);
  });

  it("still says something useful with no commit information", () => {
    const f = describeFreshness({ ...base, short: "", when: "" });
    expect(f.headline).toContain("an unknown version");
  });

  it("uses the id alone when the age is unknown", () => {
    expect(describeFreshness({ ...base, when: "" }).headline).toMatch(
      /version 218ef09/,
    );
  });
});
