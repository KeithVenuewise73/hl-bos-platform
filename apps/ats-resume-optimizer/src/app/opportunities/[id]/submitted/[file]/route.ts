import { NextResponse } from "next/server";

import {
  DOCX_MEDIA_TYPE,
  buildExportDocument,
  renderDocx,
  verifySubmission,
} from "@hl-bos/ats-resume";

import { careerContext } from "@/lib/career.ts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The exact documents from a submitted application.
 *
 * Served from the frozen submission record, never from the current drafts,
 * and only after the record's fingerprint is re-verified. If the record no
 * longer matches what was hashed at submission, nothing is served.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; file: string }> },
): Promise<Response> {
  const { id, file } = await context.params;
  const ctx = await careerContext();
  const opp = ctx.opportunities.find((o) => o.id === id);
  const submission = ctx.submissions.find((s) => s.id === opp?.submissionId);
  if (opp === undefined || submission === undefined) {
    return NextResponse.json(
      { error: "No submitted application here." },
      { status: 404 },
    );
  }
  if (!verifySubmission(submission)) {
    return NextResponse.json(
      {
        error:
          "This archived application no longer matches its fingerprint, so it is not being served.",
      },
      { status: 409 },
    );
  }
  const base =
    `${submission.employer}_${submission.title}_${submission.submittedOn}`.replace(
      /[^\w-]+/g,
      "_",
    );
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Submission-Hash": submission.contentHash,
  });
  const text = (body: string, name: string) => {
    headers.set("Content-Type", "text/plain; charset=utf-8");
    headers.set("Content-Disposition", `attachment; filename="${name}"`);
    return new NextResponse(body, { headers });
  };
  switch (file) {
    case "resume.txt":
      return text(submission.resumeText, `${base}_resume.txt`);
    case "cover-letter.txt":
      if (submission.coverLetterText === undefined) break;
      return text(submission.coverLetterText, `${base}_cover_letter.txt`);
    case "posting.txt":
      return text(submission.postingSnapshot, `${base}_job_description.txt`);
    case "resume.docx": {
      headers.set("Content-Type", DOCX_MEDIA_TYPE);
      headers.set("Content-Disposition", `attachment; filename="${base}_resume.docx"`);
      return new NextResponse(
        new Uint8Array(renderDocx(buildExportDocument(submission.resume).document)),
        { headers },
      );
    }
    default:
      break;
  }
  return NextResponse.json(
    { error: "No such file in this application." },
    { status: 404 },
  );
}
