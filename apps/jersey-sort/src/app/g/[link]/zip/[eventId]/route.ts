import {
  uniqueName,
  zipStore,
  ZipLimitError,
  type ZipEntry,
} from "@hl-bos/jersey-sort";

import { config } from "@/lib/config.ts";
import { db } from "@/lib/db.ts";
import {
  galleryEvent,
  galleryPhotoFiles,
  galleryPhotos,
} from "@/lib/repo/galleries.ts";
import { getObject } from "@/lib/storage.ts";
import { visitor } from "@/lib/visitor.ts";

export const dynamic = "force-dynamic";

/** Every photo of one game in a team gallery, originals, as one ZIP. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ link: string; eventId: string }> },
): Promise<Response> {
  const { link, eventId } = await ctx.params;
  const gallery = await visitor(link);
  if (gallery === undefined) return new Response("Not found.", { status: 404 });
  const event = galleryEvent(db(), gallery, eventId);
  if (event === undefined) return new Response("Not found.", { status: 404 });
  const rows = galleryPhotos(db(), gallery, eventId)
    .map((p) => galleryPhotoFiles(db(), gallery, p.id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);
  if (rows.length === 0)
    return new Response("No photos in this game yet.", { status: 404 });
  const size = rows.reduce((n, r) => n + r.file_size, 0);
  if (size > 3.9 * 1024 ** 3) {
    return new Response(
      "This game's photos add up to more than one download can hold (4 GB). Download them one at a time.",
      { status: 413 },
    );
  }
  const used = new Set<string>();
  async function* entries(): AsyncGenerator<ZipEntry> {
    for (const r of rows) {
      const data = await getObject(config().dataDir, r.storage_path);
      const when = new Date(r.captured_at);
      yield {
        name: uniqueName(r.original_filename, used),
        data: new Uint8Array(data),
        modified: Number.isNaN(when.getTime()) ? new Date(r.uploaded_at) : when,
      };
    }
  }
  const iterator = zipStore(entries());
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const step: IteratorResult<Uint8Array> = await iterator.next();
        if (step.done === true) controller.close();
        else controller.enqueue(step.value);
      } catch (e) {
        console.error(
          "[jerseysort] gallery download failed:",
          e instanceof ZipLimitError ? e.message : e,
        );
        controller.error(e);
      }
    },
  });
  const safe = `${event.event_date} ${event.name}`
    .replace(/[^A-Za-z0-9 ._-]/g, "_")
    .slice(0, 100);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safe}.zip"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
