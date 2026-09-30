/**
 * The fabrication guard.
 *
 * A hype video about a real child that says "state champion" when they were
 * not, or "3 offers" when there are none, is not a copywriting slip. On a
 * recruiting intro it is a false statement to a college coach, attached to
 * the kid's name. So every package — from the built-in writer or from a model
 * — is checked here before it can be saved:
 *
 *   1. NUMBERS. Every number in the audience-facing text must appear in what
 *      the user entered (or in the template's own fixed wording). A writer may
 *      not invent a stat, a score, a ranking or a year.
 *
 *   2. CLAIMS. Words that assert an honour or a recruiting status — champion,
 *      MVP, All-State, offer, committed, undefeated, record — may only appear
 *      if the user's own input contains them.
 *
 * A prompt asks a model not to do these things; this function is what makes
 * the answer "it cannot". Only the audience-facing fields are checked: the
 * music prompt legitimately contains a tempo, and the video prompt is an
 * instruction to a tool, not a claim about the athlete.
 */

import type { HypeTemplate } from "./templates.ts";
import type { AthleteDetails, HypePackage } from "./types.ts";

/** Honour and recruiting terms. Matched as whole words, case-insensitive. */
export const CLAIM_TERMS = [
  "champion",
  "champions",
  "championship",
  "mvp",
  "all-state",
  "all-conference",
  "all-district",
  "all-region",
  "all-american",
  "undefeated",
  "record",
  "offer",
  "offers",
  "committed",
  "commit",
  "scholarship",
  "d1",
  "ranked",
  "#1",
  "champs",
  "state title",
  "conference title",
  "national title",
  "hall of fame",
] as const;

export interface GuardResult {
  readonly ok: boolean;
  /** Plain English, one per problem. */
  readonly problems: readonly string[];
}

/** The text the audience will see or hear. */
export function audienceText(pkg: HypePackage): string {
  return [
    pkg.title,
    pkg.script15,
    pkg.script30,
    pkg.voiceover,
    pkg.socialCaption,
    pkg.hashtags.join(" "),
    pkg.onScreenText.map((b) => b.text).join(" "),
    pkg.sponsorCallout ?? "",
  ].join("\n");
}

/** Everything a writer is licensed to draw facts from. */
export function licensedText(details: AthleteDetails, template: HypeTemplate): string {
  return [
    details.athleteName,
    details.sport,
    details.teamOrSchool,
    details.jerseyNumber,
    details.position,
    details.classYearOrAgeGroup,
    ...details.achievements,
    details.personalityNotes,
    details.sponsorName,
    details.extraContext,
    template.name,
    template.opener,
    template.closer,
    ...template.cards,
    ...template.hashtags,
  ].join("\n");
}

// Timestamps like [0:12] are structure, not claims.
const TIMESTAMP = /\[\d{1,2}:\d{2}\]/g;

function numbersIn(text: string): Set<string> {
  const found = text.replace(TIMESTAMP, " ").match(/\d+(?:[.,]\d+)?/g) ?? [];
  return new Set(found.map((n) => n.replace(",", "")));
}

function hasTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // "#1" starts with a non-word character, so \b cannot anchor it.
  const re = /^\w/.test(term)
    ? new RegExp(`\\b${escaped}\\b`, "i")
    : new RegExp(`(^|\\s)${escaped}\\b`, "i");
  return re.test(text);
}

export function checkFabrication(
  pkg: HypePackage,
  details: AthleteDetails,
  template: HypeTemplate,
): GuardResult {
  const output = audienceText(pkg);
  const licensed = licensedText(details, template);
  const problems: string[] = [];

  const allowedNumbers = numbersIn(licensed);
  // Hashtags glue words together ("ClassOf2027"), so a number can hide inside
  // a word; numbersIn() still finds it because it matches digits anywhere.
  for (const n of numbersIn(output)) {
    if (!allowedNumbers.has(n)) {
      problems.push(`States the number "${n}", which is not in anything you entered.`);
    }
  }

  for (const term of CLAIM_TERMS) {
    if (hasTerm(output, term) && !hasTerm(licensed, term)) {
      problems.push(
        `Uses the word "${term}", which claims something you did not enter.`,
      );
    }
  }

  return { ok: problems.length === 0, problems };
}
