/**
 * LinkedIn assistance and outreach drafts.
 *
 * Everything here is a SUGGESTION the subscriber reviews, and every suggestion
 * is built from verified facts and re-checked by the same claim validator the
 * resume uses. Nothing is published: there is no authorised LinkedIn
 * integration in this platform, so the only path is copy, export and manual
 * posting. No scraping, no automated engagement, no mass messaging.
 */

import { validateClaim } from "../claims.ts";
import { newId, now, extractNumbers } from "../text.ts";
import type { CareerFact, UUID } from "../types.ts";
import type {
  BaseResume,
  LinkedInItem,
  LinkedInItemKind,
  Opportunity,
  SearchProfile,
} from "./types.ts";

export const PUBLISHING_STATUS =
  "No authorised LinkedIn publishing integration is connected. Copy a draft, post it yourself on LinkedIn, then mark it as published here.";

function item(
  profileId: UUID,
  kind: LinkedInItemKind,
  label: string,
  text: string,
  evidence: readonly CareerFact[],
  licensed: readonly string[] = [],
): LinkedInItem {
  const verdict = validateClaim(text, { evidence, licensedTerms: licensed });
  const timestamp = now();
  return {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId,
    kind,
    label,
    text,
    factIds: evidence.map((f) => f.id),
    validation: verdict.status,
    notes: verdict.notes,
    status: kind === "post" ? "draft" : "suggested",
  };
}

/**
 * Profile recommendations from the approved base resume and the bank.
 *
 * Headline: target title plus the subscriber's own strongest skills — the
 * target title is licensed because it is what they told us they want, framed
 * as "seeking", never as a title they hold.
 */
export function profileRecommendations(input: {
  readonly profileId: UUID;
  readonly base: BaseResume;
  readonly facts: readonly CareerFact[];
  readonly search?: SearchProfile;
}): LinkedInItem[] {
  const { base, facts, profileId } = input;
  const out: LinkedInItem[] = [];
  const byId = new Map(facts.map((f) => [f.id, f]));
  const skillFacts = facts.filter((f) =>
    ["software", "technical_skill", "operational_skill", "leadership_skill"].includes(
      f.category,
    ),
  );
  const current = base.roles[0];
  const headlineFact = facts.find((f) => f.category === "headline");

  if (current !== undefined) {
    const employment = facts.find(
      (f) => f.category === "employment" && f.text.startsWith(current.title),
    );
    const skills = base.skills.slice(0, 3);
    const parts = [current.title, ...skills];
    const evidence = [
      employment,
      ...skillFacts.filter((f) => skills.includes(f.text)),
    ].filter((f): f is CareerFact => f !== undefined);
    out.push(
      item(
        profileId,
        "headline",
        "Headline — current role and strengths",
        parts.join(" | "),
        evidence,
      ),
    );
  }
  if (headlineFact !== undefined) {
    out.push(
      item(profileId, "headline", "Headline — from your resume", headlineFact.text, [
        headlineFact,
      ]),
    );
  }
  if (
    input.search?.confidential !== true &&
    input.search !== undefined &&
    current !== undefined
  ) {
    const target = input.search.targetTitles[0];
    if (target !== undefined) {
      const employment = facts.find(
        (f) => f.category === "employment" && f.text.startsWith(current.title),
      );
      out.push(
        item(
          profileId,
          "headline",
          "Headline — signalling your search (not shown when your search is confidential)",
          `${current.title} | Open to ${target} roles`,
          employment === undefined ? [] : [employment],
          ["open", "to", "roles", target],
        ),
      );
    }
  }

  // About: summary lines and the two most quantified accomplishments, verbatim.
  const summaryLines = base.summary.slice(0, 2);
  const quantified = base.roles
    .flatMap((r) => r.bullets)
    .filter((b) => extractNumbers(b.text).length > 0)
    .slice(0, 2);
  const aboutLines = [...summaryLines, ...quantified];
  if (aboutLines.length > 0) {
    const evidence = aboutLines
      .flatMap((l) => l.factIds.map((id) => byId.get(id)))
      .filter((f): f is CareerFact => f !== undefined);
    out.push(
      item(
        profileId,
        "about",
        "About section",
        aboutLines.map((l) => l.text).join("\n\n"),
        evidence,
      ),
    );
  }

  for (const role of base.roles.slice(0, 3)) {
    const bullets = role.bullets.slice(0, 4);
    if (bullets.length === 0) continue;
    const evidence = bullets
      .flatMap((b) => b.factIds.map((id) => byId.get(id)))
      .filter((f): f is CareerFact => f !== undefined);
    out.push(
      item(
        profileId,
        "experience",
        `Experience — ${role.title}, ${role.employer}`,
        bullets.map((b) => `• ${b.text}`).join("\n"),
        evidence,
      ),
    );
  }

  if (base.skills.length > 0) {
    out.push(
      item(
        profileId,
        "skills",
        "Skills to list (LinkedIn allows up to 50; lead with these)",
        base.skills.slice(0, 15).join(", "),
        skillFacts.filter((f) => base.skills.slice(0, 15).includes(f.text)),
      ),
    );
  }
  return out;
}

/**
 * A post draft from the subscriber's own words.
 *
 * The draft is their text, lightly structured. Their own input is the
 * evidence, so it validates; anything the template adds is generic framing,
 * licensed explicitly, never a claim.
 */
export function postDraft(
  profileId: UUID,
  input: { topic: string; story: string; lesson: string },
): LinkedInItem {
  const story = input.story.trim();
  const lesson = input.lesson.trim();
  if (story.length === 0)
    throw new Error("Write what happened in your own words first.");
  const own: CareerFact = {
    id: newId(),
    createdAt: now(),
    updatedAt: now(),
    profileId,
    category: "other",
    text: `${input.topic} ${story} ${lesson}`,
    source: "user_confirmed",
    numbers: extractNumbers(`${story} ${lesson}`),
  };
  const text = [
    story,
    lesson.length === 0 ? "" : `What I took from it: ${lesson}`,
    "What has your experience been?",
  ]
    .filter((s) => s.length > 0)
    .join("\n\n");
  const draft = item(
    profileId,
    "post",
    input.topic.trim() || "Post draft",
    text,
    [own],
    ["what", "i", "took", "from", "it", "has", "your", "experience", "been"],
  );
  return { ...draft, factIds: [] };
}

export function schedulePost(post: LinkedInItem, date: string): LinkedInItem {
  if (post.kind !== "post") throw new Error("Only posts go on the content calendar.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a calendar date.");
  return {
    ...post,
    scheduledFor: date,
    status: post.status === "draft" ? "ready" : post.status,
    updatedAt: now(),
  };
}

/**
 * A short recruiter / hiring-manager note for one opportunity, from the
 * strongest verified matches. Respects confidential search: the current
 * employer is never named.
 */
export function outreachDraft(input: {
  readonly opportunity: Opportunity;
  readonly strengths: readonly string[];
  readonly fullName: string;
  readonly confidential: boolean;
}): string {
  const { opportunity } = input;
  const lines = [
    "Hello [name],",
    "",
    `I recently came across the ${opportunity.title} role at ${opportunity.employer} and wanted to introduce myself.`,
    ...(input.strengths.length === 0
      ? []
      : [
          "",
          "A few things from my background that line up with the posting:",
          ...input.strengths.slice(0, 3).map((s) => `• ${s}`),
        ]),
    "",
    "Would you be open to a short conversation about the role?",
    "",
    "Thank you,",
    input.fullName || "[Your name]",
  ];
  const note = input.confidential
    ? "\n\n[Confidential search: this draft does not name your current employer. Check any detail you add does not identify it.]"
    : "";
  return lines.join("\n") + note;
}
