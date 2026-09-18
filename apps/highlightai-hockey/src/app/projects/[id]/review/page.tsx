import Link from "next/link";
import { notFound } from "next/navigation";

import {
  clipDuration,
  effectiveWindow,
  reviewProgress,
} from "@hl-bos/hockey-highlights";

import { ActionForm } from "@/components/Forms.tsx";
import { Card, Confidence, Empty, timecode } from "@/components/ui.tsx";
import { decideClip, trimClip } from "@/lib/actions.ts";
import { loadWorkspace } from "@/lib/store.ts";
import {
  clipsFor,
  eventsFor,
  mediaFor,
  projectById,
  segmentsFor,
} from "@/lib/workspace.ts";

export const dynamic = "force-dynamic";

/**
 * The review screen.
 *
 * This is where the MVP's central bet lives: the engine proposes, a person
 * disposes. Every clip carries the reason it was proposed and how sure the
 * analysis is that it is even the right player, because a reviewer who is
 * asked to approve something has to be told what they are approving.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await loadWorkspace();
  const project = projectById(workspace, id);
  if (project === undefined) notFound();

  const clips = clipsFor(workspace, id);
  const events = eventsFor(workspace, id);
  const segments = segmentsFor(workspace, id);
  const original = mediaFor(workspace, id, "original");
  const progress = reviewProgress(clips);

  return (
    <>
      <h1>Review · {project.name}</h1>
      <p className="subtitle">{progress.summary}</p>

      {clips.length === 0 ? (
        <Card>
          <Empty
            heading="There is nothing to review."
            reasons={["No clips were produced for this game."]}
          />
          <Link href={`/projects/${id}`} className="primary-link">
            Back to the game
          </Link>
        </Card>
      ) : (
        <>
          <ol className="clips">
            {clips.map((clip) => {
              const event = events.find((e) => e.id === clip.eventId);
              const segment =
                event === undefined
                  ? undefined
                  : segments.find((s) => s.id === event.segmentId);
              const window = effectiveWindow(clip);
              return (
                <li key={clip.id} className={`clip clip-${clip.decision}`}>
                  <div className="clip-head">
                    <span className="mono">
                      {timecode(window.start)} – {timecode(window.end)} (
                      {clipDuration(clip).toFixed(1)}s)
                    </span>
                    {segment !== undefined && (
                      <Confidence band={segment.band} value={segment.confidence} />
                    )}
                  </div>

                  {/*
                    The clip plays from the ORIGINAL upload with a media
                    fragment, rather than from a pre-rendered file. It means
                    review works the moment clips exist, without waiting for
                    every candidate to be encoded — most of which will be
                    rejected.
                  */}
                  {original !== undefined && (
                    <video
                      controls
                      preload="metadata"
                      className="clip-video"
                      src={`/media/original/${id}#t=${window.start},${window.end}`}
                    />
                  )}

                  {event !== undefined && (
                    <p className="clip-why">
                      <strong>{event.kind.replace(/_/g, " ")}</strong> —{" "}
                      {event.rationale}
                    </p>
                  )}

                  <div className="clip-actions">
                    <ActionForm action={decideClip} label="Keep" busy="…">
                      <input type="hidden" name="clipId" value={clip.id} />
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="decision" value="accepted" />
                    </ActionForm>
                    <ActionForm
                      action={decideClip}
                      label="Discard"
                      busy="…"
                      className="secondary"
                    >
                      <input type="hidden" name="clipId" value={clip.id} />
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="decision" value="rejected" />
                    </ActionForm>
                    <span className={`decision decision-${clip.decision}`}>
                      {clip.decision === "pending"
                        ? "not reviewed"
                        : clip.decision === "accepted"
                          ? "in the reel"
                          : "discarded"}
                    </span>
                  </div>

                  <details className="trim">
                    <summary>Trim this clip</summary>
                    <ActionForm
                      action={trimClip}
                      label="Save trim"
                      busy="Saving…"
                      className="secondary"
                    >
                      <input type="hidden" name="clipId" value={clip.id} />
                      <input type="hidden" name="projectId" value={id} />
                      <label>
                        Start (seconds)
                        <input
                          name="start"
                          type="number"
                          step="0.1"
                          min={clip.startTime}
                          max={clip.endTime}
                          defaultValue={window.start}
                        />
                      </label>
                      <label>
                        End (seconds)
                        <input
                          name="end"
                          type="number"
                          step="0.1"
                          min={clip.startTime}
                          max={clip.endTime}
                          defaultValue={window.end}
                        />
                      </label>
                      <p className="footnote">
                        A trim can only shorten what was detected —{" "}
                        {timecode(clip.startTime)} to {timecode(clip.endTime)}.
                      </p>
                    </ActionForm>
                  </details>
                </li>
              );
            })}
          </ol>

          <Card title="When you are done">
            {progress.canBuildReel ? (
              <Link href={`/projects/${id}/reel`} className="primary-link">
                Build the reel from {progress.accepted} clip
                {progress.accepted === 1 ? "" : "s"} (
                {progress.acceptedSeconds.toFixed(1)}s)
              </Link>
            ) : (
              <Empty
                heading="Nothing is in the reel yet."
                reasons={["Keep at least one clip and the reel becomes available."]}
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
