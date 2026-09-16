"use server";

/**
 * Every mutation in the app.
 *
 * Server actions rather than API routes, for a reason that matters to this
 * product: the forms work without JavaScript. A career database that stops
 * saving because a bundle failed to load is a career database that loses work.
 *
 * Two rules hold throughout this file:
 *
 *   1. Facts a user types in are stored with `source: "user_confirmed"` —
 *      real evidence, distinguishable from what was read off their resume.
 *   2. Anything the app generates is re-validated on every edit. Editing a
 *      generated sentence in the review screen re-runs the claim validator
 *      against the same evidence, so a user's own edit can move a line from
 *      Verified to Needs confirmation. That is correct: the check is on the
 *      sentence, not on who typed it.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  analyzeJob,
  buildDemoDataset,
  extractResumeText,
  factsFromResume,
  generateCoverLetter,
  generateInterviewPrep,
  generateTailoredResume,
  makeFact,
  newId,
  now,
  parseJobPosting,
  parseResume,
  usableKeywords,
  validateClaim,
  type Application,
  type ApplicationStatus,
  type CandidateProfile,
  type CareerFact,
  type FactCategory,
  type GeneratedLine,
  type GeneratedResume,
  type JobPosting,
  type MasterResume,
} from "@hl-bos/ats-resume";

import { currentProfile, loadWorkspace, updateWorkspace } from "./store.ts";
import { licensedTermsFor } from "./analysis-helpers.ts";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(form: FormData, key: string): string | undefined {
  const value = text(form, key);
  return value.length === 0 ? undefined : value;
}

async function requireProfileId(): Promise<string> {
  const profile = await currentProfile();
  if (profile !== undefined) return profile.id;
  return createEmptyProfile();
}

async function createEmptyProfile(): Promise<string> {
  return updateWorkspace((workspace) => {
    const timestamp = now();
    const profile: CandidateProfile = {
      id: newId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      userId: workspace.userId,
      fullName: "",
      headline: "",
      summary: "",
      contact: {},
    };
    workspace.profiles.push(profile);
    return profile.id;
  });
}

// ---------------------------------------------------------------------------
// Candidate profile
// ---------------------------------------------------------------------------

export async function saveProfile(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  await updateWorkspace((workspace) => {
    const index = workspace.profiles.findIndex((p) => p.id === profileId);
    const existing = workspace.profiles[index];
    if (existing === undefined) return;
    workspace.profiles[index] = {
      ...existing,
      fullName: text(form, "fullName"),
      headline: text(form, "headline"),
      summary: text(form, "summary"),
      contact: {
        ...(optional(form, "email") === undefined
          ? {}
          : { email: text(form, "email") }),
        ...(optional(form, "phone") === undefined
          ? {}
          : { phone: text(form, "phone") }),
        ...(optional(form, "location") === undefined
          ? {}
          : { location: text(form, "location") }),
        ...(optional(form, "linkedin") === undefined
          ? {}
          : { linkedin: text(form, "linkedin") }),
        ...(optional(form, "website") === undefined
          ? {}
          : { website: text(form, "website") }),
      },
      updatedAt: now(),
    };
  });
  revalidatePath("/profile");
  revalidatePath("/");
}

/**
 * Add a career fact the user knows but the resume does not say.
 *
 * This is the ONLY way a new claim enters the system. It is stored as
 * `user_confirmed`, which makes it usable as evidence and keeps it visibly
 * distinct from what the resume itself says.
 */
export async function addCareerFact(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const body = text(form, "text");
  if (body.length === 0) return;
  await updateWorkspace((workspace) => {
    workspace.facts.push(
      makeFact(profileId, {
        category: (text(form, "category") || "other") as FactCategory,
        text: body,
        source: "user_confirmed",
        ...(optional(form, "context") === undefined
          ? {}
          : { context: text(form, "context") }),
      }),
    );
  });
  revalidatePath("/profile");
}

export async function deleteCareerFact(form: FormData): Promise<void> {
  const id = text(form, "factId");
  await updateWorkspace((workspace) => {
    const index = workspace.facts.findIndex((f) => f.id === id);
    if (index >= 0) workspace.facts.splice(index, 1);
  });
  revalidatePath("/profile");
}

// ---------------------------------------------------------------------------
// Master resume
// ---------------------------------------------------------------------------

/**
 * Take in a resume: pasted text, or an uploaded DOCX/PDF.
 *
 * Extraction is never trusted silently. The extracted text is stored as the
 * raw source, and the Master Resume screen shows it in an editable box with
 * the extractor's own quality verdict next to it.
 */
export async function saveMasterResume(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  let raw = text(form, "rawText");
  let format: MasterResume["format"] = "paste";
  const notes: string[] = [];

  const upload = form.get("file");
  if (upload instanceof File && upload.size > 0) {
    const buffer = Buffer.from(await upload.arrayBuffer());
    const extracted = extractResumeText(buffer, upload.name);
    if (extracted.text.trim().length > 0) {
      raw = extracted.text;
      format = upload.name.toLowerCase().endsWith(".pdf") ? "pdf" : "docx";
      notes.push(...extracted.notes);
    } else {
      notes.push(...extracted.notes);
    }
  }

  if (raw.trim().length === 0) {
    redirect("/master-resume?error=empty");
  }

  const parsed = parseResume(raw);
  const label =
    optional(form, "label") ?? `Master resume ${new Date().toISOString().slice(0, 10)}`;

  const resumeId = await updateWorkspace((workspace) => {
    const timestamp = now();
    const resume: MasterResume = {
      id: newId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      profileId,
      label,
      format,
      rawText: raw,
      parsed,
      isDefault: true,
    };
    for (const [index, existing] of workspace.resumes.entries()) {
      if (existing.profileId === profileId && existing.isDefault) {
        workspace.resumes[index] = { ...existing, isDefault: false };
      }
    }
    workspace.resumes.push(resume);

    // The resume's own lines become the evidence corpus. Facts from a previous
    // version of this resume are kept: the user may have confirmed things
    // against them, and deleting evidence silently is how a tool loses trust.
    workspace.facts.push(...factsFromResume(profileId, parsed));

    // Fill in profile details the user has not set yet, without overwriting
    // anything they typed themselves.
    const profileIndex = workspace.profiles.findIndex((p) => p.id === profileId);
    const profile = workspace.profiles[profileIndex];
    if (profile !== undefined) {
      workspace.profiles[profileIndex] = {
        ...profile,
        fullName: profile.fullName.length > 0 ? profile.fullName : parsed.fullName,
        headline: profile.headline.length > 0 ? profile.headline : parsed.headline,
        summary:
          profile.summary.length > 0 ? profile.summary : parsed.summary.join(" "),
        contact:
          Object.keys(profile.contact).length > 0 ? profile.contact : parsed.contact,
        updatedAt: timestamp,
      };
    }
    return resume.id;
  });

  revalidatePath("/master-resume");
  revalidatePath("/profile");
  revalidatePath("/");
  redirect(`/master-resume?saved=${resumeId}`);
}

export async function setDefaultResume(form: FormData): Promise<void> {
  const resumeId = text(form, "resumeId");
  await updateWorkspace((workspace) => {
    const target = workspace.resumes.find((r) => r.id === resumeId);
    if (target === undefined) return;
    for (const [index, resume] of workspace.resumes.entries()) {
      if (resume.profileId !== target.profileId) continue;
      workspace.resumes[index] = { ...resume, isDefault: resume.id === resumeId };
    }
  });
  revalidatePath("/master-resume");
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export async function analyzeNewJob(form: FormData): Promise<void> {
  const profileId = await requireProfileId();
  const workspace = await loadWorkspace();
  const raw = text(form, "jobText");
  if (raw.length === 0) redirect("/analyze?error=empty");

  const resumeId = optional(form, "resumeId");
  const resumes = workspace.resumes.filter((r) => r.profileId === profileId);
  const resume =
    resumes.find((r) => r.id === resumeId) ??
    resumes.find((r) => r.isDefault) ??
    resumes[resumes.length - 1];
  if (resume === undefined) redirect("/master-resume?error=no-resume");

  const parsedJob = parseJobPosting({
    rawText: raw,
    ...(optional(form, "company") === undefined
      ? {}
      : { company: text(form, "company") }),
    ...(optional(form, "title") === undefined ? {} : { title: text(form, "title") }),
    ...(optional(form, "location") === undefined
      ? {}
      : { location: text(form, "location") }),
  });

  const analysisId = await updateWorkspace((ws) => {
    const timestamp = now();
    const job: JobPosting = {
      id: newId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      profileId,
      company: parsedJob.company,
      title: parsedJob.title,
      ...(parsedJob.location === undefined ? {} : { location: parsedJob.location }),
      ...(optional(form, "url") === undefined ? {} : { url: text(form, "url") }),
      rawText: raw,
      facets: parsedJob.facets,
      requirements: parsedJob.requirements,
      keywords: parsedJob.keywords,
    };
    ws.jobs.push(job);

    const facts = ws.facts.filter((f) => f.profileId === profileId);
    const analysis = analyzeJob({ profileId, resume, facts, job });
    ws.analyses.push(analysis);

    // An analysis is the start of an application, so the tracker records it
    // immediately rather than waiting for the user to remember.
    const application: Application = {
      id: newId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      profileId,
      company: job.company,
      role: job.title,
      ...(job.url === undefined ? {} : { jobUrl: job.url }),
      jobPostingId: job.id,
      analysisId: analysis.id,
      dateAnalyzed: timestamp.slice(0, 10),
      status: "researching",
      interviewDates: [],
      notes: "",
    };
    ws.applications.push(application);
    return analysis.id;
  });

  revalidatePath("/");
  revalidatePath("/applications");
  redirect(`/analyses/${analysisId}`);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export async function generateResume(form: FormData): Promise<void> {
  const analysisId = text(form, "analysisId");
  const workspace = await loadWorkspace();
  const analysis = workspace.analyses.find((a) => a.id === analysisId);
  if (analysis === undefined) redirect("/?error=missing-analysis");

  const profile = workspace.profiles.find((p) => p.id === analysis.profileId);
  const resume = workspace.resumes.find((r) => r.id === analysis.resumeId);
  const job = workspace.jobs.find((j) => j.id === analysis.jobPostingId);
  if (profile === undefined || resume === undefined || job === undefined) {
    redirect(`/analyses/${analysisId}?error=missing-inputs`);
  }

  const generatedId = await updateWorkspace((ws) => {
    const facts = ws.facts.filter((f) => f.profileId === analysis.profileId);
    const priorVersions = ws.generated.filter(
      (g) => g.analysisId === analysis.id,
    ).length;
    const generated = generateTailoredResume({
      profile,
      resume,
      facts,
      job,
      analysis,
      versionNumber: priorVersions + 1,
    });
    ws.generated.push(generated);

    const applicationIndex = ws.applications.findIndex(
      (a) => a.analysisId === analysis.id,
    );
    const application = ws.applications[applicationIndex];
    if (application !== undefined) {
      ws.applications[applicationIndex] = {
        ...application,
        generatedResumeId: generated.id,
        status:
          application.status === "researching" ? "resume_created" : application.status,
        updatedAt: now(),
      };
    }
    return generated.id;
  });

  revalidatePath("/library");
  revalidatePath("/applications");
  redirect(`/resumes/${generatedId}`);
}

/**
 * Edit one generated sentence.
 *
 * The edited text is re-validated against the same evidence as the original.
 * A user editing their own resume can absolutely write something the evidence
 * does not support — and when they do, the line is marked Needs confirmation
 * and stops being exportable until they resolve it.
 */
export async function editGeneratedLine(form: FormData): Promise<void> {
  const resumeId = text(form, "resumeId");
  const lineId = text(form, "lineId");
  const newText = text(form, "text");
  if (newText.length === 0) return;

  await updateWorkspace((workspace) => {
    const index = workspace.generated.findIndex((g) => g.id === resumeId);
    const generated = workspace.generated[index];
    if (generated === undefined) return;
    const analysis = workspace.analyses.find((a) => a.id === generated.analysisId);
    const facts = workspace.facts.filter((f) => f.profileId === generated.profileId);
    const factsById = new Map(facts.map((f) => [f.id, f]));
    const licensed = analysis === undefined ? [] : licensedTermsFor(analysis);

    const revalidate = (line: GeneratedLine): GeneratedLine => {
      if (line.id !== lineId) return line;
      const evidence = line.evidenceFactIds
        .map((id) => factsById.get(id))
        .filter((f): f is CareerFact => f !== undefined);
      const verdict = validateClaim(newText, { evidence, licensedTerms: licensed });
      return {
        ...line,
        text: newText,
        originalText: line.originalText ?? line.text,
        rationale: "Edited by you.",
        validation: verdict.status,
        validationNotes: verdict.notes,
      };
    };

    workspace.generated[index] = {
      ...generated,
      headline: revalidate(generated.headline),
      summary: generated.summary.map(revalidate),
      experience: generated.experience.map((entry) => ({
        ...entry,
        bullets: entry.bullets.map(revalidate),
      })),
      updatedAt: now(),
    };
  });

  revalidatePath(`/resumes/${resumeId}`);
}

/**
 * Confirm a flagged line.
 *
 * This is a real decision with a real consequence: the user is asserting the
 * sentence is true, and it becomes exportable. So the sentence is stored as a
 * user-confirmed CAREER FACT as well, and attached to the line as its
 * evidence — the claim stops being unsupported because supporting evidence now
 * exists, not because a flag was flipped.
 */
export async function confirmGeneratedLine(form: FormData): Promise<void> {
  const resumeId = text(form, "resumeId");
  const lineId = text(form, "lineId");

  await updateWorkspace((workspace) => {
    const index = workspace.generated.findIndex((g) => g.id === resumeId);
    const generated = workspace.generated[index];
    if (generated === undefined) return;

    let confirmed: CareerFact | undefined;
    const confirm = (line: GeneratedLine): GeneratedLine => {
      if (line.id !== lineId) return line;
      confirmed = makeFact(generated.profileId, {
        category: "other",
        text: line.text,
        source: "user_confirmed",
        ...(line.section === "experience"
          ? { context: "Confirmed on a tailored resume" }
          : {}),
      });
      return {
        ...line,
        evidenceFactIds: [...line.evidenceFactIds, confirmed.id],
        evidenceText: [...line.evidenceText, confirmed.text],
        validation: "user_confirmed",
        validationNotes: [
          "You confirmed this sentence is true. It is now stored in your profile as a confirmed career fact.",
        ],
      };
    };

    const updated: GeneratedResume = {
      ...generated,
      headline: confirm(generated.headline),
      summary: generated.summary.map(confirm),
      experience: generated.experience.map((entry) => ({
        ...entry,
        bullets: entry.bullets.map(confirm),
      })),
      updatedAt: now(),
    };
    workspace.generated[index] = updated;
    if (confirmed !== undefined) workspace.facts.push(confirmed);
  });

  revalidatePath(`/resumes/${resumeId}`);
  revalidatePath("/profile");
}

// ---------------------------------------------------------------------------
// Cover letter and interview prep
// ---------------------------------------------------------------------------

export async function createCoverLetter(form: FormData): Promise<void> {
  const analysisId = text(form, "analysisId");
  const workspace = await loadWorkspace();
  const analysis = workspace.analyses.find((a) => a.id === analysisId);
  const job = workspace.jobs.find((j) => j.id === analysis?.jobPostingId);
  const profile = workspace.profiles.find((p) => p.id === analysis?.profileId);
  if (analysis === undefined || job === undefined || profile === undefined) return;

  await updateWorkspace((ws) => {
    const facts = ws.facts.filter((f) => f.profileId === analysis.profileId);
    const letter = generateCoverLetter({
      profile,
      job,
      analysis,
      facts,
      ...(optional(form, "motivation") === undefined
        ? {}
        : { motivation: text(form, "motivation") }),
      ...(optional(form, "recipient") === undefined
        ? {}
        : { recipientName: text(form, "recipient") }),
    });
    const existing = ws.coverLetters.findIndex((l) => l.analysisId === analysisId);
    if (existing >= 0) ws.coverLetters[existing] = letter;
    else ws.coverLetters.push(letter);

    const applicationIndex = ws.applications.findIndex(
      (a) => a.analysisId === analysisId,
    );
    const application = ws.applications[applicationIndex];
    if (application !== undefined) {
      ws.applications[applicationIndex] = {
        ...application,
        coverLetterId: letter.id,
        updatedAt: now(),
      };
    }
  });
  revalidatePath(`/analyses/${analysisId}/cover-letter`);
}

export async function createInterviewPrep(form: FormData): Promise<void> {
  const analysisId = text(form, "analysisId");
  const workspace = await loadWorkspace();
  const analysis = workspace.analyses.find((a) => a.id === analysisId);
  const job = workspace.jobs.find((j) => j.id === analysis?.jobPostingId);
  if (analysis === undefined || job === undefined) return;

  await updateWorkspace((ws) => {
    const facts = ws.facts.filter((f) => f.profileId === analysis.profileId);
    const prep = generateInterviewPrep({
      profileId: analysis.profileId,
      job,
      analysis,
      facts,
    });
    const existing = ws.interviewPreps.findIndex((p) => p.analysisId === analysisId);
    if (existing >= 0) ws.interviewPreps[existing] = prep;
    else ws.interviewPreps.push(prep);
  });
  revalidatePath(`/analyses/${analysisId}/interview-prep`);
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function saveApplication(form: FormData): Promise<void> {
  const id = text(form, "applicationId");
  await updateWorkspace((workspace) => {
    const index = workspace.applications.findIndex((a) => a.id === id);
    const existing = workspace.applications[index];
    if (existing === undefined) return;
    const interviewDates = text(form, "interviewDates")
      .split(/[,\n]/)
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    workspace.applications[index] = {
      ...existing,
      status: (text(form, "status") || existing.status) as ApplicationStatus,
      ...(optional(form, "dateApplied") === undefined
        ? {}
        : { dateApplied: text(form, "dateApplied") }),
      ...(optional(form, "recruiterName") === undefined
        ? {}
        : { recruiterName: text(form, "recruiterName") }),
      ...(optional(form, "recruiterContact") === undefined
        ? {}
        : { recruiterContact: text(form, "recruiterContact") }),
      ...(optional(form, "jobUrl") === undefined
        ? {}
        : { jobUrl: text(form, "jobUrl") }),
      interviewDates,
      notes: text(form, "notes"),
      updatedAt: now(),
    };
  });
  revalidatePath("/applications");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function removeSampleData(): Promise<void> {
  await updateWorkspace((workspace) => {
    const sampleProfiles = new Set(
      workspace.profiles.filter((p) => p.isSample === true).map((p) => p.id),
    );
    workspace.profiles = workspace.profiles.filter((p) => p.isSample !== true);
    workspace.facts = workspace.facts.filter((f) => !sampleProfiles.has(f.profileId));
    workspace.resumes = workspace.resumes.filter(
      (r) => !sampleProfiles.has(r.profileId),
    );
    workspace.jobs = workspace.jobs.filter((j) => !sampleProfiles.has(j.profileId));
    workspace.analyses = workspace.analyses.filter(
      (a) => !sampleProfiles.has(a.profileId),
    );
    workspace.generated = workspace.generated.filter(
      (g) => !sampleProfiles.has(g.profileId),
    );
    workspace.applications = workspace.applications.filter(
      (a) => !sampleProfiles.has(a.profileId),
    );
    workspace.coverLetters = workspace.coverLetters.filter(
      (l) => !sampleProfiles.has(l.profileId),
    );
    workspace.interviewPreps = workspace.interviewPreps.filter(
      (p) => !sampleProfiles.has(p.profileId),
    );
  });
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/settings");
}

export async function restoreSampleData(): Promise<void> {
  await updateWorkspace((workspace) => {
    if (workspace.profiles.some((p) => p.isSample === true)) return;
    const demo = buildDemoDataset(workspace.userId);
    workspace.profiles.push(demo.profile);
    workspace.facts.push(...demo.facts);
    workspace.resumes.push(demo.resume);
    workspace.jobs.push(demo.job);
    workspace.analyses.push(demo.analysis);
    workspace.generated.push(demo.generated);
    workspace.applications.push(...demo.applications);
  });
  revalidatePath("/");
  revalidatePath("/settings");
}

/** Exposed for the analysis page so it can show what the optimizer may use. */
export async function licensedTermsForAnalysis(analysisId: string): Promise<string[]> {
  const workspace = await loadWorkspace();
  const analysis = workspace.analyses.find((a) => a.id === analysisId);
  return analysis === undefined ? [] : usableKeywords(analysis.keywords);
}
