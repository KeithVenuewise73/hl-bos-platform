import Link from "next/link";

import { Card, Empty, Notice, PageHead, SampleTag } from "@/components/ui.tsx";
import { saveApplication } from "@/lib/actions.ts";
import { currentProfile, loadWorkspace } from "@/lib/store.ts";
import {
  APPLICATION_STATUSES,
  formatDate,
  humanStatus,
} from "@/lib/analysis-helpers.ts";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const workspace = await loadWorkspace();
  const profile = await currentProfile();
  const applications = workspace.applications
    .filter((a) => a.profileId === profile?.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <PageHead
        title="Applications"
        lead="Every analysis starts an application here automatically, so the tracker is never behind what you have actually done."
        action={
          <Link className="btn btn-primary" href="/analyze">
            Analyze New Job
          </Link>
        }
      />

      {applications.length === 0 ? (
        <Empty>
          Nothing tracked yet. <Link href="/analyze">Analyze a job</Link> and it will
          appear here.
        </Empty>
      ) : (
        applications.map((application) => {
          const analysis = workspace.analyses.find(
            (a) => a.id === application.analysisId,
          );
          const resume = workspace.generated.find(
            (g) => g.id === application.generatedResumeId,
          );
          const letter = workspace.coverLetters.find(
            (l) => l.id === application.coverLetterId,
          );
          return (
            <Card
              key={application.id}
              title={`${application.role} — ${application.company}`}
              sub={`Analyzed ${formatDate(application.dateAnalyzed)}`}
              right={application.isSample === true ? <SampleTag /> : undefined}
            >
              <div className="row small muted" style={{ marginBottom: 10 }}>
                <span>Status: {humanStatus(application.status)}</span>
                {analysis === undefined ? null : (
                  <Link href={`/analyses/${analysis.id}`}>Analysis</Link>
                )}
                {resume === undefined ? (
                  <span>No tailored resume yet</span>
                ) : (
                  <Link href={`/resumes/${resume.id}`}>
                    Resume v{resume.versionNumber}
                  </Link>
                )}
                {letter === undefined ? (
                  <span>No cover letter</span>
                ) : analysis === undefined ? null : (
                  <Link href={`/analyses/${analysis.id}/cover-letter`}>
                    Cover letter
                  </Link>
                )}
                {analysis === undefined ? null : (
                  <Link href={`/analyses/${analysis.id}/interview-prep`}>
                    Interview prep
                  </Link>
                )}
              </div>

              <form action={saveApplication}>
                <input type="hidden" name="applicationId" value={application.id} />
                <div className="field-row">
                  <div className="field">
                    <label htmlFor={`status-${application.id}`}>Status</label>
                    <select
                      id={`status-${application.id}`}
                      name="status"
                      defaultValue={application.status}
                    >
                      {APPLICATION_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {humanStatus(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`applied-${application.id}`}>Date applied</label>
                    <input
                      id={`applied-${application.id}`}
                      name="dateApplied"
                      type="date"
                      defaultValue={application.dateApplied ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`url-${application.id}`}>Job URL</label>
                    <input
                      id={`url-${application.id}`}
                      name="jobUrl"
                      type="url"
                      defaultValue={application.jobUrl ?? ""}
                    />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor={`recruiter-${application.id}`}>Recruiter</label>
                    <input
                      id={`recruiter-${application.id}`}
                      name="recruiterName"
                      type="text"
                      defaultValue={application.recruiterName ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`contact-${application.id}`}>
                      Recruiter contact
                    </label>
                    <input
                      id={`contact-${application.id}`}
                      name="recruiterContact"
                      type="text"
                      defaultValue={application.recruiterContact ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`interviews-${application.id}`}>
                      Interview dates
                    </label>
                    <input
                      id={`interviews-${application.id}`}
                      name="interviewDates"
                      type="text"
                      defaultValue={application.interviewDates.join(", ")}
                      placeholder="2026-09-22, 2026-09-30"
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`notes-${application.id}`}>Notes</label>
                  <textarea
                    id={`notes-${application.id}`}
                    name="notes"
                    defaultValue={application.notes}
                    rows={3}
                  />
                </div>
                <button className="btn" type="submit">
                  Save
                </button>
              </form>
            </Card>
          );
        })
      )}

      <Notice>
        Statuses are the ones a real search moves through: researching, resume created,
        applied, recruiter screen, interviewing, final interview, offer, rejected,
        withdrawn, closed.
      </Notice>
    </>
  );
}
