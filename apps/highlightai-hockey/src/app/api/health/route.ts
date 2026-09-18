import { NextResponse } from "next/server";

import { currentMode, getViewer } from "@/lib/session.ts";
import { loadWorkspace } from "@/lib/store.ts";
import { visionProvider } from "@/lib/pipeline-runner.ts";

// A cached health check reports the health of the past.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Health.
 *
 * Distinguishes states a platform health check must not confuse:
 *
 *   refusing — alive and deliberately not serving, because no identity
 *              provider is configured. 200, because a failing check makes the
 *              platform restart-loop the container, which hides the one page
 *              that explains the fix.
 *   waiting  — running, signed out. Not a fault.
 *   ok       — serving. `analysis.ready` is reported separately and honestly:
 *              the app is perfectly healthy with no vision service, it just
 *              cannot analyse anything, and conflating those two would make
 *              the console show a red light for a working app.
 */
export async function GET(): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  const mode = currentMode();

  if (mode === "refuse") {
    return NextResponse.json(
      {
        status: "refusing",
        mode,
        detail:
          "Deployed with no identity provider configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and redeploy.",
      },
      { headers },
    );
  }

  const analysis = await visionProvider().availability();
  const viewer = await getViewer();
  if (!viewer.authenticated) {
    return NextResponse.json(
      {
        status: "waiting",
        mode,
        detail: "Running. No user is signed in.",
        analysis: { ready: analysis.available, detail: analysis.detail },
      },
      { headers },
    );
  }

  try {
    const workspace = await loadWorkspace();
    return NextResponse.json(
      {
        status: "ok",
        mode,
        storage: "local-json",
        analysis: { ready: analysis.available, detail: analysis.detail },
        records: {
          projects: workspace.projects.length,
          jobs: workspace.jobs.length,
          segments: workspace.segments.length,
          clips: workspace.clips.length,
          reels: workspace.reels.length,
        },
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        mode,
        detail:
          error instanceof Error ? error.message : "Unknown error reading the store.",
      },
      { status: 503, headers },
    );
  }
}
