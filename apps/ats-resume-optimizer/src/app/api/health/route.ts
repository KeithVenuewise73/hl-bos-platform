import { NextResponse } from "next/server";

import { aiStatus } from "@/lib/config.ts";
import { currentMode, getViewer } from "@/lib/session.ts";
import { loadWorkspace } from "@/lib/store.ts";

// A cached health check reports the health of the past.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Health.
 *
 * Reports what is actually true, and distinguishes three things a platform
 * health check must not confuse:
 *
 *   refusing  — the container is alive and deliberately not serving, because
 *               no identity provider is configured. 200, because a failing
 *               health check makes the platform restart-loop the container,
 *               and a restart loop hides the one page that explains the fix.
 *   waiting   — running, signed-out. 200: not being signed in is not a fault.
 *   ok        — serving, with the store readable. Counts come from the store.
 *
 * Only a store that cannot be read is a 503, because that is the only one of
 * these states that a redeploy or a restart might actually fix.
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
          "Deployed with no identity provider configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as build variables and redeploy.",
      },
      { headers },
    );
  }

  const viewer = await getViewer();
  if (!viewer.authenticated) {
    return NextResponse.json(
      { status: "waiting", mode, detail: "Running. No user is signed in." },
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
        aiProvider: aiStatus().configured ? "claude" : "rules-engine",
        records: {
          profiles: workspace.profiles.length,
          facts: workspace.facts.length,
          resumes: workspace.resumes.length,
          analyses: workspace.analyses.length,
          generatedResumes: workspace.generated.length,
          applications: workspace.applications.length,
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
