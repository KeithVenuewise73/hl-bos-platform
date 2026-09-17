/**
 * The redaction rules, tested.
 *
 * `sanitizeProps` is the only thing standing between a product counter and a
 * table full of resume text. It is a pure function precisely so this test can
 * exist, and the cases below are the ones that would actually happen: a
 * caller passing a job title, a sentence, an employer name.
 */
import { describe, expect, it } from "vitest";

import {
  EVENT_NAMES,
  funnelRates,
  isEventName,
  isFeedbackAnswer,
  sanitizeProps,
} from "./events.ts";

describe("event names", () => {
  it("accepts the nine the sprint defined, plus feedback", () => {
    expect(EVENT_NAMES).toHaveLength(10);
    expect(isEventName("resume_exported")).toBe(true);
    expect(isEventName("value_feedback")).toBe(true);
  });

  it("rejects anything not on the list", () => {
    expect(isEventName("resume_text")).toBe(false);
    expect(isEventName("")).toBe(false);
    expect(isEventName("__proto__")).toBe(false);
  });
});

describe("sanitizeProps", () => {
  it("keeps numbers, booleans and short identifiers", () => {
    expect(sanitizeProps({ format: "docx", count: 3, first: true })).toEqual({
      format: "docx",
      count: 3,
      first: true,
    });
  });

  it("drops anything that looks like content a user typed", () => {
    const out = sanitizeProps({
      format: "docx",
      title: "Director of Transportation Operations",
      employer: "Sunrise Logistics Inc.",
      bullet: "Cut dock dwell time by 27%.",
    });
    expect(out).toEqual({ format: "docx" });
  });

  it("drops non-finite numbers rather than storing NaN", () => {
    expect(
      sanitizeProps({ ratio: Number.NaN, size: Number.POSITIVE_INFINITY }),
    ).toEqual({});
  });

  it("drops keys that are not plain identifiers", () => {
    expect(sanitizeProps({ "job title": "x", "a.b": 1, ok: 2 })).toEqual({ ok: 2 });
  });

  it("returns an empty object for undefined", () => {
    expect(sanitizeProps(undefined)).toEqual({});
  });
});

describe("feedback answers", () => {
  it("accepts only the three offered", () => {
    expect(isFeedbackAnswer("yes")).toBe(true);
    expect(isFeedbackAnswer("somewhat")).toBe(true);
    expect(isFeedbackAnswer("no")).toBe(true);
    expect(isFeedbackAnswer("Yes")).toBe(false);
    expect(isFeedbackAnswer("it was fine, thanks")).toBe(false);
  });
});

describe("funnelRates", () => {
  it("computes the metric this beta turns on", () => {
    const rates = funnelRates({
      accounts: 10,
      analysesCompleted: 8,
      resumesGenerated: 6,
      resumesExported: 4,
    });
    expect(rates.analysisToGeneration).toBe(0.75);
    expect(rates.generationToExport).toBeCloseTo(0.667, 3);
    expect(rates.accountToExport).toBe(0.4);
  });

  it("returns zero rather than dividing by zero on an empty beta", () => {
    const rates = funnelRates({
      accounts: 0,
      analysesCompleted: 0,
      resumesGenerated: 0,
      resumesExported: 0,
    });
    expect(rates.accountToExport).toBe(0);
    expect(rates.analysisToGeneration).toBe(0);
  });
});
