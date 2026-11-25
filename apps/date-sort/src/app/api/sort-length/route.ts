import { basename, dirname, isAbsolute, join } from "node:path";

import {
  findTools,
  probeSeconds,
  sortByLength,
  MAX_CLIP_SECONDS,
} from "@hl-bos/date-sort/review";

import { guard } from "@/lib/guard.ts";

export const dynamic = "force-dynamic";

/**
 * Move videos longer than a short clip out of a phone's "Short Clips" folder into the "Game Footage"
 * folder beside it (same month folder, never overwriting). With `apply: false` it only looks and says
 * what would move. Only a folder named "Short Clips" is accepted, and the files only ever go to the
 * "Game Footage" folder next to it: this cannot be used to move files anywhere else.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as {
    clipsFolder?: unknown;
    apply?: unknown;
  };
  const clips = typeof body.clipsFolder === "string" ? body.clipsFolder.trim() : "";
  if (!isAbsolute(clips) || basename(clips) !== "Short Clips") {
    return Response.json(
      { error: "Choose a phone's Short Clips folder." },
      { status: 400 },
    );
  }
  const games = join(dirname(clips), "Game Footage");
  const tools = await findTools();
  if (tools === null) {
    return Response.json({
      kind: "needs-tool",
      message:
        "Sorting by length needs the free program ffmpeg, which was not found on this computer.",
    });
  }
  const result = await sortByLength({
    clipsRoot: clips,
    gamesRoot: games,
    apply: body.apply === true,
    probe: (f) => probeSeconds(tools, f, request.signal),
    signal: request.signal,
  });
  return Response.json({ kind: "sorted", maxSeconds: MAX_CLIP_SECONDS, ...result });
}
