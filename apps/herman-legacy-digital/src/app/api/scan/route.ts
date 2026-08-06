import { NextResponse } from "next/server";
import { analyst } from "@hl-bos/bti-engine";
import { fetchSiteHtml } from "@/lib/scan/fetch-site";
import { buildReportView } from "@/lib/scan/report-model";

// The free AI Business Scan — the customer-acquisition front door.
//
// It reads the customer's LIVE website (SSRF-safe fetch), runs the existing
// deterministic analysis engine over the real HTML, and returns an
// evidence-backed Transformation Report view. It never fabricates: if the site
// cannot be read, it says so; anything the engine cannot quantify stays unknown.
// No data is persisted (no DB, no migration) — the report is computed per request.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Best-effort in-process rate limit — a fetch of an arbitrary URL is more
// expensive than a form post, so the window is tighter than the intake route.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 4;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_PER_WINDOW;
}

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? "unknown").trim();
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  if (rateLimited(clientKey(req))) {
    return NextResponse.json(
      { status: "error", error: "Too many scans. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Malformed request." },
      { status: 400 },
    );
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const website = str(b["website"]);
  const name = str(b["name"]) || "Your business";
  const industry = str(b["industry"]) || "general";
  const location = str(b["location"]);

  if (!website) {
    return NextResponse.json(
      { status: "error", error: "Enter your website address to run a scan." },
      { status: 422 },
    );
  }

  const fetched = await fetchSiteHtml(website);
  if (!fetched.ok || !fetched.html) {
    return NextResponse.json(
      { status: "error", error: fetched.error ?? "We could not read that website." },
      { status: 422 },
    );
  }

  let report;
  try {
    const analysis = analyst.analyzeBusiness({
      name,
      website: fetched.finalUrl ?? website,
      industry,
      html: fetched.html,
      ...(location ? { location } : {}),
    });
    report = buildReportView(analysis, { analyzedAtIso: new Date().toISOString() });
  } catch {
    // The engine is deterministic; a throw here means malformed evidence, not a
    // customer error. Fail honestly rather than returning a fabricated result.
    return NextResponse.json(
      {
        status: "error",
        error:
          "We read your site but could not complete the analysis. Please try again.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: "ok",
    scannedUrl: fetched.finalUrl ?? website,
    report,
  });
}
