/**
 * Assembling the finished reel.
 *
 * A render plan, not a renderer: this file decides what goes in, in what order,
 * with what title and at what offset. Actually moving bytes is the vision
 * service's job (services/hockey-vision), which has ffmpeg. Keeping the plan
 * pure means the ordering rules are unit-testable without a media toolchain.
 *
 * The rule from `review.ts` is enforced again here. `buildReel` filters to
 * accepted clips itself rather than trusting its caller to have done so —
 * belt and braces on the one path where being wrong means sending a family a
 * video of somebody else's child.
 */

import { acceptedClips } from "./review.ts";
import { clipDuration, effectiveWindow } from "./clips.ts";
import type { Clip, HighlightProject, HighlightReel, ReelEntry } from "./types.ts";

export interface ReelOptions {
  readonly id: string;
  readonly now: string;
  /** Override the generated title. */
  readonly title?: string;
  readonly subtitle?: string;
}

export class EmptyReelError extends Error {
  constructor() {
    super(
      "A reel needs at least one approved clip. Nothing is rendered from clips nobody has looked at.",
    );
    this.name = "EmptyReelError";
  }
}

/**
 * The reel's title.
 *
 * Built from what the user actually typed — athlete, number, teams, date — and
 * nothing else. No "Season Highlights", no invented achievement, no adjective
 * the footage has not earned.
 */
export function reelTitle(project: HighlightProject): string {
  const { athlete } = project;
  return `${athlete.name} · #${athlete.jerseyNumber}`;
}

export function reelSubtitle(project: HighlightProject): string {
  const parts: string[] = [];
  if (project.team.length > 0 && project.opponent.length > 0) {
    parts.push(`${project.team} vs ${project.opponent}`);
  } else if (project.team.length > 0) {
    parts.push(project.team);
  }
  if (project.gameDate.length > 0) parts.push(formatGameDate(project.gameDate));
  return parts.join(" · ");
}

function formatGameDate(iso: string): string {
  // Parsed as a plain calendar date. `new Date("2026-02-14")` is UTC midnight,
  // which renders as the 13th for anyone west of Greenwich — and the date on a
  // family's highlight reel being a day off is the kind of small wrongness that
  // makes people distrust everything else on the screen.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) return iso;
  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) return iso;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const name = months[Number(month) - 1];
  if (name === undefined) return iso;
  return `${name} ${Number(day)}, ${year}`;
}

export function buildReel(
  project: HighlightProject,
  clips: readonly Clip[],
  options: ReelOptions,
): HighlightReel {
  const kept = acceptedClips(clips);
  if (kept.length === 0) throw new EmptyReelError();

  let offset = 0;
  const entries: ReelEntry[] = [];
  for (const clip of kept) {
    const { start, end } = effectiveWindow(clip);
    const duration = clipDuration(clip);
    entries.push({
      clipId: clip.id,
      startTime: round2(start),
      endTime: round2(end),
      reelOffset: round2(offset),
      durationSeconds: duration,
    });
    offset += duration;
  }

  return {
    id: options.id,
    projectId: project.id,
    title: options.title ?? reelTitle(project),
    subtitle: options.subtitle ?? reelSubtitle(project),
    entries,
    totalDurationSeconds: round2(offset),
    mediaAssetId: null,
    createdAt: options.now,
  };
}

/**
 * The instruction the renderer follows.
 *
 * Cuts are taken from the ORIGINAL upload, never from the proxy. The proxy is a
 * downscaled copy made so analysis is cheap; rendering the family's keepsake
 * from it would hand them a soft, blocky video of their own child. The proxy's
 * only job is to be looked at by a model.
 */
export interface RenderPlan {
  readonly reelId: string;
  readonly sourceStorageKey: string;
  readonly cuts: readonly { readonly start: number; readonly end: number }[];
  readonly title: string;
  readonly subtitle: string;
}

export function renderPlan(
  reel: HighlightReel,
  originalStorageKey: string,
): RenderPlan {
  return {
    reelId: reel.id,
    sourceStorageKey: originalStorageKey,
    cuts: reel.entries.map((entry) => ({ start: entry.startTime, end: entry.endTime })),
    title: reel.title,
    subtitle: reel.subtitle,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
