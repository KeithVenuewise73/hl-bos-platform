"use server";

/**
 * Every mutation in the HLG Career Platform journey.
 *
 * Pattern: validate, then mutate inside `updateWorkspace` so a failure leaves
 * nothing half-written, then redirect. Errors come back to the page as a
 * plain-English `?error=` message; the redirect happens outside any try block
 * so Next's redirect signal is never swallowed.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  analyzeJob,
  approveBaseResume,
  attachDrafts,
  buildPracticeSession,
  changeStage,
  completeFollowUp,
  confirmInterpretation,
  confirmSubmission,
  correctFact,
  decide,
  draftBaseResume,
  editBaseResumeLine,
  extractResumeText,
  factsFromResume,
  findDuplicate,
  generateCoverLetter,
  generateTailoredResume,
  makeFact,
  newId,
  newOpportunity,
  now,
  outreachDraft,
  parseJobPosting,
  parseResume,
  postDraft,
  profileRecommendations,
  proposeInterpretations,
  recordAttempt,
  runDiscovery,
  schedulePost,
  thankYouDraft,
  addFollowUp,
  addInterview,
  updateInterviewNotes,
  validateIntake,
  validateResumeUpload,
  assessFit,
  isIsoDate,
  BOARD_TOKEN_RE,
  contactLine,
  type BaseResume,
  type CandidateProfile,
  type CareerFact,
  type FactCategory,
  type JobPosting,
  type MasterResume,
  type Opportunity,
  type SourceId,
} from "@hl-bos/ats-resume";

import {
  LimitReached,
  boardFetchJson,
  formToRaw,
  meter,
  SUPPORTED_BOARD_SOURCES,
} from "./career.ts";
import {
  currentProfile,
  eraseAccountData,
  loadWorkspace,
  updateWorkspace,
} from "./store.ts";
import type { Workspace } from "./store/workspace.ts";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function messageOf(error: unknown): string {
  if (error instanceof LimitReached) return error.message;
  if (error instanceof Error && error.message.length > 0 && error.message.length < 300)
    return error.message;
  return "Something went wrong and nothing was saved. Please try again.";
}

function back(path: string, error: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(error)}`);
}

/** Run a mutation; on failure, return to `path` with the reason. Nothing is saved on failure. */
async function attempt<T>(path: string, fn: () => Promise<T>): Promise<T> {
  let failure: string | null = null;
  let result: T | undefined;
  try {
    result = await fn();
  } catch (error) {
    failure = messageOf(error);
  }
  if (failure !== null) back(path, failure);
  return result as T;
}

async function requireProfileId(): Promise<string> {
  const existing = await currentProfile();
  if (existing !== undefined && existing.isSample !== true) return existing.id;
  return updateWorkspace((ws) => {
    const real = ws.profiles.find((p) => p.isSample !== true);
    if (real !== undefined) return real.id;
    const timestamp = now();
    const profile: CandidateProfile = {
      id: newId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      userId: ws.userId,
      fullName: "",
      headline: "",
      summary: "",
      contact: {},
    };
    ws.profiles.push(profile);
    return profile.id;
  });
}

function findOpportunity(
  ws: Workspace,
  id: string,
  profileId: string,
): { index: number; opp: Opportunity } {
  const index = ws.opportunities.findIndex(
    (o) => o.id === id && o.profileId === profileId,
  );
  const opp = ws.opportunities[index];
  if (opp === undefined)
    throw new Error("That opportunity was not found in your account.");
  return { index, opp };
}

// ---------------------------------------------------------------------------
// 1. Intake
// ---------------------------------------------------------------------------

export async function saveIntake(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const raw = formToRaw(form);
  const outcome = await updateWorkspace((ws) => {
    const existing = ws.searchProfiles.find((s) => s.profileId === profileId);
    const result = validateIntake(profileId, raw, existing);
    if (!result.ok) return result;
    if (existing === undefined) ws.searchProfiles.push(result.profile);
    else ws.searchProfiles[ws.searchProfiles.indexOf(existing)] = result.profile;
    // Re-assess open matches against the edited preferences. Feedback never
    // becomes an exclusion silently: only what the subscriber typed changes.
    ws.opportunities = ws.opportunities.map((o) =>
      o.profileId !== profileId || o.submissionId !== undefined
        ? o
        : {
            ...o,
            fit: assessFit(
              {
                title: o.title,
                ...(o.location === undefined ? {} : { location: o.location }),
                ...(o.salaryText === undefined ? {} : { salaryText: o.salaryText }),
                description: o.descriptionSnapshot,
              },
              result.profile,
              o.fit?.qualificationScore === undefined
                ? undefined
                : {
                    score: o.fit.qualificationScore,
                    strengths: [],
                    gaps: [],
                    uncertain: [],
                  },
            ),
          },
    );
    return result;
  });
  if (!outcome.ok) {
    // Hand the typed values back so nothing has to be re-entered.
    const payload = Buffer.from(
      JSON.stringify({ errors: outcome.errors, values: raw }),
    ).toString("base64url");
    redirect(`/intake?state=${payload}`);
  }
  revalidatePath("/start");
  redirect("/intake?saved=1");
}

// ---------------------------------------------------------------------------
// 2. Experience bank and base resume
// ---------------------------------------------------------------------------

export async function uploadResume(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  let raw = text(form, "rawText");
  let format: MasterResume["format"] = "paste";
  const upload = form.get("file");
  if (upload instanceof File && upload.size > 0) {
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const problem = validateResumeUpload(upload.name, bytes);
    if (problem !== null) back("/experience", problem);
    const extracted = extractResumeText(Buffer.from(bytes), upload.name);
    if (extracted.text.trim().length === 0)
      back(
        "/experience",
        "No text could be read from that file. It may be a scanned image — paste the text instead.",
      );
    raw = extracted.text;
    format = upload.name.toLowerCase().endsWith(".pdf") ? "pdf" : "docx";
  }
  if (raw.length === 0) back("/experience", "Upload a resume or paste its text.");
  if (raw.length > 60_000)
    back(
      "/experience",
      "That resume is longer than 60,000 characters. Paste the main content only.",
    );

  await attempt("/experience", () =>
    updateWorkspace((ws) => {
      meter(ws, profileId, "resume_upload");
      const parsed = parseResume(raw);
      const timestamp = now();
      for (const [i, r] of ws.resumes.entries())
        if (r.profileId === profileId && r.isDefault)
          ws.resumes[i] = { ...r, isDefault: false };
      ws.resumes.push({
        id: newId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        profileId,
        label: `Uploaded resume ${timestamp.slice(0, 10)}`,
        format,
        rawText: raw,
        parsed,
        isDefault: true,
      });
      const known = new Set(
        ws.facts
          .filter((f) => f.profileId === profileId)
          .map((f) => `${f.context ?? ""}|${f.text}`),
      );
      ws.facts.push(
        ...factsFromResume(profileId, parsed).filter(
          (f) => !known.has(`${f.context ?? ""}|${f.text}`),
        ),
      );
      const pi = ws.profiles.findIndex((p) => p.id === profileId);
      const p = ws.profiles[pi];
      if (p !== undefined) {
        ws.profiles[pi] = {
          ...p,
          fullName: p.fullName || parsed.fullName,
          headline: p.headline || parsed.headline,
          contact: Object.keys(p.contact).length > 0 ? p.contact : parsed.contact,
          updatedAt: timestamp,
        };
      }
      const mine = ws.facts.filter((f) => f.profileId === profileId);
      ws.interpretations.push(
        ...proposeInterpretations(
          profileId,
          mine,
          ws.interpretations.filter((x) => x.profileId === profileId),
        ),
      );
    }),
  );
  revalidatePath("/experience");
  redirect("/experience?step=review");
}

export async function answerQuestion(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const answer = text(form, "answer");
  if (answer.length === 0) back("/experience", "Write an answer before saving.");
  if (answer.length > 2000)
    back("/experience", "Keep each answer under 2,000 characters.");
  const category = (text(form, "category") || "other") as FactCategory;
  const context = text(form, "context");
  await attempt("/experience", () =>
    updateWorkspace((ws) => {
      // The subscriber typed it, so it is their confirmed statement.
      ws.facts.push(
        makeFact(profileId, {
          category,
          text: answer,
          source: "user_confirmed",
          ...(context.length > 0 ? { context } : {}),
        }),
      );
    }),
  );
  revalidatePath("/experience");
  redirect(
    `/experience?answered=${encodeURIComponent(text(form, "questionId"))}#questions`,
  );
}

export async function editFact(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "factId");
  const value = text(form, "text");
  if (value.length === 0)
    back("/experience", "A fact cannot be empty. Use Remove instead.");
  await attempt("/experience", () =>
    updateWorkspace((ws) => {
      const i = ws.facts.findIndex((f) => f.id === id && f.profileId === profileId);
      const fact = ws.facts[i];
      if (fact === undefined) throw new Error("That fact was not found.");
      ws.facts[i] = correctFact(fact, value);
    }),
  );
  revalidatePath("/experience");
  redirect("/experience#bank");
}

export async function removeFact(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "factId");
  await updateWorkspace((ws) => {
    ws.facts = ws.facts.filter((f) => !(f.id === id && f.profileId === profileId));
  });
  revalidatePath("/experience");
  redirect("/experience#bank");
}

export async function resolveInterpretation(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "interpretationId");
  const decision = text(form, "decision");
  await attempt("/experience", () =>
    updateWorkspace((ws) => {
      const i = ws.interpretations.findIndex(
        (x) => x.id === id && x.profileId === profileId,
      );
      const item = ws.interpretations[i];
      if (item === undefined || item.status !== "pending")
        throw new Error("That suggestion was already handled.");
      if (decision === "confirm") {
        const edited = text(form, "text");
        const { interpretation, fact } = confirmInterpretation(
          item,
          edited.length > 0 ? edited : undefined,
        );
        ws.interpretations[i] = interpretation;
        ws.facts.push(fact);
      } else {
        ws.interpretations[i] = { ...item, status: "rejected", updatedAt: now() };
      }
    }),
  );
  revalidatePath("/experience");
  redirect("/experience#suggestions");
}

function contactFor(ws: Workspace, profileId: string): string {
  const p = ws.profiles.find((x) => x.id === profileId);
  return p === undefined ? "" : contactLine(p.contact);
}

export async function createBaseDraft(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const exclude = form
    .getAll("exclude")
    .filter((v): v is string => typeof v === "string");
  const id = await attempt("/experience", () =>
    updateWorkspace((ws) => {
      meter(ws, profileId, "base_resume_draft");
      const uploads = ws.resumes.filter(
        (r) => r.profileId === profileId && !r.label.startsWith("Approved base resume"),
      );
      const resume = uploads.find((r) => r.isDefault) ?? uploads[uploads.length - 1];
      if (resume === undefined)
        throw new Error("Upload or paste your current resume first.");
      const versions = ws.baseResumes.filter((b) => b.profileId === profileId);
      const draft = draftBaseResume({
        profileId,
        resume,
        facts: ws.facts.filter((f) => f.profileId === profileId),
        versionNumber: versions.reduce((m, b) => Math.max(m, b.versionNumber), 0) + 1,
        excludeFactIds: exclude,
      });
      ws.baseResumes.push(draft);
      return draft.id;
    }),
  );
  revalidatePath("/experience");
  redirect(`/experience/base/${id}`);
}

function findBase(
  ws: Workspace,
  id: string,
  profileId: string,
): { i: number; base: BaseResume } {
  const i = ws.baseResumes.findIndex((b) => b.id === id && b.profileId === profileId);
  const base = ws.baseResumes[i];
  if (base === undefined) throw new Error("That base resume version was not found.");
  return { i, base };
}

export async function editBaseLine(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "baseId");
  const path = `/experience/base/${id}`;
  const role = Number(text(form, "role"));
  const bullet = Number(text(form, "bullet"));
  const value = text(form, "text");
  const remove = text(form, "remove") === "1";
  await attempt(path, () =>
    updateWorkspace((ws) => {
      const { i, base } = findBase(ws, id, profileId);
      if (base.status !== "draft")
        throw new Error("Approved versions are never edited. Start a new draft.");
      if (remove) {
        const target = base.roles[role]?.bullets[bullet];
        ws.baseResumes[i] = {
          ...base,
          roles: base.roles.map((r, ri) =>
            ri !== role
              ? r
              : { ...r, bullets: r.bullets.filter((_, bi) => bi !== bullet) },
          ),
          omittedFactIds: [...base.omittedFactIds, ...(target?.factIds ?? [])],
          updatedAt: now(),
        };
        return;
      }
      if (value.length === 0)
        throw new Error("A line cannot be empty. Use Remove instead.");
      ws.baseResumes[i] = editBaseResumeLine(
        base,
        role,
        bullet,
        value,
        ws.facts.filter((f) => f.profileId === profileId),
      );
    }),
  );
  redirect(path);
}

/** "This edited line is true" — stored as a confirmed fact, then attached as its evidence. */
export async function confirmBaseLine(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "baseId");
  const path = `/experience/base/${id}`;
  const role = Number(text(form, "role"));
  const bullet = Number(text(form, "bullet"));
  await attempt(path, () =>
    updateWorkspace((ws) => {
      const { i, base } = findBase(ws, id, profileId);
      const target = base.roles[role]?.bullets[bullet];
      if (target === undefined || base.status !== "draft")
        throw new Error("That line can no longer be confirmed.");
      const r = base.roles[role];
      const fact: CareerFact = makeFact(profileId, {
        category: "accomplishment",
        text: target.text,
        source: "user_confirmed",
        ...(r === undefined
          ? {}
          : { context: `${r.employer} — ${r.title}`.replace(/^ — | — $/, "") }),
      });
      ws.facts.push(fact);
      ws.baseResumes[i] = {
        ...base,
        roles: base.roles.map((rr, ri) =>
          ri !== role
            ? rr
            : {
                ...rr,
                bullets: rr.bullets.map((b, bi) =>
                  bi !== bullet
                    ? b
                    : {
                        ...b,
                        factIds: [...b.factIds, fact.id],
                        validation: "user_confirmed" as const,
                        notes: [
                          "You confirmed this line is true. It is now in your experience bank.",
                        ],
                      },
                ),
              },
        ),
        updatedAt: now(),
      };
    }),
  );
  redirect(path);
}

export async function approveBase(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "baseId");
  const path = `/experience/base/${id}`;
  if (text(form, "confirm") !== "yes")
    back(path, "Tick the box to confirm you reviewed this resume and it is accurate.");
  await attempt(path, () =>
    updateWorkspace((ws) => {
      const { i, base } = findBase(ws, id, profileId);
      const { base: approved, master } = approveBaseResume(
        base,
        contactFor(ws, profileId),
        parseResume,
      );
      for (const [bi, b] of ws.baseResumes.entries())
        if (b.profileId === profileId && b.status === "approved")
          ws.baseResumes[bi] = { ...b, status: "superseded", updatedAt: now() };
      ws.baseResumes[i] = approved;
      for (const [ri, r] of ws.resumes.entries())
        if (r.profileId === profileId && r.isDefault)
          ws.resumes[ri] = { ...r, isDefault: false };
      ws.resumes.push(master);
    }),
  );
  revalidatePath("/experience");
  revalidatePath("/start");
  redirect(`${path}?approved=1`);
}

// ---------------------------------------------------------------------------
// 3. Discovery
// ---------------------------------------------------------------------------

export async function addBoard(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const source = text(form, "source");
  const token = text(form, "boardToken");
  const employer = text(form, "employer");
  if (!(SUPPORTED_BOARD_SOURCES as string[]).includes(source))
    back("/jobs", "Choose one of the supported job-board systems.");
  if (!BOARD_TOKEN_RE.test(token))
    back(
      "/jobs",
      "The board name may contain only letters, numbers, dots, dashes and underscores.",
    );
  if (employer.length === 0 || employer.length > 120)
    back("/jobs", "Enter the employer's name.");
  await updateWorkspace((ws) => {
    if (
      ws.employerBoards.some(
        (b) =>
          b.profileId === profileId &&
          b.source === source &&
          b.boardToken.toLowerCase() === token.toLowerCase(),
      )
    )
      return;
    const t = now();
    ws.employerBoards.push({
      id: newId(),
      createdAt: t,
      updatedAt: t,
      profileId,
      employer,
      source: source as Exclude<SourceId, "manual">,
      boardToken: token,
    });
  });
  revalidatePath("/jobs");
  redirect("/jobs#sources");
}

export async function removeBoard(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "boardId");
  await updateWorkspace((ws) => {
    ws.employerBoards = ws.employerBoards.filter(
      (b) => !(b.id === id && b.profileId === profileId),
    );
  });
  revalidatePath("/jobs");
  redirect("/jobs#sources");
}

export async function runSearch(): Promise<void> {
  const profileId = await requireProfileId();
  const summary = await attempt("/jobs", async () => {
    const snapshot = await loadWorkspace();
    const search = snapshot.searchProfiles.find((s) => s.profileId === profileId);
    if (search === undefined)
      throw new Error(
        "Complete your search profile first, so there is something to match against.",
      );
    const boards = snapshot.employerBoards.filter((b) => b.profileId === profileId);
    if (boards.length === 0)
      throw new Error(
        "Add at least one employer job board, or import a posting manually.",
      );
    // Network first, outside the write, so a slow board never holds a save open.
    const result = await runDiscovery({
      profileId,
      boards,
      criteria: search,
      existing: snapshot.opportunities.filter((o) => o.profileId === profileId),
      fetchJson: boardFetchJson,
    });
    await updateWorkspace((ws) => {
      meter(ws, profileId, "discovery_run");
      const updated = new Map(result.updated.map((o) => [o.id, o]));
      ws.opportunities = ws.opportunities.map((o) => updated.get(o.id) ?? o);
      ws.opportunities.push(...result.added);
      const t = now();
      ws.employerBoards = ws.employerBoards.map((b) => {
        const r = result.boards.find((x) => x.boardId === b.id);
        if (r === undefined) return b;
        const { lastError: _drop, ...rest } = b;
        return {
          ...rest,
          lastCheckedAt: t,
          lastResult: r.ok ? ("ok" as const) : ("failed" as const),
          lastCount: r.fetched,
          ...(r.error === undefined ? {} : { lastError: r.error }),
          updatedAt: t,
        };
      });
    });
    const failed = result.boards.filter((b) => !b.ok).length;
    return `added=${result.added.length}&dupes=${result.duplicates}&applied=${result.previouslyApplied}&expired=${result.expired}&failed=${failed}`;
  });
  revalidatePath("/jobs");
  redirect(`/jobs?ran=1&${summary}`);
}

export async function importJob(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const description = text(form, "description");
  const employer = text(form, "employer");
  const title = text(form, "title");
  const url = text(form, "url");
  if (description.length < 80)
    back("/jobs", "Paste the full job description (at least a few sentences).");
  if (description.length > 50_000)
    back("/jobs", "That description is too long. Paste the posting itself only.");
  if (url.length > 0 && !/^https?:\/\//i.test(url))
    back("/jobs", "The posting link must start with http:// or https://.");
  const postedAt = text(form, "postedAt");
  if (postedAt.length > 0 && !isIsoDate(postedAt))
    back("/jobs", "The posting date is not a real calendar date.");
  const location = text(form, "location").slice(0, 120);
  const parsed = parseJobPosting({
    rawText: description,
    ...(location ? { location } : {}),
    ...(employer ? { company: employer } : {}),
    ...(title ? { title } : {}),
  });
  const id = await attempt("/jobs", () =>
    updateWorkspace((ws) => {
      meter(ws, profileId, "job_import");
      const search = ws.searchProfiles.find((s) => s.profileId === profileId);
      const mine = ws.opportunities.filter((o) => o.profileId === profileId);
      const dup = findDuplicate(
        {
          employer: parsed.company,
          title: parsed.title,
          description,
          source: "manual",
        },
        mine,
      );
      if (dup.kind === "duplicate") {
        throw new Error(
          dup.previouslyApplied
            ? `You already applied to ${dup.of.title} at ${dup.of.employer}. It is in your pipeline.`
            : `This looks like ${dup.of.title} at ${dup.of.employer}, already in your list.`,
        );
      }
      const source = text(form, "foundOn");
      const opp = newOpportunity({
        profileId,
        source: "manual",
        employer: parsed.company,
        title: parsed.title,
        ...(parsed.location === undefined ? {} : { location: parsed.location }),
        ...(text(form, "salaryText")
          ? { salaryText: text(form, "salaryText") }
          : parsed.facets.compensation
            ? { salaryText: parsed.facets.compensation }
            : {}),
        ...(url ? { url } : {}),
        ...(postedAt ? { postedAt } : {}),
        description,
        foundVia: source.length > 0 ? source.slice(0, 80) : "Manual import",
      });
      ws.opportunities.push(
        search === undefined
          ? opp
          : {
              ...opp,
              fit: assessFit(
                {
                  title: opp.title,
                  ...(opp.location ? { location: opp.location } : {}),
                  ...(opp.salaryText ? { salaryText: opp.salaryText } : {}),
                  description,
                },
                search,
              ),
            },
      );
      return opp.id;
    }),
  );
  revalidatePath("/jobs");
  redirect(`/opportunities/${id}`);
}

export async function decideOpportunity(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "opportunityId");
  const decision = text(form, "decision");
  const returnTo = text(form, "returnTo") || `/opportunities/${id}`;
  if (decision !== "pursue" && decision !== "pass" && decision !== "save")
    back(returnTo, "Choose Pursue, Pass or Save for later.");
  const reasons = form
    .getAll("reason")
    .filter((v): v is string => typeof v === "string");
  const other = text(form, "otherReason");
  await attempt(returnTo, () =>
    updateWorkspace((ws) => {
      const { index, opp } = findOpportunity(ws, id, profileId);
      ws.opportunities[index] = decide(opp, decision, [
        ...reasons,
        ...(other ? [other.slice(0, 200)] : []),
      ]);
    }),
  );
  revalidatePath("/jobs");
  revalidatePath("/pipeline");
  redirect(returnTo);
}

// ---------------------------------------------------------------------------
// 4. Tailored package and submission
// ---------------------------------------------------------------------------

export async function generatePackage(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "opportunityId");
  const path = `/opportunities/${id}`;
  const motivation = text(form, "motivation");
  await attempt(path, () =>
    updateWorkspace((ws) => {
      const { index, opp } = findOpportunity(ws, id, profileId);
      if (opp.stage !== "pursuing" && opp.stage !== "documents_ready")
        throw new Error("Choose Pursue before preparing documents.");
      const approved = ws.baseResumes.find(
        (b) => b.profileId === profileId && b.status === "approved",
      );
      const master = ws.resumes.find((r) => r.id === approved?.masterResumeId);
      if (approved === undefined || master === undefined)
        throw new Error(
          "Approve your base resume first. Tailored documents start from the version you approved.",
        );
      const profile = ws.profiles.find((p) => p.id === profileId);
      if (profile === undefined) throw new Error("Your profile was not found.");
      meter(ws, profileId, "package_generation");

      const facts = ws.facts.filter((f) => f.profileId === profileId);
      let job: JobPosting | undefined = ws.jobs.find((j) => j.id === opp.jobPostingId);
      if (job === undefined) {
        const parsed = parseJobPosting({
          rawText: opp.descriptionSnapshot || `${opp.title}\n${opp.employer}`,
          company: opp.employer,
          title: opp.title,
          ...(opp.location ? { location: opp.location } : {}),
        });
        const t = now();
        job = {
          id: newId(),
          createdAt: t,
          updatedAt: t,
          profileId,
          company: opp.employer,
          title: opp.title,
          ...(opp.location ? { location: opp.location } : {}),
          ...(opp.url ? { url: opp.url } : {}),
          rawText: opp.descriptionSnapshot,
          facets: parsed.facets,
          requirements: parsed.requirements,
          keywords: parsed.keywords,
        };
        ws.jobs.push(job);
      }
      const analysis = analyzeJob({ profileId, resume: master, facts, job });
      ws.analyses.push(analysis);
      const priorVersions = opp.draftResumeIds.length;
      const resume = generateTailoredResume({
        profile,
        resume: master,
        facts,
        job,
        analysis,
        versionNumber: priorVersions + 1,
      });
      ws.generated.push(resume);
      const letter = generateCoverLetter({
        profile,
        job,
        analysis,
        facts,
        ...(motivation ? { motivation } : {}),
      });
      ws.coverLetters.push(letter);
      const search = ws.searchProfiles.find((s) => s.profileId === profileId);
      const strengths = analysis.matches
        .filter((m) => m.status === "strong_match" && m.evidence.length > 0)
        .slice(0, 3)
        .map((m) => m.evidence);
      const outreach = outreachDraft({
        opportunity: opp,
        strengths,
        fullName: profile.fullName,
        confidential: search?.confidential ?? false,
      });
      const strong = analysis.matches
        .filter((m) => m.status === "strong_match" || m.status === "terminology_match")
        .map((m) => m.requirement);
      // Qualification gaps: what the posting REQUIRES or PREFERS that the bank
      // does not evidence, required first. Duties listed under
      // "Responsibilities" are what the job does, not qualifications, so an
      // unmatched duty is reported as uncertain rather than as a gap.
      const requirementById = new Map(job.requirements.map((r) => [r.id, r]));
      const isDuty = (requirementId: string): boolean =>
        /responsibilit|duties|what you.ll do/i.test(
          requirementById.get(requirementId)?.sourceSection ?? "",
        );
      const rank = {
        critical: 0,
        important: 1,
        preferred: 2,
        informational: 3,
      } as const;
      // A REQUIRED qualification that is only partly met (an associate degree
      // against a bachelor's requirement) is a gap to be honest about too.
      const requiredPartial = (m: (typeof analysis.matches)[number]): boolean =>
        m.status === "partial_match" &&
        m.importance === "critical" &&
        !isDuty(m.requirementId);
      const gaps = analysis.matches
        .filter(
          (m) =>
            (m.status === "not_evidenced" &&
              m.importance !== "informational" &&
              !isDuty(m.requirementId)) ||
            requiredPartial(m),
        )
        .sort((a, b) => rank[a.importance] - rank[b.importance])
        .map(
          (m) =>
            `${m.status === "partial_match" ? "Only partly evidenced" : "Not evidenced"} (${m.importance === "critical" ? "required" : m.importance}): ${m.requirement}`,
        );
      const partial = [
        ...analysis.matches
          .filter((m) => m.status === "partial_match" && !requiredPartial(m))
          .map((m) => `Partly evidenced: ${m.requirement}`),
        ...analysis.matches
          .filter((m) => m.status === "not_evidenced" && isDuty(m.requirementId))
          .map((m) => `Duty not clearly shown in your experience: ${m.requirement}`),
      ];
      const withDrafts = attachDrafts(
        { ...opp, jobPostingId: job.id, analysisId: analysis.id },
        { resumeId: resume.id, coverLetterId: letter.id, outreach },
      );
      ws.opportunities[index] =
        search === undefined
          ? withDrafts
          : {
              ...withDrafts,
              fit: assessFit(
                {
                  title: opp.title,
                  ...(opp.location ? { location: opp.location } : {}),
                  ...(opp.salaryText ? { salaryText: opp.salaryText } : {}),
                  description: opp.descriptionSnapshot,
                },
                search,
                {
                  score: Math.round(analysis.scoreBefore.overall),
                  strengths: strong,
                  gaps,
                  uncertain: partial,
                },
              ),
            };
    }),
  );
  revalidatePath(path);
  redirect(`${path}?generated=1#documents`);
}

export async function confirmSubmitted(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "opportunityId");
  const path = `/opportunities/${id}`;
  if (text(form, "confirm") !== "yes")
    back(path, "Tick the box to confirm you actually submitted this application.");
  const resumeId = text(form, "resumeId");
  const letterId = text(form, "coverLetterId");
  await attempt(path, () =>
    updateWorkspace((ws) => {
      const { index, opp } = findOpportunity(ws, id, profileId);
      const resume = ws.generated.find(
        (g) => g.id === resumeId && g.profileId === profileId,
      );
      if (resume === undefined) throw new Error("Choose the resume you submitted.");
      const letter =
        letterId.length === 0
          ? undefined
          : ws.coverLetters.find((l) => l.id === letterId && l.profileId === profileId);
      if (letterId.length > 0 && letter === undefined)
        throw new Error("That cover letter was not found.");
      const { opportunity, submission } = confirmSubmission({
        opportunity: opp,
        resume,
        ...(letter === undefined ? {} : { coverLetter: letter }),
        submittedOn: text(form, "submittedOn"),
        submittedVia: text(form, "submittedVia"),
      });
      ws.opportunities[index] = opportunity;
      ws.submissions.push(submission);
    }),
  );
  revalidatePath(path);
  revalidatePath("/pipeline");
  redirect(`${path}?submitted=1#submitted`);
}

export async function updateOpportunity(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "opportunityId");
  const op = text(form, "op");
  const path = `/opportunities/${id}`;
  await attempt(path, () =>
    updateWorkspace((ws) => {
      const { index, opp } = findOpportunity(ws, id, profileId);
      let next: Opportunity;
      switch (op) {
        case "stage":
          if (text(form, "stage") === "")
            throw new Error("Choose the new status first.");
          next = changeStage(
            opp,
            text(form, "stage"),
            text(form, "note").slice(0, 300),
          );
          if (text(form, "outcome"))
            next = { ...next, outcome: text(form, "outcome").slice(0, 500) };
          break;
        case "contact": {
          const name = text(form, "name");
          if (name.length === 0) throw new Error("Enter the contact's name.");
          const email = text(form, "email");
          if (email.length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
            throw new Error("That email address does not look right.");
          next = {
            ...opp,
            contacts: [
              ...opp.contacts,
              {
                id: newId(),
                name: name.slice(0, 120),
                ...(text(form, "role")
                  ? { role: text(form, "role").slice(0, 120) }
                  : {}),
                ...(email ? { email } : {}),
                ...(text(form, "phone")
                  ? { phone: text(form, "phone").slice(0, 40) }
                  : {}),
              },
            ],
            updatedAt: now(),
          };
          break;
        }
        case "interview":
          next = addInterview(opp, {
            label: text(form, "label"),
            date: text(form, "date"),
            format: text(form, "format"),
          });
          break;
        case "interviewNotes":
          next = updateInterviewNotes(opp, text(form, "roundId"), text(form, "notes"));
          break;
        case "thankYou": {
          const round = opp.interviews.find((r) => r.id === text(form, "roundId"));
          if (round === undefined)
            throw new Error("That interview round was not found.");
          const name = ws.profiles.find((p) => p.id === profileId)?.fullName ?? "";
          next = {
            ...opp,
            interviews: opp.interviews.map((r) =>
              r.id === round.id
                ? { ...r, thankYouDraft: thankYouDraft(opp, round, name) }
                : r,
            ),
            updatedAt: now(),
          };
          break;
        }
        case "followUp":
          next = addFollowUp(opp, text(form, "due"), text(form, "action"));
          break;
        case "followUpDone":
          next = completeFollowUp(opp, text(form, "followUpId"));
          break;
        case "notes":
          next = {
            ...opp,
            notes: text(form, "notes").slice(0, 10_000),
            updatedAt: now(),
          };
          break;
        default:
          throw new Error("Unknown change.");
      }
      ws.opportunities[index] = next;
    }),
  );
  revalidatePath(path);
  revalidatePath("/pipeline");
  redirect(`${path}#${op}`);
}

// ---------------------------------------------------------------------------
// 6. Interview practice
// ---------------------------------------------------------------------------

export async function startPractice(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "opportunityId");
  const path = `/opportunities/${id}/practice`;
  const sessionId = await attempt(path, () =>
    updateWorkspace((ws) => {
      const { opp } = findOpportunity(ws, id, profileId);
      const submission = ws.submissions.find((s) => s.id === opp.submissionId);
      if (submission === undefined)
        throw new Error(
          "Practice uses the exact package you submitted. Confirm your submission first.",
        );
      const job = ws.jobs.find((j) => j.id === opp.jobPostingId);
      const analysis = ws.analyses.find((a) => a.id === opp.analysisId);
      if (job === undefined || analysis === undefined)
        throw new Error("The analysis for this application is missing.");
      const session = buildPracticeSession({
        submission,
        job,
        analysis,
        facts: ws.facts.filter((f) => f.profileId === profileId),
        round: text(form, "round") || "Interview",
      });
      ws.practiceSessions.push(session);
      return session.id;
    }),
  );
  redirect(`${path}?session=${sessionId}`);
}

export async function answerPractice(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "opportunityId");
  const sessionId = text(form, "sessionId");
  const questionId = text(form, "questionId");
  const path = `/opportunities/${id}/practice?session=${sessionId}&q=${encodeURIComponent(questionId)}`;
  const answer = (() => {
    const v = form.get("answer");
    return typeof v === "string" ? v : "";
  })();
  await attempt(path, () =>
    updateWorkspace((ws) => {
      const i = ws.practiceSessions.findIndex(
        (s) => s.id === sessionId && s.profileId === profileId,
      );
      const session = ws.practiceSessions[i];
      if (session === undefined)
        throw new Error("That practice session was not found.");
      meter(ws, profileId, "practice_answer");
      ws.practiceSessions[i] = recordAttempt(
        session,
        questionId,
        answer,
        ws.facts.filter((f) => f.profileId === profileId),
      );
    }),
  );
  redirect(`${path}#feedback`);
}

// ---------------------------------------------------------------------------
// 7. LinkedIn
// ---------------------------------------------------------------------------

export async function generateLinkedIn(): Promise<void> {
  const profileId = await requireProfileId();
  await attempt("/linkedin", () =>
    updateWorkspace((ws) => {
      const base = ws.baseResumes.find(
        (b) => b.profileId === profileId && b.status === "approved",
      );
      if (base === undefined)
        throw new Error(
          "Approve your base resume first. LinkedIn suggestions are built from it.",
        );
      meter(ws, profileId, "linkedin_generation");
      const search = ws.searchProfiles.find((s) => s.profileId === profileId);
      // Replace unreviewed suggestions; keep anything accepted and every post.
      ws.linkedinItems = ws.linkedinItems.filter(
        (x) =>
          !(x.profileId === profileId && x.kind !== "post" && x.status === "suggested"),
      );
      ws.linkedinItems.push(
        ...profileRecommendations({
          profileId,
          base,
          facts: ws.facts.filter((f) => f.profileId === profileId),
          ...(search ? { search } : {}),
        }),
      );
    }),
  );
  revalidatePath("/linkedin");
  redirect("/linkedin#profile");
}

export async function updateLinkedInItem(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const id = text(form, "itemId");
  const op = text(form, "op");
  await attempt("/linkedin", () =>
    updateWorkspace((ws) => {
      const i = ws.linkedinItems.findIndex(
        (x) => x.id === id && x.profileId === profileId,
      );
      const item = ws.linkedinItems[i];
      if (item === undefined) throw new Error("That item was not found.");
      if (op === "schedule")
        ws.linkedinItems[i] = schedulePost(item, text(form, "date"));
      else if (op === "published")
        ws.linkedinItems[i] = {
          ...item,
          status: "published_manually",
          updatedAt: now(),
        };
      else if (op === "accept")
        ws.linkedinItems[i] = { ...item, status: "accepted", updatedAt: now() };
      else if (op === "dismiss")
        ws.linkedinItems[i] = { ...item, status: "dismissed", updatedAt: now() };
      else if (op === "edit") {
        const value = text(form, "text");
        if (value.length === 0) throw new Error("A draft cannot be empty.");
        ws.linkedinItems[i] = { ...item, text: value.slice(0, 3000), updatedAt: now() };
      } else throw new Error("Unknown change.");
    }),
  );
  revalidatePath("/linkedin");
  redirect("/linkedin#calendar");
}

export async function createPost(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  await attempt("/linkedin", () =>
    updateWorkspace((ws) => {
      meter(ws, profileId, "linkedin_generation");
      ws.linkedinItems.push(
        postDraft(profileId, {
          topic: text(form, "topic").slice(0, 120),
          story: text(form, "story").slice(0, 2500),
          lesson: text(form, "lesson").slice(0, 1000),
        }),
      );
    }),
  );
  revalidatePath("/linkedin");
  redirect("/linkedin#calendar");
}

// ---------------------------------------------------------------------------
// 8. Account
// ---------------------------------------------------------------------------

/**
 * Delete everything this account holds. Local mode: the account's store is
 * emptied. Signed-in mode: every row the user owns is deleted under their own
 * row-level security. Deleting the sign-in itself needs a service-side call
 * this app does not hold (see the account page).
 */
export async function deleteAllMyData(form: FormData): Promise<void> {
  if (text(form, "confirm") !== "DELETE")
    back("/account", "Type DELETE in capitals to confirm.");
  const removed = await attempt("/account", () => eraseAccountData());
  revalidatePath("/");
  redirect(`/account?deleted=${removed}`);
}
