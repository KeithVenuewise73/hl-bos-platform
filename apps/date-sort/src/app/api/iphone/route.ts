import { guard } from "@/lib/guard.ts";
import { freeBytes } from "@/lib/free-space.ts";
import { copyFromIphone } from "@/lib/iphone.ts";
import { checkSpace } from "@/lib/iphone-space.ts";
import { keepAwake } from "@/lib/keep-awake.ts";
import type { IphoneKind, IphoneLine, IphonePageLine } from "@/lib/iphone-script.ts";

export const dynamic = "force-dynamic";

/**
 * One phone, one cable: copies from it take turns. A photo copy and a video
 * copy go to separate folders and never touch each other's files, but two at
 * once would fight over the same USB connection. So the second one waits for
 * the first, says so, and starts by itself, instead of being refused.
 */
let tail: Promise<void> = Promise.resolve();
let active = 0;
/** Kinds running or waiting: pressing the same button twice is refused. */
const queued = new Set<IphoneKind>();

function takeTurn(): { waiting: boolean; ready: Promise<void>; release: () => void } {
  const waiting = active > 0;
  active += 1;
  const before = tail;
  let release = () => {};
  let released = false;
  tail = new Promise<void>((resolve) => {
    release = () => {
      if (released) return;
      released = true;
      active -= 1;
      resolve();
    };
  });
  return { waiting, ready: before, release };
}

/** How far back to look: a whole number of days up to ten years, or everything. */
function parseDays(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 && raw <= 3650
    ? raw
    : null;
}

/**
 * Copy the plugged-in iPhone's photos (kind "photos") or videos (kind
 * "videos") into the chosen folder, streaming one line of JSON per step.
 * Only reads the phone; never changes or deletes anything on it. Files
 * already in the folder are skipped.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as {
    folder?: unknown;
    kind?: unknown;
    days?: unknown;
    size?: unknown;
    preview?: unknown;
  };
  if (body.kind !== "photos" && body.kind !== "videos") {
    return Response.json(
      { error: "Choose whether to bring in photos or videos." },
      { status: 400 },
    );
  }
  const kind: IphoneKind = body.kind;
  const days = parseDays(body.days);
  const size = body.size === "small" || body.size === "large" ? body.size : "all";
  const preview = body.preview === true;
  const folder = typeof body.folder === "string" ? body.folder.trim() : "";
  if (!/^[A-Za-z]:[\\/]|^\\\\|^\//.test(folder)) {
    return Response.json(
      { error: `Choose the folder to keep the iPhone's ${kind} in first.` },
      { status: 400 },
    );
  }
  if (queued.has(kind)) {
    return Response.json(
      { error: `Already bringing in the iPhone's ${kind}. Wait for it to finish.` },
      { status: 409 },
    );
  }
  queued.add(kind);
  const turn = takeTurn();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (m: IphonePageLine) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(m)}\n`));
        } catch {
          // the page went away
        }
      };
      try {
        if (turn.waiting) {
          send({ type: "waiting", for: kind === "photos" ? "videos" : "photos" });
          await turn.ready;
        }
        if (request.signal.aborted) return; // the page went away while waiting
        // A phone full of video takes a while: Windows must not sleep meanwhile.
        const awake = await keepAwake();
        send({ type: "awake", held: awake.held });
        try {
          // Read once, before anything is copied: what is to come is compared
          // with this the moment the phone has been listed. A copy that cannot
          // fit is stopped before it starts, not when the drive is full.
          const free = await freeBytes(folder);
          const stop = new AbortController();
          request.signal.addEventListener("abort", () => stop.abort(), { once: true });
          const watch = (line: IphoneLine) => {
            send(line);
            if (line.type !== "found") return;
            const needed = line.todoBytes ?? line.bytes;
            const room = checkSpace(needed, free);
            send({ type: "space", needed, free, enough: room.enough });
            // "Check size first" only reports; a real copy stops here if it will not fit.
            if (!preview && !room.enough) stop.abort();
          };
          await copyFromIphone(
            folder,
            kind,
            days,
            { size, preview },
            watch,
            stop.signal,
          );
        } finally {
          awake.release();
        }
      } finally {
        queued.delete(kind);
        turn.release();
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
