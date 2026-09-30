import Link from "next/link";

import { ProjectRow } from "@/components/ProjectRow.tsx";
import { param } from "@/lib/load.ts";
import { store } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

export default async function ProjectHistory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const deleted = param((await searchParams)["deleted"]) === "1";
  const projects = await store().list();
  return (
    <div>
      <div className="kicker">Project history</div>
      <h1>Your hype projects</h1>
      <p className="lede">Newest first. Every project is private.</p>
      {deleted ? (
        <p className="notice good">
          Project deleted, along with every photo and clip uploaded to it.
        </p>
      ) : null}
      {projects.length === 0 ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>No projects yet.</p>
          <Link href="/projects/new" className="btn">
            Create your first hype video
          </Link>
        </div>
      ) : (
        <div className="grid" style={{ gap: 10 }}>
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
