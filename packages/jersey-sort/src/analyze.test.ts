import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { analyzePhoto } from "./analyze.ts";
import { DEFAULT_THRESHOLDS } from "./confidence.ts";
import { createClaudeVisionProvider } from "./provider/claude.ts";
import type { ImageAnalysisProvider } from "./provider/types.ts";
import type { ProviderResult } from "./types.ts";

const image = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff]),
  mimeType: "image/jpeg" as const,
  width: 1600,
  height: 1067,
};

function fake(
  result: ProviderResult,
  understandsContext = true,
): ImageAnalysisProvider {
  return {
    info: {
      id: "fake",
      model: "fake-1",
      label: "Fake",
      method: understandsContext ? "vision_model" : "ocr",
      understandsContext,
    },
    analyze: () => Promise.resolve(result),
  };
}

describe("analyzePhoto", () => {
  it("runs the brief's IMG_4492 example: three athletes, one needs review", async () => {
    const out = await analyzePhoto(
      fake({
        athletesPresent: true,
        athleteCount: 3,
        readings: [
          { text: "24", confidence: 0.94, location: "jersey_back", box: null },
          { text: "18", confidence: 0.78, location: "jersey_front", box: null },
          { text: "52", confidence: 0.62, location: "jersey_front", box: null },
          { text: "14", confidence: 0.99, location: "scoreboard", box: null },
        ],
      }),
      image,
      DEFAULT_THRESHOLDS,
    );
    expect(out.detections.map((d) => d.value)).toEqual(["24", "18", "52"]);
    expect(out.rejected).toHaveLength(1);
    expect(out.status).toBe("needs_review");
    expect(out.provider).toBe("fake");
  });

  it("caps an OCR provider's readings so they always reach a person", async () => {
    const out = await analyzePhoto(
      fake(
        {
          athletesPresent: null,
          athleteCount: null,
          readings: [{ text: "24", confidence: 0.99, location: "unknown", box: null }],
        },
        false,
      ),
      image,
      DEFAULT_THRESHOLDS,
    );
    expect(out.detections[0]?.confidence).toBe(0.8);
    expect(out.status).toBe("needs_review");
  });

  it("lets a provider failure propagate: nothing is invented", async () => {
    const failing: ImageAnalysisProvider = {
      ...fake({ athletesPresent: null, athleteCount: null, readings: [] }),
      analyze: () => Promise.reject(new Error("rate limited")),
    };
    await expect(analyzePhoto(failing, image, DEFAULT_THRESHOLDS)).rejects.toThrow(
      "rate limited",
    );
  });
});

describe("Claude vision provider (SDK client injected)", () => {
  function clientReturning(response: unknown, seen: unknown[] = []): Anthropic {
    return {
      beta: {
        messages: {
          parse: (body: unknown) => {
            seen.push(body);
            return Promise.resolve(response);
          },
        },
      },
    } as unknown as Anthropic;
  }

  it("sends the image and maps the structured answer", async () => {
    const seen: unknown[] = [];
    const provider = createClaudeVisionProvider({
      apiKey: "",
      client: clientReturning(
        {
          stop_reason: "end_turn",
          parsed_output: {
            athletes_present: true,
            athlete_count: 2,
            numbers: [
              {
                text: "24",
                confidence: 0.93,
                printed_on: "jersey_back",
                jersey: "dark",
                box: { x: 0.4, y: 0.3, width: 0.1, height: 1.4 },
              },
              {
                text: "30",
                confidence: 0.97,
                printed_on: "yard_marker",
                jersey: "unknown",
                box: null,
              },
            ],
            notes: "",
          },
        },
        seen,
      ),
    });
    const result = await provider.analyze(image);
    expect(result.athletesPresent).toBe(true);
    expect(result.readings[0]).toEqual({
      text: "24",
      confidence: 0.93,
      location: "jersey_back",
      jersey: "dark",
      box: { x: 0.4, y: 0.3, width: 0.1, height: 1 },
    });
    const body = seen[0] as {
      model: string;
      messages: Array<{
        content: Array<{ type: string; source?: { data: string; media_type: string } }>;
      }>;
    };
    expect(body.model).toBe("claude-opus-5-5");
    const img = body.messages[0]?.content[0];
    expect(img?.type).toBe("image");
    expect(img?.source?.media_type).toBe("image/jpeg");
    expect(img?.source?.data).toBe(Buffer.from(image.bytes).toString("base64"));
  });

  it("turns a refusal into an error, not an empty result", async () => {
    const provider = createClaudeVisionProvider({
      apiKey: "",
      client: clientReturning({ stop_reason: "refusal", parsed_output: null }),
    });
    await expect(provider.analyze(image)).rejects.toThrow("declined");
  });

  it("turns a malformed answer into an error", async () => {
    const provider = createClaudeVisionProvider({
      apiKey: "",
      client: clientReturning({ stop_reason: "end_turn", parsed_output: null }),
    });
    await expect(provider.analyze(image)).rejects.toThrow("unexpected shape");
  });
});
