import { NextResponse } from "next/server";
import { isModuleKey, isAvailableInThisBuild, type ModuleKey } from "@hl-bos/tms";
import { demo, resetDemo } from "@/lib/demo.ts";
import { currentCtx } from "@/lib/guard.ts";

/**
 * Owner-only demo controls: change which modules this company is licensed
 * for, or reset all demo data. In production, licences come from billing
 * (HL-BOS entitlements.module_activations), not from a button.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await currentCtx();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (ctx.user.role !== "owner")
    return NextResponse.json(
      { error: "Only the company owner can change modules." },
      { status: 403 },
    );
  const body = (await req.json()) as { action?: string; modules?: string[] };
  if (body.action === "reset") {
    await resetDemo();
    return NextResponse.json({ ok: true });
  }
  if (body.action === "license" && Array.isArray(body.modules)) {
    const mods = body.modules.filter((m): m is ModuleKey => isModuleKey(m));
    const unbuilt = mods.filter((m) => !isAvailableInThisBuild(m));
    if (unbuilt.length > 0) {
      return NextResponse.json(
        { error: `Not built yet, so it cannot be switched on: ${unbuilt.join(", ")}.` },
        { status: 422 },
      );
    }
    const company = (await demo()).companies.get(ctx.company.id);
    if (company) company.licensed = mods;
    return NextResponse.json({ ok: true, licensed: mods });
  }
  return NextResponse.json({ error: "Unsupported." }, { status: 400 });
}
