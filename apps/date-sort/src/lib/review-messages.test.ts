import { describe, expect, it } from "vitest";

import { allDoneLines, dayStatus, progressLine, resultLines } from "./review-messages";

const base = {
  sent: 0,
  alreadyThere: 0,
  largeAdded: 0,
  failed: [],
  skipped: [],
  videosNotSent: 0,
  clipsSent: 0,
  clipsAlreadyThere: 0,
  clipNotes: [] as string[],
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

  it("says clips are sent and private until approved", () => {
    expect(resultLines({ ...base, clipsSent: 3 })[0]).toBe(
      "Sent 3 clips for review. They are private until you approve them on the website.",
    );
  });

  it("says plainly that clips need ffmpeg when it is missing", () => {
    expect(resultLines({ ...base, sent: 1, videosNotSent: 2 }).join(" ")).toMatch(
      /2 clips were not sent: converting a clip needs a free program called ffmpeg/,
    );
  });

  it("shows clip progress", () => {
    expect(progressLine({ phase: "clips", done: 2, total: 9 })).toBe(
      "Converting and sending clips… 2 of 9",
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
    clipsSent: 0,
    clipsAlreadyThere: 0,
    clipsNeedTool: 0,
    skippedDays: [],
    problemDays: [],
  };
  it("totals the dates and photos", () => {
    expect(allDoneLines(t, false)).toEqual([
      "Finished. 3 dates done: 120 photos newly sent for review, 40 photos already there.",
    ]);
    expect(allDoneLines(t, true)[0]).toMatch(/^Stopped\. 3 dates done/);
  });
  it("totals clips and the missing tool", () => {
    const l = allDoneLines(
      { ...t, clipsSent: 4, clipsAlreadyThere: 1, clipsNeedTool: 2 },
      false,
    );
    expect(l.join("\n")).toMatch(/Clips: 4 newly sent, 1 already there\./);
    expect(l.join("\n")).toMatch(/2 clips were not sent: .*ffmpeg/);
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

describe("the badge on a date card", () => {
  it("says not yet, partly, or all", () => {
    expect(dayStatus(282, 0, 0)).toEqual({ kind: "none", text: "Not on 5Star yet." });
    expect(dayStatus(282, 120, 0)).toEqual({
      kind: "partial",
      text: "On 5Star: 120 of 282 photos. Send for review adds the rest.",
    });
    expect(dayStatus(282, 282, 250)).toEqual({
      kind: "all",
      text: "On 5Star: all 282 photos (250 approved).",
    });
  });
});

describe("the on-5Star badge keeps photos and clips apart", () => {
  it("does not call a clip-only date complete because of photos on the site", () => {
    expect(dayStatus(0, 0, 0, 112, 0)).toEqual({
      kind: "none",
      text: "Not on 5Star yet.",
    });
  });
  it("says all clips when all are there", () => {
    expect(dayStatus(0, 0, 0, 3, 3)).toEqual({
      kind: "all",
      text: "On 5Star: all 3 clips.",
    });
  });
  it("joins photo and clip parts, partial when they differ", () => {
    const s = dayStatus(10, 10, 0, 4, 1);
    expect(s.kind).toBe("partial");
    expect(s.text).toBe(
      "On 5Star: all 10 photos. On 5Star: 1 of 4 clips. Send for review adds the rest.",
    );
  });
});

describe("Send all, when the scan has clips that are not in the date folders", () => {
  const none = {
    daysDone: 6,
    sent: 0,
    alreadyThere: 3919,
    largeAdded: 0,
    failedPhotos: 0,
    clipsSent: 0,
    clipsAlreadyThere: 0,
    clipsNeedTool: 0,
    skippedDays: [],
    problemDays: [],
  };
  it("says so, and what to press, instead of sounding like success", () => {
    const text = allDoneLines(none, false, 96).join(" ");
    expect(text).toMatch(/found 96 short clips, but none were in the date folders/);
    expect(text).toMatch(/Copy all dates first/);
  });
  it("stays quiet when clips were sent, or the scan had none", () => {
    expect(allDoneLines({ ...none, clipsSent: 3 }, false, 96).join(" ")).not.toMatch(
      /none were in the date folders/,
    );
    expect(allDoneLines(none, false, 0).join(" ")).not.toMatch(
      /none were in the date folders/,
    );
  });
});

describe("Send all names why files could not be sent", () => {
  it("lists the reasons, a few at a time", () => {
    const t = {
      daysDone: 2,
      sent: 0,
      alreadyThere: 0,
      largeAdded: 0,
      failedPhotos: 7,
      failedReasons: Array.from(
        { length: 7 },
        (_, i) => `IMG_${i}.MOV is 400 seconds long.`,
      ),
      clipsSent: 0,
      clipsAlreadyThere: 0,
      clipsNeedTool: 0,
      skippedDays: [],
      problemDays: [],
    };
    const text = allDoneLines(t, false).join("\n");
    expect(text).toMatch(/• IMG_0\.MOV is 400 seconds long\./);
    expect(text).toMatch(/• and 2 more/);
    expect(text).not.toMatch(/IMG_6/);
  });
});
