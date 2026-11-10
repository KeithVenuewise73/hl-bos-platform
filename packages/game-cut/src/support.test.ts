import { describe, expect, it } from "vitest";

import { bytesNeeded, checkRoom } from "./disk.ts";
import { ffmpegCandidates, ffprobeBeside } from "./find-tools.ts";

const GB = 1024 ** 3;

describe("where ffmpeg might be", () => {
  const places = {
    pathDirs: ["C:\\Windows\\System32", "C:\\Tools\\bin\\"],
    localAppData: "C:\\Users\\kherm\\AppData\\Local",
    programFiles: "C:\\Program Files",
    programData: "C:\\ProgramData",
    home: "C:\\Users\\kherm",
  };

  it("tries the PATH first, then the places installers use", () => {
    const c = ffmpegCandidates(places);
    expect(c[0]).toBe("C:\\Windows\\System32\\ffmpeg.exe");
    expect(c[1]).toBe("C:\\Tools\\bin\\ffmpeg.exe"); // trailing slash handled
    expect(c).toContain(
      "C:\\Users\\kherm\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe",
    );
    expect(c).toContain("C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe");
    expect(c).toContain("C:\\Users\\kherm\\scoop\\shims\\ffmpeg.exe");
    expect(c).toContain("C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe");
  });

  it("lists each place once and skips places that are not known", () => {
    const c = ffmpegCandidates({
      ...places,
      pathDirs: ["C:\\Program Files\\ffmpeg\\bin"],
      localAppData: "",
    });
    expect(new Set(c).size).toBe(c.length);
    expect(c.some((p) => p.includes("WinGet"))).toBe(false);
  });

  it("finds ffprobe beside ffmpeg, keeping .exe or not", () => {
    expect(ffprobeBeside("C:\\x\\bin\\ffmpeg.exe")).toBe("C:\\x\\bin\\ffprobe.exe");
    expect(ffprobeBeside("/usr/bin/ffmpeg")).toBe("/usr/bin/ffprobe");
  });
});

describe("room for a job", () => {
  it("a two-hour result at full quality needs about 14 GB at its peak; a draft needs less than half that", () => {
    const full = bytesNeeded(2 * 3600, "full");
    const draft = bytesNeeded(2 * 3600, "draft");
    expect(full.peak).toBeGreaterThan(12 * GB);
    expect(full.peak).toBeLessThan(20 * GB);
    expect(draft.peak).toBeLessThan(full.peak / 2);
    expect(full.peak).toBe(full.result * 2);
  });

  it("says it will not fit, with the numbers, when the drive is too small", () => {
    const r = checkRoom("C:", 30 * GB, 40 * GB);
    expect(r.enough).toBe(false);
    expect(r.message).toMatch(/will not fit/);
    expect(r.message).toMatch(/only 30\.0 GB free/);
    expect(r.message).toMatch(/Draft/);
  });

  it("fits when there is room plus 2 GB to spare, and not by a byte less", () => {
    expect(checkRoom("D:", 42 * GB, 40 * GB).enough).toBe(true);
    expect(checkRoom("D:", 42 * GB - 1, 40 * GB).enough).toBe(false);
  });

  it("does not block when the free space cannot be read, and says so", () => {
    const r = checkRoom("D:", null, 40 * GB);
    expect(r).toMatchObject({ enough: true, known: false });
    expect(r.message).toMatch(/Could not read how much room D: has/);
  });
});
