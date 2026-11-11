import { spawn } from "node:child_process";

import { guard } from "@/lib/guard.ts";
import { jobs } from "@/lib/manager.ts";

export const dynamic = "force-dynamic";

/**
 * Show the finished video in File Explorer. Only the file the last job made:
 * the page cannot ask for any other path to be opened.
 */
export function POST(request: Request): Response {
  const refused = guard(request);
  if (refused !== null) return refused;
  const job = jobs.snapshot();
  const made = job?.result?.kind === "make" ? job.result.made.outFile : null;
  if (made === null)
    return Response.json(
      { error: "There is no finished video to show." },
      { status: 404 },
    );
  if (process.platform !== "win32") {
    return Response.json(
      { error: `Showing a file is a Windows feature. It is at ${made}` },
      { status: 501 },
    );
  }
  spawn("explorer.exe", [`/select,${made}`], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref();
  return Response.json({ shown: true });
}
