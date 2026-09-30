import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { advanceStatus, type MediaItem } from "@hl-bos/hype-video";

import { isSameOrigin, seeOther } from "@/lib/http.ts";
import { checkUpload, isId, safeOriginalName } from "@/lib/media.ts";
import { store } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

/**
 * Upload. A plain multipart form posts here and is redirected back to the
 * media page, so uploading works with JavaScript off.
 *
 * Refused before anything is written: another site's request, a project that
 * does not exist, a project whose media-rights confirmation is missing, and
 * any file whose bytes are not a supported photo or video.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-site upload refused." }, { status: 403 });
  }
  const back = (error?: string) =>
    seeOther(
      `/projects/${id}/media${error === undefined ? "" : `?error=${encodeURIComponent(error)}`}`,
    );
  if (!isId(id))
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });

  const project = await store().get(id);
  if (project === null)
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  if (!project.consent.mediaRightsConfirmed) {
    return back("Confirm you have the rights to this media before uploading.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back("The upload didn't arrive in one piece. Try again.");
  }
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return back("Choose a photo or video first.");

  const added: MediaItem[] = [];
  const problems: string[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const verdict = checkUpload(bytes, project.media.length + added.length);
    const name = safeOriginalName(file.name);
    if (!verdict.ok) {
      problems.push(`${name}: ${verdict.reason}`);
      continue;
    }
    const item: MediaItem = {
      id: randomUUID(),
      kind: verdict.sniffed.kind,
      mimeType: verdict.sniffed.mimeType,
      sizeBytes: bytes.length,
      originalName: name,
      uploadedAt: new Date().toISOString(),
    };
    await store().writeMedia(id, item.id, verdict.sniffed.extension, bytes);
    added.push(item);
  }

  if (added.length > 0) {
    await store().update(id, (p) => ({
      ...p,
      media: [...p.media, ...added],
      status: advanceStatus(p.status, "media_uploaded"),
    }));
  }
  return back(problems.length > 0 ? problems.join(" ") : undefined);
}
