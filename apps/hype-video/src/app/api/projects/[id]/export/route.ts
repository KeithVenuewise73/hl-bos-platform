import { NextResponse } from "next/server";

import {
  advanceStatus,
  exportFilename,
  exportPackage,
  latestGeneration,
  type ExportFormat,
} from "@hl-bos/hype-video";

import { isSameOrigin, seeOther } from "@/lib/http.ts";
import { isId } from "@/lib/media.ts";
import { store } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

const FORMATS: readonly ExportFormat[] = ["txt", "md", "json"];

/**
 * Export Package. A real download of the latest generated package, and the
 * step that moves a project to "exported". A POST, not a GET, because it
 * changes the project — and so it also gets the same-origin check.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-site export refused." }, { status: 403 });
  }
  if (!isId(id))
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  const project = await store().get(id);
  if (project === null)
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });

  const record = latestGeneration(project);
  if (record === null) {
    return seeOther(
      `/projects/${id}?error=${encodeURIComponent("Generate the package before exporting it.")}`,
    );
  }

  const form = await request.formData();
  const requested = form.get("format");
  const format = FORMATS.find((f) => f === requested) ?? "txt";
  const file = exportPackage(
    record,
    {
      projectName: project.name,
      templateKey: project.template,
      tone: project.tone,
      outputTypes: project.outputTypes,
    },
    format,
  );

  await store().update(id, (p) => ({
    ...p,
    status: advanceStatus(p.status, "exported"),
    exportedAt: new Date().toISOString(),
  }));

  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${exportFilename(project.name, file.extension)}"`,
      "Cache-Control": "no-store",
    },
  });
}
