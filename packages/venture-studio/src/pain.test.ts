import { describe, it, expect } from "vitest";
import {
  MIN_KEYWORDS_PER_ASSIGNMENT,
  MIN_SIGNALS_PER_CLUSTER,
  PAIN_ENGINE_VERSION,
  PAIN_PHRASES,
  PAIN_QUERIES,
  PAIN_SEARCH_FLOOR,
  PAIN_THEMES,
  assignTheme,
  engagementWeight,
  painSearchQuery,
} from "./pain";

describe("the phrasings we go looking for", () => {
  it("keeps the CEO's own wording rather than a paraphrase", () => {
    const phrases = PAIN_PHRASES.map((p) => p.phrase);
    expect(phrases).toContain("why isn't there an app");
    expect(phrases).toContain("I wish this app would");
    expect(phrases).toContain("does anyone know software that");
    expect(phrases).toContain("I hate having to do this manually");
    expect(phrases).toContain("is there a better way to");
    expect(phrases).toContain("this costs too much");
    expect(phrases).toContain("I need something that");
    expect(phrases).toContain("the existing tools don't");
  });

  it("has a version and unique ids, so a collection run is reproducible", () => {
    expect(PAIN_ENGINE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/);
    expect(new Set(PAIN_PHRASES.map((p) => p.id)).size).toBe(PAIN_PHRASES.length);
  });

  it("searches the phrase as a phrase, not as loose words", () => {
    // Unquoted, "why isn't there an app" would match any issue containing "app".
    const q = painSearchQuery(PAIN_PHRASES[0]!);
    expect(q).toContain(`"${PAIN_PHRASES[0]!.phrase}"`);
    expect(q).toContain("type:issue");
  });

  it("uses an absolute date floor so a re-run searches the same window", () => {
    expect(PAIN_SEARCH_FLOOR).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const q of PAIN_QUERIES)
      expect(q.query).toContain(`created:>${PAIN_SEARCH_FLOOR}`);
  });
});

describe("clustering is deterministic and checkable", () => {
  it("defines themes with a title, a problem statement and keywords", () => {
    expect(PAIN_THEMES.length).toBeGreaterThanOrEqual(10);
    for (const t of PAIN_THEMES) {
      expect(t.title).not.toBe("");
      expect(t.problemStatement).not.toBe("");
      expect(t.keywords.length).toBeGreaterThan(3);
    }
    expect(new Set(PAIN_THEMES.map((t) => t.key)).size).toBe(PAIN_THEMES.length);
  });

  it("assigns a signal to the theme it shares most vocabulary with", () => {
    const a = assignTheme({
      title: "Cannot sync the schedule to Google Calendar",
      bodyExcerpt:
        "We keep the same calendar in two places because there is no ical export",
      labels: [],
    });
    expect(a.theme).toBe("schedule-fragmentation");
    expect(a.matchedKeywords).toContain("calendar");
    expect(a.basis).toContain("schedule-fragmentation");
  });

  it("refuses to cluster on a single ordinary word", () => {
    // Both of these joined a theme in the first pass, on one word each: a music
    // player matched schedule-fragmentation on "sync", a font request matched
    // reporting-visibility on "log".
    const a = assignTheme({
      title: "Music keeps playing automatically",
      bodyExcerpt: "the player will sync to the next track on its own",
      labels: [],
    });
    expect(a.theme).toBeNull();
    expect(a.basis).toContain("coincidence");
    expect(MIN_KEYWORDS_PER_ASSIGNMENT).toBeGreaterThanOrEqual(2);
  });

  it("leaves an unmatched signal unclustered rather than forcing it somewhere", () => {
    const a = assignTheme({
      title: "Typo in the readme",
      bodyExcerpt: "line 4",
      labels: [],
    });
    expect(a.theme).toBeNull();
    expect(a.matchedKeywords).toEqual([]);
    expect(a.basis).toContain("left unclustered");
  });

  it("returns the same answer every time for the same input", () => {
    const subject = {
      title: "Export is missing",
      bodyExcerpt: "I want to migrate away and there is no backup or export",
      labels: ["enhancement"],
    };
    const first = assignTheme(subject);
    for (let i = 0; i < 5; i++) expect(assignTheme(subject)).toEqual(first);
  });

  it("records which keywords produced the assignment, so it can be argued with", () => {
    const a = assignTheme({
      title: "Too expensive for a small team",
      bodyExcerpt: "the pricing is per seat and we cannot afford it",
      labels: [],
    });
    expect(a.theme).toBe("pricing-pressure");
    expect(a.matchedKeywords.length).toBeGreaterThan(1);
    expect(a.basis).toMatch(/matched \d+ keywords? for pricing-pressure/);
  });
});

describe("recurrence, not anecdote", () => {
  it("requires several signals before a theme is presented as a pain point", () => {
    // One complaint is a person having a bad day. The premise is recurrence.
    expect(MIN_SIGNALS_PER_CLUSTER).toBeGreaterThanOrEqual(3);
  });

  it("weights a complaint others engaged with above one nobody answered", () => {
    expect(engagementWeight(10, 5)).toBeGreaterThan(engagementWeight(10, 0));
    expect(engagementWeight(0, 0)).toBe(0);
    expect(engagementWeight(null, null)).toBe(0);
    // A reply is stronger evidence of a shared problem than a reaction.
    expect(engagementWeight(0, 1)).toBeGreaterThan(engagementWeight(1, 0));
  });
});
