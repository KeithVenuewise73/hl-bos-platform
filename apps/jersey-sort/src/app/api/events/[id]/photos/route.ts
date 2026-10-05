import { NextResponse } from "next/server";

import { config } from "@/lib/config.ts";
import { db } from "@/lib/db.ts";
import { isSameOrigin } from "@/lib/http.ts";
import { ingestPhoto, type IngestResult } from "@/lib/ingest.ts";
import { kickQueue } from "@/lib/queue.ts";
import { currentUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

/**
 * Upload one or more photos into an event. The browser sends a few files per
 * request, several requests at once, so hundreds of photos stream in without
 * one giant request. Each file gets its own result: a duplicate or a non-photo
 * is refused with the reason, and the rest of the batch carries on.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Cross-site upload refused." }, { status: 403 });
  const user = await currentUser();
  if (user === null) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const { id: eventId } = await ctx.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "The upload was not readable." },
      { status: 400 },
    );
  }
  const files = form
    .getAll("file")
    .filter((f): f is File => f instanceof File)
    .slice(0, 20);
  if (files.length === 0)
    return NextResponse.json({ error: "No files." }, { status: 400 });

  const results: Array<{ name: string } & IngestResult> = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const r = await ingestPhoto(db(), config().dataDir, {
        org: user.organizationId,
        userId: user.userId,
        eventId,
        filename: file.name,
        bytes,
      });
      results.push({ name: file.name, ...r });
    } catch (e) {
      console.error("[jerseysort] upload failed:", e);
      results.push({ name: file.name, ok: false, reason: "Could not be saved." });
    }
  }
  if (results.some((r) => r.ok)) kickQueue();
  return NextResponse.json({ results });
}
