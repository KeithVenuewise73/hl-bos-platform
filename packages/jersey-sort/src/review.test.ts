import { describe, expect, it } from "vitest";

import { DEFAULT_THRESHOLDS as T } from "./confidence.ts";
import {
  analyzedStatus,
  galleryNumbers,
  isUnidentified,
  type PhotoReviewState,
} from "./review.ts";

const base: PhotoReviewState = {
  detections: [],
  athletesPresent: true,
  noJerseyVisible: false,
  unusable: false,
  reviewed: false,
};
const d = (
  value: string,
  confidence: number,
  status: "suggested" | "confirmed" | "rejected" = "suggested",
) => ({
  value,
  confidence,
  status,
});

describe("analyzedStatus", () => {
  it("completes a photo whose every number is high confidence", () => {
    expect(
      analyzedStatus({ ...base, detections: [d("24", 0.94), d("18", 0.9)] }, T),
    ).toBe("completed");
  });
  it("sends a medium reading to review", () => {
    expect(
      analyzedStatus({ ...base, detections: [d("24", 0.94), d("18", 0.78)] }, T),
    ).toBe("needs_review");
  });
  it("sends a low reading to review", () => {
    expect(analyzedStatus({ ...base, detections: [d("52", 0.4)] }, T)).toBe(
      "needs_review",
    );
  });
  it("sends athletes with no readable number to review", () => {
    expect(analyzedStatus(base, T)).toBe("needs_review");
  });
  it("sends 'cannot tell' to review: unknown is not 'no athletes'", () => {
    expect(analyzedStatus({ ...base, athletesPresent: null }, T)).toBe("needs_review");
  });
  it("completes a photo with no athletes in it", () => {
    expect(analyzedStatus({ ...base, athletesPresent: false }, T)).toBe("completed");
  });
  it("a confirmed medium reading needs nothing more", () => {
    expect(
      analyzedStatus({ ...base, detections: [d("18", 0.7, "confirmed")] }, T),
    ).toBe("completed");
  });
  it.each(["reviewed", "noJerseyVisible", "unusable"] as const)(
    "%s is final",
    (flag) => {
      expect(
        analyzedStatus({ ...base, detections: [d("52", 0.3)], [flag]: true }, T),
      ).toBe("completed");
    },
  );
});

describe("galleryNumbers", () => {
  it("files high and medium suggestions and confirmed numbers, not low or rejected", () => {
    expect(
      galleryNumbers(
        [
          d("24", 0.94),
          d("18", 0.78),
          d("52", 0.4),
          d("3", 0.3, "confirmed"),
          d("9", 0.99, "rejected"),
        ],
        T,
      ).sort(),
    ).toEqual(["18", "24", "3"]);
  });
});

describe("isUnidentified", () => {
  it("is true when only low readings exist", () => {
    expect(isUnidentified({ ...base, detections: [d("52", 0.4)] }, T)).toBe(true);
  });
  it("is false once someone says no jersey is visible", () => {
    expect(isUnidentified({ ...base, noJerseyVisible: true }, T)).toBe(false);
  });
});
