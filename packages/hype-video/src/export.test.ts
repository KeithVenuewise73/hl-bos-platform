import { describe, expect, it } from "vitest";

import { exportFilename, exportPackage, orderedSections } from "./export.ts";
import { FULL, request } from "./fixtures.test-helpers.ts";
import { PLANS, formatPrice } from "./pricing.ts";
import { capabilityStatuses } from "./integrations.ts";
import { writeWithTemplate } from "./writer.ts";

const record = {
  package: writeWithTemplate(request(FULL)),
  producedBy: "template-writer",
  fellBack: false,
  notes: [],
  generatedAt: "2026-09-30T12:00:00.000Z",
};
const meta = {
  projectName: "Jordan / Game Day!",
  templateKey: "game_day",
  tone: "aggressive" as const,
  outputTypes: ["voiceover_script" as const],
};

describe("export", () => {
  it("labels template output as not AI in every text format", () => {
    for (const format of ["txt", "md"] as const) {
      expect(exportPackage(record, meta, format).body).toContain(
        "template writer (not AI)",
      );
    }
    const json = JSON.parse(exportPackage(record, meta, "json").body) as Record<
      string,
      unknown
    >;
    expect(json["producedBy"]).toBe("template-writer");
    expect(json["format"]).toBe("5-star-hype-package/v1");
  });

  it("includes every part of the package", () => {
    const txt = exportPackage(record, meta, "txt").body;
    for (const heading of [
      "15-SECOND SCRIPT",
      "30-SECOND SCRIPT",
      "VOICEOVER",
      "SOCIAL CAPTION",
      "HASHTAGS",
      "ON-SCREEN TEXT",
      "AI VIDEO PROMPT",
      "AI MUSIC PROMPT",
      "SPONSOR CALLOUT",
    ]) {
      expect(txt).toContain(heading);
    }
  });

  it("puts the user's chosen output first, after the title", () => {
    const order = orderedSections(record.package, ["voiceover_script"]).map(
      (s) => s.heading,
    );
    expect(order.slice(0, 2)).toEqual(["Title", "Voiceover narration"]);
  });

  it("makes a safe filename", () => {
    expect(exportFilename("Jordan / Game Day!", "txt")).toBe("jordan-game-day.txt");
    expect(exportFilename("../../", "md")).toBe("hype-package.md");
  });
});

describe("pricing placeholder", () => {
  it("formats the planned prices", () => {
    expect(PLANS.map(formatPrice)).toEqual([
      "Free",
      "$4.99",
      "$9.99/mo",
      "$29.95/mo",
      "$99–$299",
    ]);
  });
});

describe("integrations", () => {
  it("reports every capability as not connected when no adapter is registered", () => {
    const statuses = capabilityStatuses();
    expect(statuses.map((s) => s.key)).toEqual([
      "video",
      "music",
      "voice",
      "payments",
      "media_moderation",
    ]);
    expect(statuses.every((s) => s.status === "not_connected")).toBe(true);
  });

  it("reports ready only when an adapter is actually registered", () => {
    const statuses = capabilityStatuses({
      voice: {
        provider: "Test Voice",
        synthesize: () => Promise.reject(new Error("unused")),
      },
    });
    expect(statuses.find((s) => s.key === "voice")?.status).toBe("ready");
  });
});
