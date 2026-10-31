/**
 * Experience bank and base resume.
 *
 * The experience bank IS the optimizer's evidence corpus (`CareerFact`). This
 * module adds three things around it:
 *
 *   - targeted QUESTIONS that ask for what the resume leaves out (scope,
 *     metrics, systems, credentials, examples);
 *   - INTERPRETATIONS — things inferred from the resume — which are held apart
 *     from the bank until the subscriber confirms them;
 *   - the BASE RESUME: a reviewed, versioned, approved document assembled only
 *     from facts in the bank.
 */

import { makeFact } from "../career-facts.ts";
import { validateClaim } from "../claims.ts";
import { extractNumbers, newId, normalize, now } from "../text.ts";
import { CERTIFICATION_VOCAB, SOFTWARE_VOCAB, findVocabulary } from "../vocabulary.ts";
import type {
  CareerFact,
  FactCategory,
  MasterResume,
  ParsedResume,
  UUID,
} from "../types.ts";
import type {
  BaseResume,
  BaseResumeLine,
  BaseResumeRole,
  ExperienceQuestion,
  Interpretation,
} from "./types.ts";

/** Equipment and process vocabulary common in transportation, logistics and warehousing. */
export const OPERATIONS_VOCAB: readonly string[] = [
  "forklift",
  "reach truck",
  "pallet jack",
  "order picker",
  "rf scanner",
  "cdl",
  "class a cdl",
  "dot compliance",
  "hazmat",
  "osha",
  "cross-dock",
  "cross docking",
  "cycle count",
  "cycle counting",
  "inventory control",
  "route planning",
  "dispatch",
  "last mile",
  "lean",
  "5s",
  "kaizen",
  "six sigma",
  "kpi",
  "p&l",
  "budget",
  "fleet",
  "telematics",
  "eld",
  "wms",
  "tms",
  "yard management",
  "receiving",
  "shipping",
  "loading dock",
  "putaway",
  "replenishment",
];

const SCOPE_RE =
  /\b(team|staff|employees|drivers|associates|direct reports|contractors|routes?|facilit(y|ies)|sites?|warehouses?|budget|square feet|sq\.? ?ft|trucks|vehicles|fleet|shifts?)\b/i;

function contextKey(fact: CareerFact): string {
  return fact.context ?? "";
}

/**
 * Questions that uncover evidence the resume does not state.
 *
 * Deterministic and specific: each question names the role it is about, so
 * the answer can be stored against that role as a confirmed fact.
 */
export function experienceQuestions(
  parsed: ParsedResume | undefined,
  facts: readonly CareerFact[],
): ExperienceQuestion[] {
  const questions: ExperienceQuestion[] = [];
  const roles = parsed?.experience ?? [];

  for (const role of roles) {
    const context = `${role.employer} — ${role.title}`.replace(/^ — | — $/, "");
    const roleFacts = facts.filter((f) => contextKey(f) === context);
    const text = roleFacts.map((f) => f.text).join(" ");
    const slug = normalize(context).replace(/\s+/g, "-").slice(0, 60);

    if (!roleFacts.some((f) => extractNumbers(f.text).length > 0)) {
      questions.push({
        id: `metrics:${slug}`,
        topic: "metrics",
        prompt: `At ${role.employer || "this job"}, what improved because of your work, and by how much?`,
        hint: "On-time delivery, safety incidents, cost per unit, turnover, inventory accuracy, dwell time — only numbers you can stand behind.",
        category: "accomplishment",
        context,
      });
    }
    if (!SCOPE_RE.test(text)) {
      questions.push({
        id: `scope:${slug}`,
        topic: "scope",
        prompt: `As ${role.title || "this role"}, how big was what you were responsible for?`,
        hint: "People or contractors you led, routes, facilities, square footage, fleet size, budget.",
        category: "scope",
        context,
      });
    }
    if (findVocabulary(text, [...SOFTWARE_VOCAB, ...OPERATIONS_VOCAB]).length === 0) {
      questions.push({
        id: `systems:${slug}`,
        topic: "systems",
        prompt: `Which systems, equipment or processes did you use at ${role.employer || "this job"}?`,
        hint: "WMS/TMS names, ERP, scanners, forklifts or other equipment, Lean or safety programs.",
        category: "operational_skill",
        context,
      });
    }
  }

  if (!facts.some((f) => f.category === "certification" || f.category === "license")) {
    questions.push({
      id: "credentials",
      topic: "credentials",
      prompt: "Do you hold any licenses or certifications?",
      hint: "CDL class and endorsements, forklift certification, OSHA 10/30, HAZMAT, APICS/ASCM, PMP, Six Sigma belts.",
      category: "certification",
    });
  }
  if (roles.length === 0) {
    questions.push({
      id: "history",
      topic: "history",
      prompt: "List a job you have held: title, employer, and dates.",
      hint: "Your resume did not give us a job history we could read. Start with the most recent.",
      category: "employment",
    });
  }
  questions.push({
    id: "examples",
    topic: "examples",
    prompt:
      "Describe a problem you solved at work that you would be proud to talk about in an interview.",
    hint: "What was happening, what you did, and what changed. This becomes interview material.",
    category: "accomplishment",
  });
  questions.push({
    id: "transferable",
    topic: "transferable",
    prompt:
      "What experience from outside your job titles would help in the roles you want?",
    hint: "Volunteer leadership, military service, coaching, a side business, training others.",
    category: "other",
  });
  return questions;
}

/**
 * Inferences the subscriber must confirm before they count.
 *
 * Example: a bullet says "trained 12 associates on RF scanners", and no skill
 * line mentions RF scanners. Proposing "RF scanner" as a skill is reasonable —
 * and still an inference, so it waits for a yes.
 */
export function proposeInterpretations(
  profileId: UUID,
  facts: readonly CareerFact[],
  existing: readonly Interpretation[],
): Interpretation[] {
  const stated = new Set(
    facts
      .filter((f) =>
        [
          "software",
          "technical_skill",
          "operational_skill",
          "certification",
          "license",
        ].includes(f.category),
      )
      .map((f) => normalize(f.text)),
  );
  const already = new Set(existing.map((i) => normalize(i.proposedText)));
  const proposals = new Map<string, { category: FactCategory; basis: CareerFact[] }>();

  for (const fact of facts) {
    if (fact.category !== "responsibility" && fact.category !== "accomplishment")
      continue;
    const found: [string, FactCategory][] = [
      ...findVocabulary(fact.text, SOFTWARE_VOCAB).map((t): [string, FactCategory] => [
        t,
        "software",
      ]),
      ...findVocabulary(fact.text, OPERATIONS_VOCAB).map(
        (t): [string, FactCategory] => [t, "operational_skill"],
      ),
      ...findVocabulary(fact.text, CERTIFICATION_VOCAB).map(
        (t): [string, FactCategory] => [t, "certification"],
      ),
    ];
    for (const [term, category] of found) {
      const key = normalize(term);
      if ([...stated].some((s) => s.includes(key))) continue;
      if (already.has(key)) continue;
      const entry = proposals.get(key) ?? { category, basis: [] };
      entry.basis.push(fact);
      proposals.set(key, entry);
    }
  }

  const timestamp = now();
  return [...proposals.entries()].map(([term, { category, basis }]) => ({
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId,
    category,
    proposedText: term.replace(/\b[a-z]/g, (c) => c.toUpperCase()),
    basisFactIds: basis.map((b) => b.id),
    basisText: basis.map((b) => b.text),
    reason:
      category === "certification"
        ? "Your experience mentions this credential, but it is not listed as one you hold. Confirm only if you actually hold it."
        : "Your experience mentions this, but it is not listed as a skill.",
    status: "pending",
    engine: "rules-engine",
  }));
}

/** Confirm an interpretation: it becomes a user-confirmed fact, and only then evidence. */
export function confirmInterpretation(
  interpretation: Interpretation,
  editedText?: string,
): { interpretation: Interpretation; fact: CareerFact } {
  const text = (editedText ?? interpretation.proposedText).trim();
  const fact = makeFact(interpretation.profileId, {
    category: interpretation.category,
    text,
    source: "user_confirmed",
    ...(interpretation.context === undefined
      ? {}
      : { context: interpretation.context }),
  });
  return {
    interpretation: {
      ...interpretation,
      status: "confirmed",
      confirmedFactId: fact.id,
      updatedAt: now(),
    },
    fact,
  };
}

/**
 * Correct an extracted fact. The corrected statement is the subscriber's own
 * word now, so it is stored as user-confirmed; numbers are re-extracted.
 */
export function correctFact(fact: CareerFact, text: string): CareerFact {
  const replacement = makeFact(fact.profileId, {
    category: fact.category,
    text,
    source: "user_confirmed",
    ...(fact.context === undefined ? {} : { context: fact.context }),
  });
  return { ...replacement, id: fact.id, createdAt: fact.createdAt };
}

// ---------------------------------------------------------------------------
// Base resume
// ---------------------------------------------------------------------------

function line(text: string, evidence: readonly CareerFact[]): BaseResumeLine {
  const verdict = validateClaim(text, { evidence });
  return {
    text,
    factIds: evidence.map((e) => e.id),
    validation: verdict.status,
    notes: verdict.notes,
  };
}

const EVIDENCE_CATEGORIES = new Set<FactCategory>([
  "responsibility",
  "accomplishment",
  "metric",
  "scope",
]);

/**
 * Draft a base resume from the master resume plus confirmed bank facts.
 *
 * Every bullet is a fact from the bank, quoted. Facts the subscriber added
 * about a role (scope, metrics) are placed under that role. Nothing is
 * paraphrased here — improvement comes from completeness and ordering, which
 * keeps the draft provably truthful; the subscriber edits wording afterwards
 * and every edit is re-validated.
 */
export function draftBaseResume(input: {
  readonly profileId: UUID;
  readonly resume: MasterResume;
  readonly facts: readonly CareerFact[];
  readonly versionNumber: number;
  readonly excludeFactIds?: readonly UUID[];
}): BaseResume {
  const { resume, facts } = input;
  const exclude = new Set(input.excludeFactIds ?? []);
  const parsed = resume.parsed;
  const usable = facts.filter((f) => f.source !== "generated_wording");
  const used = new Set<UUID>();

  const take = (f: CareerFact): boolean => {
    if (exclude.has(f.id)) return false;
    used.add(f.id);
    return true;
  };

  const roles: BaseResumeRole[] = parsed.experience.map((entry) => {
    const context = `${entry.employer} — ${entry.title}`.replace(/^ — | — $/, "");
    const roleFacts = usable.filter(
      (f) => f.context === context && EVIDENCE_CATEGORIES.has(f.category),
    );
    // Quantified accomplishments first: they are what a reader scans for.
    const ordered = [...roleFacts].sort(
      (a, b) => extractNumbers(b.text).length - extractNumbers(a.text).length,
    );
    const seen = new Set<string>();
    const bullets: BaseResumeLine[] = [];
    for (const fact of ordered) {
      const key = normalize(fact.text);
      if (seen.has(key) || !take(fact)) continue;
      seen.add(key);
      bullets.push(line(fact.text, [fact]));
    }
    return {
      title: entry.title,
      employer: entry.employer,
      ...(entry.location === undefined ? {} : { location: entry.location }),
      ...(entry.startDate === undefined ? {} : { startDate: entry.startDate }),
      ...(entry.endDate === undefined ? {} : { endDate: entry.endDate }),
      current: entry.current,
      bullets,
    };
  });

  const summaryFacts = usable.filter((f) => f.category === "summary" && take(f));
  const skillFacts = usable.filter(
    (f) =>
      ["software", "technical_skill", "operational_skill", "leadership_skill"].includes(
        f.category,
      ) && take(f),
  );
  const certFacts = usable.filter(
    (f) => (f.category === "certification" || f.category === "license") && take(f),
  );
  const headlineFact = usable.find(
    (f) => f.category === "headline" && !exclude.has(f.id),
  );
  if (headlineFact !== undefined) used.add(headlineFact.id);
  for (const f of usable)
    if (f.category === "employment" || f.category === "education") used.add(f.id);

  const dedupe = (items: string[]): string[] => {
    const seen = new Set<string>();
    return items.filter((i) => {
      const k = normalize(i);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const timestamp = now();
  return {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId: input.profileId,
    versionNumber: input.versionNumber,
    sourceResumeId: resume.id,
    status: "draft",
    fullName: parsed.fullName,
    headline: headlineFact?.text ?? parsed.headline,
    summary: summaryFacts.map((f) => line(f.text, [f])),
    skills: dedupe(skillFacts.map((f) => f.text)),
    roles,
    education: parsed.education,
    certifications: dedupe(certFacts.map((f) => f.text)),
    omittedFactIds: usable.filter((f) => !used.has(f.id)).map((f) => f.id),
  };
}

/**
 * Edit a bullet in a DRAFT. Approved versions are immutable; editing one
 * means drafting a new version first.
 */
export function editBaseResumeLine(
  base: BaseResume,
  roleIndex: number,
  bulletIndex: number,
  text: string,
  facts: readonly CareerFact[],
): BaseResume {
  if (base.status !== "draft") {
    throw new Error(
      "Approved base resumes are never edited in place. Start a new draft.",
    );
  }
  const byId = new Map(facts.map((f) => [f.id, f]));
  const roles = base.roles.map((role, r) =>
    r !== roleIndex
      ? role
      : {
          ...role,
          bullets: role.bullets.map((b, i) =>
            i !== bulletIndex
              ? b
              : line(
                  text.trim(),
                  b.factIds
                    .map((id) => byId.get(id))
                    .filter((f): f is CareerFact => f !== undefined),
                ),
          ),
        },
  );
  return { ...base, roles, updatedAt: now() };
}

/** Lines that block approval: anything the validator did not clear. */
export function blockingLines(base: BaseResume): BaseResumeLine[] {
  const all = [...base.summary, ...base.roles.flatMap((r) => r.bullets)];
  return all.filter(
    (l) => l.validation === "unsupported" || l.validation === "needs_confirmation",
  );
}

export function renderBaseResumeText(base: BaseResume, contact: string): string {
  const out: string[] = [base.fullName];
  if (base.headline.length > 0) out.push(base.headline);
  if (contact.length > 0) out.push(contact);
  if (base.summary.length > 0) {
    out.push("", "SUMMARY", ...base.summary.map((l) => l.text));
  }
  if (base.skills.length > 0) out.push("", "SKILLS", base.skills.join(", "));
  if (base.roles.length > 0) {
    out.push("", "EXPERIENCE");
    for (const role of base.roles) {
      const dates = [role.startDate, role.current ? "Present" : role.endDate]
        .filter((d): d is string => d !== undefined && d.length > 0)
        .join(" - ");
      out.push(
        "",
        [role.title, role.employer].filter((p) => p.length > 0).join(" | "),
        [role.location, dates]
          .filter((p): p is string => p !== undefined && p.length > 0)
          .join(" | "),
        ...role.bullets.map((b) => `- ${b.text}`),
      );
    }
  }
  if (base.education.length > 0) {
    out.push("", "EDUCATION");
    for (const e of base.education)
      out.push(
        [e.credential, e.institution, e.year]
          .filter((p): p is string => p !== undefined && p.length > 0)
          .join(" | "),
      );
  }
  if (base.certifications.length > 0)
    out.push("", "CERTIFICATIONS", ...base.certifications);
  return out.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

/**
 * Approve a draft. Refuses while any line is unsupported or unconfirmed, and
 * produces the master-resume record the tailoring engine reads, so tailored
 * applications start from what the subscriber approved — not the raw upload.
 */
export function approveBaseResume(
  base: BaseResume,
  contact: string,
  parsedFromText: (text: string) => ParsedResume,
): { base: BaseResume; master: MasterResume } {
  if (base.status !== "draft") throw new Error("Only a draft can be approved.");
  const blocking = blockingLines(base);
  if (blocking.length > 0) {
    throw new Error(
      `${blocking.length} line(s) are not supported by your experience bank. Fix or remove them before approving.`,
    );
  }
  const timestamp = now();
  const rawText = renderBaseResumeText(base, contact);
  const parsed = parsedFromText(rawText);
  const master: MasterResume = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId: base.profileId,
    label: `Approved base resume v${base.versionNumber}`,
    format: "paste",
    rawText,
    parsed,
    isDefault: true,
  };
  return {
    base: {
      ...base,
      status: "approved",
      approvedAt: timestamp,
      masterResumeId: master.id,
      updatedAt: timestamp,
    },
    master,
  };
}
