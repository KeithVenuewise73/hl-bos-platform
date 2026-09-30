import Link from "next/link";

import { findTemplate, type HypeProject } from "@hl-bos/hype-video";

import { MediaThumb } from "./MediaThumb.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

export function ProjectRow({ project }: { project: HypeProject }) {
  const first = project.media.find((m) => m.kind === "image") ?? project.media[0];
  const who =
    project.details?.athleteName ||
    project.details?.teamOrSchool ||
    "No athlete details yet";
  return (
    <Link
      href={`/projects/${project.id}`}
      className="project-row"
      data-accent={project.accent}
    >
      <div className="thumb" style={{ overflow: "hidden" }}>
        {first === undefined ? (
          "🏆"
        ) : (
          <MediaThumb projectId={project.id} item={first} />
        )}
      </div>
      <div>
        <div className="title">{project.name}</div>
        <div className="sub">
          {who} · {findTemplate(project.template)?.name ?? project.template} · updated{" "}
          {new Date(project.updatedAt).toLocaleDateString()}
        </div>
      </div>
      <StatusBadge status={project.status} />
    </Link>
  );
}
