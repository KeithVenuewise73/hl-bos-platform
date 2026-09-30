import Link from "next/link";

import { TEMPLATES } from "@hl-bos/hype-video";

import { CreateProjectForm } from "@/components/CreateProjectForm.tsx";
import { ProjectRow } from "@/components/ProjectRow.tsx";
import { writerStatus } from "@/lib/ai.ts";
import { store } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const projects = await store().list();
  const recent = projects.slice(0, 4);
  const generated = projects.filter((p) => p.generations.length > 0).length;
  const writer = writerStatus();

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div className="split">
        <section className="card hero">
          <div className="kicker">5-Star Sports Media</div>
          <h1>Make a hype video for your athlete.</h1>
          <p className="lede">
            Upload a photo or clip, add the details, pick a style — get the full hype
            package: scripts, voiceover, caption, hashtags and ready-to-go video and
            music prompts.
          </p>
          <CreateProjectForm />
        </section>

        <aside className="grid" style={{ alignContent: "start" }}>
          <section className="card">
            <h3>Your projects</h3>
            {projects.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                None yet. Your first project will show up here.
              </p>
            ) : (
              <>
                <p style={{ margin: "0 0 12px" }}>
                  <strong>{projects.length}</strong> project
                  {projects.length === 1 ? "" : "s"} · <strong>{generated}</strong> with
                  a generated package
                </p>
                <div className="grid" style={{ gap: 8 }}>
                  {recent.map((p) => (
                    <ProjectRow key={p.id} project={p} />
                  ))}
                </div>
                {projects.length > recent.length ? (
                  <p className="small" style={{ marginBottom: 0 }}>
                    <Link href="/projects">See all {projects.length} →</Link>
                  </p>
                ) : null}
              </>
            )}
          </section>

          <section className="card">
            <h3>How packages are written</h3>
            <p className="small muted" style={{ margin: 0 }}>
              {writer.detail}
            </p>
          </section>

          <section className="card">
            <h3>Privacy</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Every project is private and stored only on this computer. Nothing is
              posted or shared for you — you download the package and decide where it
              goes.
            </p>
          </section>
        </aside>
      </div>

      <section>
        <h2>Hype styles</h2>
        <div className="grid-3">
          {TEMPLATES.map((t) => (
            <Link
              key={t.key}
              href={`/projects/new?template=${t.key}`}
              className="card"
              style={{ textDecoration: "none" }}
            >
              <strong>{t.name}</strong>
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                {t.tagline}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
