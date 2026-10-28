import { guard } from "@/lib/guard.ts";
import { copyFromIphone } from "@/lib/iphone.ts";
import { keepAwake } from "@/lib/keep-awake.ts";
import type { IphoneLine } from "@/lib/iphone-script.ts";

export const dynamic = "force-dynamic";

/** One at a time: two copies from one phone would race for the same files. */
let busy = false;

/**
 * Copy the plugged-in iPhone's photos and videos into the chosen folder,
 * streaming one line of JSON per step. Only reads the phone; never changes
 * or deletes anything on it. Files already in the folder are skipped.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as { folder?: unknown };
  const folder = typeof body.folder === "string" ? body.folder.trim() : "";
  if (!/^[A-Za-z]:[\\/]|^\\\\|^\//.test(folder)) {
    return Response.json(
      { error: "Choose the folder to keep the iPhone's photos and videos in first." },
      { status: 400 },
    );
  }
  if (busy) {
    return Response.json(
      { error: "Already copying from the iPhone. Wait for it to finish." },
      { status: 409 },
    );
  }
  busy = true;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (m: IphoneLine) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(m)}\n`));
        } catch {
          // the page went away
        }
      };
      // A phone full of video takes a while: Windows must not sleep meanwhile.
      const awake = await keepAwake();
      try {
        await copyFromIphone(folder, send, request.signal);
      } finally {
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
