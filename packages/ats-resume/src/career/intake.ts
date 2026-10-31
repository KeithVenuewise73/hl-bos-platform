/**
 * Intake: turning a submitted form into a validated `SearchProfile`.
 *
 * Validation runs on the server, against raw form values, and returns every
 * problem at once so a subscriber on a phone fixes the form in one pass.
 * Nothing here trusts a select box: a value outside the allowed list is an
 * error, not a default.
 */

import { newId, now } from "../text.ts";
import type { UUID } from "../types.ts";
import {
  CAREER_GOALS,
  EMPLOYMENT_SITUATIONS,
  EMPLOYMENT_TYPES,
  PAY_PERIODS,
  SEARCH_ACTIVITIES,
  SHIFT_LIMITS,
  WORK_ARRANGEMENTS,
  type Criterion,
  type SalaryExpectation,
  type SearchProfile,
} from "./types.ts";

/** A form flattened to strings: single values, or every value of a checkbox group. */
export type RawForm = Readonly<Record<string, string | readonly string[] | undefined>>;

export type IntakeResult =
  | { readonly ok: true; readonly profile: SearchProfile }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>> };

function one(form: RawForm, key: string): string {
  const value = form[key];
  if (value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return (value[0] ?? "").trim();
}

function many(form: RawForm, key: string): string[] {
  const value = form[key];
  if (value === undefined) return [];
  const list = typeof value === "string" ? [value] : [...value];
  return list.map((v) => v.trim()).filter((v) => v.length > 0);
}

/** Comma- or newline-separated free text, deduplicated, capped. */
export function splitList(
  value: string,
  max = 25,
  separators: RegExp = /[,\n;]/,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(separators)) {
    const item = raw.trim().replace(/\s+/g, " ");
    if (item.length === 0 || item.length > 120) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function oneOf<T extends string>(allowed: readonly T[], value: string): T | undefined {
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function allOf<T extends string>(
  allowed: readonly T[],
  values: readonly string[],
): { ok: T[]; bad: string[] } {
  const ok: T[] = [];
  const bad: string[] = [];
  for (const v of values) {
    const hit = oneOf(allowed, v);
    if (hit === undefined) bad.push(v);
    else if (!ok.includes(hit)) ok.push(hit);
  }
  return { ok, bad };
}

function firm(form: RawForm, key: string): boolean {
  return one(form, `${key}Firm`) === "firm";
}

function number(
  form: RawForm,
  key: string,
  errors: Record<string, string>,
  label: string,
  range: { min: number; max: number },
): number | undefined {
  const raw = one(form, key).replace(/[,$\s]/g, "");
  if (raw.length === 0) return undefined;
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    errors[key] = `${label} must be a number.`;
    return undefined;
  }
  const value = Number(raw);
  if (value < range.min || value > range.max) {
    errors[key] =
      `${label} must be between ${range.min} and ${range.max.toLocaleString("en-US")}.`;
    return undefined;
  }
  return value;
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * Validate an intake form.
 *
 * `existing` keeps the record id stable across edits, so editing preferences
 * updates the profile instead of creating a second one.
 */
export function validateIntake(
  profileId: UUID,
  form: RawForm,
  existing?: SearchProfile,
): IntakeResult {
  const errors: Record<string, string> = {};

  const employmentSituation = oneOf(
    EMPLOYMENT_SITUATIONS,
    one(form, "employmentSituation"),
  );
  if (employmentSituation === undefined)
    errors["employmentSituation"] =
      "Choose your employment situation (or 'Prefer not to say').";

  const searchActivity = oneOf(SEARCH_ACTIVITIES, one(form, "searchActivity"));
  if (searchActivity === undefined)
    errors["searchActivity"] = "Choose how actively you are searching.";

  const targetTitles = splitList(one(form, "targetTitles"));
  if (targetTitles.length === 0)
    errors["targetTitles"] = "Add at least one target job title.";

  const goals = allOf(CAREER_GOALS, many(form, "goals"));
  if (goals.bad.length > 0)
    errors["goals"] = "One of the selected goals is not recognised.";

  const arrangements = allOf(WORK_ARRANGEMENTS, many(form, "arrangements"));
  if (arrangements.bad.length > 0)
    errors["arrangements"] = "One of the selected work arrangements is not recognised.";
  if (arrangements.ok.length === 0)
    errors["arrangements"] = "Choose at least one of remote, hybrid or on-site.";

  const employmentTypes = allOf(EMPLOYMENT_TYPES, many(form, "employmentTypes"));
  if (employmentTypes.bad.length > 0)
    errors["employmentTypes"] =
      "One of the selected employment types is not recognised.";
  if (employmentTypes.ok.length === 0)
    errors["employmentTypes"] = "Choose at least one employment type.";

  const shifts = allOf(SHIFT_LIMITS, many(form, "shiftLimits"));
  if (shifts.bad.length > 0)
    errors["shiftLimits"] = "One of the shift limits is not recognised.";

  // Place names carry commas ("Columbus, OH"), so locations split on lines and semicolons only.
  const locations = splitList(one(form, "locations"), 25, /[\n;]/);
  const onSiteOrHybrid = arrangements.ok.some((a) => a !== "remote");
  if (onSiteOrHybrid && locations.length === 0)
    errors["locations"] = "Add at least one location for on-site or hybrid roles.";

  const commute = number(form, "maxCommuteMiles", errors, "Maximum commute", {
    min: 1,
    max: 500,
  });
  const travel = number(form, "maxTravelPercent", errors, "Travel limit", {
    min: 0,
    max: 100,
  });

  const availability = one(form, "availability");
  if (availability.length > 120)
    errors["availability"] = "Keep availability under 120 characters.";
  if (/^\d{4}-\d{2}-\d{2}$/.test(availability) && !isIsoDate(availability))
    errors["availability"] = "That start date is not a real calendar date.";

  let salary: SalaryExpectation | undefined;
  const minimum = number(form, "salaryMin", errors, "Salary minimum", {
    min: 1,
    max: 10_000_000,
  });
  const target = number(form, "salaryTarget", errors, "Salary target", {
    min: 1,
    max: 10_000_000,
  });
  if (minimum !== undefined || target !== undefined) {
    const currency = one(form, "salaryCurrency").toUpperCase() || "USD";
    const period = oneOf(PAY_PERIODS, one(form, "salaryPeriod") || "year");
    if (!CURRENCY_RE.test(currency))
      errors["salaryCurrency"] = "Currency must be a three-letter code such as USD.";
    if (period === undefined) errors["salaryPeriod"] = "Choose a pay period.";
    if (minimum !== undefined && target !== undefined && target < minimum)
      errors["salaryTarget"] = "Target salary cannot be below your minimum.";
    if (period !== undefined) {
      salary = {
        ...(minimum === undefined ? {} : { minimum }),
        ...(target === undefined ? {} : { target }),
        currency,
        period,
        firm: firm(form, "salary"),
      };
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    employmentSituation === undefined ||
    searchActivity === undefined
  ) {
    return { ok: false, errors };
  }

  const timestamp = now();
  const crit = <T>(value: T, key: string): Criterion<T> => ({
    value,
    firm: firm(form, key),
  });
  const profile: SearchProfile = {
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    profileId,
    employmentSituation,
    searchActivity,
    confidential: one(form, "confidential") === "yes",
    availability,
    targetTitles,
    relatedTitles: splitList(one(form, "relatedTitles")),
    keywords: splitList(one(form, "keywords")),
    industries: splitList(one(form, "industries")),
    goals: goals.ok,
    locations: crit(locations, "locations"),
    ...(commute === undefined
      ? {}
      : { maxCommuteMiles: crit(commute, "maxCommuteMiles") }),
    arrangements: crit(arrangements.ok, "arrangements"),
    willingToRelocate: one(form, "relocation") === "yes",
    ...(travel === undefined
      ? {}
      : { maxTravelPercent: crit(travel, "maxTravelPercent") }),
    shiftLimits: crit(shifts.ok, "shiftLimits"),
    employmentTypes: crit(employmentTypes.ok, "employmentTypes"),
    ...(salary === undefined ? {} : { salary }),
  };
  return { ok: true, profile };
}

/** Plain-English labels, shared by the form and every summary. */
export const LABELS: Readonly<Record<string, string>> = {
  employed_full_time: "Employed full-time",
  employed_part_time: "Employed part-time",
  self_employed: "Self-employed / contracting",
  unemployed: "Unemployed",
  student: "Student / recent graduate",
  career_break: "Career break",
  prefer_not_to_say: "Prefer not to say",
  actively_applying: "Actively applying",
  selectively_exploring: "Selectively exploring",
  passively_open: "Passively open",
  preparing: "Preparing for a future search",
  advancement: "Career advancement",
  lateral: "Lateral move",
  industry_change: "Industry change",
  return_to_work: "Return to work",
  remote: "Remote",
  hybrid: "Hybrid",
  on_site: "On-site",
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temporary: "Temporary",
  no_overnight: "No overnight shifts",
  no_weekends: "No weekends",
  no_rotating: "No rotating shifts",
  days_only: "Day shift only",
  hour: "per hour",
  week: "per week",
  month: "per month",
  year: "per year",
};

export function label(value: string): string {
  return LABELS[value] ?? value.replace(/_/g, " ");
}
