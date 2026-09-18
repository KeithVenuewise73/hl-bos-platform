import Link from "next/link";
import { notFound } from "next/navigation";

import { reviewProgress } from "@hl-bos/hockey-highlights";

import { ActionForm } from "@/components/Forms.tsx";
import { Card, Empty, timecode } from "@/components/ui.tsx";
import { buildHighlightReel } from "@/lib/actions.ts";
import { loadWorkspace } from "@/lib/store.ts";
import { visionProvider } from "@/lib/pipeline-runner.ts";
import { clipsFor, latestReel, projectById } from "@/lib/workspace.ts";

export const dynamic = "force-dynamic";

export default async function ReelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await loadWorkspace();
  const project = projectById(workspace, id);
  if (project === undefined) notFound();

  const clips = clipsFor(workspace, id);
  const progress = reviewProgress(clips);
  const reel = latestReel(workspace, id);
  const rendered =
    reel?.mediaAssetId === undefined || reel.mediaAssetId === null
      ? undefined
      : workspace.media.find((m) => m.id === reel.mediaAssetId);
  const availability = await visionProvider().availability();

  return (
    <>
      <h1>Highlight reel · {project.name}</h1>

      {!progress.canBuildReel ? (
        <Card>
          <Empty
            heading="No clips have been approved."
            reasons={[
              "A reel is built only from clips you have kept.",
              "Nothing is rendered from clips nobody has looked at.",
            ]}
          />
          <Link href={`/projects/${id}/review`} className="primary-link">
            Review the clips
          </Link>
        </Card>
      ) : (
        <Card title="What will be in it">
          <p>
            {progress.accepted} clip{progress.accepted === 1 ? "" : "s"} ·{" "}
            {progress.acceptedSeconds.toFixed(1)} seconds
            {progress.pending > 0 &&
              ` · ${progress.pending} clip${progress.pending === 1 ? "" : "s"} still unreviewed and not included`}
          </p>
          {availability.available ? (
            <ActionForm
              action={buildHighlightReel}
              label={reel === undefined ? "Build the reel" : "Rebuild the reel"}
              busy="Building…"
            >
              <input type="hidden" name="projectId" value={id} />
            </ActionForm>
          ) : (
            <p className="problem">{availability.detail}</p>
          )}
          <p className="footnote">
            The reel is cut from your original upload, not from the smaller copy the
            analysis reads, so it is at the quality you filmed it.
          </p>
        </Card>
      )}

      {reel !== undefined && (
        <Card title={reel.title}>
          <p className="subtitle">{reel.subtitle}</p>
          <ol className="reel-entries">
            {reel.entries.map((entry) => (
              <li key={entry.clipId} className="mono">
                {timecode(entry.reelOffset)} — from {timecode(entry.startTime)} to{" "}
                {timecode(entry.endTime)} ({entry.durationSeconds.toFixed(1)}s)
              </li>
            ))}
          </ol>
          <p>Total: {reel.totalDurationSeconds.toFixed(1)} seconds.</p>

          {/*
            A download link appears only when a file actually exists. A button
            for a file that was never rendered is a 404 with a friendly label.
          */}
          {rendered === undefined ? (
            <Empty
              heading="This reel has been planned but not rendered."
              reasons={[
                "The clip list above is what will be cut.",
                "Use Build the reel to produce the video file.",
              ]}
            />
          ) : (
            <>
              <video
                controls
                preload="metadata"
                className="reel-video"
                src={`/media/reel/${id}`}
              />
              <a
                className="primary-link"
                href={`/media/reel/${id}`}
                download="highlight-reel.mp4"
              >
                Download the reel
              </a>
            </>
          )}
        </Card>
      )}
    </>
  );
}
