import Link from "next/link";

import { MediaThumb } from "@/components/MediaThumb.tsx";
import { Steps } from "@/components/Steps.tsx";
import { deleteMedia } from "@/lib/actions.ts";
import { loadProject, param } from "@/lib/load.ts";
import {
  MAX_IMAGE_BYTES,
  MAX_MEDIA_PER_PROJECT,
  MAX_VIDEO_BYTES,
} from "@/lib/media.ts";

export const dynamic = "force-dynamic";

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default async function UploadMedia({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const project = await loadProject((await params).id);
  const error = param((await searchParams)["error"]);
  const full = project.media.length >= MAX_MEDIA_PER_PROJECT;

  return (
    <div data-accent={project.accent}>
      <div className="kicker">{project.name}</div>
      <h1>Upload media</h1>
      <Steps project={project} current="media" />

      <div className="split">
        <section className="card stack">
          {error !== undefined ? (
            <div className="notice bad" role="alert">
              {error}
            </div>
          ) : null}

          <form
            action={`/api/projects/${project.id}/media`}
            method="post"
            encType="multipart/form-data"
            className="stack"
          >
            <label className="dropzone">
              <div className="big-icon">📸</div>
              <strong>Add a photo or short video of the athlete or team</strong>
              <div className="muted small">
                JPG, PNG, WebP or GIF up to {MAX_IMAGE_BYTES / 1024 / 1024} MB · MP4,
                MOV or WebM up to {MAX_VIDEO_BYTES / 1024 / 1024} MB · up to{" "}
                {MAX_MEDIA_PER_PROJECT} per project
              </div>
              <input
                type="file"
                name="files"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                disabled={full}
              />
            </label>
            <div className="row">
              <button type="submit" className="btn" disabled={full}>
                Upload
              </button>
              <Link href={`/projects/${project.id}/details`} className="btn secondary">
                {project.media.length > 0
                  ? "Next: athlete details →"
                  : "Skip for now →"}
              </Link>
            </div>
          </form>

          {project.media.length > 0 ? (
            <div>
              <h3>Uploaded ({project.media.length})</h3>
              <div className="media-grid">
                {project.media.map((m) => (
                  <div key={m.id} className="media-tile">
                    <MediaThumb projectId={project.id} item={m} controls />
                    <div className="meta">
                      <span title={m.originalName}>
                        {m.kind === "image" ? "Photo" : "Video"} · {mb(m.sizeBytes)}
                      </span>
                      <form action={deleteMedia.bind(null, project.id, m.id)}>
                        <button type="submit" className="btn danger small">
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="grid" style={{ alignContent: "start" }}>
          <div className="notice warn">
            <strong>Only upload what you have the rights to.</strong>
            <ul>
              <li>Your own photos and video, or ones the owner said you can use.</li>
              <li>Not other families&apos; kids without their parent&apos;s OK.</li>
              <li>
                No broadcast footage, and nothing showing a home address, school
                schedule or phone number.
              </li>
            </ul>
          </div>
          <div className="notice small">
            <strong>What happens to uploads:</strong> they are stored on this computer
            only, inside this project, and are deleted when you delete the project. They
            are not uploaded to any AI or video service — no video service is connected
            yet. Photos and clips are not automatically checked for content; you are the
            check.
          </div>
        </aside>
      </div>
    </div>
  );
}
