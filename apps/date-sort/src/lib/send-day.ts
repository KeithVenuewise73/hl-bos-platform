import type { SendResult } from "@hl-bos/date-sort/review";

import type { NeedChoice, ReviewLine } from "@/app/api/review/route.ts";
import { progressLine } from "@/lib/review-messages.ts";

/** How sending one date ended. */
export type DayOutcome =
  | { readonly kind: "done"; readonly result: SendResult }
  /** This date has no folder ready to send (not copied yet, or named differently). */
  | { readonly kind: "skip"; readonly message: string }
  /** The website already has a game for this date under another name: ask which one these join. */
  | { readonly kind: "choose"; readonly need: NeedChoice }
  | { readonly kind: "error"; readonly message: string };

/** The person's answer to "which game?": join one the website has, or start a new one. */
export type GameAnswer =
  | { readonly join: { readonly name: string; readonly sport: string } }
  | { readonly asNew: true };

/** The game a date was last joined to, remembered in this browser so Send all does not ask again. */
const KEY = "datesort.joinedGame.";
function remembered(day: string): GameAnswer | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + day) ?? "null") as {
      name?: unknown;
      sport?: unknown;
    } | null;
    return v !== null && typeof v.name === "string"
      ? { join: { name: v.name, sport: typeof v.sport === "string" ? v.sport : "" } }
      : undefined;
  } catch {
    return undefined;
  }
}
function remember(day: string, answer: GameAnswer): void {
  try {
    if ("join" in answer) localStorage.setItem(KEY + day, JSON.stringify(answer.join));
  } catch {
    // private browsing: it will just ask again
  }
}

/**
 * Send one date's photos for review through DateSort's own service, reporting a plain-words
 * progress line as it goes. Used by the date card button and by Send all.
 */
export async function sendDay(
  day: string,
  eventName: string,
  onLine: (line: string) => void,
  signal?: AbortSignal,
  answer?: GameAnswer,
): Promise<DayOutcome> {
  try {
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, eventName, ...(answer ?? remembered(day) ?? {}) }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok || res.body === null) {
      const out = (await res.json().catch(() => ({}))) as {
        error?: string;
        skip?: boolean;
        needChoice?: boolean;
      } & Partial<NeedChoice>;
      if (out.needChoice === true && Array.isArray(out.games))
        return { kind: "choose", need: out as NeedChoice };
      const message = out.error ?? "Could not start sending.";
      return out.skip === true ? { kind: "skip", message } : { kind: "error", message };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    let outcome: DayOutcome | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffered.indexOf("\n")) !== -1) {
        const line = buffered.slice(0, nl);
        buffered = buffered.slice(nl + 1);
        if (line.trim() === "") continue;
        const m = JSON.parse(line) as ReviewLine;
        if (m.type === "progress") onLine(progressLine(m.progress));
        else if (m.type === "done") outcome = { kind: "done", result: m.result };
        else outcome = { kind: "error", message: m.message };
      }
    }
    if (outcome?.kind === "done" && answer !== undefined) remember(day, answer);
    return (
      outcome ?? {
        kind: "error",
        message:
          "DateSort stopped answering. Send again: what is already there is skipped.",
      }
    );
  } catch {
    if (signal?.aborted === true) return { kind: "error", message: "Stopped." };
    return {
      kind: "error",
      message: "DateSort did not answer. Is its window still open?",
    };
  }
}
