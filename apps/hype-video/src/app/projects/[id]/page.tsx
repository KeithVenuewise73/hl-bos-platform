import Link from "next/link";

import {
  capabilityStatuses,
  describeProducer,
  findTemplate,
  latestGeneration,
  orderedSections,
  readiness,
} from "@hl-bos/hype-video";

import { CopyButton } from "@/components/CopyButton.tsx";
import { MediaThumb } from "@/components/MediaThumb.tsx";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import { Steps } from "@/components/Steps.tsx";
import { deleteProject, generate } from "@/lib/actions.ts";
import { writerStatus } from "@/lib/ai.ts";
import { loadProject, param } from "@/lib/load.ts";

export const dynamic = "force-dynamic";

export default async function PackagePreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const project = await loadProject((await params).id);
  const error = param((await searchParams)["error"]);
  const ready = readiness(project);
  const record = latestGeneration(project);
  const template = findTemplate(project.template);
  const hero = project.media.find((m) => m.kind === "image") ?? project.media[0];
  // Everything except payments, which lives on the pricing page.
  const integrations = capabilityStatuses().filter((c) => c.key !== "payments");

  return (
    <div data-accent={project.accent}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="kicker">{project.name}</div>
          <h1>Hype package</h1>
        </div>
        <div className="row">
          <StatusBadge status={project.status} />
          <span className="badge private">Private</span>
        </div>
      </div>
      <Steps project={project} current="package" />

      {error !== undefined ? (
        <div className="notice bad" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      {!ready.canGenerate ? (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          <strong>Before we can write this package:</strong>
          <ul>
            {ready.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p style={{ marginBottom: 0 }}>
            <Link href={`/projects/${project.id}/details`}>
              Go to athlete details →
            </Link>
          </p>
        </div>
      ) : null}

      <div className="split">
        <section className="grid" style={{ alignContent: "start" }}>
          <div className={`preview-hero${hero === undefined ? " empty" : ""}`}>
            {hero !== undefined ? (
              <MediaThumb
                projectId={project.id}
                item={hero}
                controls={hero.kind === "video"}
              />
            ) : null}
            <div className="overlay">
              <div className="bar" />
              <h2>
                {record?.package.title ?? project.details?.athleteName ?? project.name}
              </h2>
              <div className="muted small">
                {template?.name} ·{" "}
                <span style={{ textTransform: "capitalize" }}>{project.tone}</span>
              </div>
            </div>
          </div>

          {record === null ? (
            <div className="card">
              <h2>Ready when you are</h2>
              <p className="muted">
                We&apos;ll write the title, 15- and 30-second scripts, voiceover,
                caption, hashtags, on-screen text, an AI video prompt, an AI music
                prompt and a sponsor line
                {project.details?.sponsorName ? "" : " (if you add a sponsor)"}.
              </p>
              <form action={generate.bind(null, project.id)}>
                <button type="submit" className="btn big" disabled={!ready.canGenerate}>
                  ⚡ Generate hype package
                </button>
              </form>
            </div>
          ) : (
            <>
              {project.packageStale ? (
                <div className="notice warn">
                  You changed the details or style after this package was written.
                  Generate again to update it.
                </div>
              ) : null}
              <div className="notice small">
                <strong>{describeProducer(record.producedBy)}.</strong> Generated{" "}
                {new Date(record.generatedAt).toLocaleString()}.
                {record.notes.map((n) => (
                  <p key={n} style={{ margin: "6px 0 0" }}>
                    {n}
                  </p>
                ))}
              </div>

              {orderedSections(record.package, project.outputTypes)
                .slice(1)
                .map((s) =>
                  s.heading === "Hashtags" ? (
                    <div key={s.heading} className="block">
                      <div className="block-head">
                        <h3>Hashtags</h3>
                        <CopyButton text={s.body} />
                      </div>
                      <div className="tags">
                        {record.package.hashtags.map((h) => (
                          <span key={h} className="tag">
                            #{h}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : s.heading === "On-screen text" ? (
                    <div key={s.heading} className="block">
                      <div className="block-head">
                        <h3>On-screen text</h3>
                        <CopyButton text={s.body} />
                      </div>
                      <ol className="timeline">
                        {record.package.onScreenText.map((b) => (
                          <li key={`${b.atSecond}-${b.text}`}>
                            <span className="t">{b.atSecond}s</span>
                            <span className="card-text">{b.text}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <div key={s.heading} className="block">
                      <div className="block-head">
                        <h3>{s.heading}</h3>
                        {record.package.sponsorCallout === null &&
                        s.heading === "Sponsor callout" ? null : (
                          <CopyButton text={s.body} />
                        )}
                      </div>
                      <pre>{s.body}</pre>
                    </div>
                  ),
                )}
            </>
          )}
        </section>

        <aside className="grid" style={{ alignContent: "start" }}>
          {record !== null ? (
            <section className="card stack">
              <h3>Export package</h3>
              <p className="small muted" style={{ margin: 0 }}>
                Downloads everything above. Nothing is posted anywhere — you choose
                where it goes.
              </p>
              <form
                action={`/api/projects/${project.id}/export`}
                method="post"
                className="row"
              >
                <button type="submit" name="format" value="txt" className="btn">
                  ⬇ Export Package (.txt)
                </button>
                <button
                  type="submit"
                  name="format"
                  value="md"
                  className="btn secondary small"
                >
                  .md
                </button>
                <button
                  type="submit"
                  name="format"
                  value="json"
                  className="btn secondary small"
                >
                  .json
                </button>
              </form>
              {project.exportedAt !== null ? (
                <p className="small muted" style={{ margin: 0 }}>
                  Last exported {new Date(project.exportedAt).toLocaleString()}.
                </p>
              ) : null}
              <form action={generate.bind(null, project.id)}>
                <button
                  type="submit"
                  className="btn secondary"
                  disabled={!ready.canGenerate}
                >
                  ↻ Generate again
                </button>
              </form>
              {project.generations.length > 1 ? (
                <p className="small muted" style={{ margin: 0 }}>
                  {project.generations.length} versions kept; the newest is shown.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="card stack">
            <h3>Make it a video</h3>
            <p className="small muted" style={{ margin: 0 }}>
              The package already contains what these services need. They aren&apos;t
              connected yet, so these buttons are switched off — nothing pretends to
              render.
            </p>
            {integrations.map((c) => (
              <div key={c.key} className="integration">
                <button
                  type="button"
                  className="btn secondary"
                  disabled
                  aria-describedby={`why-${c.key}`}
                >
                  {c.action}
                </button>
                <p id={`why-${c.key}`}>
                  {c.what} {c.detail}
                </p>
              </div>
            ))}
          </section>

          <section className="card stack">
            <h3>Privacy</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Private — stored only on this computer. Public sharing isn&apos;t
              available in this version, so nothing about this athlete is published by
              the app.
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              Consent recorded{" "}
              {project.consent.confirmedAt === null
                ? ""
                : new Date(project.consent.confirmedAt).toLocaleDateString()}
              {project.consent.featuresMinor
                ? ` · guardian: ${project.consent.guardianName}`
                : " · adult athlete"}
              .
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              {writerStatus().detail}
            </p>
            <form action={deleteProject.bind(null, project.id)}>
              <button type="submit" className="btn danger small">
                Delete project and all its media
              </button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}
