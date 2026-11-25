/**
 * Runs ONE step of the phone import through the same /api/iphone copy the older buttons use, and
 * reads its stream into a result. Nothing here touches the phone or the disk itself.
 */

import type { DayRow, ImportStep, StepResult } from "./iphone-import.ts";
import { driveNearlyFullMessage, noRoomMessage } from "./iphone-space.ts";
import type { IphonePageLine } from "./iphone-script.ts";

export interface StepProgress {
  /** Files the phone has for this step that are not in the folder yet (known once it has looked). */
  readonly todo: number;
  readonly todoBytes: number;
  /** Files dealt with so far (copied, already there, failed...). */
  readonly done: number;
  readonly copiedBytes: number;
  /** While the phone is being listed. */
  readonly looking: boolean;
  /** Another copy from the phone is running first. */
  readonly waiting: boolean;
}

export type StepOutcome =
  | { readonly kind: "ok"; readonly result: StepResult }
  /** Stopped, with the reason in plain words; what was copied so far is kept. */
  | { readonly kind: "problem"; readonly message: string; readonly result: StepResult };

export const NO_PHONE =
  "No iPhone found. Plug it in with its cable, unlock it, and tap Trust if it asks, then press the button again.";

export async function runStep(
  step: ImportStep,
  days: number,
  preview: boolean,
  onProgress: (p: StepProgress) => void,
  fetchImpl: typeof fetch = fetch,
  /** The days to bring in (a shared phone). null = every day: only for a phone used for 5 Star alone. */
  pick: readonly string[] | null = null,
): Promise<StepOutcome> {
  let todo = 0;
  let todoBytes = 0;
  let done = 0;
  let copied = 0;
  let already = 0;
  let conflicts = 0;
  let copiedBytes = 0;
  const failed: string[] = [];
  const short: string[] = [];
  let looking = true;
  let waiting = false;
  const result = (): StepResult => ({
    step,
    copied,
    already,
    conflicts,
    failed: [...failed],
    short: [...short],
    bytes: copiedBytes,
    todo,
    todoBytes,
  });
  const tell = () =>
    onProgress({ todo, todoBytes, done, copiedBytes, looking, waiting });
  const problem = (message: string): StepOutcome => ({
    kind: "problem",
    message,
    result: result(),
  });
  try {
    const res = await fetchImpl("/api/iphone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folder: step.folder,
        kind: step.kind,
        days,
        size: step.size,
        preview,
        ...(pick === null ? { allDates: true } : { dates: pick }),
      }),
    });
    if (!res.ok || res.body === null) {
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      return problem(out.error ?? "The iPhone could not be read.");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffered += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffered.indexOf("\n")) !== -1) {
        const line = buffered.slice(0, nl);
        buffered = buffered.slice(nl + 1);
        if (line.trim() === "") continue;
        let m: IphonePageLine;
        try {
          m = JSON.parse(line) as IphonePageLine;
        } catch {
          continue; // one garbled line must not end the whole copy
        }
        if (m.type === "waiting") {
          waiting = true;
          tell();
        } else if (m.type === "none") {
          return problem(NO_PHONE);
        } else if (m.type === "locked") {
          return problem(
            `${m.device} is connected but its files can't be seen yet. Unlock it and tap Trust (then enter its passcode), then press the button again.`,
          );
        } else if (m.type === "error") {
          return problem(m.message);
        } else if (m.type === "stuck") {
          return problem(
            `The iPhone stopped answering after ${copied.toLocaleString("en-US")} files in this step. Unplug it, plug it back in and unlock it, then press the button again. What is copied is kept; the files that failed are tried last next time.`,
          );
        } else if (m.type === "space") {
          if (m.live)
            return problem(driveNearlyFullMessage(step.folder, m.needed, m.free ?? 0));
          if (!m.enough && !preview)
            return problem(noRoomMessage(step.folder, m.needed, m.free));
        } else if (m.type === "looking") {
          looking = true;
          waiting = false;
          tell();
        } else if (m.type === "found") {
          looking = false;
          waiting = false;
          todo = m.todo ?? m.total;
          todoBytes = m.todoBytes ?? m.bytes;
          tell();
        } else if (m.type === "file") {
          done += 1;
          if (m.result === "copied") {
            copied += 1;
            copiedBytes += m.bytes ?? 0;
          } else if (m.result === "already") already += 1;
          else if (m.result === "conflict") conflicts += 1;
          else if (m.result === "short") short.push(`${m.folder}\\${m.name}`);
          else failed.push(`${m.folder}\\${m.name}`);
          tell();
        } else if (m.type === "done" || m.type === "previewed") {
          return { kind: "ok", result: result() };
        }
      }
    }
    return problem(
      "Copying from the iPhone stopped part-way (was it unplugged or locked?). Everything copied so far is complete; press the button again to finish the rest.",
    );
  } catch (e) {
    const why = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return problem(
      `DateSort lost touch with this page (${why.slice(0, 160)}). Press the button again; what is already copied is skipped.`,
    );
  }
}

export type ListOutcome =
  | {
      readonly kind: "ok";
      readonly rows: readonly DayRow[];
      readonly olderFolders: number;
    }
  | { readonly kind: "problem"; readonly message: string };

/**
 * Asks the phone what it has, day by day. Only counts: nothing is copied, and nothing is created.
 * This is the first step for a phone that is also used for family pictures.
 */
export async function listDates(
  folder: string,
  days: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ListOutcome> {
  const problem = (message: string): ListOutcome => ({ kind: "problem", message });
  try {
    const res = await fetchImpl("/api/iphone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list: true, folder, days }),
    });
    if (!res.ok || res.body === null) {
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      return problem(out.error ?? "The iPhone could not be read.");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffered.indexOf("\n")) !== -1) {
        const line = buffered.slice(0, nl);
        buffered = buffered.slice(nl + 1);
        if (line.trim() === "") continue;
        let m: IphonePageLine;
        try {
          m = JSON.parse(line) as IphonePageLine;
        } catch {
          continue;
        }
        if (m.type === "none") return problem(NO_PHONE);
        if (m.type === "locked")
          return problem(
            `${m.device} is connected but its files can't be seen yet. Unlock it and tap Trust (then enter its passcode), then try again.`,
          );
        if (m.type === "error") return problem(m.message);
        if (m.type === "dates") {
          // PowerShell writes a single day as an object, not a list.
          const rows = Array.isArray(m.list)
            ? m.list
            : m.list
              ? [m.list as unknown as DayRow]
              : [];
          return { kind: "ok", rows, olderFolders: m.olderFolders ?? 0 };
        }
      }
    }
    return problem(
      "The phone stopped answering while its days were being counted. Check the cable and that it is unlocked, then try again.",
    );
  } catch (e) {
    const why = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return problem(
      `DateSort lost touch with this page (${why.slice(0, 160)}). Try again.`,
    );
  }
}
