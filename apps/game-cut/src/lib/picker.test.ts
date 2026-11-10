import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { parsePick, PICK_SCRIPT, pickEnvironment } = await import("./picker.ts");

describe("the file windows", () => {
  it("open for a video with a video filter, and save with an mp4 filter and a suggested name", () => {
    const open = pickEnvironment("video-a", "", "D:\\Hockey Videos");
    expect(open).toMatchObject({ GC_MODE: "open", GC_DIR: "D:\\Hockey Videos" });
    expect(open["GC_TITLE"]).toMatch(/FIRST game video/);
    expect(open["GC_FILTER"]).toMatch(/\*\.mov/);
    const save = pickEnvironment("save", "Game 2026-11-08.mp4", "");
    expect(save).toMatchObject({ GC_MODE: "save", GC_NAME: "Game 2026-11-08.mp4" });
    expect(save["GC_FILTER"]).toBe("MP4 video (*.mp4)|*.mp4");
  });

  it("takes names and folders from the environment, never pasted into the script", () => {
    expect(PICK_SCRIPT).toContain("$env:GC_TITLE");
    expect(PICK_SCRIPT).toContain("$env:GC_NAME");
    expect(PICK_SCRIPT).not.toMatch(/Hockey|Game 20/);
    expect(PICK_SCRIPT).toContain("OverwritePrompt = $true"); // never replaces a file silently
  });

  it("reads a path, a cancel, and rubbish", () => {
    expect(parsePick('{"path":"D:\\\\V\\\\a.mov"}\r\n')).toEqual({
      kind: "picked",
      path: "D:\\V\\a.mov",
    });
    expect(parsePick('{"cancelled":true}')).toEqual({ kind: "cancelled" });
    expect(parsePick('some warning\n{"path":"D:\\\\x.mp4"}')).toEqual({
      kind: "picked",
      path: "D:\\x.mp4",
    });
    expect(parsePick("").kind).toBe("failed");
    expect(parsePick("{not json").kind).toBe("failed");
  });
});
