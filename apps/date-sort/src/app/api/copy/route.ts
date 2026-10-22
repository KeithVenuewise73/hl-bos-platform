import { copyDays, CopyError, type DayRequest } from "@hl-bos/date-sort/copy";

import { HEARTBEAT_MS } from "@/lib/copy-watch.ts";
import { guard } from "@/lib/guard.ts";
import { keepAwake } from "@/lib/keep-awake.ts";
import { findScan } from "@/lib/scan-store.ts";
import type { CopyMessage } from "@/lib/scan-view.ts";

export const dynamic = "force-dynamic";

/** One copy at a time: two at once would compete for the same disk. */
let busy = false;

/**
 * Create the date folders and COPY the photos into them, streaming progress
 * as lines of JSON. Originals are only read; nothing is ever overwritten
 * (@hl-bos/date-sort's copy/write-file.ts). Closing the page cancels it,
 * leaving no half-written file; pressing the button again finishes the rest.
 * While it runs, Windows is asked not to sleep (keep-awake.ts): a sleeping
 * laptop drops the page's connection, which would stop the copy.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;

  const body = (await request.json().catch(() => ({}))) as {
    scanId?: unknown;
    destination?: unknown;
    days?: unknown;
  };
  const scan = typeof body.scanId === "string" ? findScan(body.scanId) : undefined;
  if (scan === undefined) {
    return Response.json(
      {
        error:
          "DateSort was restarted since this scan. Press Scan again, then Create Folder.",
      },
      { status: 409 },
    );
  }
  const destination =
    typeof body.destination === "string"
      ? body.destination.trim().replace(/^"(.*)"$/, "$1")
      : "";
  const days: DayRequest[] = Array.isArray(body.days)
    ? body.days.flatMap((d: unknown) => {
        const o = d as { day?: unknown; eventName?: unknown };
        if (typeof o?.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.day)) return [];
        return [
          { day: o.day, eventName: typeof o.eventName === "string" ? o.eventName : "" },
        ];
      })
    : [];
  if (days.length === 0)
    return Response.json({ error: "No dates chosen." }, { status: 400 });
  if (busy) {
    return Response.json(
      {
        error:
          "A copy is already running (or the last one is still stopping). Try again in a minute; nothing is lost.",
      },
      { status: 409 },
    );
  }
  busy = true;

  const encoder = new TextEncoder();
  const started = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (m: CopyMessage) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(m)}\n`));
        } catch {
          // the page went away; the copy notices through request.signal
        }
      };
      let lastSent = 0;
      const awake = await keepAwake();
      send({ type: "awake", held: awake.held });
      // Lets the page tell "busy" from "gone quiet" (copy-watch.ts).
      const heartbeat = setInterval(() => send({ type: "alive" }), HEARTBEAT_MS);
      try {
        const results = await copyDays({
          root: scan.root,
          files: scan.files,
          destination,
          days,
          signal: request.signal,
          onProgress: (p) => {
            const now = Date.now();
            if (now - lastSent < 200 && p.done !== p.total) return;
            lastSent = now;
            send({ type: "progress", ...p });
          },
        });
        send({ type: "done", days: results, seconds: (Date.now() - started) / 1000 });
      } catch (e) {
        if (request.signal.aborted) return;
        send({
          type: "error",
          message:
            e instanceof CopyError
              ? e.message
              : `The copy stopped: ${e instanceof Error ? e.message : String(e)}. Your originals were not touched; press the button again to finish.`,
        });
      } finally {
        clearInterval(heartbeat);
        awake.release();
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
