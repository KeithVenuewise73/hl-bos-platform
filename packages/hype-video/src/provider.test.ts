import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { FULL, MINIMAL, request } from "./fixtures.test-helpers.ts";
import {
  InputRefusedError,
  TEMPLATE_WRITER_ID,
  createClaudeWriter,
  generatePackage,
  normalizePackage,
  type HypeWriter,
} from "./provider/index.ts";
import type { HypePackage } from "./types.ts";
import { normalizeDetails } from "./validation.ts";
import { writeWithTemplate } from "./writer.ts";

const fixedNow = () => new Date("2026-09-30T12:00:00.000Z");

function fakeWriter(write: HypeWriter["write"]): HypeWriter {
  return { id: "claude:test", label: "Claude (test)", available: true, write };
}

describe("generatePackage", () => {
  it("uses the template writer when no model is configured", async () => {
    const record = await generatePackage(request(FULL), { now: fixedNow });
    expect(record.producedBy).toBe(TEMPLATE_WRITER_ID);
    expect(record.fellBack).toBe(false);
    expect(record.generatedAt).toBe("2026-09-30T12:00:00.000Z");
  });

  it("uses a model's draft when it passes every check", async () => {
    const writer = fakeWriter((_req, baseline) =>
      Promise.resolve({ ...baseline, title: "Jordan Reyes: Game Day Energy" }),
    );
    const record = await generatePackage(request(FULL), { writer, now: fixedNow });
    expect(record.producedBy).toBe("claude:test");
    expect(record.package.title).toBe("Jordan Reyes: Game Day Energy");
    expect(record.notes).toEqual([]);
  });

  it("refuses a model's invented stat and says why", async () => {
    const writer = fakeWriter((_req, baseline) =>
      Promise.resolve({ ...baseline, socialCaption: "Averaging 28 points a night!" }),
    );
    const record = await generatePackage(request(FULL), { writer, now: fixedNow });
    expect(record.producedBy).toBe(TEMPLATE_WRITER_ID);
    expect(record.fellBack).toBe(true);
    expect(record.notes.join(" ")).toContain('"28"');
    expect(record.package.socialCaption).not.toContain("28");
  });

  it("refuses a model's draft that leaks contact details", async () => {
    const writer = fakeWriter((_req, baseline) =>
      Promise.resolve({ ...baseline, socialCaption: "Book Jordan: coach@example.com" }),
    );
    const record = await generatePackage(request(FULL), { writer });
    expect(record.fellBack).toBe(true);
    expect(record.package.socialCaption).not.toContain("@example.com");
  });

  it("refuses a sponsor callout nobody asked for", async () => {
    const writer = fakeWriter((_req, baseline) =>
      Promise.resolve({ ...baseline, sponsorCallout: "Brought to you by Nike." }),
    );
    const record = await generatePackage(request(MINIMAL), { writer });
    expect(record.fellBack).toBe(true);
    expect(record.package.sponsorCallout).toBeNull();
  });

  it("falls back when the model fails outright", async () => {
    const writer = fakeWriter(() => Promise.reject(new Error("rate limited.")));
    const record = await generatePackage(request(FULL), { writer });
    expect(record.producedBy).toBe(TEMPLATE_WRITER_ID);
    expect(record.notes[0]).toContain("rate limited.");
  });

  it("never asks an unavailable writer", async () => {
    let called = false;
    const writer: HypeWriter = {
      ...fakeWriter(() => {
        called = true;
        return Promise.reject(new Error("should not run"));
      }),
      available: false,
    };
    const record = await generatePackage(request(FULL), { writer });
    expect(called).toBe(false);
    expect(record.fellBack).toBe(false);
  });

  it("refuses the user's input before any writer sees it", async () => {
    let called = false;
    const writer = fakeWriter((_r, b) => {
      called = true;
      return Promise.resolve(b);
    });
    const details = normalizeDetails({
      ...FULL,
      personalityNotes: "Text me at 555-867-5309",
    });
    await expect(generatePackage(request(details), { writer })).rejects.toBeInstanceOf(
      InputRefusedError,
    );
    expect(called).toBe(false);
  });
});

describe("normalizePackage", () => {
  it("strips # from hashtags, caps cards and sorts them", () => {
    const base = writeWithTemplate(request(FULL));
    const pkg = normalizePackage({
      ...base,
      hashtags: ["#GameDay", "##Two Words", "#"],
      onScreenText: [
        { atSecond: 40, text: "LATE" },
        { atSecond: 2.4, text: "EARLY" },
      ],
      sponsorCallout: "   ",
    });
    expect(pkg.hashtags).toEqual(["GameDay", "TwoWords"]);
    expect(pkg.onScreenText).toEqual([
      { atSecond: 2, text: "EARLY" },
      { atSecond: 30, text: "LATE" },
    ]);
    expect(pkg.sponsorCallout).toBeNull();
  });
});

describe("Claude writer", () => {
  function fakeClient(response: unknown, seen: unknown[] = []): Anthropic {
    return {
      beta: {
        messages: {
          parse: (params: unknown) => {
            seen.push(params);
            return Promise.resolve(response);
          },
        },
      },
    } as unknown as Anthropic;
  }

  it("is unavailable without a key", () => {
    expect(createClaudeWriter({ apiKey: "" }).available).toBe(false);
  });

  it("sends the model, refusal fallback and structured output format", async () => {
    const baseline = writeWithTemplate(request(FULL));
    const seen: unknown[] = [];
    const writer = createClaudeWriter({
      apiKey: "",
      client: fakeClient({ stop_reason: "end_turn", parsed_output: baseline }, seen),
    });
    const out = await writer.write(request(FULL), baseline);
    expect(out).toEqual(baseline);
    const params = seen[0] as Record<string, unknown>;
    expect(params["model"]).toBe("claude-opus-5-5");
    expect(params["fallbacks"]).toBe("default");
    expect(params["betas"]).toEqual(["server-side-fallback-2026-07-01"]);
    expect(JSON.stringify(params["messages"])).toContain("Jordan Reyes");
  });

  it("treats a refusal as a failure, so the template draft is used", async () => {
    const writer = createClaudeWriter({
      apiKey: "",
      client: fakeClient({ stop_reason: "refusal", parsed_output: null }),
    });
    const record = await generatePackage(request(FULL), { writer });
    expect(record.producedBy).toBe(TEMPLATE_WRITER_ID);
    expect(record.notes[0]).toContain("declined");
  });

  it("treats an unparseable draft as a failure", async () => {
    const writer = createClaudeWriter({
      apiKey: "",
      client: fakeClient({ stop_reason: "end_turn", parsed_output: null } satisfies {
        stop_reason: string;
        parsed_output: HypePackage | null;
      }),
    });
    const record = await generatePackage(request(FULL), { writer });
    expect(record.fellBack).toBe(true);
  });
});
