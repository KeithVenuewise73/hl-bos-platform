import type { SendResult } from "@hl-bos/date-sort/review";

import type { ReviewLine } from "@/app/api/review/route.ts";
import { progressLine } from "@/lib/review-messages.ts";

/** How sending one date ended. */
export type DayOutcome =
  | { readonly kind: "done"; readonly result: SendResult }
  /** This date has no folder ready to send (not copied yet, or named differently). */
  | { readonly kind: "skip"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

/**
 * Send one date's photos for review through DateSort's own service, reporting a plain-words
 * progress line as it goes. Used by the date card button and by Send all.
 */
export async function sendDay(
  day: string,
  eventName: string,
  onLine: (line: string) => void,
  signal?: AbortSignal,
): Promise<DayOutcome> {
  try {
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, eventName }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok || res.body === null) {
      const out = (await res.json().catch(() => ({}))) as {
        error?: string;
        skip?: boolean;
      };
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
