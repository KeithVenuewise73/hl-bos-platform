import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Reading AI Persona X's vocabulary from a sibling checkout.
 *
 * Two properties are worth fixing. It must read the REAL file rather than a
 * copy kept here, because a second copy drifts and a review surface showing
 * copy nobody ships is worse than none. And when it cannot find one it must say
 * so and say where it looked — an empty panel that explains itself beats a
 * populated one that is out of date, and beats a stack trace either way.
 */

const VALID = {
  product: "AI Persona X",
  sections: [
    {
      key: "render",
      label: "Per-picture choices",
      description: "These describe ONE picture.",
      groups: [
        {
          key: "solo_act",
          label: "What they are doing",
          hint: "Always alone.",
          required: true,
          multiple: false,
          defaultValue: "none",
          askedInQuickDesign: false,
          options: [
            { value: "none", label: "Nothing in particular", phrase: "", tier: 0 },
            { value: "posing", label: "Posing", phrase: "alone, posing", tier: 1 },
          ],
        },
      ],
    },
  ],
  rules: [{ title: "Nobody under eighteen", detail: "The database refuses it." }],
};

/** A checkout whose export is whatever this test writes. */
async function checkout(contents: string | null): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "vocab-"));
  if (contents !== null) {
    await mkdir(path.join(dir, "docs"), { recursive: true });
    await writeFile(path.join(dir, "docs", "vocabulary.json"), contents, "utf8");
  }
  return dir;
}

/** Read a checkout at an explicit path, which is how the tests aim it. */
async function readWith(dir: string) {
  const mod = await import("./vocabulary");
  return mod.vocabularyState([dir]);
}

describe("it reads the product's own export", () => {
  it("returns the lists, and counts what it found", async () => {
    const dir = await checkout(JSON.stringify(VALID));
    try {
      const state = await readWith(dir);
      expect(state.found).toBe(true);
      if (!state.found) return;
      expect(state.doc.product).toBe("AI Persona X");
      expect(state.totals).toEqual({ lists: 1, choices: 2, rules: 1 });
      expect(state.repoPath).toBe(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps the tier that gates the act axis", async () => {
    const dir = await checkout(JSON.stringify(VALID));
    try {
      const state = await readWith(dir);
      if (!state.found) throw new Error("expected the export to be found");
      const options = state.doc.sections[0]?.groups[0]?.options ?? [];
      expect(options.map((o) => o.tier)).toEqual([0, 1]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("says git could not date it rather than inventing a date", async () => {
    // The temp directory is not a git repository, which is the honest case:
    // the file is real, its history is unknown, and the page must not fill
    // that in with something plausible.
    const dir = await checkout(JSON.stringify(VALID));
    try {
      const state = await readWith(dir);
      if (!state.found) throw new Error("expected the export to be found");
      expect(state.revision).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("it explains itself when it cannot read anything", () => {
  it("reports every path it tried when no checkout is there", async () => {
    const empty = await checkout(null);
    try {
      const mod = await import("./vocabulary");
      const state = await mod.vocabularyState([empty, "/nowhere/at/all"]);
      expect(state.found).toBe(false);
      if (state.found) return;
      expect(state.searched).toEqual([
        path.join(empty, "docs", "vocabulary.json"),
        path.join("/nowhere/at/all", "docs", "vocabulary.json"),
      ]);
      // The reason is written for the person reading the console, who is not
      // an engineer: no git command, no environment variable, no instruction
      // to go and do engineering.
      expect(state.reason).toContain("not on this computer");
      expect(state.reason).toContain("your engineer");
      for (const jargon of ["clone", "git ", "npm", "environment variable"]) {
        expect(state.reason).not.toContain(jargon);
      }
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("falls through a directory with no export to the next candidate", async () => {
    // The override is checked first but must not be the end of the search: a
    // stale environment variable should not hide a checkout that is right
    // where the console would otherwise look.
    const empty = await checkout(null);
    const real = await checkout(JSON.stringify(VALID));
    try {
      const mod = await import("./vocabulary");
      const state = await mod.vocabularyState([empty, real]);
      expect(state.found).toBe(true);
      if (!state.found) return;
      expect(state.repoPath).toBe(real);
    } finally {
      await rm(empty, { recursive: true, force: true });
      await rm(real, { recursive: true, force: true });
    }
  });

  it("looks beside this repository, and nowhere it had to be told about", async () => {
    // No setting and no environment variable, on purpose: an unusual checkout
    // location is an engineering problem, not a knob for the CEO to find.
    const mod = await import("./vocabulary");
    const dirs = mod.candidates();
    expect(dirs.length).toBe(2);
    expect(dirs.every((d) => d.endsWith("characterstudio"))).toBe(true);
    // The second is one level further out than the first, which is the whole
    // of the search: beside the repository, then beside its parent.
    expect(path.dirname(dirs[1] ?? "")).toBe(path.dirname(path.dirname(dirs[0] ?? "")));
  });

  it("names a file it found but could not understand", async () => {
    // Different from a missing checkout, and must not be reported as one: the
    // file is there, so "clone the repository" would be wrong advice.
    const dir = await checkout(JSON.stringify({ product: "AI Persona X" }));
    try {
      const state = await readWith(dir);
      expect(state.found).toBe(false);
      if (state.found) return;
      expect(state.reason).toContain("does not recognise");
      expect(state.reason).toContain("Your engineer needs to update the console");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("explains a corrupt file instead of crashing the page", async () => {
    // A half-written file is the likeliest way this breaks, and a console that
    // throws a parse error at the CEO has failed at its only job.
    const dir = await checkout("not json at all");
    try {
      const state = await readWith(dir);
      expect(state.found).toBe(false);
      if (state.found) return;
      expect(state.reason).toContain("damaged");
      expect(state.reason).toContain("your engineer needs to regenerate it");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
