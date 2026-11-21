import { describe, expect, it } from "vitest";

import { checkedLine, freedLines, groupKept } from "./free-card-messages";

describe("freeing the card: what is said", () => {
  it("groups kept files by reason, biggest first, with a few example names", () => {
    const g = groupKept(
      [
        { path: "DCIM\\100\\A.JPG", reason: "not-on-5star" },
        { path: "DCIM\\100\\B.JPG", reason: "no-copy" },
        { path: "DCIM\\100\\C.JPG", reason: "no-copy" },
        { path: "DCIM\\100\\D.JPG", reason: "no-copy" },
        { path: "DCIM\\100\\E.JPG", reason: "no-copy" },
      ],
      { "no-copy": "no copy on the drive", "not-on-5star": "not on 5Star yet" },
    );
    expect(g[0]).toEqual({
      reason: "no-copy",
      words: "no copy on the drive",
      count: 4,
      examples: ["B.JPG", "C.JPG", "D.JPG"],
    });
    expect(g[1]!.count).toBe(1);
  });

  it("says what a check found", () => {
    expect(checkedLine(0, 0, 0)).toBe("Nothing on the card can be deleted yet.");
    expect(checkedLine(3, 0, 5e9)).toBe(
      "3 photos (5.0 GB) can be deleted from the card. Each has an identical copy on your hard drive, and each photo is already on 5Star.",
    );
    expect(checkedLine(2, 2, 2e6)).toMatch(
      /^2 videos \(2 MB\) can be deleted .* hard drive\.$/,
    );
  });

  it("says what was deleted, kept and could not be", () => {
    expect(freedLines(10, 4e9, 0, 0, false)).toEqual([
      "Deleted 10 files from the card, freeing 4.0 GB.",
    ]);
    const l = freedLines(1, 1e6, 2, 1, true);
    expect(l[0]).toBe("Stopped. Deleted 1 file from the card, freeing 1 MB.");
    expect(l.join(" ")).toMatch(/2 files were kept/);
    expect(l.join(" ")).toMatch(/1 file could not be deleted/);
  });
});
