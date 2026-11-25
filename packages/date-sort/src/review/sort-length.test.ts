import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { sortByLength } from "./sort-length";
import { findTools, probeSeconds } from "./video";

const work = mkdtempSync(join(tmpdir(), "sort-length-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** A fake probe: the length is written in the file name (IMG_<seconds>.MOV). */
const byName = (file: string) => {
  const m = /IMG_(\d+)\.MOV$/i.exec(file);
  return Promise.resolve(m ? Number(m[1]) : null);
};

function layout(name: string) {
  const clips = join(work, name, "Short Clips");
  const games = join(work, name, "Game Footage");
  mkdirSync(join(clips, "202611_a"), { recursive: true });
  mkdirSync(join(clips, ".datesort-incoming"), { recursive: true });
  for (const f of ["IMG_30.MOV", "IMG_179.MOV", "IMG_181.MOV", "IMG_4867.MOV"])
    writeFileSync(join(clips, "202611_a", f), f);
  writeFileSync(join(clips, "202611_a", "IMG_bad.MOV"), "not a video");
  writeFileSync(join(clips, "202611_a", "notes.txt"), "ignored");
  // half-copied files in DateSort's own folder are never looked at
  writeFileSync(join(clips, ".datesort-incoming", "IMG_9999.MOV"), "part");
  return { clips, games };
}

describe("sorting videos by length", () => {
  it("only looks when asked to check, and changes nothing", async () => {
    const { clips, games } = layout("check");
    const r = await sortByLength({
      clipsRoot: clips,
      gamesRoot: games,
      apply: false,
      probe: byName,
    });
    expect(r.looked).toBe(5);
    expect(r.long.map((l) => l.path).sort()).toEqual([
      "202611_a\\IMG_181.MOV",
      "202611_a\\IMG_4867.MOV",
    ]);
    expect(r.moved).toBe(0);
    expect(existsSync(games)).toBe(false);
    expect(readdirSync(join(clips, "202611_a")).sort()).toEqual([
      "IMG_179.MOV",
      "IMG_181.MOV",
      "IMG_30.MOV",
      "IMG_4867.MOV",
      "IMG_bad.MOV",
      "notes.txt",
    ]);
  });

  it("moves only the videos longer than 180 seconds, keeping the month folder", async () => {
    const { clips, games } = layout("move");
    const r = await sortByLength({
      clipsRoot: clips,
      gamesRoot: games,
      apply: true,
      probe: byName,
    });
    expect(r.moved).toBe(2);
    expect(readdirSync(join(games, "202611_a")).sort()).toEqual([
      "IMG_181.MOV",
      "IMG_4867.MOV",
    ]);
    expect(readdirSync(join(clips, "202611_a")).sort()).toEqual([
      "IMG_179.MOV", // 179 s stays: a short clip
      "IMG_30.MOV",
      "IMG_bad.MOV", // unreadable: left alone
      "notes.txt",
    ]);
    expect(r.unreadable).toEqual(["202611_a\\IMG_bad.MOV"]);
    expect(existsSync(join(clips, ".datesort-incoming", "IMG_9999.MOV"))).toBe(true);
  });

  it("never overwrites: a name already in Game Footage leaves the video where it is", async () => {
    const { clips, games } = layout("conflict");
    mkdirSync(join(games, "202611_a"), { recursive: true });
    writeFileSync(join(games, "202611_a", "IMG_4867.MOV"), "already here");
    const r = await sortByLength({
      clipsRoot: clips,
      gamesRoot: games,
      apply: true,
      probe: byName,
    });
    expect(r.conflicts).toEqual(["202611_a\\IMG_4867.MOV"]);
    expect(r.moved).toBe(1);
    expect(existsSync(join(clips, "202611_a", "IMG_4867.MOV"))).toBe(true);
    expect(readdirSync(join(games, "202611_a")).sort()).toEqual([
      "IMG_181.MOV",
      "IMG_4867.MOV",
    ]);
  });

  it("running it again changes nothing", async () => {
    const { clips, games } = layout("again");
    await sortByLength({
      clipsRoot: clips,
      gamesRoot: games,
      apply: true,
      probe: byName,
    });
    const r = await sortByLength({
      clipsRoot: clips,
      gamesRoot: games,
      apply: true,
      probe: byName,
    });
    expect(r.moved).toBe(0);
    expect(r.long).toEqual([]);
  });
});

describe("with the real ffprobe, when this computer has it", () => {
  it("reads true lengths and moves the long video", async () => {
    const tools = await findTools();
    if (tools === null) return; // no ffmpeg here: the fake-probe tests above still ran
    const clips = join(work, "real", "Short Clips");
    const games = join(work, "real", "Game Footage");
    mkdirSync(join(clips, "202611_a"), { recursive: true });
    for (const [name, secs] of [
      ["short.mp4", 5],
      ["whole-game.mp4", 200],
    ] as const)
      execFileSync(tools.ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc=duration=${secs}:size=64x64:rate=1`,
        "-pix_fmt",
        "yuv420p",
        join(clips, "202611_a", name),
      ]);
    const r = await sortByLength({
      clipsRoot: clips,
      gamesRoot: games,
      apply: true,
      probe: (f) => probeSeconds(tools, f),
    });
    expect(r.moved).toBe(1);
    expect(readdirSync(join(clips, "202611_a"))).toEqual(["short.mp4"]);
    expect(readdirSync(join(games, "202611_a"))).toEqual(["whole-game.mp4"]);
  }, 60_000);
});
