import Link from "next/link";

import { analysisSummary } from "@hl-bos/ats-resume";
import { Card, Empty, Notice, PageHead, SampleTag, Stat } from "@/components/ui.tsx";
import { currentProfile, loadWorkspace } from "@/lib/store.ts";
import { formatDate } from "@/lib/analysis-helpers.ts";

export const dynamic = "force-dynamic";

/**
 * The dashboard.
 *
 * Every number here is counted from stored records. There is no "sample
 * metric", no placeholder chart, and no average computed over zero analyses —
 * where there is nothing to show, the panel says what is missing and why.
 */
export default async function DashboardPage() {
  const workspace = await loadWorkspace();
  const profile = await currentProfile();

  if (profile === undefined) {
    return (
      <>
        <PageHead
          title="Dashboard"
          lead="Nothing has been set up yet."
          action={
            <Link className="btn btn-primary" href="/master-resume">
              Add your resume
            </Link>
          }
        />
        <Empty>
          Start with your master resume. Everything else — analyses, tailored resumes,
          the application tracker — is built from it.
        </Empty>
      </>
    );
  }

  const analyses = workspace.analyses.filter((a) => a.profileId === profile.id);
  const generated = workspace.generated.filter((g) => g.profileId === profile.id);
  const applications = workspace.applications.filter((a) => a.profileId === profile.id);
  const activeApplications = applications.filter(
    (a) => !["rejected", "withdrawn", "closed"].includes(a.status),
  );

  const averageScore =
    analyses.length === 0
      ? undefined
      : analyses.reduce((sum, a) => sum + a.scoreBefore.overall, 0) / analyses.length;

  // Recurring strengths and gaps are counted across every analysis, so they
  // mean "this keeps coming up", not "this appeared once".
  const strengthCounts = new Map<string, number>();
  const gapCounts = new Map<string, number>();
  for (const analysis of analyses) {
    for (const match of analysis.matches) {
      if (match.status === "strong_match" || match.status === "terminology_match") {
        const key = match.evidence.slice(0, 90);
        if (key.length > 0) strengthCounts.set(key, (strengthCounts.get(key) ?? 0) + 1);
      }
      if (match.status === "not_evidenced") {
        const key = match.requirement.slice(0, 90);
        gapCounts.set(key, (gapCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const topStrengths = [...strengthCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topGaps = [...gapCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const recent = [...analyses]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)
    .map((analysis) => ({
      analysis,
      job: workspace.jobs.find((j) => j.id === analysis.jobPostingId),
      summary: analysisSummary(analysis),
    }));

  return (
    <>
      <PageHead
        title="Dashboard"
        lead={`${profile.fullName.length > 0 ? profile.fullName : "Your profile"} — every figure below is counted from your own records.`}
        action={
          <Link className="btn btn-primary" href="/analyze">
            Analyze New Job
          </Link>
        }
      />

      {profile.isSample === true ? (
        <Notice tone="sample">
          <strong>You are looking at sample data.</strong> Marcus Delgado is a fictional
          transportation executive, created so the app can be tried immediately. Add
          your own resume on the Master Resume screen, then delete the sample in
          Settings.
        </Notice>
      ) : null}

      <div className="grid" style={{ marginBottom: 18 }}>
        <Stat value={analyses.length} label="Jobs analyzed" />
        <Stat value={generated.length} label="Tailored resumes created" />
        <Stat
          value={activeApplications.length}
          label="Active applications"
          note={`${applications.length} total, ${applications.length - activeApplications.length} closed`}
        />
        <Stat
          value={averageScore === undefined ? "—" : averageScore.toFixed(1)}
          label="Average internal match score"
          note={
            averageScore === undefined
              ? "No analyses yet."
              : "Our own measure, not the employer's ATS score."
          }
        />
      </div>

      <Card
        title="Recent analyses"
        sub="Most recent first. The score shown is the resume as it stands, before optimization."
      >
        {recent.length === 0 ? (
          <Empty>
            No job has been analyzed yet.{" "}
            <Link href="/analyze">Paste a job posting</Link> to see how your resume
            lines up against it.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Company</th>
                  <th>Analyzed</th>
                  <th>Score</th>
                  <th>Strong</th>
                  <th>Gaps</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.map(({ analysis, job, summary }) => (
                  <tr key={analysis.id}>
                    <td>
                      {job?.title ?? "Unknown role"}
                      {analysis.isSample === true ? (
                        <>
                          {" "}
                          <SampleTag />
                        </>
                      ) : null}
                    </td>
                    <td>{job?.company ?? "—"}</td>
                    <td className="nowrap">{formatDate(analysis.createdAt)}</td>
                    <td className="mono nowrap">
                      {analysis.scoreBefore.overall.toFixed(1)}
                    </td>
                    <td>{summary.strong}</td>
                    <td>
                      {summary.missing}
                      {summary.criticalMissing > 0 ? (
                        <span className="muted small">
                          {" "}
                          ({summary.criticalMissing} critical)
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <Link href={`/analyses/${analysis.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="split">
        <Card
          title="Strongest recurring evidence"
          sub="The experience that keeps matching what employers ask for."
        >
          {topStrengths.length === 0 ? (
            <Empty>
              Nothing to count yet — this fills in after your first analysis.
            </Empty>
          ) : (
            <ol className="stack" style={{ paddingLeft: 18, margin: 0 }}>
              {topStrengths.map(([text, count]) => (
                <li key={text}>
                  {text}
                  <span className="muted small">
                    {" "}
                    — matched in {count} analysis{count === 1 ? "" : "es"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card
          title="Common qualification gaps"
          sub="Requirements that keep coming up with nothing in your profile to evidence them."
        >
          {topGaps.length === 0 ? (
            <Empty>No recurring gaps recorded yet.</Empty>
          ) : (
            <ol className="stack" style={{ paddingLeft: 18, margin: 0 }}>
              {topGaps.map(([text, count]) => (
                <li key={text}>
                  {text}
                  <span className="muted small">
                    {" "}
                    — asked for {count} time{count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
