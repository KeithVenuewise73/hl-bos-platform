/**
 * What DateSort says about sending photos for review. Pure, so it can be tested.
 */

export interface ResultFacts {
  readonly sent: number;
  readonly alreadyThere: number;
  readonly largeAdded: number;
  readonly failed: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
  readonly skipped: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
  /** Short clips newly sent, already there, and left unsent for want of the video tool. */
  readonly clipsSent: number;
  readonly clipsAlreadyThere: number;
  readonly videosNotSent: number;
  readonly clipNotes: readonly string[];
}

const photos = (n: number) => `${n.toLocaleString("en-US")} photo${n === 1 ? "" : "s"}`;
const clips = (n: number) => `${n.toLocaleString("en-US")} clip${n === 1 ? "" : "s"}`;

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
  if (r.clipsSent > 0)
    lines.push(
      `Sent ${clips(r.clipsSent)} for review. They are private until you approve them on the website.`,
    );
  if (r.clipsAlreadyThere > 0)
    lines.push(
      `${clips(r.clipsAlreadyThere)} ${r.clipsAlreadyThere === 1 ? "was" : "were"} already there, so not sent again.`,
    );
  for (const note of r.clipNotes.slice(0, 3)) lines.push(note);
  if (r.largeAdded > 0)
    lines.push(
      `Added the large (3,600 px) copy for ${photos(r.largeAdded)} that were already there, so they can be offered as "Download large".`,
    );
  if (
    r.sent === 0 &&
    r.clipsSent === 0 &&
    r.alreadyThere + r.clipsAlreadyThere > 0 &&
    r.largeAdded === 0 &&
    r.failed.length === 0 &&
    r.videosNotSent === 0
  )
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
      `${clips(r.videosNotSent)} ${r.videosNotSent === 1 ? "was" : "were"} not sent: converting a clip needs a free program called ffmpeg, and it was not found on this computer. Install it, then press Send for review again.`,
    );
  return lines;
}

export interface ProgressFacts {
  readonly phase: "reading" | "checking" | "sending" | "large" | "clips" | "done";
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
  if (p.phase === "clips")
    return `Converting and sending clips… ${p.done.toLocaleString("en-US")} of ${p.total.toLocaleString("en-US")}`;
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
  readonly clipsSent: number;
  readonly clipsAlreadyThere: number;
  /** Clips left unsent because the free video tool (ffmpeg) is missing. */
  readonly clipsNeedTool: number;
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
export function allDoneLines(
  t: AllTotals,
  stopped: boolean,
  /** How many short clips the scan found: they are sent from the date folders, not from the scan. */
  scanClips = 0,
): string[] {
  const lines: string[] = [
    `${stopped ? "Stopped." : "Finished."} ${t.daysDone.toLocaleString("en-US")} date${t.daysDone === 1 ? "" : "s"} done: ${photos(t.sent)} newly sent for review, ${photos(t.alreadyThere)} already there.`,
  ];
  if (t.clipsSent > 0 || t.clipsAlreadyThere > 0)
    lines.push(
      `Clips: ${t.clipsSent.toLocaleString("en-US")} newly sent, ${t.clipsAlreadyThere.toLocaleString("en-US")} already there.`,
    );
  if (
    !stopped &&
    scanClips > 0 &&
    t.clipsSent === 0 &&
    t.clipsAlreadyThere === 0 &&
    t.clipsNeedTool === 0
  )
    lines.push(
      `The scan found ${scanClips.toLocaleString("en-US")} short clip${scanClips === 1 ? "" : "s"}, but none were in the date folders on the drive, so none were sent. Press Copy all dates first (it puts the clips next to the photos), then send again.`,
    );
  if (t.clipsNeedTool > 0)
    lines.push(
      `${t.clipsNeedTool.toLocaleString("en-US")} clip${t.clipsNeedTool === 1 ? " was" : "s were"} not sent: converting clips needs the free program ffmpeg, which was not found on this computer.`,
    );
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

/** How a date card says how much of it is already on the website. */
export type DayStatus =
  | { readonly kind: "none"; readonly text: string }
  | { readonly kind: "partial"; readonly text: string }
  | { readonly kind: "all"; readonly text: string };

const num = (v: number) => v.toLocaleString("en-US");

/**
 * Photos and clips are compared with their own kind on the website: 112 clips on a card are not "all
 * on 5Star" because 5Star holds 1,401 photos of that day.
 */
export function dayStatus(
  stills: number,
  onSite: number,
  approved: number,
  clipCount = 0,
  clipsOnSite = 0,
): DayStatus {
  const parts: { kind: DayStatus["kind"]; text: string }[] = [];
  if (stills > 0 || clipCount === 0) {
    const extra = approved > 0 ? ` (${num(approved)} approved)` : "";
    if (onSite <= 0) parts.push({ kind: "none", text: "Not on 5Star yet." });
    else if (onSite >= stills)
      parts.push({ kind: "all", text: `On 5Star: all ${num(stills)} photos${extra}.` });
    else
      parts.push({
        kind: "partial",
        text: `On 5Star: ${num(onSite)} of ${num(stills)} photos${extra}. Send for review adds the rest.`,
      });
  }
  if (clipCount > 0) {
    const label = clipCount === 1 ? "clip" : "clips";
    if (clipsOnSite <= 0)
      parts.push({
        kind: "none",
        text:
          stills > 0
            ? `${num(clipCount)} ${label} not on 5Star yet.`
            : `Not on 5Star yet.`,
      });
    else if (clipsOnSite >= clipCount)
      parts.push({
        kind: "all",
        text: `On 5Star: all ${num(clipCount)} ${label}.`,
      });
    else
      parts.push({
        kind: "partial",
        text: `On 5Star: ${num(clipsOnSite)} of ${num(clipCount)} ${label}. Send for review adds the rest.`,
      });
  }
  const kinds = new Set(parts.map((p) => p.kind));
  const kind: DayStatus["kind"] = kinds.size === 1 ? parts[0]!.kind : "partial";
  return { kind, text: parts.map((p) => p.text).join(" ") };
}
