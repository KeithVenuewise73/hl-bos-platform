import Link from "next/link";
import { notFound } from "next/navigation";

import { reviewProgress } from "@hl-bos/hockey-highlights";

import { ActionForm } from "@/components/Forms.tsx";
import { JobStatus } from "@/components/JobStatus.tsx";
import {
  Card,
  Confidence,
  Empty,
  Evidence,
  Jersey,
  fileSize,
  timecode,
} from "@/components/ui.tsx";
import {
  deleteProject,
  retryAnalysis,
  startAnalysis,
  uploadVideo,
} from "@/lib/actions.ts";
import { loadWorkspace } from "@/lib/store.ts";
import { visionProvider } from "@/lib/pipeline-runner.ts";
import {
  clipsFor,
  jobFor,
  mediaFor,
  projectById,
  segmentsFor,
} from "@/lib/workspace.ts";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await loadWorkspace();
  const project = projectById(workspace, id);
  if (project === undefined) notFound();

  const job = jobFor(workspace, id);
  const original = mediaFor(workspace, id, "original");
  const segments = segmentsFor(workspace, id);
  const clips = clipsFor(workspace, id);
  const stored = workspace.tracks.find((t) => t.projectId === id);
  const availability = await visionProvider().availability();
  const progress = reviewProgress(clips);

  return (
    <>
      <h1>{project.name}</h1>
      <p className="subtitle">
        {project.athlete.name} ·{" "}
        <Jersey
          colorId={project.athlete.jerseyColorId}
          number={project.athlete.jerseyNumber}
        />{" "}
        · {project.athlete.position}
        {project.team.length > 0 && ` · ${project.team}`}
        {project.opponent.length > 0 && ` vs ${project.opponent}`}
        {project.gameDate.length > 0 && ` · ${project.gameDate}`}
      </p>

      <Card title="Game video">
        {original === undefined ? (
          <>
            <Empty
              heading="No video uploaded yet."
              reasons={["MP4 and MOV are accepted. 1080p phone footage works best."]}
            />
            <ActionForm action={uploadVideo} label="Upload" busy="Uploading…">
              <input type="hidden" name="projectId" value={id} />
              <input
                type="file"
                name="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                required
              />
            </ActionForm>
          </>
        ) : (
          <dl className="facts">
            <div>
              <dt>File</dt>
              <dd>{original.filename}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{fileSize(original.sizeBytes)}</dd>
            </div>
            <div>
              <dt>Length</dt>
              {/* Null is rendered as "not measured yet", never as 0:00. */}
              <dd>
                {original.durationSeconds === null ? (
                  <em>not measured yet — it is measured when analysis starts</em>
                ) : (
                  timecode(original.durationSeconds)
                )}
              </dd>
            </div>
            <div>
              <dt>Resolution</dt>
              <dd>
                {original.width === null || original.height === null ? (
                  <em>not measured yet</em>
                ) : (
                  `${original.width} × ${original.height}${original.frameRate !== null ? ` at ${original.frameRate}fps` : ""}`
                )}
              </dd>
            </div>
          </dl>
        )}
      </Card>

      {job !== undefined && (
        <Card title="Processing">
          <JobStatus job={job} />
          {/*
            Every button here is either able to do its job or is not rendered.
            A control that cannot control anything reads as protection that is
            not there.
          */}
          {original !== undefined &&
            job.status === "uploaded" &&
            availability.available && (
              <ActionForm
                action={startAnalysis}
                label="Find my player"
                busy="Analysing…"
              >
                <input type="hidden" name="projectId" value={id} />
              </ActionForm>
            )}
          {original !== undefined &&
            job.status === "uploaded" &&
            !availability.available && <p className="problem">{availability.detail}</p>}
          {job.status === "failed" && job.failure?.retryable === true && (
            <ActionForm action={retryAnalysis} label="Try again" busy="Retrying…">
              <input type="hidden" name="projectId" value={id} />
            </ActionForm>
          )}
        </Card>
      )}

      {stored !== undefined && stored.notes.length > 0 && (
        <Card title="What the analysis wants you to know">
          <ul className="notes">
            {stored.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Find my player"
        footnote="Confidence is shown as a word, not just a number, because a percentage invites you to trust it as precision it does not have. The evidence behind every claim is listed with it."
      >
        {segments.length === 0 ? (
          <Empty
            heading="No candidate stretches for this player."
            reasons={
              job === undefined || job.status === "uploaded"
                ? ["Analysis has not run yet."]
                : stored === undefined
                  ? ["Analysis has not produced any tracking for this game."]
                  : [
                      "The analysis ran and did not find a good enough match.",
                      "Check the jersey colour and number are right, and that your player is actually in frame.",
                    ]
            }
          />
        ) : (
          <ul className="segments">
            {segments.map((segment) => (
              <li key={segment.id}>
                <div className="segment-head">
                  <span className="mono">
                    {timecode(segment.startTime)} – {timecode(segment.endTime)}
                  </span>
                  <Confidence band={segment.band} value={segment.confidence} />
                </div>
                <Evidence segment={segment} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {clips.length > 0 && (
        <Card title="Clips">
          <p>{progress.summary}</p>
          <Link href={`/projects/${id}/review`} className="primary-link">
            Review the clips
          </Link>
          {progress.canBuildReel && (
            <Link href={`/projects/${id}/reel`} className="secondary-link">
              Go to the reel
            </Link>
          )}
        </Card>
      )}

      <Card title="Danger">
        <ActionForm
          action={deleteProject}
          label="Delete this game"
          busy="Deleting…"
          className="danger"
          confirm="Delete this game, its video and everything found in it? This cannot be undone."
        >
          <input type="hidden" name="projectId" value={id} />
        </ActionForm>
      </Card>
    </>
  );
}
