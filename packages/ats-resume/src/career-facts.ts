/**
 * The evidence corpus.
 *
 * Every downstream decision — does the candidate match this requirement, may
 * this keyword be used, is this generated sentence supportable — is answered
 * against `CareerFact`s and nothing else. Turning a parsed resume into facts
 * is therefore the moment provenance is established, and it happens exactly
 * once, here.
 *
 * Facts derived from the uploaded resume are `source: "resume"`. Facts the
 * user types in themselves are `source: "user_confirmed"` — equally valid
 * evidence, and marked differently so the UI can always show which is which.
 */

import { extractNumbers, newId, now } from "./text.ts";
import { findVocabulary, CERTIFICATION_VOCAB, SOFTWARE_VOCAB } from "./vocabulary.ts";
import type {
  CareerFact,
  FactCategory,
  ParsedResume,
  SourceStatus,
  UUID,
} from "./types.ts";

export interface FactInput {
  readonly category: FactCategory;
  readonly text: string;
  readonly source?: SourceStatus;
  readonly context?: string;
  readonly isSample?: boolean;
}

/** Build a fact, extracting its quantities once so nothing re-parses prose. */
export function makeFact(profileId: UUID, input: FactInput): CareerFact {
  const timestamp = now();
  const fact: {
    id: UUID;
    createdAt: string;
    updatedAt: string;
    profileId: UUID;
    category: FactCategory;
    text: string;
    source: SourceStatus;
    numbers: string[];
    context?: string;
    isSample?: boolean;
  } = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId,
    category: input.category,
    text: input.text.trim(),
    source: input.source ?? "user_confirmed",
    numbers: extractNumbers(input.text),
  };
  if (input.context !== undefined) fact.context = input.context;
  if (input.isSample !== undefined) fact.isSample = input.isSample;
  return fact;
}

/**
 * Derive the career database from a parsed resume.
 *
 * Note what this does NOT do: it does not summarise, merge or infer. One line
 * of the resume becomes one fact, so that any later quote can be traced back
 * to a specific line the candidate wrote.
 */
export function factsFromResume(
  profileId: UUID,
  parsed: ParsedResume,
  options: { readonly isSample?: boolean } = {},
): CareerFact[] {
  const facts: CareerFact[] = [];
  const add = (input: FactInput): void => {
    if (input.text.trim().length === 0) return;
    const base: FactInput = {
      ...input,
      source: input.source ?? "resume",
    };
    facts.push(
      makeFact(
        profileId,
        options.isSample === undefined ? base : { ...base, isSample: options.isSample },
      ),
    );
  };

  if (parsed.headline.length > 0) {
    add({ category: "headline", text: parsed.headline });
  }
  for (const line of parsed.summary) {
    add({ category: "summary", text: line });
  }
  for (const skill of parsed.skills) {
    add({ category: categoriseSkill(skill), text: skill });
  }
  for (const entry of parsed.experience) {
    const context = `${entry.employer} — ${entry.title}`.replace(/^ — | — $/, "");
    const dates = [entry.startDate, entry.current ? "Present" : entry.endDate]
      .filter((d): d is string => d !== undefined && d.length > 0)
      .join(" – ");
    add({
      category: "employment",
      text: [entry.title, entry.employer, entry.location, dates]
        .filter((p): p is string => p !== undefined && p.length > 0)
        .join(" | "),
      context,
    });
    for (const bullet of entry.bullets) {
      add({
        category:
          extractNumbers(bullet).length > 0 ? "accomplishment" : "responsibility",
        text: bullet,
        context,
      });
    }
  }
  for (const edu of parsed.education) {
    add({
      category: "education",
      text: [edu.credential, edu.institution, edu.year]
        .filter((p): p is string => p !== undefined && p.length > 0)
        .join(" | "),
    });
  }
  for (const cert of parsed.certifications) {
    add({ category: "certification", text: cert });
  }
  for (const project of parsed.projects) {
    add({ category: "project", text: project });
  }
  for (const extra of parsed.additional) {
    add({ category: "other", text: extra });
  }
  for (const extra of parsed.unparsed) {
    add({ category: "other", text: extra });
  }
  return facts;
}

/** Route a bare skill string to the most specific category we can justify. */
export function categoriseSkill(skill: string): FactCategory {
  if (findVocabulary(skill, SOFTWARE_VOCAB).length > 0) return "software";
  if (findVocabulary(skill, CERTIFICATION_VOCAB).length > 0) return "certification";
  if (/\b(lead|leadership|manage|management|coach|mentor|team|p&l)\b/i.test(skill)) {
    return "leadership_skill";
  }
  if (
    /\b(operations|logistics|process|safety|compliance|routing|warehouse)\b/i.test(
      skill,
    )
  ) {
    return "operational_skill";
  }
  return "technical_skill";
}

/** Facts that can be quoted as evidence in a resume bullet. */
export function evidenceFacts(facts: readonly CareerFact[]): CareerFact[] {
  return facts.filter(
    (f) =>
      f.source !== "generated_wording" &&
      f.category !== "identity" &&
      f.category !== "contact",
  );
}
