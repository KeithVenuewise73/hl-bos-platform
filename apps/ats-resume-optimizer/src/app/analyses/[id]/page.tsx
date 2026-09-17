import { ValueFeedback } from "@/components/ValueFeedback.tsx";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SCORE_DISCLAIMER, analysisSummary } from "@hl-bos/ats-resume";
import {
  Card,
  Empty,
  ImportanceTag,
  MatchTag,
  MeterRow,
  Notice,
  PageHead,
  SampleTag,
  Stat,
} from "@/components/ui.tsx";
import { generateResume } from "@/lib/actions.ts";
import { loadWorkspace } from "@/lib/store.ts";
import { sortMatches } from "@/lib/analysis-helpers.ts";

export const dynamic = "force-dynamic";

/**
 * The analysis results page.
 *
 * Ordered so the uncomfortable part cannot be missed: score, then the
 * breakdown, then the evidence matrix with unevidenced critical requirements
 * at the top. A tool that buried the gaps under a green number would be
 * pleasant and useless.
 */
export default async function AnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const thanks = ((await searchParams) ?? {})["thanks"] === "1";
  const workspace = await loadWorkspace();
  const analysis = workspace.analyses.find((a) => a.id === id);
  if (analysis === undefined) notFound();

  const job = workspace.jobs.find((j) => j.id === analysis.jobPostingId);
  const generated = workspace.generated.filter((g) => g.analysisId === analysis.id);
  const summary = analysisSummary(analysis);
  const matches = sortMatches(analysis.matches);
  const weights = analysis.scoreBefore.weights;
  const before = analysis.scoreBefore.breakdown;
  const projected = analysis.scoreProjected.breakdown;

  return (
    <>
      <PageHead
        title={job?.title ?? "Analysis"}
        lead={`${job?.company ?? "Unknown company"}${job?.location === undefined ? "" : ` — ${job.location}`}`}
        action={
          <form action={generateResume}>
            <input type="hidden" name="analysisId" value={analysis.id} />
            <button className="btn btn-primary" type="submit">
              Generate Tailored Resume
            </button>
          </form>
        }
      />

      {analysis.isSample === true ? (
        <Notice tone="sample">
          <strong>Sample analysis</strong> — a fictional candidate against a fictional
          posting.
        </Notice>
      ) : null}

      <Notice>
        <strong>Internal optimization score.</strong> {SCORE_DISCLAIMER}
      </Notice>

      <div className="grid" style={{ marginBottom: 18 }}>
        <Stat
          value={analysis.scoreBefore.overall.toFixed(1)}
          label="Score before optimization"
          note="Your resume as it stands today."
        />
        <Stat
          value={analysis.scoreProjected.overall.toFixed(1)}
          label="Projected after supported revisions"
          note="Assumes only changes your own evidence supports."
        />
        <Stat
          value={summary.strong}
          label="Strong matches"
          note={`of ${summary.total} requirements`}
        />
        <Stat
          value={summary.missing}
          label="Not evidenced"
          note={
            summary.criticalMissing > 0
              ? `${summary.criticalMissing} of them are critical`
              : "None of them are critical"
          }
        />
      </div>

      <div className="split">
        <Card
          title="Score breakdown"
          sub="Weighted as: qualifications 35, experience 25, skills and keywords 20, quantified results 10, ATS structure 10."
        >
          <MeterRow
            label="Qualification alignment"
            value={before.qualificationAlignment}
            max={weights.qualificationAlignment}
          />
          <MeterRow
            label="Relevant experience"
            value={before.relevantExperience}
            max={weights.relevantExperience}
          />
          <MeterRow
            label="Skills and keyword coverage"
            value={before.skillsAndKeywords}
            max={weights.skillsAndKeywords}
          />
          <MeterRow
            label="Quantified accomplishments"
            value={before.quantifiedAccomplishments}
            max={weights.quantifiedAccomplishments}
          />
          <MeterRow
            label="ATS structure and formatting"
            value={before.atsStructure}
            max={weights.atsStructure}
          />
          <ul className="small muted" style={{ paddingLeft: 18, marginTop: 12 }}>
            {analysis.scoreBefore.explanation.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>

        <Card
          title="What the projection assumes"
          sub="And, more importantly, what it refuses to assume."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Now</th>
                  <th>Projected</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Qualification alignment</td>
                  <td className="mono">{before.qualificationAlignment.toFixed(1)}</td>
                  <td className="mono">
                    {projected.qualificationAlignment.toFixed(1)}
                  </td>
                </tr>
                <tr>
                  <td>Relevant experience</td>
                  <td className="mono">{before.relevantExperience.toFixed(1)}</td>
                  <td className="mono">{projected.relevantExperience.toFixed(1)}</td>
                </tr>
                <tr>
                  <td>Skills and keywords</td>
                  <td className="mono">{before.skillsAndKeywords.toFixed(1)}</td>
                  <td className="mono">{projected.skillsAndKeywords.toFixed(1)}</td>
                </tr>
                <tr>
                  <td>Quantified accomplishments</td>
                  <td className="mono">
                    {before.quantifiedAccomplishments.toFixed(1)}
                  </td>
                  <td className="mono">
                    {projected.quantifiedAccomplishments.toFixed(1)}
                  </td>
                </tr>
                <tr>
                  <td>ATS structure</td>
                  <td className="mono">{before.atsStructure.toFixed(1)}</td>
                  <td className="mono">{projected.atsStructure.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="small muted" style={{ paddingLeft: 18, marginTop: 12 }}>
            {analysis.scoreProjected.explanation.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Evidence matrix"
        sub="Every requirement, what you can evidence against it, and what to do about it. Critical and unevidenced rows are at the top."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Job requirement</th>
                <th>Importance</th>
                <th style={{ minWidth: 240 }}>Resume evidence</th>
                <th>Evidence source</th>
                <th>Match status</th>
                <th style={{ minWidth: 240 }}>Recommended action</th>
                <th>Placement</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => (
                <tr key={match.id}>
                  <td>{match.requirement}</td>
                  <td>
                    <ImportanceTag importance={match.importance} />
                  </td>
                  <td>
                    {match.evidence.length > 0 ? (
                      match.evidence
                    ) : (
                      <span className="muted">
                        Nothing in your profile evidences this.
                      </span>
                    )}
                  </td>
                  <td className="small muted">{match.evidenceSource}</td>
                  <td>
                    <MatchTag status={match.status} />
                  </td>
                  <td className="small">{match.recommendedAction}</td>
                  <td className="small muted">
                    {match.suggestedPlacement.length === 0
                      ? "—"
                      : match.suggestedPlacement.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="split">
        <Card
          title="Terminology opportunities"
          sub="Work you have already done, stated in this posting's words. The numbers and the detail stay exactly as you wrote them."
        >
          {analysis.terminology.length === 0 ? (
            <Empty>No terminology rewrites available for this posting.</Empty>
          ) : (
            <div className="stack">
              {analysis.terminology.map((opportunity) => (
                <div key={opportunity.id} className="line">
                  <p className="small muted" style={{ margin: 0 }}>
                    The posting says <strong>{opportunity.jobWording}</strong>
                  </p>
                  <p className="quote" style={{ marginBottom: 4 }}>
                    Your wording: {opportunity.resumeWording}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Recommended:</strong> {opportunity.recommendedRewrite}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Keyword analysis"
          sub="Three buckets. The third one is never inserted into your resume."
        >
          <h3>Already in your resume ({analysis.keywords.present.length})</h3>
          <p className="small muted">
            {analysis.keywords.present
              .slice(0, 24)
              .map((k) => k.term)
              .join(" · ") || "None."}
          </p>

          <h3 style={{ marginTop: 12 }}>
            Supported, but missing from the resume (
            {analysis.keywords.supportedMissing.length})
          </h3>
          <p className="small muted">
            {analysis.keywords.supportedMissing.map((k) => k.term).join(" · ") ||
              "None."}
          </p>
          <p className="hint">
            Safe to add: your evidence backs them, your wording just differs.
          </p>

          <h3 style={{ marginTop: 12 }}>
            Not currently evidenced ({analysis.keywords.unsupported.length})
          </h3>
          <p className="small muted">
            {analysis.keywords.unsupported
              .slice(0, 40)
              .map((k) => k.term)
              .join(" · ") || "None."}
          </p>
          <Notice tone="warn">
            These will <strong>not</strong> be added to your resume. If you have the
            experience, add it as a confirmed fact in your Candidate Profile and re-run
            the analysis.
          </Notice>
        </Card>
      </div>

      <Card title="Resume improvement recommendations" sub="In priority order.">
        {analysis.recommendations.length === 0 ? (
          <Empty>
            No recommendations — unusual, and worth double-checking the posting parsed
            correctly.
          </Empty>
        ) : (
          <ol className="stack" style={{ paddingLeft: 18, margin: 0 }}>
            {analysis.recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Next steps">
        <div className="row">
          <form action={generateResume}>
            <input type="hidden" name="analysisId" value={analysis.id} />
            <button className="btn btn-primary" type="submit">
              Generate Tailored Resume
            </button>
          </form>
          <Link className="btn" href={`/analyses/${analysis.id}/cover-letter`}>
            Cover letter
          </Link>
          <Link className="btn" href={`/analyses/${analysis.id}/interview-prep`}>
            Interview prep
          </Link>
        </div>
        {generated.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <h3>Versions generated from this analysis</h3>
            <ul style={{ paddingLeft: 18, margin: "6px 0 0" }}>
              {generated.map((version) => (
                <li key={version.id}>
                  <Link href={`/resumes/${version.id}`}>
                    Version {version.versionNumber}
                  </Link>
                  {version.isSample === true ? (
                    <>
                      {" "}
                      <SampleTag />
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <ValueFeedback stage="analysis" back={`/analyses/${id}`} answered={thanks} />
    </>
  );
}
