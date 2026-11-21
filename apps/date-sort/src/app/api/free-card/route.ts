import {
  checkCard,
  freeCard,
  FreeCardError,
  KEEP_WORDS,
  type CardRequest,
} from "@hl-bos/date-sort/free-card";
import { loadReview, reviewKnown } from "@hl-bos/date-sort/review";

import { forgetCheck, holdCheck, takeCheck } from "@/lib/free-card-store.ts";
import { groupKept, type KeptGroup } from "@/lib/free-card-messages.ts";
import { guard } from "@/lib/guard.ts";
import { keepAwake } from "@/lib/keep-awake.ts";
import { findScan } from "@/lib/scan-store.ts";

export const dynamic = "force-dynamic";

export type FreeCardLine =
  | { type: "progress"; phase: "checking" | "removing"; done: number; total: number }
  | {
      type: "checked";
      checkId: string;
      safe: number;
      videos: number;
      bytes: number;
      notMedia: number;
      kept: KeptGroup[];
      keptCount: number;
    }
  | {
      type: "freed";
      removed: number;
      bytesFreed: number;
      keptCount: number;
      failedCount: number;
      stopped: boolean;
      kept: KeptGroup[];
    }
  | { type: "error"; message: string };

/** One check or delete at a time. */
let busy = false;

/** Asks 5Star which photos it holds; null (photos all kept) when it cannot be asked. */
async function siteAsker(): Promise<CardRequest["onSite"]> {
  const s = await loadReview();
  if (s.serviceUrl === null || s.key === null || s.connectedAt === null) return null;
  const { serviceUrl, key } = s;
  return (hashes) => reviewKnown(serviceUrl, key, hashes, (u, i) => fetch(u, i));
}

/**
 * Free up the card, in two steps that each stream lines of JSON.
 *
 *   { step: "check", scanId, destination }   reads and compares; deletes nothing
 *   { step: "delete", checkId, confirm: "DELETE" }
 *                                           re-proves each file the check found safe,
 *                                           then deletes it from the card
 *
 * Everything that decides is in @hl-bos/date-sort/free-card.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as {
    step?: unknown;
    scanId?: unknown;
    destination?: unknown;
    checkId?: unknown;
    confirm?: unknown;
  };
  const step = body.step === "check" || body.step === "delete" ? body.step : null;
  if (step === null) return Response.json({ error: "Nothing asked." }, { status: 400 });

  // Resolve what the step works on BEFORE taking the lock or touching anything.
  let scanId = "";
  let destination = "";
  let held: ReturnType<typeof takeCheck> = null;
  if (step === "check") {
    scanId = typeof body.scanId === "string" ? body.scanId : "";
    destination =
      typeof body.destination === "string"
        ? body.destination.trim().replace(/^"(.*)"$/, "$1")
        : "";
  } else {
    if (body.confirm !== "DELETE")
      return Response.json(
        { error: "Deleting needs your confirmation. Nothing was deleted." },
        { status: 400 },
      );
  }
  if (busy)
    return Response.json(
      { error: "DateSort is already busy with the card. Wait for it to finish." },
      { status: 409 },
    );
  if (step === "delete") {
    held = typeof body.checkId === "string" ? takeCheck(body.checkId) : null;
    if (held === null)
      return Response.json(
        {
          error:
            "That check is no longer current (DateSort was restarted, or it was already used). Press Check again; nothing was deleted.",
        },
        { status: 409 },
      );
    scanId = held.scanId;
    destination = held.destination;
  }
  const scan = findScan(scanId);
  if (scan === undefined)
    return Response.json(
      {
        error: "DateSort was restarted since this scan. Press Scan again, then Check.",
      },
      { status: 409 },
    );
  busy = true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (m: FreeCardLine) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(m)}\n`));
        } catch {
          // the page went away
        }
      };
      const awake = await keepAwake();
      let lastSent = 0;
      const req: CardRequest = {
        root: scan.root,
        files: scan.files,
        destination,
        onSite: await siteAsker(),
        signal: request.signal,
        onProgress: (p) => {
          const now = Date.now();
          if (now - lastSent < 200 && p.done !== p.total) return;
          lastSent = now;
          send({ type: "progress", ...p });
        },
      };
      try {
        if (step === "check") {
          forgetCheck();
          const check = await checkCard(req);
          send({
            type: "checked",
            checkId: holdCheck(scanId, destination, check),
            safe: check.safe.length,
            videos: check.safe.filter((s) => s.video).length,
            bytes: check.bytesSafe,
            notMedia: check.notMedia,
            kept: groupKept(check.kept, KEEP_WORDS),
            keptCount: check.kept.length,
          });
        } else {
          const r = await freeCard(req, held!.check, true);
          send({
            type: "freed",
            removed: r.removed,
            bytesFreed: r.bytesFreed,
            keptCount: r.kept.length,
            failedCount: r.failed.length,
            stopped: r.stopped,
            kept: groupKept(r.kept, KEEP_WORDS),
          });
        }
      } catch (e) {
        if (request.signal.aborted) return;
        send({
          type: "error",
          message:
            e instanceof FreeCardError
              ? e.message
              : `It stopped: ${e instanceof Error ? e.message : String(e)}. Nothing further was deleted.`,
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
