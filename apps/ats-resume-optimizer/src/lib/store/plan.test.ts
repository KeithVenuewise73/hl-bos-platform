/**
 * What the SQL path would actually write.
 *
 * `planWorkspaceWrites` is where a persistence bug would do real damage —
 * a missed table means silently lost work, and an over-eager one means a
 * thousand rows rewritten to change a sentence. It is pure, so it is tested
 * directly rather than inferred from a passing screen.
 */
import { describe, expect, it } from "vitest";
import { buildDemoDataset, makeFact } from "@hl-bos/ats-resume";

import { planWorkspaceWrites } from "./write-plan.ts";
import { emptyWorkspace, type Workspace } from "./workspace.ts";

const OWNER = "66666666-6666-4666-8666-666666666666";

function workspaceFromDemo(): Workspace {
  const demo = buildDemoDataset(OWNER);
  return {
    version: 1,
    userId: OWNER,
    profiles: [demo.profile],
    facts: [...demo.facts],
    resumes: [demo.resume],
    jobs: [demo.job],
    analyses: [demo.analysis],
    generated: [demo.generated],
    applications: [...demo.applications],
    coverLetters: [],
    interviewPreps: [],
  };
}

const clone = (w: Workspace): Workspace => structuredClone(w);
const blank = (): Workspace => emptyWorkspace(OWNER);

describe("planWorkspaceWrites", () => {
  it("writes nothing when nothing changed", () => {
    const before = workspaceFromDemo();
    expect(planWorkspaceWrites(before, clone(before), OWNER)).toEqual([]);
  });

  it("writes only the table that changed", () => {
    const before = workspaceFromDemo();
    const after = clone(before);
    after.applications[0] = { ...after.applications[0]!, status: "applied" };

    const plans = planWorkspaceWrites(before, after, OWNER);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.table).toBe("applications");
    expect(plans[0]?.upserts).toHaveLength(1);
    expect(plans[0]?.upserts[0]?.["status"]).toBe("applied");
  });

  it("does not rewrite a thousand rows to change one sentence", () => {
    const before = workspaceFromDemo();
    const after = clone(before);
    after.facts.push(
      makeFact(before.profiles[0]!.id, {
        category: "certification",
        text: "Certified Transportation Professional.",
        source: "user_confirmed",
      }),
    );
    const plans = planWorkspaceWrites(before, after, OWNER);
    const written = plans.reduce((n, p) => n + p.upserts.length, 0);
    expect(written).toBe(1);
    expect(plans[0]?.table).toBe("career_facts");
  });

  it("records a deletion rather than leaving the row behind", () => {
    const before = workspaceFromDemo();
    const after = clone(before);
    const removed = after.facts.pop()!;
    const plans = planWorkspaceWrites(before, after, OWNER);
    expect(plans[0]?.deletedIds).toEqual([removed.id]);
    expect(plans[0]?.upserts).toHaveLength(0);
  });

  it("writes the parsed snapshot alongside a newly added resume", () => {
    const before: Workspace = { ...workspaceFromDemo(), resumes: [] };
    const after = workspaceFromDemo();
    const plans = planWorkspaceWrites(before, after, OWNER);
    expect(plans.find((p) => p.table === "resumes")?.upserts).toHaveLength(1);
    const versions = plans.find((p) => p.table === "resume_versions");
    expect(versions?.upserts).toHaveLength(1);
    expect(versions?.upserts[0]?.["parsed"]).toBeDefined();
    expect(versions?.conflictTarget).toBe("resume_id,version_no");
  });

  it("orders writes so a parent exists before the row that references it", () => {
    // Everything at once, as on first sign-in with the sample dataset.
    const tables = planWorkspaceWrites(blank(), workspaceFromDemo(), OWNER).map(
      (p) => p.table,
    );
    const at = (t: string) => tables.indexOf(t);
    expect(at("candidate_profiles")).toBeLessThan(at("career_facts"));
    expect(at("candidate_profiles")).toBeLessThan(at("resumes"));
    expect(at("resumes")).toBeLessThan(at("job_analyses"));
    expect(at("job_postings")).toBeLessThan(at("job_analyses"));
    expect(at("job_analyses")).toBeLessThan(at("generated_resumes"));
    expect(at("generated_resumes")).toBeLessThan(at("applications"));
    // The constraint-bearing children come after the rows they point at.
    expect(at("job_postings")).toBeLessThan(at("job_requirements"));
    expect(at("job_postings")).toBeLessThan(at("job_keywords"));
    expect(at("job_requirements")).toBeLessThan(at("requirement_matches"));
    expect(at("job_analyses")).toBeLessThan(at("requirement_matches"));
    expect(at("generated_resumes")).toBeLessThan(at("generated_resume_bullets"));
    expect(at("generated_resume_bullets")).toBeLessThan(at("claim_evidence"));
    expect(at("career_facts")).toBeLessThan(at("claim_evidence"));
  });

  it("stamps every row with the owner, so RLS accepts the write", () => {
    const empty: Workspace = { ...workspaceFromDemo(), profiles: [], facts: [] };
    const plans = planWorkspaceWrites(empty, workspaceFromDemo(), OWNER);
    for (const plan of plans) {
      for (const row of plan.upserts) {
        expect(row["owner_id"]).toBe(OWNER);
      }
    }
  });

  it("fills the tables the anti-fabrication constraints actually guard", () => {
    // Storing requirements, matches and generated lines as JSONB on their
    // parents would leave these tables empty, and a CHECK constraint that
    // never sees a row is not a control.
    const demo = workspaceFromDemo();
    const plans = planWorkspaceWrites(blank(), demo, OWNER);
    const rows = (table: string) => plans.find((p) => p.table === table)?.upserts ?? [];

    expect(rows("job_requirements")).toHaveLength(demo.jobs[0]!.requirements.length);
    expect(rows("job_keywords")).toHaveLength(demo.jobs[0]!.keywords.length);
    expect(rows("requirement_matches")).toHaveLength(demo.analyses[0]!.matches.length);
    expect(rows("generated_resume_bullets").length).toBe(lineCount(demo));
    expect(rows("job_requirements").length).toBeGreaterThan(0);
    expect(rows("requirement_matches").length).toBeGreaterThan(0);
    expect(rows("generated_resume_bullets").length).toBeGreaterThan(0);
  });

  it("never marks an unsupported or unconfirmed line as exported", () => {
    const before = blank();
    const after = workspaceFromDemo();
    // Tamper: a line the user has not confirmed, and one with no evidence.
    const resume = after.generated[0]!;
    after.generated[0] = {
      ...resume,
      summary: [
        { ...resume.summary[0]!, validation: "needs_confirmation" },
        { ...resume.summary[1]!, validation: "unsupported" },
      ],
    };

    const rows =
      planWorkspaceWrites(before, after, OWNER).find(
        (p) => p.table === "generated_resume_bullets",
      )?.upserts ?? [];
    const suspect = rows.filter(
      (r) =>
        r["validation"] === "unsupported" || r["validation"] === "needs_confirmation",
    );
    expect(suspect.length).toBeGreaterThan(0);
    for (const row of suspect) expect(row["included_in_export"]).toBe(false);
    // And the rows that are exportable say so, rather than everything being false.
    expect(rows.some((r) => r["included_in_export"] === true)).toBe(true);
  });

  it("rewrites one sentence and only that sentence's evidence", () => {
    const before = workspaceFromDemo();
    const after = clone(before);
    const resume = after.generated[0]!;
    const edited = { ...resume.summary[0]!, text: "Reworded by the user." };
    after.generated[0] = { ...resume, summary: [edited, ...resume.summary.slice(1)] };

    const plans = planWorkspaceWrites(before, after, OWNER);
    const bullets = plans.find((p) => p.table === "generated_resume_bullets");
    expect(bullets?.upserts).toHaveLength(1);
    expect(bullets?.upserts[0]?.["id"]).toBe(edited.id);

    // The links for that one bullet are replaced, not every bullet's.
    const evidence = plans.find((p) => p.table === "claim_evidence");
    expect(evidence?.clear).toEqual({ column: "bullet_id", values: [edited.id] });
    expect(evidence?.conflictTarget).toBe("bullet_id,fact_id");
    for (const row of evidence?.upserts ?? []) {
      expect(row["bullet_id"]).toBe(edited.id);
    }
  });

  it("links a claim only to facts that exist", () => {
    const after = workspaceFromDemo();
    const resume = after.generated[0]!;
    after.generated[0] = {
      ...resume,
      summary: [
        {
          ...resume.summary[0]!,
          // A dangling id would abort the whole save on a foreign key, so it is
          // dropped; the sentence is still written, with its verdict intact.
          evidenceFactIds: [...resume.summary[0]!.evidenceFactIds, "not-a-real-fact"],
        },
        ...resume.summary.slice(1),
      ],
    };

    const plans = planWorkspaceWrites(blank(), after, OWNER);
    const known = new Set(after.facts.map((f) => f.id));
    const links = plans.find((p) => p.table === "claim_evidence")?.upserts ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const row of links) expect(known.has(String(row["fact_id"]))).toBe(true);
  });

  it("re-parsing a posting does not take the evidence matrix with it", () => {
    // job_requirements cascades to requirement_matches. Replacing a posting's
    // requirements wholesale would silently delete every analysis built on it.
    const before = workspaceFromDemo();
    const after = clone(before);
    const job = after.jobs[0]!;
    after.jobs[0] = {
      ...job,
      requirements: [
        { ...job.requirements[0]!, text: "Re-read from the posting." },
        ...job.requirements.slice(1),
      ],
    };

    const plans = planWorkspaceWrites(before, after, OWNER);
    const requirements = plans.find((p) => p.table === "job_requirements");
    expect(requirements?.upserts).toHaveLength(1);
    expect(requirements?.deletedIds).toEqual([]);
    expect(plans.find((p) => p.table === "requirement_matches")).toBeUndefined();
  });

  it("deletes a removed requirement rather than orphaning it", () => {
    const before = workspaceFromDemo();
    const after = clone(before);
    const job = after.jobs[0]!;
    const dropped = job.requirements[job.requirements.length - 1]!;
    after.jobs[0] = { ...job, requirements: job.requirements.slice(0, -1) };

    const plans = planWorkspaceWrites(before, after, OWNER);
    const requirements = plans.find((p) => p.table === "job_requirements");
    expect(requirements?.deletedIds).toEqual([dropped.id]);
    expect(requirements?.upserts).toHaveLength(0);
  });
});

/** How many sentences a workspace's generated resumes contain in total. */
function lineCount(workspace: Workspace): number {
  return workspace.generated.reduce(
    (n, r) =>
      n + 1 + r.summary.length + r.experience.reduce((m, e) => m + e.bullets.length, 0),
    0,
  );
}
