import { scanFolder, ScanError, type ScanResult } from "@hl-bos/date-sort/scan";

import { guard } from "@/lib/guard.ts";
import type { ScanMessage, ScanView } from "@/lib/scan-view.ts";

export const dynamic = "force-dynamic";

/**
 * Scan a folder, READ ONLY, streaming progress as lines of JSON and ending
 * with the report. Everything that touches the disk is in
 * @hl-bos/date-sort's read-only-file.ts, which can only read.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;

  let body: { folder?: unknown; includeSubfolders?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const folder =
    typeof body.folder === "string" ? body.folder.trim().replace(/^"(.*)"$/, "$1") : "";
  if (folder === "") {
    return Response.json({ error: "Choose a folder first." }, { status: 400 });
  }
  const includeSubfolders = body.includeSubfolders === true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (m: ScanMessage) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(m)}\n`));
      let lastSent = 0;
      try {
        const result = await scanFolder(folder, {
          includeSubfolders,
          signal: request.signal,
          onProgress: (p) => {
            const now = Date.now();
            if (now - lastSent < 150 && p.read !== p.found) return;
            lastSent = now;
            send({ type: "progress", ...p });
          },
        });
        send({ type: "done", view: toView(result) });
      } catch (e) {
        if (request.signal.aborted) return; // the page went away; nobody to tell
        send({
          type: "error",
          message:
            e instanceof ScanError
              ? e.message
              : `The scan stopped: ${e instanceof Error ? e.message : String(e)}. Nothing in the folder was changed.`,
        });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed because the page went away
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

function toView(result: ScanResult): ScanView {
  const sources = { DateTimeOriginal: 0, CreateDate: 0, FileModified: 0 };
  const estimated = [];
  for (const f of result.files) {
    if (f.kind !== "photo" || f.dateSource === null || f.takenAt === null) continue;
    sources[f.dateSource] += 1;
    if (f.dateSource === "FileModified") {
      estimated.push({ path: f.path, format: f.format, takenAt: f.takenAt });
    }
  }
  return {
    root: result.root,
    includeSubfolders: result.includeSubfolders,
    seconds: result.seconds,
    report: result.report,
    estimated,
    sources,
    folderProblems: result.folderProblems,
    skippedLinks: result.skippedLinks,
  };
}
