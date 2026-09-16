import { NextResponse } from "next/server";

import {
  DOCX_MEDIA_TYPE,
  PDF_MEDIA_TYPE,
  buildExportDocument,
  renderDocx,
  renderPdf,
  renderPlainText,
} from "@hl-bos/ats-resume";

import { loadWorkspace } from "@/lib/store.ts";

/**
 * Never cached.
 *
 * Found by testing the real running app: without this, Next served a cached
 * copy of an earlier export. A user who edited a line, or whose edit turned a
 * line unsupported, downloaded the PREVIOUS document and had no way to tell.
 * For a file someone sends to an employer, a stale byte is a wrong byte.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Download a tailored resume.
 *
 * `buildExportDocument()` runs first and unconditionally. Every claim that is
 * not verified or user-confirmed is dropped here, at the point the bytes are
 * produced — not in the UI, where a bug or a stale render could let something
 * through. The response header reports how many lines were dropped so the
 * behaviour is observable rather than silent.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get("format") ?? "docx";

  const workspace = await loadWorkspace();
  const generated = workspace.generated.find((g) => g.id === id);
  if (generated === undefined) {
    return NextResponse.json({ error: "No such resume." }, { status: 404 });
  }

  const { document, dropped } = buildExportDocument(generated);
  const safeName = `${generated.fullName || "resume"} — ${generated.company}`
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_");

  const headers = new Headers({
    "X-Claims-Dropped": String(dropped.length),
    "Cache-Control": "no-store",
  });

  if (format === "txt") {
    headers.set("Content-Type", "text/plain; charset=utf-8");
    headers.set("Content-Disposition", `attachment; filename="${safeName}.txt"`);
    return new NextResponse(renderPlainText(document), { headers });
  }

  if (format === "pdf") {
    const pdf = renderPdf(document);
    headers.set("Content-Type", PDF_MEDIA_TYPE);
    headers.set("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
    return new NextResponse(new Uint8Array(pdf), { headers });
  }

  const docx = renderDocx(document);
  headers.set("Content-Type", DOCX_MEDIA_TYPE);
  headers.set("Content-Disposition", `attachment; filename="${safeName}.docx"`);
  return new NextResponse(new Uint8Array(docx), { headers });
}
