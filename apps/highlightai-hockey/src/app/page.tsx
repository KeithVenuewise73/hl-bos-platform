import Link from "next/link";

import { describeStatus } from "@hl-bos/hockey-highlights";

import { Card, Empty, Jersey } from "@/components/ui.tsx";
import { loadWorkspace } from "@/lib/store.ts";
import { jobFor } from "@/lib/workspace.ts";
import { visionProvider } from "@/lib/pipeline-runner.ts";

export const dynamic = "force-dynamic";

export default async function Home() {
  const workspace = await loadWorkspace();
  const availability = await visionProvider().availability();
  const projects = [...workspace.projects].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <>
      <h1>Your games</h1>

      {/*
        The analysis service's state is on the home page, not buried in
        Settings. If it cannot run, the user should learn that before they
        upload four gigabytes of video, not after.
      */}
      {!availability.available && (
        <div className="banner">
          <strong>Analysis is not available right now.</strong>
          <p>{availability.detail}</p>
          {availability.remedy !== null && (
            <p className="footnote mono">{availability.remedy}</p>
          )}
        </div>
      )}

      {projects.length === 0 ? (
        <Card>
          <Empty
            heading="No games yet."
            reasons={[
              "Nothing has been uploaded to this account.",
              "Start by creating a game and describing the player you want the reel to be about.",
            ]}
          />
          <Link href="/new" className="primary-link">
            Create your first game
          </Link>
        </Card>
      ) : (
        <ul className="projects">
          {projects.map((project) => {
            const job = jobFor(workspace, project.id);
            return (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} className="project">
                  <span className="project-name">{project.name}</span>
                  <span className="project-meta">
                    {project.athlete.name} ·{" "}
                    <Jersey
                      colorId={project.athlete.jerseyColorId}
                      number={project.athlete.jerseyNumber}
                    />
                    {project.gameDate.length > 0 && ` · ${project.gameDate}`}
                  </span>
                  <span
                    className={`project-status status-${job?.status ?? "uploaded"}`}
                  >
                    {describeStatus(job?.status ?? "uploaded").label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
