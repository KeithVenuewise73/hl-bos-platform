import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { loadWorkspace, mediaRoot } from "@/lib/store.ts";
import { pathForKey } from "@/lib/media.ts";
import { getViewer } from "@/lib/session.ts";
import type { MediaAsset } from "@hl-bos/hockey-highlights";

export const dynamic = "force-dynamic";

/**
 * Serve a project's video.
 *
 * The file path is NEVER taken from the URL. The URL names a project and a
 * role; the path is looked up in the caller's own workspace, which RLS-like
 * ownership already scopes to them. That is what makes traversal impossible
 * rather than merely filtered — there is no user-supplied path to sanitise.
 *
 * Range requests are honoured because the review screen seeks into the middle
 * of a multi-gigabyte file. Without them the browser downloads the whole game
 * to show a six-second clip.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ role: string; projectId: string }> },
): Promise<Response> {
  const { role, projectId } = await params;
  if (role !== "original" && role !== "proxy" && role !== "reel" && role !== "clip") {
    return new Response("Unknown media role.", { status: 404 });
  }

  const viewer = await getViewer();
  if (!viewer.authenticated) return new Response("Not signed in.", { status: 401 });

  const workspace = await loadWorkspace();
  const asset: MediaAsset | undefined = workspace.media.find(
    (m) => m.projectId === projectId && m.role === role,
  );
  if (asset === undefined) return new Response("No such file.", { status: 404 });

  // Resolved through the same containment rule the vision service applies, so
  // a key that somehow got into the store cannot read outside the media root.
  let file: string;
  try {
    file = pathForKey(mediaRoot(), asset.storageKey);
  } catch {
    return new Response("That file is not addressable.", { status: 400 });
  }

  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    // The record exists but the file does not. Saying so beats a stack trace,
    // and beats a zero-byte download that looks like a corrupt video.
    return new Response("That file is recorded but is no longer on disk.", {
      status: 410,
    });
  }

  const contentType = asset.contentType.length > 0 ? asset.contentType : "video/mp4";
  const range = request.headers.get("range");
  if (range === null) {
    return new Response(toWeb(createReadStream(file)), {
      headers: {
        "content-type": contentType,
        "content-length": String(size),
        "accept-ranges": "bytes",
        "cache-control": "private, no-store",
      },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (match === null) {
    return new Response("Bad range.", { status: 416 });
  }
  const startRaw = match[1] ?? "";
  const endRaw = match[2] ?? "";
  const start = startRaw === "" ? 0 : Number(startRaw);
  const end = endRaw === "" ? size - 1 : Math.min(Number(endRaw), size - 1);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > end ||
    start >= size
  ) {
    return new Response("Range not satisfiable.", {
      status: 416,
      headers: { "content-range": `bytes */${size}` },
    });
  }

  return new Response(toWeb(createReadStream(file, { start, end })), {
    status: 206,
    headers: {
      "content-type": contentType,
      "content-length": String(end - start + 1),
      "content-range": `bytes ${start}-${end}/${size}`,
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
    },
  });
}

function toWeb(stream: ReturnType<typeof createReadStream>): ReadableStream {
  return Readable.toWeb(stream) as ReadableStream;
}
