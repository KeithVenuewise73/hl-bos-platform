import {
  loadReview,
  ReviewError,
  sendForReview,
  type SendProgress,
  type SendResult,
} from "@hl-bos/date-sort/review";

import { dayFolder } from "@/lib/day-folder.ts";
import { guard } from "@/lib/guard.ts";
import { keepAwake } from "@/lib/keep-awake.ts";

export const dynamic = "force-dynamic";

export type ReviewLine =
  | { type: "progress"; progress: SendProgress }
  | { type: "done"; result: SendResult }
  | { type: "error"; message: string; sent: number };

/** One send at a time: two at once would both hash and upload the same photos. */
let busy = false;

/** Is the website's review area set up, and is this computer connected to it? */
export async function GET(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const s = await loadReview();
  return Response.json(
    { configured: s.serviceUrl !== null, connected: s.connectedAt !== null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * "Send for review" on a date card: sends that date's photos to the
 * website's private review area, streaming one line of JSON per step.
 * Nothing in the folder is changed, and nothing sent is public: the photos
 * wait there until the owner approves them.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as {
    day?: unknown;
    eventName?: unknown;
  };
  const day =
    typeof body.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
      ? body.day
      : null;
  if (day === null) return Response.json({ error: "No date chosen." }, { status: 400 });
  const eventName = typeof body.eventName === "string" ? body.eventName.trim() : "";

  const settings = await loadReview();
  if (settings.serviceUrl === null) {
    return Response.json(
      {
        error:
          "The website's review area is not switched on yet, so there is nowhere to send these. Nothing was sent.",
      },
      { status: 503 },
    );
  }
  if (settings.key === null || settings.connectedAt === null) {
    return Response.json(
      { error: "This computer is not connected to the website's review area yet." },
      { status: 409 },
    );
  }
  const found = await dayFolder(day, eventName, "review");
  if (!found.ok) return Response.json({ error: found.error }, { status: found.status });
  if (busy)
    return Response.json(
      { error: "Photos are already being sent. Wait for that to finish." },
      { status: 409 },
    );
  busy = true;

  const encoder = new TextEncoder();
  const { serviceUrl, key } = settings;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (m: ReviewLine) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(m)}\n`));
        } catch {
          // the page went away
        }
      };
      const awake = await keepAwake();
      try {
        const result = await sendForReview({
          folder: found.folder,
          game: { name: found.name || eventName, sport: found.sport, date: day },
          serviceUrl,
          key,
          fetch: (url, init) => fetch(url, init),
          signal: request.signal,
          onProgress: (progress) => send({ type: "progress", progress }),
        });
        send({ type: "done", result });
      } catch (e) {
        send({
          type: "error",
          message:
            e instanceof ReviewError
              ? e.message
              : "Sending stopped unexpectedly. Send again: what is already there is skipped.",
          sent: e instanceof ReviewError ? e.sent : 0,
        });
      } finally {
        awake.release();
        busy = false;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
