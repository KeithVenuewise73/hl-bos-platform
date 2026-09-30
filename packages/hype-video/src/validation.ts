/**
 * Input normalisation and validation for athlete details.
 *
 * Returns plain-English problems keyed by field so the form can show each one
 * next to the box it belongs to. Nothing here throws: an incomplete form is a
 * normal state, not an error.
 */

import { findTemplate } from "./templates.ts";
import type { AthleteDetails, TemplateKey } from "./types.ts";

export const LIMITS = {
  shortField: 80,
  achievement: 160,
  achievements: 8,
  notes: 600,
} as const;

export type DetailsField = keyof AthleteDetails;

export interface DetailsValidation {
  readonly ok: boolean;
  readonly problems: Partial<Record<DetailsField, string>>;
  /** Not blocking, but the package will be thinner without them. */
  readonly suggestions: readonly string[];
}

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Build a details record from untrusted form input. Unknown keys are dropped. */
export function normalizeDetails(
  raw: Readonly<Record<string, unknown>>,
): AthleteDetails {
  const achievementsRaw = raw["achievements"];
  const lines: string[] = Array.isArray(achievementsRaw)
    ? achievementsRaw.map((v) => (typeof v === "string" ? v : ""))
    : typeof achievementsRaw === "string"
      ? achievementsRaw.split(/\r?\n/)
      : [];
  return {
    athleteName: clean(raw["athleteName"], LIMITS.shortField),
    sport: clean(raw["sport"], LIMITS.shortField),
    teamOrSchool: clean(raw["teamOrSchool"], LIMITS.shortField),
    jerseyNumber: clean(raw["jerseyNumber"], 3).replace(/^#/, ""),
    position: clean(raw["position"], LIMITS.shortField),
    classYearOrAgeGroup: clean(raw["classYearOrAgeGroup"], LIMITS.shortField),
    achievements: lines
      .map((l) => clean(l.replace(/^[-*•]\s*/, ""), LIMITS.achievement))
      .filter((l) => l.length > 0)
      .slice(0, LIMITS.achievements),
    personalityNotes: clean(raw["personalityNotes"], LIMITS.notes),
    sponsorName: clean(raw["sponsorName"], LIMITS.shortField),
    extraContext: clean(raw["extraContext"], LIMITS.notes),
  };
}

export function emptyDetails(): AthleteDetails {
  return normalizeDetails({});
}

export function validateDetails(
  details: AthleteDetails,
  template: TemplateKey,
): DetailsValidation {
  const problems: Partial<Record<DetailsField, string>> = {};
  const suggestions: string[] = [];
  const isTeam = findTemplate(template)?.subject === "team";

  if (!isTeam && details.athleteName.length === 0) {
    problems.athleteName = "Enter the athlete's name.";
  }
  if (details.sport.length === 0) problems.sport = "Enter the sport.";
  if (details.teamOrSchool.length === 0)
    problems.teamOrSchool = "Enter the team or school.";
  if (details.jerseyNumber.length > 0 && !/^\d{1,2}$/.test(details.jerseyNumber)) {
    problems.jerseyNumber = "A jersey number is one or two digits, like 7 or 00.";
  }

  if (!isTeam && details.position.length === 0) suggestions.push("Add a position.");
  if (details.classYearOrAgeGroup.length === 0) {
    suggestions.push("Add a class year or age group.");
  }
  if (details.achievements.length === 0) {
    suggestions.push(
      "Add at least one achievement. The writer only states facts you enter, so with none the video stays general.",
    );
  }

  return { ok: Object.keys(problems).length === 0, problems, suggestions };
}
