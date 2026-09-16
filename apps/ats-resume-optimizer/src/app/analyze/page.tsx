import Link from "next/link";

import { Card, Empty, Notice, PageHead } from "@/components/ui.tsx";
import { analyzeNewJob } from "@/lib/actions.ts";
import { currentProfile, resumesFor } from "@/lib/store.ts";
import { aiStatus } from "@/lib/config.ts";

export const dynamic = "force-dynamic";

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const profile = await currentProfile();
  const resumes = profile === undefined ? [] : await resumesFor(profile.id);
  const ai = aiStatus();

  if (resumes.length === 0) {
    return (
      <>
        <PageHead title="New Job Analysis" />
        <Empty>
          A job can only be analyzed against a resume.{" "}
          <Link href="/master-resume">Add your master resume</Link> first.
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="New Job Analysis"
        lead="Paste the posting. Every requirement in it will be matched against evidence you actually have, and the gaps will be named rather than papered over."
      />

      {params["error"] === "empty" ? (
        <Notice tone="danger">Paste the job description before analyzing.</Notice>
      ) : null}

      <Card>
        <form action={analyzeNewJob}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="company">Company</label>
              <input
                id="company"
                name="company"
                type="text"
                placeholder="Leave blank to read it from the posting"
              />
            </div>
            <div className="field">
              <label htmlFor="title">Job title</label>
              <input
                id="title"
                name="title"
                type="text"
                placeholder="Leave blank to read it from the posting"
              />
            </div>
            <div className="field">
              <label htmlFor="location">Location</label>
              <input id="location" name="location" type="text" />
            </div>
          </div>

          <div className="field">
            <label htmlFor="url">Job posting URL (optional)</label>
            <input id="url" name="url" type="url" placeholder="https://…" />
            <p className="hint">
              The URL is stored with the application for your records. Fetching a
              posting from a URL is <strong>not</strong> built: job boards block
              automated fetches and return a login wall, so a button that pretended to
              do it would fail most of the time. Paste the text below instead.
            </p>
          </div>

          <div className="field">
            <label htmlFor="resumeId">Resume to analyze against</label>
            <select
              id="resumeId"
              name="resumeId"
              defaultValue={resumes.find((r) => r.isDefault)?.id}
            >
              {resumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.label}
                  {resume.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="jobText">Job description</label>
            <textarea
              id="jobText"
              name="jobText"
              rows={16}
              required
              placeholder="Paste the full posting, including the qualifications and responsibilities sections."
            />
            <p className="hint">
              Paste all of it. Section headings such as &quot;Minimum
              Qualifications&quot; and &quot;Preferred Qualifications&quot; are what let
              the app tell a must-have from a nice-to-have.
            </p>
          </div>

          <button className="btn btn-primary" type="submit">
            Analyze this job
          </button>
          <p className="hint" style={{ marginTop: 10 }}>
            {ai.detail}
          </p>
        </form>
      </Card>
    </>
  );
}
