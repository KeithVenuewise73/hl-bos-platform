import {
  uniqueName,
  zipStore,
  ZipLimitError,
  type ZipEntry,
} from "@hl-bos/jersey-sort";

import { config } from "@/lib/config.ts";
import { db } from "@/lib/db.ts";
import { isSameOrigin } from "@/lib/http.ts";
import { ownedPhotoIds } from "@/lib/repo/photos.ts";
import { currentUser } from "@/lib/session.ts";
import { getObject } from "@/lib/storage.ts";

export const dynamic = "force-dynamic";

/** Download the selected ORIGINALS as one ZIP, streamed one photo at a time. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request))
    return new Response("Cross-site download refused.", { status: 403 });
  const user = await currentUser();
  if (user === null) return new Response("Sign in.", { status: 401 });
  const form = await request.formData();
  const requested = form.getAll("id").filter((v): v is string => typeof v === "string");
  const ids = ownedPhotoIds(db(), user.organizationId, requested);
  if (ids.length === 0)
    return new Response("Select at least one photo.", { status: 400 });

  const rows = ids
    .map((id) =>
      db().get<{
        storage_path: string;
        original_filename: string;
        uploaded_at: string;
        captured_at: string;
        file_size: number;
      }>(
        "select storage_path, original_filename, uploaded_at, captured_at, file_size from photos where id = :id and organization_id = :org",
        { id, org: user.organizationId },
      ),
    )
    .filter((r): r is NonNullable<typeof r> => r !== undefined);
  const total = rows.length;
  // Refuse up front rather than send half an archive: one ZIP holds 4 GB.
  const size = rows.reduce((n, r) => n + r.file_size, 0);
  if (size > 3.9 * 1024 ** 3) {
    return new Response(
      "Those photos add up to more than one download can hold (4 GB). Select fewer and download in parts.",
      {
        status: 413,
      },
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
          "[jerseysort] download failed:",
          e instanceof ZipLimitError ? e.message : e,
        );
        controller.error(e);
      }
    },
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="jerseysort-${total}-photos-${stamp}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
