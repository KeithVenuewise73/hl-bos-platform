import { NextResponse } from "next/server";
import {
  canCall,
  isFleetError,
  unlicensedFleetChanges,
  type Operation,
  type Snapshot,
} from "@hl-bos/tms";
import { demo } from "@/lib/demo.ts";
import { currentCtx } from "@/lib/guard.ts";

/**
 * The one door from the browser to the fleet backend.
 *
 * The company is ALWAYS the signed-in user's own: any `workspace` the browser
 * sends is overwritten, so one company cannot address another's records. The
 * licence check happens here; role checks happen inside the backend, exactly
 * where production fleet.api does them.
 */
const OPS = new Set<Operation>([
  "snapshot",
  "save_fleet",
  "submit_inspection",
  "submit_action",
  "submit_service",
  "team",
  "save_member",
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
  const backend = (await demo()).backend;
  if (op === "save_fleet") {
    const current = await backend.call<Snapshot>(ctx.user.id, "snapshot", {
      workspace: ctx.company.id,
    });
    const incoming = (body.args?.["fleet"] ?? {}) as Record<string, unknown>;
    const blocked = unlicensedFleetChanges(
      current.state.payload,
      incoming,
      ctx.company.licensed,
    );
    if (blocked.length > 0) {
      return NextResponse.json(
        {
          error: `This company is not licensed to change: ${blocked.join(", ")}.`,
          reason: "not_licensed",
        },
        { status: 403 },
      );
    }
  }
  try {
    const result = await backend.call(ctx.user.id, op, {
      ...(body.args ?? {}),
      workspace: ctx.company.id,
    });
    return NextResponse.json({ result });
  } catch (e) {
    if (isFleetError(e)) {
      return NextResponse.json(
        { error: e.message },
        { status: e.code === "42501" ? 403 : 422 },
      );
    }
    throw e;
  }
}
