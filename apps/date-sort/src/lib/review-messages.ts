/**
 * What DateSort says about sending photos for review. Pure, so it can be tested.
 */

export interface ResultFacts {
  readonly sent: number;
  readonly alreadyThere: number;
  readonly largeAdded: number;
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
  if (r.largeAdded > 0)
    lines.push(
      `Added the large (3,600 px) copy for ${photos(r.largeAdded)} that were already there, so they can be offered as "Download large".`,
    );
  if (r.sent === 0 && r.alreadyThere > 0 && r.largeAdded === 0 && r.failed.length === 0)
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
  readonly phase: "reading" | "checking" | "sending" | "large" | "done";
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
  if (p.phase === "large")
    return `Adding large copies… ${p.done.toLocaleString("en-US")} of ${p.total.toLocaleString("en-US")}`;
  return "Finishing…";
}

/** Running totals while "Send all" works through every date. */
export interface AllTotals {
  /** Dates worked through (sent, or everything already there). */
  readonly daysDone: number;
  readonly sent: number;
  readonly alreadyThere: number;
  readonly largeAdded: number;
  readonly failedPhotos: number;
  /** Dates passed by because their folder is not ready, each with the reason. */
  readonly skippedDays: ReadonlyArray<{
    readonly day: string;
    readonly reason: string;
  }>;
  /** Dates that stopped part way, each with the reason. */
  readonly problemDays: ReadonlyArray<{
    readonly day: string;
    readonly reason: string;
  }>;
}

/** The sentences shown when Send all has finished (or was stopped). */
export function allDoneLines(t: AllTotals, stopped: boolean): string[] {
  const lines: string[] = [
    `${stopped ? "Stopped." : "Finished."} ${t.daysDone.toLocaleString("en-US")} date${t.daysDone === 1 ? "" : "s"} done: ${photos(t.sent)} newly sent for review, ${photos(t.alreadyThere)} already there.`,
  ];
  if (t.largeAdded > 0)
    lines.push(`Added the large copy for ${photos(t.largeAdded)} already there.`);
  if (t.failedPhotos > 0)
    lines.push(
      `${photos(t.failedPhotos)} could not be sent. Send those dates again to retry just them.`,
    );
  if (t.skippedDays.length > 0)
    lines.push(
      `${t.skippedDays.length.toLocaleString("en-US")} date${t.skippedDays.length === 1 ? " was" : "s were"} passed by because ${t.skippedDays.length === 1 ? "its" : "their"} folder is not ready: ${t.skippedDays
        .slice(0, 3)
        .map((d) => d.day)
        .join(
          ", ",
        )}${t.skippedDays.length > 3 ? " and others" : ""}. Use Create Folder for them, then press Send all again.`,
    );
  for (const p of t.problemDays.slice(0, 5))
    lines.push(`${p.day} stopped: ${p.reason}`);
  return lines;
}
