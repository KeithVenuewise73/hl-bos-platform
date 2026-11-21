/**
 * What DateSort says about freeing up the card. Pure, so it can be tested.
 */

export interface KeptFile {
  readonly path: string;
  readonly reason: string;
}

export interface KeptGroup {
  readonly reason: string;
  readonly words: string;
  readonly count: number;
  /** A few file names, so the person can find them. */
  readonly examples: readonly string[];
}

const name = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Group kept files by why they were kept, biggest group first. */
export function groupKept(
  kept: readonly KeptFile[],
  words: Readonly<Record<string, string>>,
): KeptGroup[] {
  const by = new Map<string, string[]>();
  for (const k of kept) by.set(k.reason, [...(by.get(k.reason) ?? []), name(k.path)]);
  return [...by.entries()]
    .map(([reason, files]) => ({
      reason,
      words: words[reason] ?? reason,
      count: files.length,
      examples: files.slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1));
}

const n = (v: number) => v.toLocaleString("en-US");
export const bytesWords = (b: number) =>
  b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`;

export function files(count: number): string {
  return `${n(count)} file${count === 1 ? "" : "s"}`;
}

/** The headline after a check. */
export function checkedLine(safe: number, videos: number, bytes: number): string {
  if (safe === 0) return "Nothing on the card can be deleted yet.";
  const photos = safe - videos;
  const parts = [
    photos > 0 ? `${n(photos)} photo${photos === 1 ? "" : "s"}` : null,
    videos > 0 ? `${n(videos)} video${videos === 1 ? "" : "s"}` : null,
  ].filter((p): p is string => p !== null);
  return `${parts.join(" and ")} (${bytesWords(bytes)}) can be deleted from the card. Each has an identical copy on your hard drive${photos > 0 ? ", and each photo is already on 5Star" : ""}.`;
}

/** The sentences after deleting. */
export function freedLines(
  removed: number,
  bytes: number,
  kept: number,
  failed: number,
  stopped: boolean,
): string[] {
  const lines = [
    `${stopped ? "Stopped. " : ""}Deleted ${files(removed)} from the card${removed > 0 ? `, freeing ${bytesWords(bytes)}` : ""}.`,
  ];
  if (kept > 0)
    lines.push(
      `${files(kept)} ${kept === 1 ? "was" : "were"} kept because ${kept === 1 ? "it" : "they"} no longer matched at the final check.`,
    );
  if (failed > 0)
    lines.push(
      `${files(failed)} could not be deleted (is the card's lock switch on?). They are still on the card, and still safe on your hard drive.`,
    );
  return lines;
}
