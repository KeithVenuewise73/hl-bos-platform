import { describe, expect, it } from "vitest";

import type { Clip, HighlightProject, MediaAsset } from "@hl-bos/hockey-highlights";

import {
  clipsFor,
  emptyWorkspace,
  jobFor,
  latestReel,
  mediaFor,
  projectById,
  segmentsFor,
  type Workspace,
} from "./workspace.ts";

const USER = "00000000-0000-4000-8000-000000000001";

function project(id: string): HighlightProject {
  return {
    id,
    ownerId: USER,
    name: `Game ${id}`,
    gameDate: "2026-02-14",
    team: "Riverside",
    opponent: "Northstars",
    athlete: {
      id: `a-${id}`,
      name: "Sam Herman",
      jerseyNumber: "17",
      jerseyColorId: "navy",
      position: "forward",
    },
    createdAt: "2026-02-15T10:00:00.000Z",
    updatedAt: "2026-02-15T10:00:00.000Z",
  };
}

function asset(projectId: string, role: MediaAsset["role"]): MediaAsset {
  return {
    id: `${projectId}-${role}`,
    projectId,
    role,
    storageKey: `${role}s/${projectId}.mp4`,
    filename: "game.mp4",
    contentType: "video/mp4",
    sizeBytes: null,
    durationSeconds: null,
    width: null,
    height: null,
    frameRate: null,
    createdAt: "2026-02-15T10:00:00.000Z",
  };
}

function clip(id: string, projectId: string, order: number): Clip {
  return {
    id,
    projectId,
    eventId: `e-${id}`,
    startTime: 100,
    endTime: 110,
    decision: "pending",
    trimmedStart: null,
    trimmedEnd: null,
    note: null,
    mediaAssetId: null,
    order,
  };
}

function seeded(): Workspace {
  const workspace = emptyWorkspace(USER);
  workspace.projects.push(project("p-1"), project("p-2"));
  workspace.media.push(
    asset("p-1", "original"),
    asset("p-1", "proxy"),
    asset("p-2", "original"),
  );
  workspace.clips.push(
    clip("c-2", "p-1", 1),
    clip("c-1", "p-1", 0),
    clip("c-9", "p-2", 0),
  );
  workspace.reels.push(
    {
      id: "r-old",
      projectId: "p-1",
      title: "old",
      subtitle: "",
      entries: [],
      totalDurationSeconds: 0,
      mediaAssetId: null,
      createdAt: "2026-02-15T10:00:00.000Z",
    },
    {
      id: "r-new",
      projectId: "p-1",
      title: "new",
      subtitle: "",
      entries: [],
      totalDurationSeconds: 0,
      mediaAssetId: null,
      createdAt: "2026-02-16T10:00:00.000Z",
    },
  );
  return workspace;
}

describe("workspace readers", () => {
  it("starts with nothing and invents nothing", () => {
    const empty = emptyWorkspace(USER);
    expect(empty.projects).toEqual([]);
    expect(empty.clips).toEqual([]);
    expect(empty.reels).toEqual([]);
    expect(empty.userId).toBe(USER);
  });

  it("finds a project, and returns undefined rather than guessing", () => {
    expect(projectById(seeded(), "p-1")?.name).toBe("Game p-1");
    expect(projectById(seeded(), "nope")).toBeUndefined();
  });

  it("never leaks one project's data into another's view", () => {
    const workspace = seeded();
    expect(clipsFor(workspace, "p-1").map((c) => c.id)).toEqual(["c-1", "c-2"]);
    expect(clipsFor(workspace, "p-2").map((c) => c.id)).toEqual(["c-9"]);
    expect(segmentsFor(workspace, "p-1")).toEqual([]);
  });

  it("returns clips in review order, not storage order", () => {
    expect(clipsFor(seeded(), "p-1").map((c) => c.order)).toEqual([0, 1]);
  });

  it("tells the original from the analysis proxy", () => {
    const workspace = seeded();
    expect(mediaFor(workspace, "p-1", "original")?.storageKey).toBe(
      "originals/p-1.mp4",
    );
    expect(mediaFor(workspace, "p-1", "proxy")?.storageKey).toBe("proxys/p-1.mp4");
    // Asking for a reel that was never rendered gets undefined, which is what
    // the page reads to decide not to show a download button.
    expect(mediaFor(workspace, "p-1", "reel")).toBeUndefined();
  });

  it("returns the newest reel", () => {
    expect(latestReel(seeded(), "p-1")?.id).toBe("r-new");
    expect(latestReel(seeded(), "p-2")).toBeUndefined();
  });

  it("reports no job for a project that has none", () => {
    expect(jobFor(seeded(), "p-1")).toBeUndefined();
  });
});
