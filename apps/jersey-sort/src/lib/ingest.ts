/**
 * One uploaded file -> one photo row, its metadata, its derivatives, and a
 * place in the analysis queue.
 *
 * Order matters and is deliberate:
 *   1. sniff the bytes (refuse anything that is not a JPEG, PNG or HEIC)
 *   2. hash them, and refuse a duplicate of a photo already in this
 *      organization, naming the original
 *   3. write the ORIGINAL, untouched
 *   4. read EXIF, render thumbnail and preview
 *   5. insert the rows, status QUEUED
 * A photo whose pixels cannot be decoded is still kept (the original is the
 * customer's file) and is marked FAILED with the reason, so it can be
 * downloaded and is never silently dropped.
 *
 * Free of `server-only` so the whole path can be tested against a temp dir.
 */

import { newId, type Db } from "./db-core.ts";
import {
  EXTENSION,
  MAX_PHOTO_BYTES,
  MIME,
  readExif,
  renderVariants,
  sha256,
  sniff,
} from "./media-core.ts";
import { objectPath, putObject, removeObjects } from "./storage.ts";

export type IngestResult =
  | {
      readonly ok: true;
      readonly photoId: string;
      readonly status: "queued" | "failed";
      readonly dateSource: "exif" | "upload";
    }
  | { readonly ok: false; readonly reason: string; readonly duplicateOf?: string };

export async function ingestPhoto(
  db: Db,
  dataDir: string,
  input: {
    org: string;
    userId: string;
    eventId: string;
    filename: string;
    bytes: Uint8Array;
    now?: Date;
  },
): Promise<IngestResult> {
  const filename =
    [...input.filename]
      .filter((c) => c.charCodeAt(0) >= 0x20)
      .join("")
      .slice(-200) || "photo";
  if (input.bytes.length === 0) return { ok: false, reason: "The file is empty." };
  if (input.bytes.length > MAX_PHOTO_BYTES)
    return { ok: false, reason: "The file is larger than 60 MB." };
  const kind = sniff(input.bytes);
  if (kind === null) return { ok: false, reason: "Not a JPG, PNG or HEIC photo." };

  const event = db.get(
    "select 1 from events where id = :id and organization_id = :org",
    { id: input.eventId, org: input.org },
  );
  if (event === undefined) return { ok: false, reason: "That event was not found." };

  const hash = sha256(input.bytes);
  const dup = db.get<{ original_filename: string; event_name: string }>(
    `select p.original_filename, e.name as event_name from photos p join events e on e.id = p.event_id
      where p.organization_id = :org and p.file_hash = :hash`,
    { org: input.org, hash },
  );
  if (dup !== undefined) {
    return {
      ok: false,
      reason: `Already uploaded as ${dup.original_filename} in ${dup.event_name}.`,
      duplicateOf: dup.original_filename,
    };
  }

  const id = newId();
  const original = objectPath("originals", input.org, id, EXTENSION[kind]);
  await putObject(dataDir, original, input.bytes);

  const exif = await readExif(input.bytes);
  let thumb: string | null = null;
  let preview: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let error: string | null = null;
  try {
    const v = await renderVariants(input.bytes, kind);
    thumb = objectPath("thumbnails", input.org, id, "webp");
    preview = objectPath("previews", input.org, id, "jpg");
    await putObject(dataDir, thumb, v.thumbnail);
    await putObject(dataDir, preview, v.preview);
    width = v.width;
    height = v.height;
  } catch (e) {
    error = `Could not read the picture in this file${kind === "heic" ? " (HEIC)" : ""}: ${e instanceof Error ? e.message : "unknown error"}. The original is kept and can be downloaded.`;
  }

  const now = input.now ?? new Date();
  const uploadedAt = now.toISOString();
  const p = (n: number) => String(n).padStart(2, "0");
  const localNow = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  const capturedAt = exif.capturedAt ?? localNow;
  const status = error === null ? "queued" : "failed";

  try {
    db.tx(() => {
      db.run(
        `insert into photos (id, organization_id, event_id, uploaded_by, original_filename, storage_path, thumbnail_path, preview_path,
           captured_at, captured_at_source, uploaded_at, width, height, mime_type, file_size, file_hash, status, error)
         values (:id, :org, :event, :user, :name, :original, :thumb, :preview, :captured, :source, :uploaded, :w, :h, :mime, :size, :hash, :status, :error)`,
        {
          id,
          org: input.org,
          event: input.eventId,
          user: input.userId,
          name: filename,
          original,
          thumb,
          preview,
          captured: capturedAt,
          source: exif.capturedAt === null ? "upload" : "exif",
          uploaded: uploadedAt,
          w: width,
          h: height,
          mime: MIME[kind],
          size: input.bytes.length,
          hash,
          status,
          error,
        },
      );
      db.run(
        `insert into photo_metadata (photo_id, camera_make, camera_model, lens, iso, exposure_time, f_number, focal_length, orientation, exif_json)
         values (:id, :make, :model, :lens, :iso, :exp, :f, :focal, :orient, :json)`,
        {
          id,
          make: exif.cameraMake,
          model: exif.cameraModel,
          lens: exif.lens,
          iso: exif.iso,
          exp: exif.exposureTime,
          f: exif.fNumber,
          focal: exif.focalLength,
          orient: exif.orientation,
          json: JSON.stringify(exif.raw),
        },
      );
    });
  } catch (e) {
    // Two uploads of the same file racing each other: the second loses the
    // unique (organization, hash) constraint. Clean up its files.
    await removeObjects(
      dataDir,
      [original, thumb, preview].filter((x): x is string => x !== null),
    );
    if (e instanceof Error && /UNIQUE/i.test(e.message)) {
      return {
        ok: false,
        reason: "This photo was just uploaded.",
        duplicateOf: filename,
      };
    }
    throw e;
  }
  return {
    ok: true,
    photoId: id,
    status,
    dateSource: exif.capturedAt === null ? "upload" : "exif",
  };
}
