/**
 * What DateSort says about sending photos for review. Pure, so it can be tested.
 */

export interface ResultFacts {
  readonly sent: number;
  readonly alreadyThere: number;
  readonly failed: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
  readonly skipped: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
  readonly videosNotSent: number;
}

const photos = (n: number) => `${n.toLocaleString("en-US")} photo${n === 1 ? "" : "s"}`;

/** The sentences shown after a send finished. */
export function resultLines(r: ResultFacts): string[] {
  const lines: string[] = [];
  if (r.sent > 0)
    lines.push(
      `Sent ${photos(r.sent)} for review. They are private until you approve them on the website.`,
    );
  if (r.alreadyThere > 0)
    lines.push(
      `${photos(r.alreadyThere)} ${r.alreadyThere === 1 ? "was" : "were"} already there, so not sent again.`,
    );
  if (r.sent === 0 && r.alreadyThere > 0 && r.failed.length === 0)
    lines.push("Everything in this folder is already waiting for review.");
  if (r.failed.length > 0)
    lines.push(
      `${photos(r.failed.length)} could not be sent: ${r.failed
        .slice(0, 3)
        .map((f) => `${f.path} (${f.reason.replace(/\.$/, "")})`)
        .join("; ")}${r.failed.length > 3 ? `; and ${r.failed.length - 3} more` : ""}.`,
    );
  if (r.skipped.length > 0)
    lines.push(
      `${r.skipped.length.toLocaleString("en-US")} file${r.skipped.length === 1 ? " was" : "s were"} not sent: ${r.skipped[0]!.path} (${r.skipped[0]!.reason.replace(/\.$/, "")})${r.skipped.length > 1 ? " and others" : ""}.`,
    );
  if (r.videosNotSent > 0)
    lines.push(
      `${r.videosNotSent.toLocaleString("en-US")} video${r.videosNotSent === 1 ? "" : "s"} in this folder ${r.videosNotSent === 1 ? "was" : "were"} not sent: videos are not part of review yet.`,
    );
  return lines;
}

export interface ProgressFacts {
  readonly phase: "reading" | "checking" | "sending" | "done";
  readonly done: number;
  readonly total: number;
}

/** One line of live progress. */
export function progressLine(p: ProgressFacts): string {
  if (p.phase === "reading") return "Looking at the folder…";
  if (p.phase === "checking")
    return `Checking what the website already has… ${p.done.toLocaleString("en-US")} of ${p.total.toLocaleString("en-US")}`;
  if (p.phase === "sending")
    return `Sending for review… ${p.done.toLocaleString("en-US")} of ${p.total.toLocaleString("en-US")}`;
  return "Finishing…";
}
