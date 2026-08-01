import { NextResponse } from "next/server";

// Public, unauthenticated health check for Herman Legacy Cloud (Coolify).
// Returns 200 with minimal, non-sensitive metadata. No secrets, no data.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "herman-legacy-digital",
    time: new Date().toISOString(),
    commit:
      process.env["SOURCE_COMMIT"] ?? process.env["COOLIFY_GIT_COMMIT_SHA"] ?? null,
  });
}
