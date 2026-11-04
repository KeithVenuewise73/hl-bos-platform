import { NextResponse } from "next/server";
import { canCall, isFleetError, type Operation } from "@hl-bos/tms";
import { currentCtx, fleetCall } from "@/lib/guard.ts";

/**
 * The one door from the browser to the fleet backend.
 *
 * The company is ALWAYS the signed-in user's own: a `workspace` sent by the
 * browser is overwritten. The licence is checked twice — here, for a clear
 * message before a round trip, and again in the database (P002), which is
 * the check that counts.
 */
const OPS = new Set<Operation>([
  "snapshot",
  "save_fleet",
  "submit_inspection",
  "submit_action",
  "submit_service",
  "team",
  "save_member",
  "templates",
  "save_template",
]);

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await currentCtx();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: { op?: string; args?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const op = body.op as Operation;
  if (!OPS.has(op))
    return NextResponse.json({ error: "Unsupported operation." }, { status: 400 });
  const licence = canCall(op, ctx.company.licensed);
  if (!licence.allowed)
    return NextResponse.json(
      { error: licence.detail, reason: licence.reason },
      { status: 403 },
    );
  try {
    return NextResponse.json({ result: await fleetCall(ctx, op, body.args ?? {}) });
  } catch (e) {
    if (isFleetError(e))
      return NextResponse.json(
        { error: e.message },
        { status: e.code === "42501" ? 403 : 422 },
      );
    throw e;
  }
}
