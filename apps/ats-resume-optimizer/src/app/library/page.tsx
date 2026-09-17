import Link from "next/link";

import { buildExportDocument } from "@hl-bos/ats-resume";
import { Card, Empty, PageHead, SampleTag } from "@/components/ui.tsx";
import { currentProfile, loadWorkspace } from "@/lib/store.ts";
import { formatDate } from "@/lib/analysis-helpers.ts";

export const dynamic = "force-dynamic";

/**
 * Resume Library — every tailored version, tied to the candidate, company,
 * job title, posting, analysis and date it was created from.
 *
 * Version comparison shows the original wording next to the optimized wording
 * and the reason for the change, because "what did this tool change about my
 * resume, and why" has to be answerable at any point in the future.
 */
export default async function LibraryPage() {
  const workspace = await loadWorkspace();
  const profile = await currentProfile();
  const versions = workspace.generated
    .filter((g) => g.profileId === profile?.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHead
        title="Resume Library"
        lead="Every tailored resume you have generated, with what changed from your master resume and why."
      />

      {versions.length === 0 ? (
        <Empty>
          No tailored resumes yet. <Link href="/analyze">Analyze a job</Link>, then
          generate one.
        </Empty>
      ) : (
        versions.map((version) => {
          const { dropped } = buildExportDocument(version);
          const changed = [
            version.headline,
            ...version.summary,
            ...version.experience.flatMap((e) => e.bullets),
          ].filter(
            (line) =>
              line.originalText !== undefined && line.originalText !== line.text,
          );

          return (
            <Card
              key={version.id}
              title={`${version.jobTitle} — ${version.company}`}
              sub={`Version ${version.versionNumber} · created ${formatDate(version.createdAt)} · ${version.engine}`}
              right={
                <div className="row">
                  {version.isSample === true ? <SampleTag /> : null}
                  <Link className="btn btn-sm" href={`/resumes/${version.id}`}>
                    Open
                  </Link>
                  <a
                    className="btn btn-sm"
                    href={`/resumes/${version.id}/export?format=docx`}
                  >
                    DOCX
                  </a>
                  <a
                    className="btn btn-sm"
                    href={`/resumes/${version.id}/export?format=pdf`}
                  >
                    PDF
                  </a>
                </div>
              }
            >
              <p className="small muted">
                {changed.length} line{changed.length === 1 ? "" : "s"} reworded ·{" "}
                {dropped.length} line{dropped.length === 1 ? "" : "s"} excluded from
                export
                {version.analysisId.length > 0 ? (
                  <>
                    {" "}
                    · <Link href={`/analyses/${version.analysisId}`}>analysis</Link>
                  </>
                ) : null}
              </p>

              {changed.length === 0 ? (
                <p className="small">
                  Nothing was reworded — your own wording already matched this posting.
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ minWidth: 220 }}>Original wording</th>
                        <th style={{ minWidth: 220 }}>Optimized wording</th>
                        <th style={{ minWidth: 220 }}>Reason for the change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changed.map((line) => (
                        <tr key={line.id}>
                          <td className="small muted">{line.originalText}</td>
                          <td className="small">{line.text}</td>
                          <td className="small">{line.rationale}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })
      )}
    </>
  );
}
