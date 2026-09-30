/**
 * Writer selection, and the gate every draft passes through.
 *
 * `generatePackage()` is the only function the app calls to produce a
 * package. Its order of operations is the product's safety model:
 *
 *   1. Screen the INPUT. A blocked input never reaches any writer.
 *   2. Write the template draft. It is always produced: it is the fallback,
 *      and it is the baseline a model is asked to improve on.
 *   3. If a model is configured, ask it. Any failure — no network, rate
 *      limit, refusal, malformed output — is recorded and falls back.
 *   4. Normalise, then GUARD and SCREEN the model's draft. Refused drafts are
 *      recorded with the reason, and the template draft is used instead.
 *   5. Guard and screen the template draft too. It should always pass, and
 *      the tests prove it does; if it ever did not, the package is refused
 *      rather than saved.
 */

import { checkFabrication } from "../guard.ts";
import { screenFields, screenText, type ModerationFlag } from "../moderation.ts";
import { templateOrThrow } from "../templates.ts";
import type { GenerationRecord, GenerationRequest, HypePackage } from "../types.ts";
import { writeWithTemplate } from "../writer.ts";
import type { HypeWriter } from "./types.ts";
import { audienceText } from "../guard.ts";

export { createClaudeWriter, DEFAULT_CLAUDE_MODEL } from "./claude.ts";
export type { ClaudeWriterOptions } from "./claude.ts";
export type { HypeWriter } from "./types.ts";

export const TEMPLATE_WRITER_ID = "template-writer";

export const templateWriter: HypeWriter = {
  id: TEMPLATE_WRITER_ID,
  label: "Built-in template writer (not AI)",
  available: true,
  write: (request) => Promise.resolve(writeWithTemplate(request)),
};

/** Thrown when the user's own input is refused. The message is safe to show. */
export class InputRefusedError extends Error {
  readonly flags: readonly ModerationFlag[];
  constructor(flags: readonly ModerationFlag[]) {
    super(
      `This project can't be generated yet: ${flags.map((f) => f.reason).join(" ")}`,
    );
    this.name = "InputRefusedError";
    this.flags = flags;
  }
}

const MAX = { line: 200, block: 2400, hashtags: 10, cards: 8 } as const;

function clip(text: string, max: number): string {
  const t = text.replace(/\r\n/g, "\n").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Bring any writer's draft into shape. Never adds content, only trims it. */
export function normalizePackage(pkg: HypePackage): HypePackage {
  return {
    title: clip(pkg.title, MAX.line),
    script15: clip(pkg.script15, MAX.block),
    script30: clip(pkg.script30, MAX.block),
    voiceover: clip(pkg.voiceover, MAX.block),
    socialCaption: clip(pkg.socialCaption, MAX.block),
    hashtags: pkg.hashtags
      .map((h) => h.replace(/^#+/, "").replace(/[^A-Za-z0-9_]/g, ""))
      .filter((h) => h.length > 1)
      .slice(0, MAX.hashtags),
    onScreenText: pkg.onScreenText
      .map((b) => ({
        atSecond: Math.min(30, Math.max(0, Math.round(b.atSecond))),
        text: clip(b.text, 60),
      }))
      .filter((b) => b.text.length > 0)
      .sort((a, b) => a.atSecond - b.atSecond)
      .slice(0, MAX.cards),
    videoPrompt: clip(pkg.videoPrompt, MAX.block),
    musicPrompt: clip(pkg.musicPrompt, MAX.block),
    sponsorCallout:
      pkg.sponsorCallout === null || pkg.sponsorCallout.trim().length === 0
        ? null
        : clip(pkg.sponsorCallout, MAX.line),
  };
}

/** Why a draft may not be saved, or an empty list if it may. */
export function reviewDraft(pkg: HypePackage, request: GenerationRequest): string[] {
  const template = templateOrThrow(request.template);
  const problems: string[] = [
    ...checkFabrication(pkg, request.details, template).problems,
  ];
  const everything = `${audienceText(pkg)}\n${pkg.videoPrompt}\n${pkg.musicPrompt}`;
  for (const flag of screenText(everything).flags) problems.push(flag.reason);
  if (request.details.sponsorName.length === 0 && pkg.sponsorCallout !== null) {
    problems.push("Wrote a sponsor callout, but no sponsor was entered.");
  }
  return problems;
}

export interface GenerateOptions {
  /** The configured model writer, if any. Omit for template-only. */
  readonly writer?: HypeWriter;
  readonly now?: () => Date;
}

export async function generatePackage(
  request: GenerationRequest,
  options: GenerateOptions = {},
): Promise<GenerationRecord> {
  const { details } = request;
  const input = screenFields({
    "Athlete name": details.athleteName,
    Sport: details.sport,
    "Team or school": details.teamOrSchool,
    Position: details.position,
    "Class or age group": details.classYearOrAgeGroup,
    Achievements: details.achievements.join("\n"),
    "Personality notes": details.personalityNotes,
    Sponsor: details.sponsorName,
    "Extra context": details.extraContext,
  });
  if (!input.allowed) throw new InputRefusedError(input.flags);

  const generatedAt = (options.now?.() ?? new Date()).toISOString();
  const baseline = normalizePackage(writeWithTemplate(request));
  const notes: string[] = [];
  const writer = options.writer;

  if (writer !== undefined && writer.available && writer.id !== TEMPLATE_WRITER_ID) {
    try {
      const draft = normalizePackage(await writer.write(request, baseline));
      const problems = reviewDraft(draft, request);
      if (problems.length === 0) {
        return {
          package: draft,
          producedBy: writer.id,
          fellBack: false,
          notes,
          generatedAt,
        };
      }
      notes.push(
        `${writer.label}'s draft was not used, because it did not pass the checks: ${problems.join(" ")} The built-in template writer's version is shown instead.`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error.";
      notes.push(
        `${writer.label} could not write this package (${reason}) The built-in template writer's version is shown instead.`,
      );
    }
  }

  const baselineProblems = reviewDraft(baseline, request);
  if (baselineProblems.length > 0) {
    throw new Error(
      `The template writer produced a draft that failed its own checks: ${baselineProblems.join(" ")}`,
    );
  }
  return {
    package: baseline,
    producedBy: TEMPLATE_WRITER_ID,
    fellBack: notes.length > 0,
    notes,
    generatedAt,
  };
}
