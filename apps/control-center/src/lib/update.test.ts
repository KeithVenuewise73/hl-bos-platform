import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { describeUpdate } from "./update-report";

/**
 * scripts/update.mjs against REAL git: a real origin, a real clone standing in
 * for his laptop, and a second clone that "finishes work" and pushes it.
 * Nothing here is mocked, because the whole point of the updater is what git
 * actually does with unsaved and diverged folders.
 */
const UPDATER = resolve(__dirname, "../../../../scripts/update.mjs");
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
  GIT_TERMINAL_PROMPT: "0",
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();

function runUpdater(cwd: string, ...flags: string[]) {
  const r = spawnSync("node", ["scripts/update.mjs", ...flags], {
    cwd,
    env: ENV,
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout.trim() };
}

let base: string;
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "hlbos-update-"));
});

/** origin + his laptop clone + a seed clone that can push new work. */
function world(name: string) {
  const origin = join(base, `${name}-origin.git`);
  const seed = join(base, `${name}-seed`);
  const laptop = join(base, `${name}-laptop`);
  execFileSync("git", ["init", "--bare", "-b", "main", origin], { env: ENV });
  execFileSync("git", ["clone", "-q", origin, seed], { env: ENV });
  mkdirSync(join(seed, "scripts"));
  copyFileSync(UPDATER, join(seed, "scripts", "update.mjs"));
  writeFileSync(join(seed, ".gitignore"), ".hlbos/\n");
  writeFileSync(join(seed, "feature.txt"), "v1\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-qm", "first");
  git(seed, "push", "-q", "origin", "HEAD:main");
  execFileSync("git", ["clone", "-q", origin, laptop], { env: ENV });
  const finishWork = (file: string, text: string) => {
    writeFileSync(join(seed, file), text);
    git(seed, "add", "-A");
    git(seed, "commit", "-qm", `work on ${file}`);
    git(seed, "push", "-q", "origin", "HEAD:main");
  };
  return { laptop, finishWork };
}

describe("scripts/update.mjs --json, against real git", () => {
  it("is up to date when nothing new was finished", () => {
    const { laptop } = world("current");
    const r = runUpdater(laptop, "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ kind: "current", rebuild: false });
  });

  it("collects finished work, asks for a rebuild, and keeps the launcher's own output unchanged", () => {
    const { laptop, finishWork } = world("updated");
    finishWork("feature.txt", "v2\n");
    const r = runUpdater(laptop, "--json");
    expect(r.code).toBe(10);
    expect(JSON.parse(r.out)).toMatchObject({ kind: "updated", rebuild: true });
    expect(readFileSync(join(laptop, "feature.txt"), "utf8")).toBe("v2\n");
    expect(existsSync(join(laptop, ".hlbos", "console-needs-rebuild"))).toBe(true);
    expect(describeUpdate(r.out).ok).toBe(true);

    // The launcher (no flag) still prints its familiar line and exit code.
    finishWork("feature.txt", "v3\n");
    const launcher = runUpdater(laptop);
    expect(launcher.code).toBe(10);
    expect(launcher.out).toBe("[ok]   Collected 1 new change from GitHub.");
  });

  it("never touches unsaved work", () => {
    const { laptop, finishWork } = world("dirty");
    writeFileSync(join(laptop, "feature.txt"), "my unsaved edit\n");
    finishWork("other.txt", "new\n");
    const r = runUpdater(laptop, "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ kind: "blocked", rebuild: false });
    expect(readFileSync(join(laptop, "feature.txt"), "utf8")).toBe("my unsaved edit\n");
    expect(existsSync(join(laptop, "other.txt"))).toBe(false);
    expect(describeUpdate(r.out).ok).toBe(false);
  });

  it("does not merge when this folder and GitHub have both moved on", () => {
    const { laptop, finishWork } = world("diverged");
    writeFileSync(join(laptop, "mine.txt"), "local commit\n");
    git(laptop, "add", "-A");
    git(laptop, "commit", "-qm", "local work");
    finishWork("other.txt", "new\n");
    const before = git(laptop, "rev-parse", "HEAD");
    const r = runUpdater(laptop, "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ kind: "blocked" });
    expect((JSON.parse(r.out) as { message: string }).message).toMatch(/both moved on/);
    expect(git(laptop, "rev-parse", "HEAD")).toBe(before);
  });
});
