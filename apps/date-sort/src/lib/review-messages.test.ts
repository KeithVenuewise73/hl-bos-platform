import { describe, expect, it } from "vitest";

import { progressLine, resultLines } from "./review-messages";

const base = { sent: 0, alreadyThere: 0, failed: [], skipped: [], videosNotSent: 0 };

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
