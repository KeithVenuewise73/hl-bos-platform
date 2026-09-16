import { NextResponse } from "next/server";

import { aiStatus } from "@/lib/config.ts";
import { loadWorkspace } from "@/lib/store.ts";

// A cached health check reports the health of the past. Same reasoning as the
// export route.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Health check.
 *
 * Reports what is actually true: whether the store is readable, whether an AI
 * provider is configured, and how many records exist. It never returns "ok"
 * without having read the store, because a health check that cannot fail is
 * not a health check.
 */
export async function GET(): Promise<Response> {
  try {
    const workspace = await loadWorkspace();
    return NextResponse.json(
      {
        status: "ok",
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
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        detail:
          error instanceof Error ? error.message : "Unknown error reading the store.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
