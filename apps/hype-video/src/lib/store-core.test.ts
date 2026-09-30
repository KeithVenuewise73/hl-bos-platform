import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { HypeProject } from "@hl-bos/hype-video";

import { createFileStore } from "./store-core.ts";

function project(name: string): HypeProject {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name,
    creatorRole: "parent",
    template: "game_day",
    tone: "aggressive",
    outputTypes: [],
    accent: "red",
    visibility: "private",
    status: "draft",
    consent: {
      mediaRightsConfirmed: true,
      featuresMinor: false,
      guardianConsentConfirmed: false,
      guardianName: "",
      confirmedAt: now,
    },
    details: null,
    media: [],
    generations: [],
    packageStale: false,
    exportedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const tempStore = async () => {
  const dir = await mkdtemp(join(tmpdir(), "hype-store-"));
  return { dir, store: createFileStore(dir) };
};

describe("file store", () => {
  it("starts empty with no file on disk", async () => {
    const { store } = await tempStore();
    expect(await store.list()).toEqual([]);
  });

  it("round-trips a project", async () => {
    const { store } = await tempStore();
    const p = project("A");
    await store.insert(p);
    expect(await store.get(p.id)).toEqual(p);
  });

  it("does not lose writes that arrive together", async () => {
    const { store } = await tempStore();
    const p = project("Counter");
    await store.insert(p);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.update(p.id, (x) => ({ ...x, name: `${x.name}|${i}` })),
      ),
    );
    const final = await store.get(p.id);
    expect(final?.name.split("|")).toHaveLength(21);
  });

  it("leaves no temp files behind", async () => {
    const { dir, store } = await tempStore();
    await store.insert(project("A"));
    expect((await readdir(dir)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("deletes a project's media with the project", async () => {
    const { dir, store } = await tempStore();
    const p = project("With media");
    await store.insert(p);
    const mediaId = randomUUID();
    await store.writeMedia(p.id, mediaId, "jpg", new Uint8Array([1, 2, 3]));
    expect(existsSync(join(dir, "media", p.id, `${mediaId}.jpg`))).toBe(true);
    await store.remove(p.id);
    expect(existsSync(join(dir, "media", p.id))).toBe(false);
    expect(await store.get(p.id)).toBeNull();
  });

  it("refuses a malformed id instead of building a path from it", async () => {
    const { store } = await tempStore();
    expect(await store.get("../projects")).toBeNull();
    await expect(
      store.writeMedia("../../etc", randomUUID(), "jpg", new Uint8Array([1])),
    ).rejects.toThrow(/malformed/);
  });
});
