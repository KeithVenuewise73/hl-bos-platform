import type { ScannedPhoto } from "@hl-bos/date-sort";
import {
  claudeAsker,
  explainClaudeError,
  loadKey,
  sampleKey,
  savedGuess,
  saveGuess,
  suggestSport,
} from "@hl-bos/date-sort/sport";

import { guard } from "@/lib/guard.ts";
import { findScan } from "@/lib/scan-store.ts";
import type { SportMessage } from "@/lib/scan-view.ts";

export const dynamic = "force-dynamic";

/** One request at a time, three dates at once inside it. */
let busy = false;
const AT_ONCE = 3;

/**
 * Suggest each date's sport with Claude, streaming one line of JSON per
 * date. Small previews of about 8 JPGs per date are sent to Anthropic; a
 * date already answered for the same photos is not asked again. Originals
 * are only read. Suggestions only: nothing is renamed or applied here.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as {
    scanId?: unknown;
    days?: unknown;
  };
  const scan = typeof body.scanId === "string" ? findScan(body.scanId) : undefined;
  if (scan === undefined) {
    return Response.json(
      { error: "DateSort was restarted since this scan. Press Scan again first." },
      { status: 409 },
    );
  }
  const apiKey = await loadKey();
  if (apiKey === null) {
    return Response.json({ error: "Add your Claude key first." }, { status: 409 });
  }
  const all = scan.report.days.map((d) => d.day);
  const days = Array.isArray(body.days)
    ? all.filter((d) => (body.days as unknown[]).includes(d))
    : all;
  if (days.length === 0)
    return Response.json({ error: "No dates chosen." }, { status: 400 });
  if (busy) {
    return Response.json(
      { error: "Sports are already being suggested. Wait for that to finish." },
      { status: 409 },
    );
  }
  busy = true;

  const photos = scan.files.filter((f): f is ScannedPhoto => f.kind === "photo");
  const ask = claudeAsker({ apiKey });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (m: SportMessage) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(m)}\n`));
        } catch {
          // the page went away
        }
      };
      let next = 0;
      const worker = async () => {
        while (next < days.length && !request.signal.aborted) {
          const day = days[next++]!;
          const samples = sampleKey(photos, day);
          try {
            const saved = await savedGuess(day, samples);
            if (saved !== null) {
              send({ type: "guess", guess: saved, cached: true });
              continue;
            }
            const guess = await suggestSport({
              root: scan.root,
              photos,
              day,
              ask,
              signal: request.signal,
            });
            if (guess.looked > 0) await saveGuess(guess, samples);
            send({ type: "guess", guess, cached: false });
          } catch (e) {
            if (request.signal.aborted) return;
            send({ type: "failed", day, message: explainClaudeError(e) });
          }
        }
      };
      try {
        await Promise.all(Array.from({ length: AT_ONCE }, worker));
        send({ type: "done" });
      } finally {
        busy = false;
        try {
          controller.close();
        } catch {
          // the page went away
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
