import { zipStore, type ZipEntry } from "@hl-bos/jersey-sort";

import { config } from "@/lib/config.ts";
import { db } from "@/lib/db.ts";
import { captionFile, makeFrame } from "@/lib/instagram-core.ts";
import { sniff } from "@/lib/media-core.ts";
import { getEvent } from "@/lib/repo/events.ts";
import { draftPhotos, getDraft } from "@/lib/repo/instagram.ts";
import { currentUser } from "@/lib/session.ts";
import { getObject } from "@/lib/storage.ts";

export const dynamic = "force-dynamic";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "post";

/** The pack: the draft's pictures (01.jpg, 02.jpg, …) and caption.txt, as one ZIP. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draft: string }> },
): Promise<Response> {
  const user = await currentUser();
  if (user === null) return new Response("Sign in.", { status: 401 });
  const { draft: id } = await params;
  const draft = getDraft(db(), user.organizationId, id);
  if (draft === undefined) return new Response("Not found.", { status: 404 });
  const photos = draftPhotos(db(), user.organizationId, draft);
  if (photos.length === 0) {
    return new Response("Choose at least one photo and save before downloading.", {
      status: 400,
    });
  }
  const event = getEvent(db(), user.organizationId, draft.event_id);

  // Make every picture first, so a photo that cannot be made fails the whole
  // download plainly instead of handing over a pack with a picture missing.
  const entries: ZipEntry[] = [];
  const now = new Date();
  try {
    for (const [i, p] of photos.entries()) {
      const bytes = new Uint8Array(await getObject(config().dataDir, p.storage_path));
      const kind = sniff(bytes);
      if (kind === null) throw new Error(`${p.original_filename} is not a photo`);
      const frame = await makeFrame(bytes, kind, {
        format: draft.format,
        fit: draft.fit,
      });
      entries.push({
        name: `${String(i + 1).padStart(2, "0")}.jpg`,
        data: new Uint8Array(frame.data),
        modified: now,
      });
    }
  } catch (e) {
    console.error("[jerseysort] instagram pack failed:", e);
    return new Response("The pack could not be made. Nothing was downloaded.", {
      status: 500,
    });
  }
  entries.push({
    name: "caption.txt",
    data: new TextEncoder().encode(captionFile(draft.caption)),
    modified: now,
  });

  const iterator = zipStore(entries);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const step: IteratorResult<Uint8Array> = await iterator.next();
        if (step.done === true) controller.close();
        else controller.enqueue(step.value);
      } catch (e) {
        controller.error(e);
      }
    },
  });
  const name = `instagram-${slug(event?.name ?? "post")}-${(event?.event_date ?? "").slice(0, 10)}.zip`;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
