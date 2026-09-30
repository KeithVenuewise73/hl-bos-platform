import Link from "next/link";

import type { HypeProject } from "@hl-bos/hype-video";

const STEPS = [
  { key: "media", label: "1 · Media", href: (id: string) => `/projects/${id}/media` },
  {
    key: "details",
    label: "2 · Athlete",
    href: (id: string) => `/projects/${id}/details`,
  },
  {
    key: "template",
    label: "3 · Template",
    href: (id: string) => `/projects/${id}/template`,
  },
  {
    key: "package",
    label: "4 · Hype package",
    href: (id: string) => `/projects/${id}`,
  },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

function isDone(project: HypeProject, key: StepKey): boolean {
  switch (key) {
    case "media":
      return project.media.length > 0;
    case "details":
      return (
        project.details !== null &&
        project.status !== "draft" &&
        project.status !== "media_uploaded"
      );
    case "template":
      return project.generations.length > 0;
    case "package":
      return project.generations.length > 0;
  }
}

export function Steps({
  project,
  current,
}: {
  project: HypeProject;
  current: StepKey;
}) {
  return (
    <ol className="steps" aria-label="Project steps">
      {STEPS.map((s) => (
        <li
          key={s.key}
          className={
            s.key === current ? "current" : isDone(project, s.key) ? "done" : undefined
          }
        >
          <Link
            href={s.href(project.id)}
            aria-current={s.key === current ? "step" : undefined}
          >
            {isDone(project, s.key) && s.key !== current ? "✓ " : ""}
            {s.label}
          </Link>
        </li>
      ))}
    </ol>
  );
}
