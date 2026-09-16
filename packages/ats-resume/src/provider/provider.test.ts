import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { applyRewriteProposals, selectProvider } from "./index.ts";
import { createClaudeProvider } from "./claude.ts";
import { makeFact } from "../career-facts.ts";
import { newId } from "../text.ts";
import type { CareerFact, GeneratedLine } from "../types.ts";

const PROFILE = "44444444-4444-4444-8444-444444444444";

const fact = makeFact(PROFILE, {
  category: "accomplishment",
  source: "resume",
  text: "Managed 85 daily delivery routes and 11 independent contractors.",
});

function line(text: string, evidence: readonly CareerFact[]): GeneratedLine {
  return {
    id: newId(),
    section: "experience",
    text,
    evidenceFactIds: evidence.map((f) => f.id),
    evidenceText: evidence.map((f) => f.text),
    addressesRequirementIds: [],
    rationale: "original",
    validation: "verified",
    validationNotes: [],
  };
}

describe("selectProvider", () => {
  it("falls back to the rules engine and says so in plain English", () => {
    const selection = selectProvider();
    expect(selection.provider.name).toBe("Built-in rules engine");
    expect(selection.description).toContain("every feature works");
  });
});

describe("applyRewriteProposals — the AI gate", () => {
  const evidenceById = new Map([[fact.id, fact]]);

  it("accepts a rewrite that only rephrases the evidence", () => {
    const original = line(
      "Managed 85 daily delivery routes and 11 independent contractors.",
      [fact],
    );
    const [applied] = applyRewriteProposals(
      [original],
      [
        {
          id: original.id,
          rewritten: "Managed 85 daily delivery routes and 11 independent contractors.",
          rationale: "clearer",
        },
      ],
      evidenceById,
      [],
    );
    expect(applied?.accepted).toBe(true);
  });

  it("rejects a rewrite that inflates a number, and keeps the original", () => {
    const original = line("Managed 85 daily delivery routes.", [fact]);
    const [applied] = applyRewriteProposals(
      [original],
      [
        {
          id: original.id,
          rewritten: "Managed 850 daily delivery routes.",
          rationale: "stronger",
        },
      ],
      evidenceById,
      [],
    );
    expect(applied?.accepted).toBe(false);
    expect(applied?.line.text).toBe("Managed 85 daily delivery routes.");
    expect(applied?.reason).toContain("rejected");
  });

  it("rejects a rewrite that introduces a skill from nowhere", () => {
    const original = line("Managed 85 daily delivery routes.", [fact]);
    const [applied] = applyRewriteProposals(
      [original],
      [
        {
          id: original.id,
          rewritten:
            "Managed 85 daily delivery routes using SAP Transportation Management.",
          rationale: "keyword alignment",
        },
      ],
      evidenceById,
      [],
    );
    expect(applied?.accepted).toBe(false);
    expect(applied?.line.text).toBe("Managed 85 daily delivery routes.");
  });
});

describe("createClaudeProvider", () => {
  it("falls back to the rules-engine draft when the API call fails", async () => {
    const failing = {
      messages: {
        parse: () => Promise.reject(new Error("rate limited")),
      },
    } as unknown as Anthropic;
    const provider = createClaudeProvider({ apiKey: "test", client: failing });
    const draft = [
      {
        id: newId(),
        text: "10+ years of transportation operations experience.",
        kind: "experience" as const,
        importance: "critical" as const,
        sourceSection: "required",
        terms: ["transport", "operation"],
      },
    ];
    await expect(provider.refineRequirements("posting", draft)).resolves.toEqual(draft);
    await expect(
      provider.proposeBulletRewrites([{ id: "a", original: "x", targets: [] }], {
        jobTitle: "Director",
        company: "Sunrise",
        licensedTerms: [],
      }),
    ).resolves.toEqual([]);
  });

  it("maps a structured response into requirements", async () => {
    const responding = {
      messages: {
        parse: () =>
          Promise.resolve({
            parsed_output: {
              requirements: [
                {
                  text: "Ten years of transportation operations leadership.",
                  importance: "critical",
                  kind: "experience",
                  years_required: 10,
                },
              ],
            },
          }),
      },
    } as unknown as Anthropic;
    const provider = createClaudeProvider({ apiKey: "test", client: responding });
    const refined = await provider.refineRequirements("posting", []);
    expect(refined).toHaveLength(1);
    expect(refined[0]?.yearsRequired).toBe(10);
    expect(refined[0]?.sourceSection).toBe("claude");
  });

  it("ignores a rewrite for a bullet it was never given", async () => {
    const responding = {
      messages: {
        parse: () =>
          Promise.resolve({
            parsed_output: {
              rewrites: [
                { id: "not-a-real-bullet", rewritten: "Invented.", rationale: "" },
                { id: "a", rewritten: "Tightened wording.", rationale: "clarity" },
              ],
            },
          }),
      },
    } as unknown as Anthropic;
    const provider = createClaudeProvider({ apiKey: "test", client: responding });
    const proposals = await provider.proposeBulletRewrites(
      [{ id: "a", original: "x", targets: [] }],
      { jobTitle: "Director", company: "Sunrise", licensedTerms: [] },
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.id).toBe("a");
  });
});
