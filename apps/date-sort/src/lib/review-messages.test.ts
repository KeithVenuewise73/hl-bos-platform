import { describe, expect, it } from "vitest";

import { allDoneLines, progressLine, resultLines } from "./review-messages";

const base = {
  sent: 0,
  alreadyThere: 0,
  largeAdded: 0,
  failed: [],
  skipped: [],
  videosNotSent: 0,
};

describe("what is said after sending", () => {
  it("says the photos are private until approved", () => {
    expect(resultLines({ ...base, sent: 12 })[0]).toBe(
      "Sent 12 photos for review. They are private until you approve them on the website.",
    );
    expect(resultLines({ ...base, sent: 1 })[0]).toMatch(/^Sent 1 photo for review/);
  });

  it("says when everything was already there", () => {
    expect(resultLines({ ...base, alreadyThere: 5 })).toEqual([
      "5 photos were already there, so not sent again.",
      "Everything in this folder is already waiting for review.",
    ]);
  });

  it("names the photos that could not be sent", () => {
    const l = resultLines({
      ...base,
      sent: 2,
      failed: [{ path: "a.jpg", reason: "could not be read as a picture." }],
    });
    expect(l.join(" ")).toMatch(
      /1 photo could not be sent: a\.jpg \(could not be read as a picture\)/,
    );
  });

  it("is honest that videos are not sent yet", () => {
    expect(resultLines({ ...base, sent: 1, videosNotSent: 2 }).join(" ")).toMatch(
      /2 videos in this folder were not sent: videos are not part of review yet\./,
    );
  });

  it("is a live progress line", () => {
    expect(progressLine({ phase: "sending", done: 14, total: 212 })).toBe(
      "Sending for review… 14 of 212",
    );
  });
});

describe("what is said after Send all", () => {
  const t = {
    daysDone: 3,
    sent: 120,
    alreadyThere: 40,
    largeAdded: 0,
    failedPhotos: 0,
    skippedDays: [],
    problemDays: [],
  };
  it("totals the dates and photos", () => {
    expect(allDoneLines(t, false)).toEqual([
      "Finished. 3 dates done: 120 photos newly sent for review, 40 photos already there.",
    ]);
    expect(allDoneLines(t, true)[0]).toMatch(/^Stopped\. 3 dates done/);
  });
  it("names dates that were passed by and dates that stopped", () => {
    const l = allDoneLines(
      {
        ...t,
        largeAdded: 5,
        failedPhotos: 2,
        skippedDays: [{ day: "2026-10-01", reason: "not copied" }],
        problemDays: [{ day: "2026-10-02", reason: "Lost the connection." }],
      },
      false,
    );
    expect(l.join("\n")).toMatch(/large copy for 5 photos/);
    expect(l.join("\n")).toMatch(/2 photos could not be sent/);
    expect(l.join("\n")).toMatch(
      /1 date was passed by because its folder is not ready: 2026-10-01/,
    );
    expect(l.join("\n")).toMatch(/2026-10-02 stopped: Lost the connection\./);
  });
});
