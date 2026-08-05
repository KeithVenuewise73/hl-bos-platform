import { NextResponse } from "next/server";
import {
  validateBtdi,
  referenceFor,
  confirmationMessage,
  type BtdiInput,
} from "@/lib/btdi";
import { persistBtdi } from "@/lib/btdi-persist";

// The Business Transformation intake front door. Validates server-side, builds
// the normalized record, stores it via the canonical RPC when configured, and
// returns an HONEST confirmation. It NEVER claims a completed assessment.
export const dynamic = "force-dynamic";

// Best-effort in-process rate limit: blunt protection against duplicate rapid
// submissions and simple floods. Not a substitute for the DB-side duplicate
// guard in migration 0031 — defence in depth. Resets on redeploy (acceptable).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
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

export async function POST(req: Request) {
  if (rateLimited(clientKey(req))) {
    return NextResponse.json(
      {
        status: "invalid",
        errors: ["Too many submissions. Please wait a moment and try again."],
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: "invalid", errors: ["Malformed request."] },
      { status: 400 },
    );
  }

  const input = (body ?? {}) as BtdiInput;
  const result = validateBtdi(input);
  if (!result.ok || !result.record) {
    return NextResponse.json(
      { status: "invalid", errors: result.errors },
      { status: 422 },
    );
  }

  const src = input["source"];
  const sourcePage =
    src &&
    typeof src === "object" &&
    !Array.isArray(src) &&
    typeof src["path"] === "string"
      ? src["path"]
      : "/business-transformation-intake";

  const delivery = await persistBtdi(result.record, sourcePage);

  return NextResponse.json({
    status: "received",
    ref: delivery.ref ?? referenceFor(result.record),
    nextStep: confirmationMessage(),
    persisted: delivery.persisted,
  });
}
